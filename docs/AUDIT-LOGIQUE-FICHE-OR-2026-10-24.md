# Audit de logique d’ensemble — Fiche OR

> Date : 2026-10-24.  
> Périmètre : fiche OR `/dashboard/ordres-reparation/[id]`, ses 7 onglets, la couche permanente et la navigation.  
> Statut : **les 7 décisions ont été validées et le Lot 0 (socle commun) est exécuté**.

## 1. Verdict

Le découpage en 7 étapes est **bon** et doit être conservé :

1. Réception
2. Diagnostic
3. Devis & Autorisation
4. Pièces
5. Travaux & Pointage
6. Contrôle Qualité
7. Facture & Restitution

Le problème n’est pas le nombre d’onglets. Il est dans la **couche permanente** au-dessus des onglets et dans la **densité interne** de chaque onglet :

- trop de blocs avant le contenu utile ;
- des informations répétées entre l’en-tête, les onglets et l’historique ;
- un stepper qui ne dit pas la vérité sur l’avancement réel ;
- deux interfaces concurrentes ;
- des actions d’enregistrement hétérogènes.

Le client ne peut donc pas répondre simplement à :

> « Où en est mon véhicule, qu’est-ce qui a été fait, qu’est-ce qui reste à faire, et que puis-je mettre à jour maintenant ? »

## 2. Structure actuelle

La fiche OR empile, sur **tous** les onglets :

1. `OrHeader` — identité, statut, priorité, technicien, totaux, facturation.
2. `RelationClient` — première réponse et réclamation.
3. `OrStepper` — prochaine action + 7 étapes.
4. Le contenu de l’onglet.
5. `Timeline` — historique du cycle de vie.

Soit **cinq couches** avant/pour chaque onglet. Le contenu utile commence souvent après le premier écran.

Poids des composants avant refonte :

| Composant | Lignes |
|---|---:|
| `DiagnosticTab` | 676 |
| `ReceptionTab` | 558 |
| `PiecesTab` | 528 |
| `TravauxTab` | 453 |
| `DevisTab` | 402 |
| `RelationClient` | 258 |
| `OrHeader` | 161 |
| `QualiteTab` | 163 |
| `FactureRestitutionTab` | 86 |
| `OrStepper` | 73 |
| `Timeline` | 65 |

## 3. Causes réelles de la confusion

### 3.1 La couche permanente étouffe l’onglet

`OrDetailLayout` affichait `OrHeader`, `RelationClient`, `OrStepper`, puis l’onglet, puis `Timeline`. L’agent devait traverser trois blocs avant d’atteindre l’action de l’étape.

### 3.2 Le stepper ne mesurait pas l’avancement réel

`orStepsState` déduisait les étapes « done » de la position du statut global. Ce n’était pas une preuve métier.

Exemples faux :

- `BLOQUE` était mappé sur **Pièces**, même si le blocage venait du diagnostic, du devis ou des travaux.
- `ANNULE` et `ferme_definitif` marquaient toutes les étapes comme faites, alors que le cycle n’avait pas été réalisé.
- Un OR `EN_COURS` affichait Réception, Diagnostic, Devis et Pièces comme terminés, même si aucun devis n’avait été autorisé.
- Une reprise après qualité ne remettait pas les étapes précédentes en cause.

Le stepper était donc un **statut déguisé en progression**.

### 3.3 La prochaine action était un texte, pas une action

`orNextAction` retournait une phrase. L’agent devait ensuite chercher lui-même l’onglet et le bouton. Le bandeau devait être un bouton.

### 3.4 Les informations étaient répétées

- Totaux financiers : en-tête + Facture + Devis.
- Plainte : en-tête + Réception.
- Technicien : en-tête + Travaux.
- Photos : Réception + Travaux + fiche 360.
- Statut/priorité : en-tête + stepper.
- Historique : `Timeline` + historiques de devis, qualité, relation client, mouvements de stock.
- Le même tableau de lignes était utilisé dans Diagnostic, Devis et Travaux avec des colonnes différentes.

### 3.5 Chaque onglet mélangeait quatre natures d’information

1. Un résumé.
2. Un formulaire de création.
3. Des actions de modification.
4. Un historique.

L’agent ne savait pas ce qui était en lecture, ce qui était en édition, ni si son changement était déjà enregistré.

### 3.6 Deux interfaces concurrentes

La fiche affichait un bandeau « Module en cours de refonte… Vue complète (précédente) » avec un lien vers l’ancienne page. Tant que cette double interface existait, l’utilisateur ne pouvait pas savoir laquelle faisait foi.

### 3.7 Tous les onglets étaient visibles à un profil consultation

`OR_TABS` rendait chaque onglet visible dès que l’utilisateur avait `or.consulter`. La permission disait « tu peux lire », pas « voici ton espace de travail ».

### 3.8 Les actions d’enregistrement ne suivaient pas une règle unique

- Certains selects sauvegardaient immédiatement.
- D’autres champs attendaient un bouton « Enregistrer ».
- Certains boutons créaient, d’autres modifiaient, d’autres changeaient un statut.

L’utilisateur ne pouvait pas prédire si son changement était déjà enregistré.

### 3.9 Le vocabulaire était technique avant d’être métier

`DVI`, `core`, `statutAutorisation`, `SORTIE_OR`, `AUTORISE_PARTIEL`, `PRET_A_LIVRER`… Ces termes sont utiles en interne, mais l’écran ne les traduisait pas en « ce qui est fait », « ce qui manque », « ce que je dois faire ».

### 3.10 Pas de vue « mon travail »

Un réceptionniste, un technicien, un magasinier, un chef d’atelier et un comptable n’ont pas le même travail. L’écran leur montrait pourtant le même dossier complet.

## 4. La logique métier réelle à rendre visible

Chaque étape doit répondre à **une seule question** :

| Étape | Question métier | État attendu |
|---|---|---|
| Réception | Qu’est-ce qui est entré, avec qui, dans quel état ? | données figées après diagnostic |
| Diagnostic | Qu’est-ce qui est cassé et que faut-il faire ? | brouillon / soumis / validé / renvoyé |
| Devis | Qu’est-ce que le client a autorisé ? | brouillon / envoyé / partiel / total / refusé |
| Pièces | Qu’est-ce qui manque encore ? | demande / commande / reçue / sortie / retour |
| Travaux | Qu’est-ce qui a été fait, par qui, en combien de temps ? | lignes à faire / en cours / faites / validées + pointages |
| Qualité | Est-ce conforme ? | non contrôlé / checklist / validé / renvoyé |
| Facture & Restitution | Est-ce payé et rendu ? | non facturé / facturé / payé / restitué / clôturé |

Le suivi du véhicule est la **somme de ces sept états**, pas un seul statut global.

## 5. Modèle cible

### 5.1 Principe

**On garde les 7 onglets. On supprime la couche permanente qui les étouffe.**

Une seule fiche, un seul en-tête compact, un seul journal accessible, une seule interface.

### 5.2 En-tête permanent compact

Il doit tenir en quelques lignes :

- véhicule : plaque, marque/modèle ;
- client : nom, téléphone ;
- OR : numéro, statut global, priorité, promesse, responsable ;
- **prochaine action** avec un bouton cliquable ;
- **alerte/blocage** éventuel ;
- total TTC / reste à facturer, en une ligne discrète.

Il ne doit plus contenir :

- le formulaire de facturation complet ;
- les deux cartes de relation client ;
- l’historique complet ;
- des doublons de totaux détaillés.

### 5.3 Stepper réel

Chaque étape affiche un **état calculé sur ses données**, pas sur l’index du statut :

- `à faire` ;
- `en cours` ;
- `en attente` ;
- `terminé` ;
- `bloqué` ;
- `non applicable`.

Le stepper doit être compact, cliquable, avec un badge par étape. `BLOQUE` doit afficher l’étape réellement bloquée, ou un badge global « bloqué » sans déplacer artificiellement l’étape.

### 5.4 Standard d’onglet

Chaque onglet suit la même structure :

1. **Résumé de l’étape** : 3 à 5 faits, l’état, le responsable, la dernière action.
2. **Action principale** : un seul bouton ou un seul formulaire mis en avant.
3. **Contenu de l’étape** : tableau ou formulaire principal.
4. **Détails & historique** : accordéon, tiroir ou section repliée.

Règles :

- une seule action principale par onglet ;
- un seul formulaire ouvert à la fois ;
- les champs ne sont éditables qu’après « Modifier » ;
- « Enregistrer » explicite et toast ;
- pas plus de deux écrans de contenu sans accordéon ;
- pas de répétition d’un fait déjà présent dans l’en-tête.

### 5.5 Journal unique

Un seul journal, en tiroir ou onglet secondaire, avec filtres :

- réception, diagnostic, devis, pièces, travaux, qualité, facture, restitution ;
- relation client ;
- auteur, date, avant/après.

Les onglets n’affichent que les **3 derniers événements de leur étape**, avec un lien « voir tout ».

### 5.6 Relation client

- Si aucune action n’est requise : simple indicateur dans l’en-tête.
- Si première réponse manquante ou réclamation ouverte : alerte compacte + tiroir.
- Pas deux cartes permanentes sur tous les onglets.

### 5.7 Une seule interface

Supprimer :

- le bandeau « Module en cours de refonte » ;
- le lien « Vue complète (précédente) » ;
- toute duplication avec l’ancienne page.

Migrer d’abord ce qui existe uniquement dans l’ancienne page, puis retirer l’ancienne route.

### 5.8 Vue par rôle

- Réceptionniste : Réception + Diagnostic en lecture.
- Technicien : Diagnostic + Travaux + Journal.
- Chef d’atelier : toutes les étapes, avec priorité aux décisions.
- Magasinier : Pièces + Journal.
- Comptable : Facture + Journal.

Un bouton « Voir tout le dossier » peut ouvrir les 7 onglets pour les profils qui en ont le droit.

## 6. Ordre d’audit

Le socle commun doit être corrigé avant les onglets, sinon chaque onglet sera encore noyé.

1. **Socle commun** : en-tête, stepper réel, navigation, journal, relation client, suppression de l’ancienne interface.
2. **Réception** : onglet pilote, pour valider le standard.
3. **Diagnostic** : première étape métier après réception.
4. **Devis & Autorisation**.
5. **Pièces**.
6. **Travaux & Pointage**.
7. **Contrôle Qualité**.
8. **Facture & Restitution**.

## 7. Décisions validées

1. Garder les 7 onglets comme colonne vertébrale.
2. Un en-tête compact unique, sans relation client ni historique permanents.
3. Un stepper fondé sur les données réelles de chaque étape.
4. Un journal unique en tiroir.
5. Une seule interface : suppression de l’ancienne vue.
6. Une action principale par onglet, avec « Modifier » puis « Enregistrer ».
7. Une vue par rôle, avec « Voir tout le dossier » pour les profils autorisés.

Les 7 décisions ont été validées le 2026-10-24.

## 8. Mise en œuvre du Lot 0

- `OrHeader` compact : identité, statut, prochaine action, alerte, total TTC / reste à facturer ; gestion (statut, priorité, technicien) repliée derrière « Gérer ».
- `RelationClient` en tiroir, avec alerte compacte dans l’en-tête si première réponse manquante ou réclamation ouverte.
- `Timeline` en tiroir « Journal » unique, avec filtres.
- `OrStepper` : états réels par étape, étape bloquée déduite de l’historique, cycle arrêté / clôturé distinct, prochaine action cliquable, badges d’état.
- Vue par rôle : technicien, magasinier, comptable, secrétariat ; « Tout le dossier » pour les profils autorisés.
- Suppression du bandeau de refonte et du lien « Vue complète (précédente) ».
- Facturation déplacée dans l’onglet Facture & Restitution (`FacturerOR`).
- `useOrQueries` dégonflé : catalogue, stock, cores et pièces client ne sont plus chargés par le layout.
- `or-status-machine.test.ts` : 22 tests (BLOQUE, ANNULE, ferme_definitif, états par données, rôle, prochaine action, distinction restitution / clôture).

Limite : l’ancienne route `?or=` reste accessible par URL directe mais n’est plus exposée ; sa suppression physique attend l’audit de parité. Détail : `docs/RAPPORT-LOT0-SOCLE-OR-2026-10-24.md`.
