# 06 – Cycle de Vie d’un Dossier d’Intervention

## États possibles

| Code                  | Libellé                     | Description |
|-----------------------|-----------------------------|-------------|
| `RECEPTIONNE`         | Réceptionné                 | Véhicule reçu, dossier créé |
| `EN_DIAGNOSTIC`       | En diagnostic               | Technicien en train de diagnostiquer |
| `DEVIS_EN_COURS`      | Devis en cours              | Devis en préparation / modification |
| `DEVIS_ENVOYE`        | Devis envoyé                | Devis transmis au client |
| `EN_ATTENTE_VALIDATION` | En attente validation client | |
| `VALIDE_CLIENT`       | Validé par le client        | Feu vert pour les travaux |
| `EN_COURS_TRAVAUX`    | En cours de travaux         | |
| `TRAVAUX_TERMINES`    | Travaux terminés            | En attente de contrôle / facturation |
| `FACTURE`             | Facturé                     | Facture émise (partielle ou totale) |
| `RESTITUE`            | Véhicule restitué           | Client a récupéré le véhicule |
| `FERME_DEFINITIF`     | Fermé définitivement        | **État final – plus aucune modification** |
| `ANNULE`              | Annulé                      | Dossier annulé (avec motif) |

---

## Transitions autorisées

```
RECEPTIONNE
    → EN_DIAGNOSTIC
    → DEVIS_EN_COURS
    → ANNULE

EN_DIAGNOSTIC
    → DEVIS_EN_COURS
    → VALIDE_CLIENT (si pas de devis formel)
    → ANNULE

DEVIS_EN_COURS
    → DEVIS_ENVOYE
    → EN_ATTENTE_VALIDATION
    → VALIDE_CLIENT
    → ANNULE

DEVIS_ENVOYE / EN_ATTENTE_VALIDATION
    → VALIDE_CLIENT
    → DEVIS_EN_COURS (retour modification)
    → ANNULE

VALIDE_CLIENT
    → EN_COURS_TRAVAUX
    → DEVIS_EN_COURS (ajout de travaux)

EN_COURS_TRAVAUX
    → TRAVAUX_TERMINES
    → DEVIS_EN_COURS (travaux supplémentaires)

TRAVAUX_TERMINES
    → FACTURE
    → RESTITUE
    → EN_COURS_TRAVAUX (retour)

FACTURE
    → RESTITUE
    → FERME_DEFINITIF

RESTITUE
    → FERME_DEFINITIF

FERME_DEFINITIF
    → (aucune transition sortante)
```

---

## Règles de transition

1. Seuls certains rôles peuvent faire certaines transitions (ex: fermeture définitive = responsable / admin).
2. Toute transition est historisée.
3. On ne peut passer à `FERME_DEFINITIF` que si :
   - Le véhicule a été restitué **ou** le client a explicitement abandonné
   - Toutes les pièces sorties sont justifiées
   - La facturation est à jour (ou solde = 0)
4. L’état `ANNULE` nécessite un motif obligatoire.

---

## Affichage recommandé

Dans la liste des dossiers et dans la fiche dossier, utiliser des **badges de couleur** :

- Gris : Réceptionné / En attente
- Bleu : En diagnostic / Devis
- Orange : En cours de travaux
- Vert : Validé / Terminé / Facturé
- Rouge : Annulé
- Noir / Violet : Fermé définitivement
