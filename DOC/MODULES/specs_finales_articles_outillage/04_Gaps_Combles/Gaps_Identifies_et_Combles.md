# Gaps identifiés dans les analyses soumises — et corrections

| # | Gap / ambiguïté | Correction retenue |
|---|-----------------|--------------------|
| 1 | Risque de créer 1 article par variante | **Article conceptuel + Variantes/SKU** explicite |
| 2 | Outils identiques non distingués | **Modèle + Exemplaires** avec n° inventaire unique |
| 3 | Conditionnements (1L/5L/20L) flous | Chaque conditionnement = **variante** distincte |
| 4 | Unités & conversions peu formalisées | Table conversions + unité de base |
| 5 | Core / échange standard absent | Champ/statut « core » sur pièces + flux dépôt/retour coquille |
| 6 | Lien Bureau magasinier | Bureau = emplacement de distribution, transferts tracés |
| 7 | Kits outillage incomplets | Composition + indicateur de complétude |
| 8 | Calibration / maintenance | Tables dédiées + statuts 🟢🟠🔴 |
| 9 | QR code | Spécifié comme cible (génération + scan + actions) |
| 10 | Permissions | Matrice magasinier / technicien / chef / boss |
| 11 | SERVICE mélangé au stock | Type SERVICE sans stock ni emplacement |
| 12 | Prix obligatoires trop stricts | Prix **nullable** ; prix réel = ligne OR |
| 13 | Recherche par équivalence | Table références équivalentes + recherche multi-réf |
| 14 | Historique non écrasable | Timeline append-only (prêts, états, maintenances…) |

Aucun de ces points ne doit rester ambigu à l’implémentation.
