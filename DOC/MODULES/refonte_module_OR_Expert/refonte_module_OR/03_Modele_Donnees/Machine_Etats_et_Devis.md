# 03 — Machine d’états & Unification du devis

## 1. Machine d’états recommandée (simplifiée mais stricte)

```
OUVERT
  → EN_ATTENTE_DIAGNOSTIC
  → EN_ATTENTE_VALIDATION_DEVIS
  → DEVIS_APPROUVE / DEVIS_PARTIELLEMENT_APPROUVE
  → EN_ATTENTE_PIECES (si besoin)
  → EN_COURS_TRAVAUX
  → CONTROLE_QUALITE
  → PRET_A_LIVRER
  → RESTITUE
  → CLOTURE

Branches :
  BLOQUE (avec raison obligatoire)
  ANNULE (avec raison obligatoire)
  EN_ATTENTE_AUTORISATION_SUPPLEMENTAIRE
```

Chaque transition est **déclarée** dans `or-status-machine.ts` avec :
- statuts sources autorisés
- permission requise
- champs obligatoires (raison, etc.)
- effets de bord (notifications, etc.)

---

## 2. Unification du devis (suppression du double chemin)

### Règle d’or
**Il n’existe plus qu’un seul modèle de devis : le devis versionné.**

Le « devis simple » (soumettre / approuver / refuser) est **absorbé** :
- La première version de devis = l’ancien « devis simple »
- L’approbation globale reste possible (bouton « Tout autoriser »)
- L’autorisation ligne par ligne reste le mécanisme fin

### Cycle devis unifié
1. Création version (brouillon)
2. Ajout / édition des lignes (MO + pièces)
3. Envoi au client (SMS / lien / email)
4. Autorisation (globale ou ligne par ligne)
5. Nouvelle version si travaux supplémentaires
6. Les lignes autorisées deviennent exécutables (travaux + sorties stock)

---

## 3. Lignes d’OR

Une ligne peut provenir de :
- Diagnostic / préconisations
- Conversion points DVI
- **Ajout manuel** (nouveau — obligatoire)
- Travaux supplémentaires

Champs minimum :
- type (MO / Pièce / Forfait / Sous-traitance)
- description
- qté, prix, remise
- statut autorisation
- technicien (optionnel)
- temps barémé / temps réel

---

## 4. Pointage & Technicien

- `responsableTechnicienId` : sélecteur visible dans l’en-tête + onglet Travaux
- Pointage : début / fin / pause avec motif
- Affichage temps réel vs barème dans l’onglet Travaux

---

## 5. Facturation

Exposer clairement dans l’UI :
- Total TTC
- Déjà facturé
- Reste à facturer
- Bouton « Facturer une avance / un solde / le total »
- Historique des factures liées à l’OR
