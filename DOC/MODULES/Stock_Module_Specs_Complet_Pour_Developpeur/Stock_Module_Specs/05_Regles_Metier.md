# 05 — RÈGLES MÉTIER STRICTES

### Règles non négociables

1. **Aucun mouvement sans utilisateur et timestamp.**
2. **Aucune suppression physique de mouvement.** Uniquement annulation par mouvement inverse ou statut « Annulé ».
3. **Toute sortie de type Perte / Vol / Casse exige un motif écrit.**
4. **Le stock ne peut pas devenir négatif** sauf paramètre explicite « autoriser stock négatif » (déconseillé en production).
5. **Reconditionnement** : les deux mouvements (source + destination) sont atomiques (soit les deux, soit aucun).
6. **Valorisation** : les sorties sont valorisées au PMP courant (ou selon règle paramétrée).
7. **Lien OR** : fortement recommandé pour les sorties atelier. Si non renseigné, alerte ou blocage selon paramétrage.
8. **Emplacement** : toute quantité est toujours dans un emplacement. Pas de stock « flottant ».
9. **Articles obsolètes / hors série** : ne peuvent plus être commandés, mais le stock restant peut être sorti ou ajusté.
10. **Droits** :
    - Magasinier : mouvements courants
    - Chef d’atelier : sorties OR + consultations
    - Admin/Dirigeant : ajustements, inventaires, paramétrage, annulations

### Règles paramétrables (à prévoir)

- Autoriser ou non le stock négatif
- Forcer le lien OR sur les sorties atelier
- Seuil de double validation pour les pertes > X FCFA
- Méthode de valorisation (PMP / FIFO / Dernier prix)
- Durée avant qu’un article soit considéré « dormant »

### Cas particuliers à gérer

- Pièce commandée pour un véhicule précis mais pas encore reçue → stock « réservé » ou simple suivi dans les commandes.
- Retour de pièce non utilisée depuis l’atelier → mouvement Retour + réintégration.
- Correction d’erreur de saisie → mouvement d’ajustement avec motif « Erreur de saisie ».
