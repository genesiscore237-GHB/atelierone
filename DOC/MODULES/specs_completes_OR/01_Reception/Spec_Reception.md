# Onglet 1 — Réception

## Objectif
Capturer proprement l’entrée du véhicule et figer l’état initial (preuve).

## Contenu fonctionnel complet

### 1.1 Informations d’entrée (lecture + édition si statut le permet)
| Champ | Type | Obligatoire | Notes |
|-------|------|-------------|-------|
| Date/heure d’entrée | datetime | Oui | Prérempli |
| Kilométrage entrée | number | Oui | |
| Niveau carburant | enum (Vide → Plein) | Oui | |
| Emplacement atelier | select | Recommandé | Baie / parking |
| Promesse de restitution | date | Recommandé | |
| Type d’accueil | enum | Oui | RDV / Passage / Dépannage / Astreinte |

### 1.2 État des lieux d’entrée
- Checklist outillage / accessoires (cric, triangle, roue de secours, extincteur, documents, etc.) — reprise de la fiche papier historique
- Zones de dommages préexistants (schéma véhicule cliquable ou liste + photos)
- Observations libres

### 1.3 Photos & médias d’entrée
- Upload multiple (extérieur 4 faces, intérieur, dommages, compteur km)
- Annotation possible
- Horodatage automatique
- Impossible de supprimer après passage au diagnostic (figé)

### 1.4 Plainte / demande client
- Texte libre (déjà présent)
- Catégorisation optionnelle (freinage, moteur, carrosserie, entretien, diagnostic…)
- Priorité client perçue

### 1.5 Actions disponibles
| Action | Condition | Effet |
|--------|-----------|-------|
| Enregistrer les modifications | Permission + statut ≤ EN_ATTENTE_DIAGNOSTIC | Sauvegarde |
| Passer en « En attente diagnostic » | Données minimales OK | Transition statut |
| Imprimer / PDF état des lieux | Toujours | Document |

### 1.6 Règles
- Une fois le diagnostic soumis, l’état des lieux d’entrée devient **lecture seule**.
- Les photos d’entrée restent toujours consultables.
- L’emplacement peut être modifié plus tard (suivi parking).
