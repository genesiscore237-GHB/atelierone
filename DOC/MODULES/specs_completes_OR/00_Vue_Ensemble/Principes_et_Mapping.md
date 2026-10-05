# Vue d’ensemble & Mapping

## 1. Structure écran (déjà en place — à conserver)

```
[Breadcrumb]
[Sous-nav Véhicules & Atelier]
[Bandeau info refonte + bouton Vue complète]

┌─ HEADER OR ─────────────────────────────────────────────┐
│ ← Liste   OR-xx-xxxx  [Priorité] [Statut]               │
│ Véhicule · Client · Plainte                             │
│ Entrée · Promesse · Immobilisation · Emplacement        │
│ [Technicien responsable ▾]                              │
│ Tuiles : Pièces | Main d'œuvre | Total TTC              │
│ [Actions globales contextuelles]                        │
└─────────────────────────────────────────────────────────┘

[→ Prochaine action recommandée : …]

[Stepper 1 2 3 4 5 6 7]

┌─ CONTENU DE L’ONGLET ACTIF ─────────────────────────────┐
│ ...                                                     │
└─────────────────────────────────────────────────────────┘

[Timeline / Historique du cycle de vie — toujours en bas]
```

## 2. Mapping Statut → Onglet actif par défaut

| Statut | Onglet par défaut | Prochaine action type |
|--------|-------------------|------------------------|
| OUVERT / RECEPTIONNE | 1 Réception | Compléter l’état des lieux / photos |
| EN_ATTENTE_DIAGNOSTIC | 2 Diagnostic | Réaliser et soumettre le diagnostic |
| EN_ATTENTE_VALIDATION | 3 Devis | Créer / envoyer le devis |
| DEVIS_ENVOYE | 3 Devis | Attendre autorisation client |
| DEVIS_APPROUVE / PARTIEL | 4 Pièces ou 5 Travaux | Réserver/sortir pièces ou démarrer travaux |
| EN_ATTENTE_PIECES | 4 Pièces | Traiter demandes / réceptionner |
| EN_COURS | 5 Travaux | Pointer et réaliser les lignes |
| CONTROLE_QUALITE | 6 Qualité | Effectuer le contrôle qualité |
| PRET_A_LIVRER | 7 Facture & Restitution | Facturer et restituer |
| RESTITUE / CLOTURE | 7 | Consultation / historique |

## 3. Règles transverses d’affichage

- Un onglet **verrouillé** (futur) reste visible en lecture seule avec message « Disponible après … ».
- Un onglet **terminé** affiche un badge ✓ et le résumé de ce qui a été fait.
- Le bandeau « Prochaine action » est calculé côté front à partir du statut + données présentes (diagnostic soumis ?, devis envoyé ?, QC validé ?, etc.).
- Les actions qui changent de statut passent toujours par la machine d’états backend.
