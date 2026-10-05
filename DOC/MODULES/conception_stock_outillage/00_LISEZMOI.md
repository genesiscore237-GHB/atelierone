# Conception Expert — Stock Général + Bureau Magasinier + Outillage

**AtelierOne — Garage Polyvalent Junior**  
**Références métier** : pratiques DMS auto (AutoLeap, multi-location inventory), Tool Crib industriels (CribMaster, CRIBWISE, best practices checkout/return)

---

## Problème métier à résoudre

Un garage a :
- **4 grands magasins** (rayons) = stock de fond (pièces, consommables, outils)
- **1 bureau du magasinier** = point de distribution quotidien vers l’atelier
- Des **outils** qui circulent (prêt / retour) et des **consommables** qui partent sans retour

Sans conception stricte → stocks fantômes, outils perdus, aucune traçabilité.

---

## Architecture retenue (2 modules complémentaires)

| Module | Rôle | Analogie |
|--------|------|----------|
| **A. Catalogue / Stock général** | Référentiel unique de tous les articles + stock multi-emplacements | L’entrepôt + le catalogue constructeur |
| **B. Bureau + Outillage** | Point de distribution + prêt d’outils + dotation consommables | Le « tool crib » + comptoir magasinier |

Un article n’existe **qu’une fois** dans le catalogue.  
Ses quantités existent **par emplacement** (Magasin 1, Magasin 2…, Bureau).

---

## Contenu du package

| Dossier | Contenu |
|---------|---------|
| `01_Catalogue_Stock_General` | Typologie, catégories, multi-emplacements, prix, inventaires |
| `02_Bureau_Magasinier` | Approvisionnement bureau, stock bureau, seuils |
| `03_Outillage_Prets` | Cycle de prêt complet (checkout / return / états) |
| `04_Mouvements_Traceabilite` | Types de mouvements, règles d’écriture |
| `05_UI_Pages` | Pages et écrans recommandés |
| `06_Permissions_Alertes` | Qui peut quoi + alertes |
| `07_Regles_Metier` | Règles non négociables |

Transmettre ce package à l’IA développeur comme référentiel de conception.
