# Onglet 2 — Diagnostic

## Objectif
Passer de la plainte client à un diagnostic technique justifié + inspection visuelle structurée (DVI).

## Blocs fonctionnels

### 2.1 Rapport de diagnostic
| Champ | Type | Obligatoire |
|-------|------|-------------|
| Constat | texte long | Oui |
| Cause probable / racine | texte | Oui |
| Préconisations | liste de lignes proposées | Recommandé |
| Codes défaut (DTC) | liste | Optionnel |
| Outils / tests réalisés | texte | Optionnel |
| Technicien diagnosticien | select | Oui |

**Actions :**
- Enregistrer brouillon
- Soumettre le diagnostic (→ statut EN_ATTENTE_VALIDATION ou équivalent)
- Valider le diagnostic (Chef)
- Renvoyer le diagnostic (Chef, avec motif)

### 2.2 Inspection DVI (Digital Vehicle Inspection)
- Choix du template (Multi-points, Freins, Entretien, etc.)
- Points groupés par zone (Extérieur, Moteur, Freinage, Pneumatiques…)
- Pour chaque point :
  - Statut : OK (vert) / À surveiller (orange) / Défectueux / Urgent (rouge) / Non inspecté
  - Mesure (ex. épaisseur plaquette)
  - Notes
  - Photos / vidéos + annotation
  - Recommandation liée
- Actions :
  - Sauvegarder inspection
  - Envoyer / figer l’inspection (devient non modifiable)
  - Convertir les points défectueux en lignes de devis

### 2.3 Lien Diagnostic ↔ Devis
- Les préconisations et les points DVI convertis alimentent automatiquement le devis (onglet 3).
- On ne crée pas encore de version de devis ici ; on prépare les lignes.

### 2.4 États & visibilité
| Situation | UI |
|-----------|----|
| Aucun diagnostic | Formulaire vide + bouton « Créer le rapport » |
| Brouillon | Éditable |
| Soumis | Lecture + actions Chef (Valider / Renvoyer) |
| Validé | Lecture seule + lien vers devis |

### 2.5 Standards couverts
- Diagnostic structuré (constat / cause / préco)
- DVI multi-points avec sévérité et preuves
- Conversion DVI → lignes
- Circuit de validation chef d’atelier
