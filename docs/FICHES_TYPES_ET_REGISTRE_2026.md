# FICHES TYPES & REGISTRE DES ANOMALIES — Module 1 (PHASE 10)

Date : 2026-09-11. Références : `docs/CONCEPTION_SEED_GUIDE_PHASE1_2026.md` (§I filtre à huile).

---

## 1. Fiche type — FILTRE À HUILE (catégorie G010101, id 17)

Chaine : Pièces moteur (G01) › Filtres (G0101) › Filtre à huile (G010101).

| Donnée | Guide | Exemple (variante référence = produit 178) |
|---|---|---|
| Type de montage | SPIN_ON / CARTRIDGE / BOLT_ON | SPIN_ON |
| Filetage | format `diamètre/pas` : `3/4-16` (impérial) ou `M18x1.5` (métrique) | (`3/4-16` famille) |
| Diamètre extérieur | en mm | 76 mm |
| Référence fabricant | marque + réf constructeur | Mann W712/92 |
| Référence OEM | code d'origine équipementier | 90915-YZZD1 |
| Compatibilité | marque → modèle → motorisation | Toyota (etc.) |
| Bague d'étanchéité | champ article | incluse |

Pièges documentés (`guide_common_errors`, catégorie 17) :
- `FILETAGE_UNITE_INCOHERENTE` — unités mélangées (« 3/4 × 16 »).
- `REF_FAB_DANS_OEM` — référence fabricant saisie dans le champ OEM (ou l'inverse).
- `TYPE_FILTRE_MANQUANT` — type de montage absent.

Règles (`guide_rules`, catégorie 17) : VALEUR SPIN_ON→filetage exigé ; UNITE (mm, N·m) ;
PIEGE filetage ≠ taille de clé ; PIEGE REF vs OEM ; ASSOCIATION CARTRIDGE→joint torique.

## 2. Fiche type — CLÉ DYNAMOMÉTRIQUE (catégorie id 11 « Outillage »)

| Niveau | Attributs (définitions existantes id 214–217) | Règle |
|---|---|---|
| MODÈLE | plage de couple (`plage_couple`), carré d'entraînement (`carre_transmission`), précision (`precision`) | couple en N·m (jamais daN·m) |
| EXEMPLAIRE | `calibrable` + `certification` | calibration périodique ISO 6789 ; exemplaire perdu/volé → statut PERDU/VOLE/REFORME, jamais supprimé |

Guide fallback `guide_categories` (typeProduit = OUTIL) : « Outillage — modèle vs exemplaire ».

## 3. Registre des anomalies intentionnelles et constatées (état observé)

| Code | Constat | Gravité | Traitement |
|---|---|---|---|
| ORPHAN_VARIANTE | 154 variantes/exemplaires actifs sans `article_id` (parmi 285 actifs) | warning | Règle CAT-01 ajoutée ; à rattacher via la fiche article (référencement) |
| DOUBLON_CANDIDAT | groupes de variantes à même `designation_courte` (ex. « Filtre à huile test … », Mann W712/92 ×N) | error | Règle CAT-01 existante ; rattachement à 1 article puis diversifier |
| REF_FAB_DANS_OEM | risque sur les saisies test (WFB-*) | error | Guidé par la fiche + erreur `REF_FAB_DANS_OEM` |
| GARAGE_ORPHELINES | lignes « Pièce garage … » (GPJ-*) dans des racines (ex. CAT-FIL) sans référence | warning | Reclassement en catégorie adaptée ou archivage |
| GTIN_VACANTS | 0 GTIN/UPC/constructeur renseigné dans les références | info | Extensions seed v3 (PHASE suivante, à planifier) |
| TAXONOMIE_44R | 44 racines incohérentes (CAT-*×9, G*×22, *GT, legacy) | warning | Conservé tel quel (alias, décision d1) ; `niveauOntologie`/`domaine` désormais posés sur tout l'arbre |

Logique de cotation CAT-01 mise à jour : pénalités = 2×incomplet + 2×sansCat + 1×sansMarque + 1×sansRéf + 3×doublons + 2×orphelins (score 0–100).

## 4. Décisions appliquées (validation Phase 1)

- d1 FOURNITURE (7) et KIT (1) **officialisés** (enums tRPC superset, commentaire schéma) ; EQUIPEMENT permis.
- d2 tables `guide_*` + `modele_valeur`/`explication` retenues (non-cassant).
- d3 domaine = AUTOMOBILE / ATELIER ; `niveau_ontologie` = FAMILLE / CATEGORIE / TYPE posés sur 100 % des catégories.
- d4 codes existants conservés (alias / référence historique).
- d5 `mode=explain` prioritaire : les `explications[]` sont servies par `articles.recherche` pour chaque résultat.