# Onglet 3 — Devis & Autorisation

## Objectif
Un seul chemin de devis versionné + autorisation client (globale ou ligne par ligne).

## 3.1 Versions de devis
- Liste des versions (v1, v2, v3…) avec statut : Brouillon / Envoyé / Approuvé / Partiellement approuvé / Refusé
- Créer une nouvelle version (copie de la précédente ou vide)
- Chaque version contient des **lignes**

### Structure d’une ligne
| Champ | Notes |
|-------|-------|
| Type | Main d’œuvre / Pièce / Forfait / Sous-traitance / Consommable |
| Désignation | |
| Quantité | |
| Prix unitaire HT | |
| Remise % | |
| TVA | |
| Origine | Diagnostic / DVI / Manuel / Travaux supplémentaires |
| Statut autorisation | Proposé / Autorisé / Décliné / Reporté |
| Temps barémé (si MO) | |

### Actions version
- Enregistrer brouillon
- Envoyer au client (SMS / Email / Lien web / Impression)
- Tout autoriser (raccourci)
- Créer version suivante (travaux supplémentaires)

## 3.2 Autorisation ligne par ligne
Pour chaque ligne de la version active :
- Select : Autoriser / Décliner / Reporter
- Méthode : Oral / SMS / Signature tablette / Lien web / Email
- Qui a autorisé + date/heure
- Commentaire client éventuel

## 3.3 Travaux supplémentaires
Pendant les travaux, possibilité de créer une nouvelle version → nouvelle demande d’autorisation sans écraser l’historique.

## 3.4 Règles
- On ne sort de pièces et on ne démarre les travaux que sur **lignes autorisées**.
- Le total de la version et le total autorisé sont affichés clairement.
- L’historique des versions est conservé et consultable.

## 3.5 Ce qui disparaît
L’ancien « devis simple » (soumettre / approuver / refuser global unique) est **entièrement absorbé** par ce système versionné.
