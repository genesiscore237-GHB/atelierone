# 10 — PLAN DE TESTS

### Cas prioritaires
- Inventaire initial → stock correct + mouvements générés
- Reconditionnement 200L → 40×5L : stocks et mouvements liés corrects
- Sortie OR avec stock disponible OK / insuffisant (réservations)
- Réservation puis sortie / libération
- Perte sans motif → refus
- Article avec DLC dépassée → comportement conforme au paramétrage
- Core : sortie + retour coquille
- Supersession : recherche propose les équivalences
- Concurrence : deux sorties simultanées → pas de stock négatif non contrôlé
- Annulation de mouvement → non destructif

Critère de fin : tous les cas critiques verts + Guide Utilisateur + notes d’architecture.
