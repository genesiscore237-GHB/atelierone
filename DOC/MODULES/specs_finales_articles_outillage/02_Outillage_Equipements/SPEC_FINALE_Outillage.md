# SPEC FINALE — Outillage & Équipements

## 1. Modèle / Exemplaire (validé)

| Niveau | Contenu |
|--------|---------|
| **Modèle** (article type OUTIL/EQUIPEMENT) | Désignation, marque, réf, caractéristiques techniques, calibrable oui/non |
| **Exemplaire** (variante outillage) | N° inventaire (OT-xxxxx), n° série, état, emplacement, responsable, historique |

Trois clés dynamométriques identiques = trois exemplaires.

## 2. Types d’outils

- INDIVIDUEL
- KIT / COFFRET (composition + indicateur de complétude)
- JEU
- MACHINE / ÉQUIPEMENT
- CONSOMMABLE d’outillage (géré comme consommable, pas comme prêt)

## 3. Cycle de vie exemplaire (validé)

```
Achat → Enregistrement (bureau ou magasin)
  → Disponible
  → PRÊT (technicien, date retour prévue, OR optionnel)
  → RETOUR (état OK / Endommagé / Perdu / Usé)
        ├── OK → Disponible
        ├── Endommagé → En réparation / remarque obligatoire
        ├── Perdu/Volé → sortie de stock + responsabilité
        └── Usé → à remplacer
  → Maintenance / Calibration
  → Réforme
```

**Règles** :
- Un exemplaire en prêt ne peut pas être prêté une 2ᵉ fois.
- Retour ≠ OK ⇒ remarque obligatoire.
- Alertes retard : J+0 technicien, J+1 magasinier, J+2 chef.
- Option : bloquer les nouveaux prêts si retard non régularisé.

## 4. Écran fiche exemplaire — onglets

`Identification | Technique | Localisation | Affectation | État | Maintenance | Calibration | Achat & Garantie | Documents | Historique`

Champs dynamiques selon le type (clé dynamo, cric, multimètre, pont…).

## 5. Localisation hiérarchique

Site → Zone → Atelier → Poste → Armoire → Rayon → Casier  
(+ QR code sur armoire et sur exemplaire).

## 6. QR Code (fonctionnalité cible)

Scan → fiche rapide :
- État, emplacement, calibration
- Actions : Emprunter / Retourner / Signaler / Historique

## 7. Kits

Composition (`kits_lignes`) + statut **Complet / Incomplet (n manquants)**.  
Prêt du kit = prêt des composants (ou kit comme unité selon paramétrage).

## 8. Lien avec le Bureau magasinier

- Stock des outils courants au bureau
- Approvisionnement tracé magasin → bureau
- Prêts et retours depuis le bureau
- Dotations consommables depuis le bureau
