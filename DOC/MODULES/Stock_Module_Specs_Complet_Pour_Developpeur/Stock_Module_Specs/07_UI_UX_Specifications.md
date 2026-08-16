# 07 — SPÉCIFICATIONS UI / UX (Écrans principaux)

### Principes UX

- Actions fréquentes accessibles en ≤ 3 clics
- Recherche article ultra-rapide (code, désignation, ref OEM)
- Couleurs d’alerte standard : Rouge = rupture, Orange = stock bas, Vert = OK
- Mobile-friendly si possible (magasinier en déplacement dans le magasin)

### Écrans prioritaires

1. **Liste des Articles**  
   - Filtres : catégorie, statut, stock bas, rupture  
   - Colonnes : Code, Désignation, Stock, Min, Emplacement, Statut  
   - Actions rapides : Mouvement, Voir historique

2. **Fiche Article**  
   - Onglets : Infos générales / Stock par emplacement / Historique mouvements / Fournisseurs

3. **Nouvel Mouvement** (wizard ou formulaire intelligent)  
   - Type de mouvement → champs contextuels  
   - Pour Reconditionnement : double zone source/destination

4. **Session d’Inventaire**  
   - Liste des lignes à compter  
   - Saisie quantité physique  
   - Validation globale

5. **Tableau de Bord Stock**  
   - KPIs : Valeur stock, Nb ruptures, Nb stock bas, Mouvements du jour  
   - Listes cliquables

6. **Recherche Emplacement / Contenu d’un emplacement**

7. **Historique complet d’un article** (filtre par type de mouvement, date, document)

### Messages utilisateurs importants

- « Stock insuffisant pour cette sortie »
- « Le reconditionnement va générer deux mouvements liés. Confirmer ? »
- « Motif obligatoire pour une perte/vol/casse »
