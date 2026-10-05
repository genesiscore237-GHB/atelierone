# Mouvements de stock & Traçabilité

## Règle d’or

> Toute variation de quantité = 1 mouvement (ou 1 couple origine/destination)  
> Qui + Quand + Quoi + Combien + D’où + Vers où + Motif (+ OR si applicable)

## Types de mouvements recommandés

| Type | Sens | Exemple |
|------|------|---------|
| ENTREE_FOURNISSEUR | + magasin | Réception commande |
| TRANSFERT | − source / + dest | Magasin 1 → Magasin 2 |
| APPROVISIONNEMENT_BUREAU | − magasin / + bureau | Réassort comptoir |
| SORTIE_OR | − emplacement | Pièce posée sur véhicule |
| RETOUR_ATELIER | + emplacement | Pièce non utilisée revenue |
| DOTATION_CONSO | − bureau | Huile donnée au technicien/OR |
| PRET_OUTIL | − bureau (dispo) | Statut → En prêt |
| RETOUR_OUTIL | + bureau (dispo) | Statut → Disponible |
| PERTE / CASSE / REFORME | − stock | Sortie définitive |
| INVENTAIRE_PLUS / MOINS | ± | Écart d’inventaire |
| RESERVATION / LIBERATION | dispo logique | Pour un OR |

## Champs minimaux d’un mouvement

- id, type, date/heure
- article_id, quantité
- emplacement_source_id (nullable)
- emplacement_dest_id (nullable)
- user_id
- or_id (nullable mais obligatoire pour SORTIE_OR)
- pret_id (si lié à un prêt)
- motif / commentaire
- etat_outil (si retour)

## Consultation

- Historique filtrable par article, emplacement, type, période, utilisateur, OR
- Export possible
