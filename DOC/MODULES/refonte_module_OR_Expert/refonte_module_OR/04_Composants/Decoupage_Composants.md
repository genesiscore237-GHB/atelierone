# 04 — Découpage Composants & Hooks

## Composants prioritaires à extraire

| Composant | Responsabilité | Max lignes |
|-----------|----------------|------------|
| `OrListPage` | Liste + recherche + création rapide | 200 |
| `OrDetailLayout` | Header + Stepper + outlet onglet | 150 |
| `OrStepper` | Stepper 7 étapes + prochaine action | 120 |
| `OrHeader` | Identité OR + tuiles + actions globales | 150 |
| `ReceptionTab` | Données d’entrée | 200 |
| `DiagnosticTab` | Diagnostic + DVI | 250 |
| `DevisTab` | Versions + autorisation lignes | 300 |
| `PiecesTab` | Tout le flux pièces / magasin | 350 |
| `TravauxTab` | Lignes éditables + pointage + technicien | 300 |
| `QualiteTab` | QC + essai | 200 |
| `FactureRestitutionTab` | Facture + restitution + marge | 280 |
| `LignesEditor` | Tableau éditable des lignes | 250 |
| `Timeline` | Historique cycle de vie | 100 |

## Hooks

| Hook | Rôle |
|------|------|
| `useOrDetail(id)` | Agrège les queries nécessaires (ou par onglet) |
| `useOrPermissions()` | Flags fins par action |
| `useOrStepper(or)` | Calcule étape courante + prochaine action |
| `useOrStatusActions(or)` | Actions de statut disponibles |

## Modals

Remplacer les 8+ modals « fixed inset-0 » par le système **Dialog** du design system (shadcn/ui ou équivalent déjà présent dans le projet).  
Un seul state : `activeModal: 'diagnostic' | 'dvi' | 'qc' | ... | null`.
