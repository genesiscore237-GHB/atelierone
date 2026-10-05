# 04 — PROCESSUS MÉTIER DÉTAILLÉS

### 1. Inventaire initial
Création session → saisie quantités physiques par article/emplacement → validation → génération mouvements d’ajustement → stock de départ historisé.

### 2. Entrée / Réception fournisseur
Lien éventuel commande → contrôle quantitatif/qualitatif → mouvement Entrée → mise à jour PMP et stock → emplacement.

### 3. Reconditionnement (critique)
Sélection article source (fût) + qté → article destination (bidon) + qté produite → deux mouvements liés atomiques (Sortie source + Entrée destination) → traçabilité complète.

### 4. Sortie vers Atelier (OR)
Demande sur OR → vérification stock disponible (actuel – réservé) → mouvement Sortie_OR → décrément → imputation à l’OR.

### 5. Réservation de stock
Pour un OR ou un client : mouvement ou enregistrement Réservation → stock disponible diminue → libération automatique à la sortie ou manuelle.

### 6. Vente comptoir
Sortie_Comptoir + éventuelle facture.

### 7. Pertes / Vols / Casse / Obsolescence
Type spécifique + **motif obligatoire** → impact valorisation.

### 8. Échange standard (Cores)
Sortie de la pièce neuve + enregistrement de la coquille retournée (valeur_core) → suivi du dépôt.

### 9. Pièces fournies par le client
Mouvement ou flag spécifique → pas d’impact valorisation interne (ou valorisation à zéro) → traçabilité sur l’OR.

### 10. Transfert d’emplacement
Source → Destination (utile pour résorber le stock bureau patron).

### 11. Retour fournisseur
Mouvement Retour_Fournisseur + avoir éventuel.

### 12. Inventaire cyclique
Même logique que l’inventaire initial, par zone ou catégorie.

### 13. Réapprovisionnement
Articles sous qte_min ou avec stock disponible bas → propositions de commande (local/import) → suivi délais.
