# Module B2 — Outillage & Prêts (Tool Crib)

## Philosophie (best practices industrielles)

Un outil = un **actif** suivi unitairement (ou par quantité si bas de gamme).  
Le cycle est celui d’une **bibliothèque** : checkout → usage → return avec contrôle d’état.

## 1. Cycle de prêt complet

```
[Disponible au bureau]
        │
        ▼  PRÊTER
[En prêt chez Technicien]  ←── date retour prévue, OR optionnel
        │
        ▼  RETOURNER
   Contrôle d’état
        │
        ├── OK ──────────────► [Disponible]
        ├── Endommagé ───────► [En réparation] ou [Réformé] + remarque obligatoire
        ├── Perdu / Volé ────► [Perdu] + remarque + responsabilité
        └── Usé ─────────────► [Usé / à remplacer]
```

## 2. Action « Prêter »

| Champ | Obligatoire |
|-------|-------------|
| Outil (ou article type OUTIL) | Oui |
| Technicien | Oui |
| Date/heure de prêt | Auto |
| Date de retour prévue | Oui (défaut selon type d’outil) |
| OR lié | Non (mais recommandé) |
| Motif / observation | Non |

**Règle** : un même outil (n° série / instance) ne peut pas être prêté deux fois.  
S’il est déjà « En prêt » → refus explicite.

## 3. Action « Retourner »

| Champ | Obligatoire |
|-------|-------------|
| État au retour | Oui : OK / Endommagé / Perdu / Usé |
| Remarque | **Oui si état ≠ OK** |
| Qui réceptionne | Auto (magasinier) |
| Photos (optionnel) | Si endommagé |

## 4. Statuts outil

| Statut | Signification |
|--------|---------------|
| Disponible | Au bureau, prêtable |
| En prêt | Chez un technicien |
| En retard | Date retour prévue dépassée |
| En réparation | Sorti du circuit de prêt |
| Réformé / Perdu / Volé | Sorti définitivement (mouvement de sortie de stock) |

## 5. Alertes prêts

- Liste « Prêts en retard » (magasinier + chef)
- Escalade : J+0 rappel technicien, J+1 alerte magasinier, J+2 alerte chef
- Blocage optionnel : technicien en retard ne peut plus emprunter tant que non régularisé

## 6. Fiche outil

- Identité (code, n° série, marque, catégorie)
- Statut courant + qui l’a
- Historique complet des prêts
- Historique des états (cassé, réparé…)
- Coût d’acquisition (optionnel) pour suivi patrimoine

## 7. Cas particuliers

- **Outil non numéroté (quantité)** : prêt « 1 tournevis cruciforme » sur quantité ; retour = +1 si OK
- **Kit d’outils** : prêt du kit = prêt des composants (ou kit comme unité)
- **Outil personnel technicien** : hors système (ou catalogue « hors stock »)
