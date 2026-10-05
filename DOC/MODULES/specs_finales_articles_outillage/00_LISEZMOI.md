# SPECS FINALES VALIDÉES — Articles / Catalogue + Outillage / Équipements

**AtelierOne — Garage Polyvalent Junior**  
**Statut : référentiel d’implémentation après revue expert**

---

## Ce qui a été fait dans cette version

1. **Revue croisée** des analyses soumises (familles, blocs d’écran, variantes, modèles vs exemplaires).
2. **Comblement des gaps** identifiés (unités/conversions, kits, core/échange standard, bureau vs magasins, QR, alertes, permissions, lien OR).
3. **Clarification des modèles** :
   - Articles → Article conceptuel + Variantes/SKU
   - Outillage → Modèle + Exemplaires physiques
4. **Alignement** avec le module Bureau magasinier + prêts déjà conçu.
5. **Ordre d’implémentation** réaliste sans casser l’existant.

---

## Structure du package

| Dossier | Contenu |
|---------|---------|
| `00_Synthese_Expert` | Décisions structurantes + ce qui change vs les specs précédentes |
| `01_Articles_Catalogue` | Spec finale module Articles (prête à coder) |
| `02_Outillage_Equipements` | Spec finale Outillage & Équipements |
| `03_Variantes_Et_Modeles` | Règles Article/Variante et Modèle/Exemplaire |
| `04_Gaps_Combles` | Liste des manques comblés |
| `05_Modele_Donnees` | Tables & relations cibles |
| `06_Ordre_Implementation` | Roadmap pour l’IA développeur |

---

## Consigne pour l’IA développeur

Implémenter **strictement** selon ces fichiers finaux.  
En cas de conflit avec une ancienne spec, **celle-ci prime**.
