# 02 — MODÈLE DE DONNÉES ENRICHI

### Article (Product)
Champs principaux :
- code_article (unique), designation, designation_courte
- categorie_id, sous_categorie_id
- marque, ref_oem, ref_aftermarket
- **origine_qualite** : Enum (Constructeur / OEM équivalent / Aftermarket / Autre)
- unite_base, unite_achat, coefficient_conversion
- prix_achat_moyen (PMP), dernier_prix_achat, prix_vente_ht
- qte_min, qte_max, qte_stock_actuel (calculé)
- emplacement_principal_id
- statut : Actif / Inactif / Obsolète / Hors série
- est_reconditionnable (bool)
- **est_core** (bool) — pièce en échange standard
- **valeur_core** (dépôt)
- **dlc_jours** ou date_peremption (pour fluides, colles…)
- **code_barre** / qr (préparation)
- notes, created_at, updated_at

### Supersession / Équivalences
Table ArticleEquivalence :
- article_id
- article_equivalent_id
- type (Supersession / Interchangeable / Kit composant)
- priorite

### Kit
- Un article de type Kit peut être composé de plusieurs articles composants (table KitLigne : kit_id, composant_id, quantite).

### Emplacement
- code (ZONE-ALLEE-RAYON-NIVEAU), zone, type, actif, capacite_indicative

### MouvementStock
- type_mouvement : Entrée, Sortie_OR, Sortie_Comptoir, Transfert, Ajustement+, Ajustement-, Recond_Source, Recond_Dest, Perte, Vol, Casse, Retour_Fournisseur, Retour_Atelier, **Reservation**, **Liberation_Reservation**, **Core_Retour**, **Piece_Client**…
- article_id, quantite, emplacement_source/dest
- document_type + document_id (OR, Commande, Inventaire…)
- or_id / vehicule_id (si applicable)
- prix_unitaire, motif (obligatoire pour Perte/Vol/Casse), user_id, date, commentaire, statut

### Stock Réservé
- Soit via type de mouvement Reservation + quantite réservée par OR
- Soit table StockReservation (article_id, or_id, qte, statut)

### Inventaire
- Entête + lignes (qte théorique, qte physique, écart, motif)

### Règles de calcul
- Stock actuel = somme algébrique des mouvements validés
- Stock disponible = Stock actuel – Stock réservé
- PMP mis à jour à chaque entrée valorisée
