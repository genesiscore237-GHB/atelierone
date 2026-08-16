# 03 — TYPOLOGIE DES PIÈCES & RAYONNAGE

### 1. Typologie recommandée (à implémenter comme référentiel)

**Catégories principales :**

1. **Filtres**  
   - Huile / Air / Habitacle / Carburant / Autres

2. **Freinage**  
   - Plaquettes / Disques / Tambours & Mâchoires / Liquide de frein / Étriers / Flexible

3. **Lubrifiants & Fluides**  
   - Huile moteur / Huile boîte / Liquide refroidissement / Liquide frein / Graisses / Autres fluides  
   → **Attention particulière au reconditionnement**

4. **Électricité & Éclairage**  
   - Batteries / Alternateurs / Démarreurs / Ampoules / Capteurs / Faisceaux

5. **Distribution & Transmission**  
   - Kits distribution / Courroies / Embrayages / Cardans

6. **Suspension & Direction**  
   - Amortisseurs / Ressorts / Rotules / Biellettes / Silentblocs

7. **Pneumatiques & Jantes**

8. **Refroidissement & Échappement**

9. **Carrosserie & Vitrage**  
   - Optiques / Rétroviseurs / Pare-chocs / Éléments de carrosserie

10. **Consommables & Divers**  
    - Visserie / Colliers / Joints / Adhésifs / Produits d’entretien / Outillage léger

11. **Pièces spécifiques / Hors série / Obsolètes** (statut particulier)

### 2. Attributs de typage importants

- Type de gestion : Standard / Reconditionnable / Hors série / Consommable rapide
- Nécessite numéro de lot ou DLC ? (surtout fluides)
- Lien possible avec références constructeur (TecDoc-like plus tard)

### 3. Codification des emplacements (Rayonnage)

**Format recommandé : `ZONE-ALLEE-RAYON-NIVEAU`**

Exemples :
- `MAG-A-01-03` → Magasin, Allée A, Rayon 01, Niveau 3
- `MAG-B-02-SOL` → Sol
- `BUR-PATRON` → Bureau du dirigeant (stock temporaire à résorber)
- `EXT-PNEU` → Zone extérieure pneus
- `SITE2-LONG` → Site 2 longue durée

**Règles de rangement intelligentes :**
- Pièces lourdes / volumineuses en bas
- Pièces à forte rotation à hauteur d’homme et près de la sortie atelier
- Fluides isolés (rétention)
- Batteries sur support adapté
- Petites pièces (ampoules, visserie) en tiroirs / bacs codés

### 4. Paramétrage initial obligatoire

Le développeur doit prévoir un écran ou un script de seed pour :
- Créer les catégories / sous-catégories
- Créer une structure d’emplacements de base (même si le garage l’ajustera)
- Définir les unités de mesure standard

### 5. Cas particulier : Huiles et reconditionnement

- Article « parent » : Fût 200L Huile 5W30
- Articles « enfants » : Bidon 5L, Bidon 1L, etc.
- Opération de reconditionnement lie les deux avec un ratio (ex: 1 fût = 40 bidons de 5L)
