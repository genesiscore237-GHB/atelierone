# 05 – Workflows & Règles Métier

## 1. Workflow Outillage

### Sortie d’outil (Check-out)
1. L’utilisateur sélectionne un outil **disponible**
2. Choisit le mécanicien
3. Saisit la date de retour prévue
4. (Optionnel) Lie à un ordre de réparation
5. Validation → 
   - Statut outil passe à `in_use`
   - quantity_available diminue de 1
   - Création d’un ToolMovement de type `check_out`

### Retour d’outil (Check-in)
1. Sélection de l’outil en prêt
2. Choix de l’état : OK / Usé / Cassé / Manquant
3. Si pas OK → notes obligatoires
4. Validation →
   - Si OK : statut → `available`, quantity_available +1
   - Si Usé : statut → `worn`
   - Si Cassé : statut → `broken`
   - Si Manquant : statut → `lost` + alerte
   - Création d’un ToolMovement `check_in`

### Déclaration de perte / vol / casse
- Justification obligatoire
- Le mouvement est historisé
- quantity_available est ajustée

---

## 2. Workflow Pièces

### Recherche avant commande (règle d’or)
1. L’utilisateur tape une référence ou un nom
2. Le système affiche les résultats en temps réel
3. **Si trouvé** :
   - Affiche quantité et emplacement
   - Propose « Sortir pour réparation » ou « Sortir pour stock »
4. **Si non trouvé** :
   - Propose « Créer une demande de commande »

### Sortie pour réparation
1. Sélection de l’ordre de réparation
2. Quantité ≤ stock disponible
3. Validation →
   - Stock diminue
   - Création PartMovement lié à `repair_order_id`
   - La pièce apparaît sur l’ordre de réparation

### Sortie pour stock / autre
- Motif obligatoire
- Notes recommandées

### Entrée de stock
- Augmente la quantité
- Historise le mouvement

**Règle stricte :** Impossible d’avoir un stock négatif.

---

## 3. Workflow Huiles

### Réception d’un fût
1. Création d’un OilStock avec volume initial
2. remaining_volume = initial_volume

### Sortie d’huile (en litres)
1. Choix du type d’huile
2. Quantité en litres
3. Le système sélectionne le fût ouvert le plus ancien (FIFO)
4. remaining_volume diminue
5. Si remaining_volume = 0 → statut du fût = `empty`
6. Création d’un OilMovement

**Règle :** On ne peut pas sortir plus de litres que le volume restant total du type d’huile.

---

## 4. Règles transversales

- Tous les mouvements sont **immuables** (on ne les supprime pas, on crée un mouvement inverse si besoin)
- Toute action de perte / vol / casse / ajustement négatif exige une justification
- Les seuils min_stock déclenchent des alertes visibles sur le dashboard
- Les outils en retard apparaissent en rouge et génèrent une alerte
- Le magasinier peut enregistrer progressivement le stock existant (pas de contrainte de tout saisir d’un coup)

---

## 5. Alertes automatiques à implémenter

- Outil non rendu après la date prévue
- Pièce sous le seuil minimum
- Huile sous le seuil minimum
- Outil déclaré perdu / volé (notification gérant)
