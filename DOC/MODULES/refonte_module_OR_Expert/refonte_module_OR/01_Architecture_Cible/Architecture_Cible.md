# 01 — Architecture Cible

## 1. Principes d’architecture

| Principe | Application |
|----------|-------------|
| Single Responsibility | 1 composant = 1 responsabilité métier claire |
| Route-driven UI | L’URL est la source de vérité (pas un state local) |
| Role-based visibility | Les blocs sont filtrés par permission fine |
| Controlled state machine | Les transitions de statut sont le guide du parcours |
| Progressive disclosure | On n’affiche que ce qui est pertinent à l’étape courante |

---

## 2. Structure de routes cible

```
/dashboard/ordres-reparation                    → Liste + création
/dashboard/ordres-reparation/nouveau            → Formulaire création (optionnel)
/dashboard/ordres-reparation/[id]               → Fiche OR (layout avec stepper)
/dashboard/ordres-reparation/[id]?tab=reception
/dashboard/ordres-reparation/[id]?tab=diagnostic
/dashboard/ordres-reparation/[id]?tab=devis
/dashboard/ordres-reparation/[id]?tab=pieces
/dashboard/ordres-reparation/[id]?tab=travaux
/dashboard/ordres-reparation/[id]?tab=qualite
/dashboard/ordres-reparation/[id]?tab=facture-restitution
```

**Avantages** :
- Historique navigateur correct
- Liens partageables
- Deep-linking possible
- Onglet = état URL (pas 8 booléens)

---

## 3. Découpage des fichiers (cible)

```
ordres-reparation/
├── page.tsx                          # Liste uniquement
├── [id]/
│   ├── page.tsx                      # Layout fiche + stepper + header
│   ├── layout.tsx                    # (optionnel)
│   └── _components/
│       ├── OrHeader.tsx
│       ├── OrStepper.tsx
│       ├── tabs/
│       │   ├── ReceptionTab.tsx
│       │   ├── DiagnosticTab.tsx
│       │   ├── DevisTab.tsx
│       │   ├── PiecesTab.tsx
│       │   ├── TravauxTab.tsx
│       │   ├── QualiteTab.tsx
│       │   └── FactureRestitutionTab.tsx
│       ├── shared/
│       │   ├── LignesEditor.tsx
│       │   ├── StatutBadge.tsx
│       │   ├── PrioriteSelector.tsx
│       │   └── Timeline.tsx
│       └── modals/                   # Dialog shadcn/ui unifiés
│           ├── DiagnosticModal.tsx
│           ├── DevisVersionModal.tsx
│           └── ...
├── _hooks/
│   ├── useOrPermissions.ts
│   ├── useOrStepper.ts
│   └── useOrQueries.ts
└── _lib/
    └── or-status-machine.ts          # Transitions autorisées
```

**Règle** : aucun fichier UI > 300 lignes. Au-delà → découper.

---

## 4. Gestion d’état

| Besoin | Solution |
|--------|----------|
| Données serveur | tRPC + React Query (déjà en place) |
| Onglet actif | `searchParams.tab` (URL) |
| Modals | 1 state `activeModal: string | null` ou lib Dialog |
| Formulaire local | React Hook Form + zod (par onglet) |
| Permissions | `useOrPermissions()` → flags fins par action |

---

## 5. Permissions cibles (plus fines)

| Permission | Qui | Donne accès à |
|------------|-----|---------------|
| `or.consulter` | Tous | Lecture fiche |
| `or.receptionner` | Réception | Création + onglet Réception |
| `or.diagnostiquer` | Technicien / Senior | Onglet Diagnostic + DVI |
| `or.deviser` | Chef / Conseiller | Onglet Devis + autorisation |
| `or.pieces.gerer` | Magasinier | Onglet Pièces complet |
| `or.pieces.servir` | Magasinier | Servir / manquant |
| `or.travailler` | Technicien | Onglet Travaux + pointage |
| `or.qualite` | Chef / Contrôleur | Onglet QC |
| `or.facturer` | Réception / Boss | Facturation |
| `or.restituer` | Réception | Restitution |
| `or.modifier_statut` | Chef | Changement statut manuel |

---

## 6. Backend : ce qui change peu

- Conserver `atelier-service.ts` (transitions)
- Unifier les endpoints devis (supprimer le chemin « devis simple » côté UI)
- Exposer clairement `or.pointageIntervention` et `or.assignerTechnicien`
- Ajouter si besoin des endpoints de lecture optimisés par onglet (éviter 8 queries systématiques)
