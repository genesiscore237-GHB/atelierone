# 01 — CAHIER DES CHARGES FONCTIONNEL
## Module Stock V2 Enrichi

### 1. Vision
Mettre en place un module de gestion de stock professionnel, adapté aux réalités d’un garage automobile camerounais (GPJ), capable de gérer inventaire initial, reconditionnement, commandes import, pertes, et les spécificités de l’industrie automobile (supersession, origines, échange standard, kits, stock réservé, DLC…).

Le module devient la **source de vérité** du stock.

### 2. Objectifs mesurables
- 100 % des mouvements traçables (utilisateur, date, motif, document lié)
- Toute sortie atelier liée à un OR (ou vente comptoir)
- Reconditionnement fût → unités opérationnel
- Alertes rupture / stock bas / péremption actionnables
- Inventaire initial + inventaires cycliques avec écarts historisés
- Distinction claire Origine constructeur / Équivalent / Aftermarket
- Gestion des pièces en échange standard (cores)
- Stock réservé pour OR ou client

### 3. Périmètre (In Scope)
Référentiel articles enrichi, emplacements, mouvements complets, reconditionnement, inventaires, commandes & réceptions, sorties OR, ventes comptoir, pertes/vols/casse/obsolescence, supersession, origines, cores, kits, stock réservé, DLC, pièces fournies par le client, alertes, valorisation PMP, tableaux de bord.

### 4. Hors périmètre (V1)
Catalogue TecDoc complet, multi-magasins complexes avancés, e-commerce, numéros de série unitaires complets (sauf si simple lot).

### 5. Acteurs
Magasinier (principal), Chef d’atelier, Techniciens (demande), Secrétaire/Admin, Direction (pilotage), Système (calculs & alertes).

### 6. Critères d’acceptation globaux
- [ ] Inventaire initial possible et historisé
- [ ] Reconditionnement fût → unités fonctionnel de bout en bout
- [ ] Sortie pièce vers OR avec décrément automatique
- [ ] Gestion pertes/vols avec motif obligatoire
- [ ] Supersession et origine/qualité gérées
- [ ] Stock réservé et cores gérés
- [ ] Alertes (rupture, min, DLC) opérationnelles
- [ ] Guide Utilisateur livré
