# Onglet 5 — Travaux & Pointage

## Objectif
Exécuter les lignes autorisées, pointer le temps, affecter le technicien, documenter le travail.

## 5.1 Technicien responsable
- Sélecteur visible (header + cet onglet)
- Historique des changements d’affectation

## 5.2 Éditeur de lignes (critique)
Le tableau des lignes n’est **plus en lecture seule**.

Actions :
- Ajouter une ligne manuelle (MO / Pièce / Forfait…)
- Modifier quantité / prix / désignation (selon droits et statut)
- Lier une ligne à un technicien
- Voir le statut d’autorisation
- Marquer une ligne « Terminée »

Seules les lignes **autorisées** sont exécutables.

## 5.3 Pointage / Temps
| Action | Détail |
|--------|--------|
| Démarrer | Horodatage + technicien |
| Pause | Motif (attente pièces, validation client…) |
| Reprendre | |
| Terminer | |
| Saisie manuelle | Durée si oubli de pointeuse |

Affichage :
- Temps barémé vs temps réel par ligne et global
- Écart

## 5.4 Documentation travaux
- Photos avant / pendant / après
- Notes technicien
- Observations pour le chef / le client

## 5.5 Découverte de travaux supplémentaires
Bouton « Signalement travaux supplémentaires » → crée une recommandation qui remonte vers Devis (nouvelle version).

## 5.6 Règles
- On ne pointe que si l’OR est EN_COURS (ou transition automatique possible).
- Le temps réel alimente la marge et le pilotage.
