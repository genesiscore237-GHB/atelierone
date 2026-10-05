# Matrice Permissions × Rôles

| Action / Zone | Réception | Magasinier | Technicien | Chef atelier | Boss |
|---------------|-----------|------------|------------|--------------|------|
| Voir fiche OR | ✓ | ✓ | ✓ | ✓ | ✓ |
| Onglet Réception (édition) | ✓ | — | — | ✓ | ✓ |
| Onglet Diagnostic | lecture | — | ✓ | ✓ | lecture |
| Valider / renvoyer diagnostic | — | — | — | ✓ | ✓ |
| Onglet Devis + autorisation | ✓ (envoi) | — | lecture | ✓ | ✓ |
| Onglet Pièces (complet) | lecture | ✓ | lecture | ✓ | lecture |
| Servir / réserver / sortir | — | ✓ | — | ✓ | — |
| Onglet Travaux + pointage | — | — | ✓ | ✓ | lecture |
| Affecter technicien | — | — | — | ✓ | ✓ |
| Onglet QC | — | — | lecture | ✓ | ✓ |
| Onglet Facture & Restitution | ✓ | — | — | ✓ | ✓ |
| Changer statut manuellement | limité | — | — | ✓ | ✓ |
| Voir marge | — | — | — | ✓ | ✓ |

Les permissions doivent être branchées finement (plus seulement 3 flags grossiers).
