# RPT-05 — API Centre RH/Paie : cloisonnement, projection, validation

> Phase livrée le 2026-10-05. DB : `packages/db`. API : `rhCentreRapports` et
> ses routers voisins. Lecture seule : aucune écriture dans
> `attendance_entries` / `absences` (§0).

## 1. Ce qui a été livré

| Élément | Fichier |
|---|---|
| Module canonique de projection | `apps/nextjs/src/server/lib/rh-secrets.ts` |
| Noyau de validation serveur | `apps/nextjs/src/server/lib/rh-centre-rapports-input.ts` |
| Tests du noyau | `apps/nextjs/src/server/lib/rh-centre-rapports-input.test.ts` |
| Contrat de projection | `apps/nextjs/src/server/lib/rh-centre-securite.test.ts` |
| Fixtures RBAC réelles | `apps/nextjs/src/test/rbac-fixtures-rpt05.ts` |
| Attaques rapport + voisins | `apps/nextjs/src/server/api/routers/rh-centre-rapports.attaques.integration.test.ts` |
| Attaques exports | `apps/nextjs/src/server/api/routers/export.attaques.integration.test.ts` |
| Migration socle | `packages/db/src/migrate-rpt05-securite-centre.ts` |

Permissions ajoutées au socle : `rh.absence.justifier`, `rh.absence.valider`.

## 2. Décisions structurantes

### 2.1 Deux contrats distincts, souvent confondus

C'est la distinction centrale de la phase, et la cause de la plupart des
corrections.

**Le droit** est une question binaire : `canSeeSalary(ctx)`. **La projection**
est une décision de forme : le champ est-il présent dans l'objet ?

La violation systématique du projet consistait à traiter le droit comme une
projection :

```ts
return canSeeSalary ? row : { ...row, salaireBase: null };   // FAUX
```

`null` est indiscernable d'un salaire réellement nul, et l'opérateur spread
laissait **toutes les autres colonnes** en clair. Sur `rh.get`, cela exposait
RIB, CNSS, NIU et pièce d'identité à quiconque avait le rôle RH sans
`rh.salaire.consulter`. Le contrat appliqué partout est désormais :

```ts
return canSeeSalary ? row : sansChampsStrict(row, CHAMPS_SENSIBLES_FICHE);
```

`sansChampsStrict` supprime la clé **même si elle porte une valeur**. La variante
`sansChamps` (qui ne nettoie que les valeurs vides) est un piège : elle laisse
passer précisément le cas qui compte, le montant réellement renseigné. Cette
erreur a été commise puis détectée par les tests d'attaque.

### 2.2 Une seule définition de `canSeeSalary`

Elle existait en double, dans `rh-centre-rapports.ts` et dans `rh-history.ts`,
avec un corps identique. C'est cette duplication qui a permis à des endpoints
d'oublier l'appel : chacun utilisait « sa » copie. La définition locale de
`rh-history.ts` est supprimée ; `rh-secrets.ts` est l'unique source.

### 2.3 Le taux horaire est un salaire

`rhPosture.now` ne renvoyait pas `salaireBase`, mais `tauxHoraire` et `gainJour`,
dérivés de `salaireBase` par division par les heures du mois. Multiplier par
225,3 redonne le salaire mensuel : le divulguer revient à le divulguer. Les deux
clés sont supprimées sans le droit. `salaireIntervalle` est un endpoint salarial
par nature — il exige désormais `rh.salaire.consulter` plutôt que de renvoyer
une coquille calculée sur des montants non autorisés.

### 2.4 Un audit est une fuite si on ne le purge pas

`rhHistory.auditEmploye` renvoyait `avantJson` / `apresJson` bruts. Or
`corrigerSalaireRetroactif` y écrit explicitement `salaireBase`, et `rh.update`
aussi. L'endpoint d'audit était donc un canal de fuite des montants **qui
contournait `rh.salaire.consulter`**. `purgerJsonSensibles()` nettoie
récursivement, y compris les JSON imbriqués et les chaînes JSON, tout en
laissant le reste de l'image lisible : on masque un montant, pas la traçabilité.

### 2.5 `db.select()` sans projection est l accident récurrent

Trois endpoints (`rh.get`, `listContrats`, `listSanctions`) faisaient
`db.select()` nu sur `employes` / `contrats` / `sanctions`. Dans les deux
derniers, l'`innerJoin(employes)` **débordait toutes les colonnes de l'employé**
dans un résultat qui ne demandait qu'une liste de contrats ou de sanctions —
RIB et salaire compris. Les trois font maintenant une projection explicite :
ce qui n'est pas demandé ne sort pas.

### 2.6 `export.ts` : le tenant était rompu, pas seulement l'ownership

Audité parce qu'il était sur la liste. Trois défauts cumulés :

1. `requestExport` n'exigeait **aucune** permission — n'importe quel profil
   authentifié déclenchait des exports ventes/stock/analytics. Il exige
   maintenant `export.consulter`, qui existait déjà dans le socle.
2. `ExportJob` ne stockait pas de propriétaire. `getExportStatus` et
   `downloadExport` faisaient `exportQueue.get(jobId)` sans comparaison : un
   utilisateur de l'agence 2 pouvait **télécharger un export de l'agence 1**, et
   deux utilisateurs de la même agence se lisaient mutuellement.
3. Le `jobId` étant devinable (`export_${Date.now()}_${random}`), l'absence de
   contrôle n'était atténuée par rien.

`exigerJobProprietaire()` compare `userId` **et** `organizationId`, et répond
`NOT_FOUND` — un `FORBIDDEN` confirmerait au attaquant que ce `jobId` existe.
Un test vérifie que le refus est indiscernable de celui d'un identifiant bidon.

> **Limite assumée.** La file vit dans un `Map`, pas en base. Il n'existe donc
> aucune contrainte SQL de propriété : la garantie tient entièrement du code. Le
> jour où les jobs sont persistés, ce contrôle devra être réécrit en SQL.

## 3. Validation serveur

Le noyau `rh-centre-rapports-input.ts` est **pur** (aucune lecture DB) et
revalide tout ce que le client propose :

- dates ISO **réellement existantes** (aller-retour, `2026-02-31` refusé) ;
- période ordonnée, max 13 mois / 400 jours ;
- `employeeIds` dédupliqués, positifs, max 500 ;
- refus du tri sur une colonne salariale sans le droit ;
- recherche et listes bornées.

### 3.1 Les plafonds de pagination ne sont pas un choix libre

`PAGE_SIZE_MAX` et `EVENT_PAGE_SIZE_MAX` valent **500 / 2000** : ce sont les
valeurs du contrat existant, pas un arrondi. RPT-02 consomme le rapport avec
`pageSize: 500` et `eventPageSize: 2000` ; les resserrer à 200/1000 a cassé six
tests d'intégration légitimes. Le rôle du module est de borner le risque
(`pageSize: 1e9`), pas de redéfinir le contrat sous couverture de sécurité.

## 4. Tests

| Suite | Résultat |
|---|---|
| `rh-centre-rapports-input.test.ts` | 22 |
| `rh-centre-securite.test.ts` | 7 |
| `rh-centre-rapports.attaques.integration.test.ts` | 31 |
| `rh-centre-rapports.securite.integration.test.ts` | 6 |
| `rh-history.integration.test.ts` | 16 |
| `export.attaques.integration.test.ts` | 6 |
| **Total RPT-05** | **88** |

Les tests d'intégration utilisent de **vrais** rôles, `role_permissions` et
utilisateurs en base. Seul `@atelierone/auth` est mocké (`next-auth` importe
`next/server` et n'est pas résolvable hors de Next) — le RBAC n'est jamais
mocké.

### 4.1 Isolation des fixtures

Les fixtures vivent dans des tables **globales**. Deux fichiers d'intégration
partageant les mêmes noms se supprimaient mutuellement leurs fixtures en
parallèle : le symptôme était 22 échecs « pour rien », tous verts isolément.
`installerFixturesRbac(namespace)` derive désormais rôles et emails du
namespace, et le nettoyage est ciblé. Une suite d'export échouait aussi sur une
violation de clé étrangère `audit_logs_user_id_utilisateurs_id_fk` : le
middleware d'audit écrit une ligne par mutation réussie, le nettoyage les
supprime avant les utilisateurs.

### 4.2 Un piège classique : un test faux peut passer au vert

L'assertion « l'utilisateur d'agence 2 ne voit rien » était fausse elle-même :
il voit légitimement les employés de *son* agence, dont celui que la fixture
crée pour prouver le cloisonnement. Le test vérifie désormais
l'**intersection** avec l'agence 1, pas une réponse vide.

## 5. Ce qui reste ouvert

- **RLS désactivée** sur `utilisateurs`, `employes`, `roles`, `permissions`,
  `role_permissions`. Le cloisonnement est purement applicatif : l'oubli d'un
  seul `eq(agenceId)` suffit aujourd'hui à ouvrir une agence sur une autre.
- Les types de sortie des moteurs déclarent `baseSalary`/`salaireBase` comme
  obligatoires. Après projection la clé n'existe plus. Corriger ces types
  demanderait de les changer partout, jusqu'à la chaîne de paie ; le cast est
  aujourd'hui local et assumé (`sansChampsTypeGenerique`), et le contrat runtime
  est vérifié par les tests d'intégration.
- `rh.posture` et `rh.situation` : les projections de détail restent à auditer
  ligne à ligne, comme `getHistorique` l'a déjà été.

## 6. Échecs préexistants (hors périmètre)

Inchangés, aucun lien avec RPT-05 :

- `licence-service.test.ts > etendrePeriode : +1 mois depuis l'échéance si dépassée`
- `stock-engine.test.ts > all movement types are accounted for`
