# Plan de refonte — Fiche OR

> Statut : **Lot 0 exécuté et vérifié le 2026-10-24** ; Lots 1 à 8 à venir.  
> Audit associé : `docs/AUDIT-LOGIQUE-FICHE-OR-2026-10-24.md`.  
> Rapport d’exécution : `docs/RAPPORT-LOT0-SOCLE-OR-2026-10-24.md`.

## 1. Objectif

Rendre la fiche OR exploitable par l’agent qui doit agir, pas seulement lisible par celui qui veut tout voir.

À la fin de chaque écran, l’utilisateur doit pouvoir répondre sans chercher :

1. Où en est le véhicule ?
2. Qu’est-ce qui a été fait ?
3. Qu’est-ce qui reste à faire ?
4. Quelle est la prochaine action, et qui doit la faire ?
5. Qu’est-ce que je peux mettre à jour maintenant ?

## 2. Principes non négociables

- **Conserver les 7 onglets** : ce sont les 7 étapes métier.
- **Un seul en-tête permanent compact** : identité, statut, prochaine action, alerte, total.
- **Un seul journal** : accessible en tiroir, pas répété sous chaque onglet.
- **Une seule interface** : suppression de l’ancienne vue et du bandeau de refonte.
- **Une action principale par onglet**.
- **Un seul formulaire ouvert à la fois**.
- **Pas de champ éditable sans mode « Modifier » et bouton « Enregistrer »**.
- **Pas de doublon** entre l’en-tête, le résumé de l’onglet et l’historique.
- **Chaque étape a un état réel**, calculé sur ses données, pas sur l’index du statut global.

## 3. Lots de travail

### Lot 0 — Socle commun de la fiche

**But** : supprimer la couche qui étouffe tous les onglets.

- [x] Remplacer `OrHeader` par un en-tête compact.
- [x] Déplacer la facturation détaillée dans l’onglet Facture.
- [x] Déplacer `RelationClient` dans une alerte compacte + un tiroir.
- [x] Déplacer `Timeline` dans un **tiroir Journal unique** avec filtres.
- [x] Rendre le stepper compact et fondé sur les données réelles :
  - états : à faire / en cours / en attente / terminé / bloqué / non applicable ;
  - `BLOQUE` n’est plus rattaché artificiellement à Pièces ;
  - `ANNULE` / `ferme_definitif` n’affichent plus toutes les étapes comme faites.
- [x] Transformer la « prochaine action » en bouton qui ouvre le bon onglet.
- [x] Supprimer le bandeau « Module en cours de refonte » et le lien « Vue complète (précédente) ».
- [ ] Vérifier que l’ancienne page ne contient aucune fonction unique avant retrait.
- [x] Ajouter un mode de visibilité par rôle, avec « Voir tout le dossier ».
- [x] Ajouter des badges d’état sur les onglets.

**Reste pour clore Lot 0** : l’ancienne route `?or=` reste accessible par URL directe, mais n’est plus exposée. Sa suppression physique attend l’audit de parité avec les 7 onglets.

**Critères d’acceptation**

- Le contenu de l’onglet courant est visible sans traverser deux cartes de relation client et un historique complet.
- Le stepper ne marque jamais une étape « terminée » sans donnée correspondante.
- Un OR bloqué affiche le blocage réel, pas l’onglet Pièces par défaut.
- Un OR annulé affiche « cycle arrêté », pas « tout terminé ».
- La prochaine action est cliquable et mène à l’action réelle.
- Il n’existe plus qu’une seule interface **exposée**.

**Vérifications exécutées le 2026-10-24**

- `or-status-machine.test.ts` : **22/22**.
- Suite complète : **1292 passés / 3 ignorés**.
- `next build` : **exit 0**.
- `tsc` : **0 erreur dans les fichiers du lot** (904 lignes de baseline).
- ESLint : **0** sur les fichiers modifiés.
- `db:check` : **schéma identique** (29 écarts de données tolérés).
- `graphify update .` exécuté.

Les tests de rendu dédiés au header et aux tiroirs restent à ajouter au Lot 8.

### Lot 1 — Réception (onglet pilote)

**But** : appliquer le standard d’onglet et figer le modèle.

- [ ] Résumé de réception en 3 à 5 faits.
- [ ] Une action principale : « Modifier la réception » ou « Compléter la réception ».
- [ ] Après diagnostic démarré : lecture seule, avec bouton « Voir le détail ».
- [ ] Regrouper les photos dans une seule galerie avec filtre d’étape.
- [ ] Supprimer les doublons avec l’en-tête (plainte, priorité, dates).
- [ ] Conserver les règles déjà validées : identités verrouillées, km non régressif, dates cohérentes, téléphone seul refusé, doublons, dépannage.

**Critères d’acceptation**

- L’agent voit immédiatement si la réception est complète ou incomplète.
- Une réception terminée ne montre plus un grand formulaire éditable.
- Aucune information de réception n’est répétée dans l’en-tête et dans l’onglet.

### Lot 2 — Diagnostic

**But** : répondre à « qu’est-ce qui est cassé et que faut-il faire ? »

- [ ] Résumé : rapport soumis/validé, nombre de lignes proposées, DVI.
- [ ] Action principale : « Rédiger / soumettre le diagnostic ».
- [ ] Regrouper le rapport et les lignes dans un seul bloc.
- [ ] Mettre l’inspection DVI dans un accordéon « Inspection ».
- [ ] Mettre l’historique dans le journal, avec seulement les 3 derniers événements.
- [ ] Clarifier les actions : soumettre, valider, renvoyer, verrouiller.

**Critères d’acceptation**

- Un diagnostic peut être rédigé, soumis et validé sans ouvrir plus de deux sections.
- Le DVI ne prend pas la place du rapport principal.
- Les actions de validation sont visibles et non ambiguës.

### Lot 3 — Devis & Autorisation

**But** : répondre à « qu’est-ce que le client a autorisé ? »

- [ ] Fusionner « Lignes du devis » et « Autorisation ligne par ligne » en un seul tableau.
- [ ] Résumé : version courante, statut, total autorisé, reste à autoriser.
- [ ] Action principale : « Envoyer le devis » ou « Enregistrer la réponse client ».
- [ ] Les lignes ne sont éditables qu’en brouillon.
- [ ] Déplacer l’historique des autorisations dans le journal.
- [ ] Supprimer les totaux dupliqués avec l’en-tête.

**Critères d’acceptation**

- Une seule table permet de comprendre la ligne, son prix et son autorisation.
- Le statut d’autorisation est lisible sans ouvrir l’historique.
- Aucun total n’est affiché deux fois.

### Lot 4 — Pièces

**But** : répondre à « qu’est-ce qui manque encore ? »

- [ ] Séparer clairement : demandes de l’OR, réservations / sorties / retours, commandes fournisseur, mouvements de stock.
- [ ] Résumé : pièces demandées, commandées, reçues, manquantes.
- [ ] Action principale contextuelle : « Demander », « Commander », « Réceptionner », « Sortir ».
- [ ] Mettre les opérations de stock global hors de l’onglet OR si elles ne concernent pas ce véhicule.
- [ ] Déplacer l’historique des mouvements dans le journal.
- [ ] Afficher uniquement les pièces qui bloquent réellement l’OR en priorité.

**Critères d’acceptation**

- L’agent sait en moins de 10 secondes ce qui manque.
- Les actions de stock ne noient pas les demandes de l’OR.
- Aucune pièce sans lien avec l’OR n’apparaît dans cet onglet.

### Lot 5 — Travaux & Pointage

**But** : répondre à « qu’est-ce qui a été fait, par qui, en combien de temps ? »

- [ ] Un seul tableau des lignes de travaux : ligne, technicien, état, temps.
- [ ] Pointage dans un panneau latéral ou un accordéon.
- [ ] Comptes rendus dans le journal, pas en bloc permanent.
- [ ] Photos dans une galerie unique avec filtre avant/pendant/après.
- [ ] Travaux supplémentaires : un seul bouton « Signaler un supplément ».
- [ ] Résumé : lignes faites / en cours / restantes, temps pointé.

**Critères d’acceptation**

- L’avancement des travaux est visible sans lire cinq blocs.
- Le pointage ne duplique pas le tableau des lignes.
- Les photos ne sont pas répétées entre réception et travaux.

### Lot 6 — Contrôle Qualité

**But** : répondre à « est-ce conforme ? »

- [ ] Résumé : dernier contrôle, résultat, contrôleur.
- [ ] Checklist en un seul bloc.
- [ ] Action principale : « Valider » ou « Renvoyer en travaux ».
- [ ] Historique dans le journal.
- [ ] Supprimer les contrôles vides ou non applicables.

**Critères d’acceptation**

- Un contrôle se fait sans quitter l’onglet.
- Le résultat est visible dans le stepper et dans l’en-tête.
- Un renvoi en travaux remet l’étape Travaux en « en cours ».

### Lot 7 — Facture & Restitution

**But** : répondre à « est-ce payé et rendu ? »

- [ ] Résumé : facture, paiement, reste à payer, restitution.
- [ ] Action principale : « Facturer », « Encaisser » ou « Restituer » selon l’état.
- [ ] Conserver `RestituerVehicule` comme composant unique.
- [ ] Supprimer les totaux dupliqués avec l’en-tête.
- [ ] Accusé de réception dans un accordéon.
- [ ] Journal pour l’historique.

**Critères d’acceptation**

- L’état financier et l’état de restitution sont lisibles en une ligne.
- Une seule action est mise en avant selon l’état.
- La restitution reste alignée avec la fiche véhicule 360.

### Lot 8 — Finition et non-régression

- [ ] Vérifier les 7 onglets sur mobile et desktop.
- [ ] Vérifier les états loading / empty / erreur.
- [ ] Vérifier les permissions : boutons masqués ou désactivés, refus explicite.
- [ ] Vérifier les toasts et les invalidations après chaque action.
- [ ] Vérifier qu’aucun formulaire ne reste éditable sans bouton d’enregistrement.
- [ ] Vérifier qu’aucune information n’est répétée plus de deux fois.
- [ ] Ajouter les tests de rendu du header, du journal et de la relation client.
- [ ] `pnpm --filter @atelierone/nextjs exec vitest run`
- [ ] `pnpm --filter @atelierone/nextjs exec tsc --noEmit -p tsconfig.json`
- [ ] `cd apps/nextjs && pnpm exec next build`
- [ ] `pnpm db:check`
- [ ] `graphify update .`
- [ ] Rédiger le rapport final prévu / réalisé / écarts.

## 4. Ordre d’exécution

```text
Lot 0  Socle commun        ✅ 2026-10-24
  ↓
Lot 1  Réception (pilote)
  ↓
Lot 2  Diagnostic
  ↓
Lot 3  Devis & Autorisation
  ↓
Lot 4  Pièces
  ↓
Lot 5  Travaux & Pointage
  ↓
Lot 6  Contrôle Qualité
  ↓
Lot 7  Facture & Restitution
  ↓
Lot 8  Finition et non-régression
```

Le Lot 0 est un prérequis : sans lui, chaque onglet serait encore noyé par l’en-tête, la relation client et l’historique.

## 5. Definition of done globale

- [ ] Les 7 onglets sont conservés.
- [x] Un seul en-tête compact.
- [x] Un seul journal en tiroir.
- [ ] Une seule interface (suppression physique de l’ancienne route).
- [x] Un stepper fondé sur les données réelles.
- [ ] Une action principale par onglet.
- [ ] Aucun doublon d’information.
- [ ] Aucun formulaire sans bouton d’enregistrement.
- [ ] Tous les états (loading, vide, erreur, refus) sont couverts.
- [x] Tests complets, build, tsc, db:check et graphify verts pour le Lot 0.
- [x] Rapport du Lot 0 rédigé.

## 6. Porte de validation

Les 7 décisions ont été validées le 2026-10-24. Le Lot 0 est exécuté. La suite se fait **onglet par onglet**, en commençant par Réception, puis Diagnostic.
