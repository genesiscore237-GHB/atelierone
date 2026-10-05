# RPT-03 — Sensibilisation RH et impacts financiers estimés

**Date** : 2026-09-30 · **Statut** : livré, sans UI · **Base** : `atelierone_erp`

---

## 1. Ce qui a été livré

Un moteur **serveur**, en lecture seule, qui transforme les données de présence
réelles en deux familles d'informations strictement séparées :

| Nature | Champ | Usage |
|---|---|---|
| **Sensibilisation** (valeur d'alerte) | `estimatedImpact`, `impactPercent`, `messages` | fiabilité RH, pas de paie |
| **Paie** (valeur contraignante) | `actualPayrollDeduction` | source de vérité, inchangée |

Le livrable ne touche **aucune** composante React, **aucune** retenue, **aucun**
net imposable, **aucun** net payé. Aucune capture d'écran n'est produite : le
périmètre RPT-03 est explicitement un moteur métier sans interface.

## 2. Décisions structurantes

### 2.1 Séparation paie / estimation — le point non négociable

Avant RPT-03, l'écart de méthode produisait mécaniquement **0** partout :
`absence_financial_impact = 0` sur 494 calculs et `late_deduction_amount = 0`
sans aucune ligne dans `late_deduction_rules`. Un zéro constaté n'est pas un
zéro demo. Les deux chemins sont désormais **nommés et cloisonnés** :

- `RETENUE_PAIE` — comportement inchangé, utilisé par la paie.
- `TAUX_HORAIRE_SENSIBILISATION` — mode explicite, produit `estimationMontant`.

Aucun appel de paie ne reçoit une estimation. Le moteur RPT-03 est *pur* :
il ne fait aucun `insert`/`update`/`delete` et n'importe rien de `@atelierone/db`.

### 2.2 Codes pris en compte

`CODES_HORAIRES_NON_FAITES = {A, MUET, C, M, O, F}`

L'extension de `MUET` à `C, M, O, F` est délibérée. Ces jours représentent un
coût financier réel pour l'employeur ; les exclure reviendrait à nier une charge.
Dans le mode estimation **aucun de ces jours ne génère de retenue** — c'est
précisément l'intérêt de la séparation.

En revanche `CODES_NON_JUSTIFIES = {A}` seulement. Un jour `MUET` est un **défaut
de saisie**, pas une absence constatée : le signaler comme « non justifié »
serait une accusation portée par une absence de données. Le jour reste compté
dans le coût financier, mais ne déclenche jamais de signal disciplinaire.

> Cette correction a un effet mesurable et volontaire : sur septembre 2026,
> `joursAbsenceNonJustifiee` passe de **238** à **20** et les employés signalés
> de 22 à **4**. Les 238 étaient un artefact.

### 2.3 Une seule diviseuse métier

Le taux horaire vient du **segment salarial de la journée**, jamais d'un salaire
figé. Le diviseur mensuel est `standardMonthlyHours`, lu dans le paramétrage.
Les constantes `9,5` et `225,3` sont **absentes du code** — deux tests le
vérifient par analyse de la source.

Le salaire de référence historique réutilise `baseEffectifPeriode()` de
`payroll-engine` (règle R7), sans réinvention.

### 2.4 Précision

`tauxHoraire()` arrondit à 2 décimales par défaut (comportement historique
préservé). Le mode sensibilisation demande une précision plus fine, sinon
l'estimation d'un poste à faible salaire serait faussée à l'arrondi.

## 3. Règles

Table `hr_sensibilisation_rules`, multi-tenant, **14 lignes** (7 règles × 2
agences). Seuils par défaut — **modifiables**, calibrés sur la base réelle,
pas présentés comme une vérité métier :

| Code | Condition | Seuil | Niveau | Priorité |
|---|---|---|---|---|
| `PRESENCE_SATISFAISANTE_RETARDS_ELEVES` | `retardMinutes >= 120` | 120 | WARNING | 50 |
| `ABSENCES_RETARDS_SIGNIFICATIFS` | `totalNotWorkedHours >= 8` | 8 | WARNING | 30 |
| `IMPACT_IMPORTANT` | `impactPercent >= 5` | 5 | WARNING | 20 |
| `IMPACT_TRES_ELEVE` | `impactPercent >= 10` | 10 | CRITICAL | 10 |
| `RETARDS_CHRONIQUES` | `joursAvecRetard >= 5` | 5 | WARNING | 40 |
| `SALAIRE_REFERENCE_INCOHERENT` | `salaireReferenceManquant >= 1` | 1 | WARNING | 25 |
| `ABSENCE_NON_JUSTIFIEE` | `joursAbsenceNonJustifiee >= 1` | 1 | CRITICAL | 15 |

`SALAIRE_REFERENCE_INCOHERENT` utilise une métrique **binaire** et non le
montant de salaire : sinon la règle ne pourrait jamais se déclencher, puisque
la métrique vaut `null` précisément quand elle est anormale.

Les messages sont **déterministes** : tri par niveau (CRITICAL avant WARNING),
puis priorité, puis code. Aucune date d'exécution n'est exposée.

## 4. API

`tRPC` en lecture seule, `rhSensibilisation` :

- `indicateurs({ from, to })` — période, équipe, segments, impact estimé,
  retenue réelle, messages, explications, règles déclenchées, règles manquantes.
- `regles()` — table des règles de l'agence.

Les deux requièrent `rh.presence.consulter`. **Aucune mutation n'est exposée.**

### Masquage du salaire

Sans `rh.salaire.consulter`, `salaireBaseReference`, `tauxHoraireMoyen`,
`estimatedImpact`, `impactPercent`, `segments`, `messages` et `explications`
renvoient `null`. Les indicateurs non sensibles (heures, retards, effectif)
restent visibles : un responsable RH doit pouvoir voir un problème de retard
sans connaître le salaire.

## 5. Résultats réels — septembre 2026

| Indicateur | Avant RPT-03 | Après RPT-03 |
|---|---|---|
| Effectif | 27 | 27 |
| Heures théoriques | 5 283 | 5 283 |
| Heures travaillées | 2 561,3 | 2 561,3 |
| Taux de présence | 48,48 % | 48,48 % |
| Heures non faites | 2 121 | 2 121 |
| Retards cumulés | 11 307 min | 11 307 min |
| **Impact estimé** | *inexistant* | **847 989,48** |
| **Impact %** | *inexistant* | **30,99 %** |
| **Retenue réelle** | **0** | **0** |

Les colonnes « avant » n'existaient pas : le moteur est ce qui les produit. La
retenue réelle reste à **0** — c'est le résultat attendu et non une régression,
puisque le mode estimation ne génère aucune retenue.

Répartition des messages : `ABSENCES_RETARDS_SIGNIFICATIFS` 22,
`IMPACT_TRES_ELEVE` 17, `IMPACT_IMPORTANT` 17,
`PRESENCE_SATISFAISANTE_RETARDS_ELEVES` 13, `RETARDS_CHRONIQUES` 12,
`SALAIRE_REFERENCE_INCOHERENT` 5, `ABSENCE_NON_JUSTIFIEE` 4.

Cas le plus exposé : `GPJ-R6TEST-960` — 227 h non faites, estimation 201 509,10,
soit 100,75 % du salaire de référence (200 000, taux horaire 887,71).

## 6. Vérifications

| Périmètre | Résultat |
|---|---|
| RPT-03 (moteur, gates, intégration DB) | **76 / 76** |
| Non-régression ciblée (10 fichiers) | **383 / 383** |
| Suite complète `src/server/lib` | **664 verts**, 2 échecs préexistants |
| `attendance_calculations` | 494 lignes, sommes de retenues **0,00** |
| `hr_sensibilisation_rules` | 14 lignes, 2 agences, 7 codes, 14 actives |
| `late_deduction_rules` | 0 ligne — intacte |

Les 2 échecs restants sont antérieurs et hors périmètre :
`licence-service.test.ts > metendrePeriode` et
`stock-engine.test.ts > mall movement types`.

`rpt03-gates.test.ts` énonce chaque gate et le démontre, y compris deux contrôles
par lecture du code source : absence de `9,5`, absence de `225,3`, absence
d'écriture en base, absence de référence à un moteur de notification ou de
workflow, et non-cumulation de `estimatedImpact` avec `actualPayrollDeduction`.

## 7. Limites connues

- **Réconciliation classeur impossible.** `Gestion_Personnel_GPJ_PRO_v3.1_Corrige.xlsx`
  est absent du dépôt. Les classeurs V4 et V5 disponibles comptent 12 feuilles et
  **aucune feuille `Sensibilisation`** ; seul un seuil d'affichage `retard > 15 min`
  a été retrouvé dans `02_Pointage`, sans aucune formule d'impact financier. Les
  chiffres ci-dessus sont donc **issus de la base**, pas recalculés depuis l'Excel.
- **Qualité de saisie.** 48,48 % de présence et de nombreux jours sans pointage
  sur un mois signalent un problème de terrain ou de saisie. Le moteur le
  restitue tel quel : il ne comble aucun trou et ne comble aucune absence par une
  hypothèse favorable.
- **Aucun segment persisté.** Les segments sont calculés à la volée ; il n'existe
  pas de table à rollback au-delà de `hr_sensibilisation_rules`.
- **Test de masquage par mock.** Aucun rôle réel ne possède
  `rh.presence.consulter` sans `rh.salaire.consulter` ; le test d'intégration
  simule le RBAC. Les droits en base n'ont pas été modifiés.
- **Seuils par défaut.** Sept seuils ont été posés sur la base réelle et restent
  modifiables. Ils doivent être arbitrés métier avant tout usage décisionnel.

## 8. Repli

```bash
# Dry-run (lecture seule)
node packages/db/src/migrate-rh-sensibilisation-rules.ts   # DRY_RUN=1

# Annuler
node packages/db/src/migrate-rh-sensibilisation-rules.ts   # ROLLBACK=1
```

Le rejeu est idempotent (`ON CONFLICT DO NOTHING`) : il n'écrase jamais une règle
personnalisée. Conséquence assumée : une ligne créée avant une correction du
seed n'est pas réalignée automatiquement — c'est le comportement protecteur
voulu, mais cela impose un `UPDATE` manuel si un seed change après coup.

## 9. Fichiers

- `apps/nextjs/src/server/lib/rh-sensibilisation-engine.ts` — moteur pur
- `apps/nextjs/src/server/lib/rh-sensibilisation-engine.test.ts` — 51 tests
- `apps/nextjs/src/server/lib/rpt03-gates.test.ts` — 13 preuves de gate
- `apps/nextjs/src/server/lib/presence-engine.ts` — modes et séparation
- `apps/nextjs/src/server/lib/rh-posture-engine.ts` — précision du taux horaire
- `apps/nextjs/src/server/api/routers/rh-sensibilisation.ts` — API lecture seule
- `apps/nextjs/src/server/api/routers/rpt03-sensibilisation.integration.test.ts` — 12 tests DB
- `packages/db/src/schema/rh_parametrage.ts` — table
- `packages/db/src/migrate-rh-sensibilisation-rules.ts` — migration
