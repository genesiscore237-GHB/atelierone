# 04 – Interfaces Utilisateur Détaillées

Toutes les interfaces doivent être **claires, rapides et adaptées à un usage en atelier** (tablette recommandée).

---

## 1. Dashboard Principal (Accueil Magasinier / Gérant)

**Objectif :** Vue d’ensemble en 5 secondes.

**Contenu :**
- Cartes de synthèse :
  - Outils actuellement en prêt
  - Outils en retard de retour
  - Pièces en stock bas
  - Huiles en dessous du seuil
- Derniers mouvements (outils + pièces + huiles)
- Boutons d’accès rapide :
  - Nouvelle sortie d’outil
  - Recherche pièce
  - Sortie d’huile
  - Nouvel enregistrement

---

## 2. Gestion de l’Outillage

### 2.1 Liste des Outils
- Tableau ou cartes avec :
  - Référence + Nom
  - Catégorie
  - Quantité disponible / totale
  - Emplacement
  - Statut (badge coloré)
- Filtres : Catégorie, Statut, Emplacement, Recherche texte
- Bouton **+ Nouvel outil**
- Action rapide : **Sortir** (si disponible)

### 2.2 Fiche Outil (détail)
- Toutes les informations de l’outil
- Historique des mouvements (timeline)
- Boutons :
  - Sortir l’outil
  - Modifier
  - Déclarer perdu / cassé / en réparation

### 2.3 Écran Check-out (Sortie d’outil)
**Champs :**
- Outil (pré-sélectionné ou recherche)
- Mécanicien (liste déroulante)
- Date/heure de sortie (auto)
- Date de retour prévue (obligatoire)
- Lié à une réparation ? (optionnel – recherche ordre de réparation)
- Notes

Bouton principal : **Valider la sortie**

### 2.4 Écran Check-in (Retour d’outil)
- Outil concerné
- État au retour : OK / Usé / Cassé / Manquant
- Notes (obligatoire si pas OK)
- Bouton **Confirmer le retour**

### 2.5 Outils en retard
- Liste des outils non rendus à la date prévue
- Possibilité d’envoyer un rappel ou de déclarer perdu

---

## 3. Gestion des Pièces

### 3.1 Recherche de Pièce (écran le plus important)
**Barre de recherche ultra-rapide** (référence, nom, catégorie)

Résultats :
- Si trouvé → afficher quantité, emplacement, type (neuf/occasion)
  - Bouton **Sortir pour réparation**
  - Bouton **Sortir pour stock**
- Si non trouvé → Bouton **Créer une demande de commande**

### 3.2 Liste des Pièces
- Tableau avec filtres (catégorie, type, stock bas, emplacement)
- Indicateur visuel si stock < min_stock
- Bouton **+ Nouvelle pièce**

### 3.3 Fiche Pièce
- Toutes les infos + historique des mouvements
- Graphique simple d’évolution de stock (optionnel)

### 3.4 Sortie de Pièce
**Deux modes clairement séparés :**

**A. Pour une réparation**
- Sélection de l’ordre de réparation
- Quantité
- Confirmation → stock diminue automatiquement

**B. Pour le stock / autre**
- Motif (ajustement, perte, inventaire…)
- Notes obligatoires

### 3.5 Entrée de stock (réception)
- Sélection ou création de la pièce
- Quantité reçue
- Prix d’achat
- Fournisseur
- Emplacement

---

## 4. Gestion des Huiles

### 4.1 Liste des Types d’Huile
- Nom + viscosité + volume total restant
- Badge si sous seuil

### 4.2 Fiche Type d’Huile
- Liste des fûts ouverts / fermés
- Volume total restant
- Historique de consommation

### 4.3 Enregistrement d’un nouveau fût
- Type d’huile
- Volume initial (litres)
- Fournisseur
- Date d’arrivée
- Emplacement

### 4.4 Sortie d’Huile
- Type d’huile
- Quantité en **litres**
- Lié à une vidange / réparation ? (optionnel)
- Le système déduit automatiquement du fût le plus ancien ouvert (FIFO recommandé)

---

## 5. Écrans Communs

### Alertes
- Liste des alertes actives (stock bas, outils en retard, etc.)
- Possibilité de marquer comme traitée

### Historique global
- Filtres par type (outil / pièce / huile), date, utilisateur
- Export possible

### Configuration (Admin / Manager)
- Catégories d’outils et de pièces
- Seuils par défaut
- Gestion des fournisseurs
- Gestion des utilisateurs et rôles

---

## Principes UX obligatoires

1. Recherche toujours visible et très rapide
2. Actions principales en grand bouton
3. Couleurs de statut cohérentes :
   - Vert = Disponible / OK
   - Orange = Attention / En prêt
   - Rouge = Retard / Stock bas / Cassé / Perdu
4. Confirmation claire pour les actions destructives (perte, vol, casse)
5. Messages de succès / erreur explicites
6. Compatible tablette (boutons assez grands)
