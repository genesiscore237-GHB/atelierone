# 06 — USER STORIES & CRITÈRES D’ACCEPTANCE

### Epic 1 — Référentiel Articles & Emplacements (Priorité 1)

**US1.1** — En tant que Magasinier/Admin, je peux créer/modifier un article avec code, désignation, catégorie, unités, seuils min/max, emplacement principal.  
**Acceptance :**  
- Code unique  
- Unité de base obligatoire  
- Statut par défaut « Actif »

**US1.2** — Je peux gérer une arborescence Catégorie / Sous-catégorie.  
**US1.3** — Je peux créer et gérer les emplacements avec code structuré.

### Epic 2 — Inventaire Initial (Priorité 1)

**US2.1** — Je peux lancer un inventaire initial, saisir les quantités physiques, et valider pour créer les stocks de départ.  
**Acceptance :**  
- Session d’inventaire historisée  
- Mouvements d’ajustement générés automatiquement  
- Stock théorique = stock physique après validation

### Epic 3 — Mouvements de base (Priorité 1)

**US3.1** — Entrée de stock (réception)  
**US3.2** — Sortie atelier liée à un OR  
**US3.3** — Transfert entre emplacements  
**US3.4** — Consultation du stock en temps réel par article / emplacement / catégorie

### Epic 4 — Reconditionnement (Priorité 1 - Critique)

**US4.1** — En tant que Magasinier, je peux reconditionner un fût en unités plus petites.  
**Acceptance :**  
- Sélection article source + quantité  
- Sélection article destination + quantité produite  
- Deux mouvements liés créés atomiquement  
- Stock source diminué, stock destination augmenté  
- Historique clair

### Epic 5 — Exceptions (Priorité 2)

**US5.1** — Enregistrer une perte / vol / casse avec motif obligatoire  
**US5.2** — Mettre un article en statut « Obsolète » ou « Hors série »

### Epic 6 — Alertes & Pilotage (Priorité 2)

**US6.1** — Tableau de bord : ruptures, stocks bas, valeur totale du stock, mouvements du jour  
**US6.2** — Liste des articles à réapprovisionner

### Epic 7 — Inventaires cycliques & Ajustements (Priorité 2)

**US7.1** — Inventaire partiel ou complet avec calcul d’écarts et génération d’ajustements

### Epic 8 — Intégrations (Priorité 2-3)

**US8.1** — Depuis un OR, pouvoir sortir des pièces et voir le stock disponible  
**US8.2** — Lien avec les commandes fournisseurs / réceptions

---

**Règle de test :**  
Chaque User Story doit avoir au minimum :
- 1 test nominal (happy path)
- 1 test de cas limite (stock insuffisant, ratio reconditionnement incohérent, etc.)
- Vérification que les mouvements sont bien historisés et non supprimables
