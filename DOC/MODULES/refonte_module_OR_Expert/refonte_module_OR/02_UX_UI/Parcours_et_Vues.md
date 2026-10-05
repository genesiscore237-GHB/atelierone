# 02 — UX / UI Cible

## 1. Parcours guidé en 7 étapes (Stepper)

```
[1. Réception] → [2. Diagnostic] → [3. Devis & Autorisation] → [4. Pièces]
        → [5. Travaux & Pointage] → [6. Contrôle Qualité] → [7. Facture & Restitution]
```

### Règles du stepper

- L’étape **courante** est déterminée par le statut de l’OR + les données présentes.
- Les étapes **terminées** sont cochées (vert).
- Les étapes **futures** sont grisées mais cliquables en lecture.
- Un bandeau permanent affiche : **« Prochaine action recommandée : … »**
- Un utilisateur ne voit que les onglets pour lesquels il a la permission.

### Mapping Statut → Étape dominante

| Statut OR | Étape active par défaut |
|-----------|-------------------------|
| OUVERT / RECEPTIONNE | 1. Réception |
| EN_ATTENTE_DIAGNOSTIC | 2. Diagnostic |
| EN_ATTENTE_VALIDATION / DEVIS_ENVOYE | 3. Devis |
| EN_ATTENTE_PIECES / PIECES_RESERVEES | 4. Pièces |
| EN_COURS / EN_TRAVAUX | 5. Travaux |
| CONTROLE_QUALITE | 6. Qualité |
| PRET_A_LIVRER / RESTITUE / FACTURE | 7. Facture & Restitution |

---

## 2. En-tête de fiche (toujours visible)

```
← Liste    OR-26-0147   [Priorité] [Statut] [Alerte si retard]
Immat · Client · Plainte résumée
Entrée · Promesse · Immobilisation · Emplacement
[Technicien responsable ▾]     Tuiles : Pièces | MO | Total TTC | Reste à facturer
```

Actions globales (droite) : uniquement celles autorisées et pertinentes au statut.

---

## 3. Contenu par onglet (vue métier)

### Onglet 1 — Réception
- Données d’entrée (km, carburant, outillage, photos entrée)
- Plainte client
- Emplacement atelier
- Lien vers fiche véhicule / client

### Onglet 2 — Diagnostic
- Rapport diagnostic (constat, cause, préconisations)
- DVI (inspections, points, conversion en lignes)
- Validation / renvoi diagnostic (chef)

### Onglet 3 — Devis & Autorisation
- **Un seul système** : versions de devis
- Création / envoi de version
- Autorisation **ligne par ligne** (Autoriser / Décliner / Reporter)
- Méthode d’autorisation + qui a autorisé
- Historique des versions

### Onglet 4 — Pièces
Visible principalement magasinier + chef :
- Demandes de pièces (Servir / Manquant)
- Réservations / sorties / retours
- Cores / Kits / Pièces client
- Commandes & retours fournisseur
- Mouvements de stock liés à l’OR

### Onglet 5 — Travaux & Pointage
- **Éditeur de lignes** (ajout / modification main d’œuvre et pièces)
- Sélecteur technicien responsable
- Pointage début / fin / pause
- Temps barémé vs réel
- Photos pendant travaux
- Notes technicien

### Onglet 6 — Contrôle Qualité
- Checklist QC
- Essai routier
- Valider / Rejeter (avec motif)

### Onglet 7 — Facture & Restitution
- Facturation (totale, partielle, avance, crédit)
- Reste à facturer visible
- Accusé de réception + WhatsApp
- Restitution (checklist, signature, motif non réparé)
- Marge de l’intervention

---

## 4. Vues filtrées par rôle (exemples)

| Rôle | Onglets visibles par défaut |
|------|-----------------------------|
| Réception | 1, 3 (lecture), 7 |
| Magasinier | 4 (plein), 1 (lecture) |
| Technicien | 2, 5 |
| Chef d’atelier | Tous |
| Boss | 7 + synthèse + lecture globale |

---

## 5. Règles UX non négociables

1. **Jamais** un bouton qui disparaît sans message d’explication.
2. Toute action importante a un état « indisponible » explicite (« Disponible après validation du diagnostic »).
3. Les formulaires longs sont dans des **Dialog** (shadcn) ou des panneaux latéraux, pas 9 modals fixed maison.
4. Feedback immédiat après chaque mutation (toast + invalidation ciblée, pas globale).
5. Mobile / tablette : stepper horizontal scrollable + contenu prioritaire.
