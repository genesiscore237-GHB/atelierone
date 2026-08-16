# 04 — PROCESSUS MÉTIER DÉTAILLÉS

## 1. Inventaire Initial (priorité absolue)

1. Créer une session d’inventaire « Initial ».
2. Pour chaque article + emplacement : saisir quantité physique.
3. Le système calcule l’écart par rapport au stock théorique (souvent 0 au départ).
4. Validation → génération automatique des mouvements d’ajustement.
5. Historisation complète.

## 2. Entrée de stock (Réception fournisseur)

1. Lien possible avec une Commande.
2. Saisie article, quantité reçue, prix, emplacement de destination.
3. Contrôle qualité simple (bon / réserves).
4. Validation → mouvement d’Entrée + mise à jour PMP + stock.

## 3. Reconditionnement (Huiles / Fluides)

**Processus critique :**

1. Sélectionner l’article source (fût).
2. Indiquer quantité source consommée.
3. Sélectionner l’article destination (bidon 5L…).
4. Indiquer quantité produite.
5. Le système vérifie le ratio (paramétrable ou libre avec alerte).
6. Génère **deux mouvements liés** :
   - Sortie du fût
   - Entrée des unités reconditionnées
7. Traçabilité complète (qui, quand, quantités, éventuel lot).

## 4. Sortie vers Atelier (OR)

1. Depuis un Ordre de Réparation ou depuis le magasin.
2. Sélection article + quantité.
3. Lien obligatoire à l’OR / véhicule (recommandé).
4. Décrément stock + enregistrement mouvement Sortie.
5. Si stock insuffisant → alerte + possibilité de créer une demande de commande.

## 5. Vente Comptoir

1. Client de passage.
2. Sortie de stock + génération éventuelle de facture (selon module existant).

## 6. Pertes / Vols / Casse / Obsolescence

1. Type de mouvement spécifique.
2. **Motif obligatoire**.
3. Quantité + emplacement.
4. Validation (éventuellement double validation si montant élevé).
5. Impact sur la valorisation (perte).

## 7. Transfert d’emplacement

- Source → Destination
- Utile pour ranger progressivement les pièces du bureau du patron vers le magasin.

## 8. Inventaire cyclique

- Même principe que l’inventaire initial.
- Possibilité de compter par zone / par catégorie.
- Génération des écarts et ajustements.

## 9. Réapprovisionnement

- Calcul des articles sous qte_min.
- Génération de propositions de commande (liées aux fournisseurs).
- Suivi des commandes en cours (surtout import avec délais longs).

## 10. Alertes automatiques

- Rupture (stock ≤ 0)
- Stock bas (stock ≤ qte_min)
- Surstock (stock > qte_max)
- Articles dormants (pas de mouvement depuis X jours)
- Écarts d’inventaire significatifs
