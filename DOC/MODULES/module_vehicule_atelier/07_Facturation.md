# 07 – Facturation

## Principes

1. La facturation est **découplée** du statut de fermeture du dossier.
2. On peut facturer **partiellement** ou **totalement**.
3. On peut regrouper plusieurs dossiers du **même client** sur une seule facture.
4. On peut aussi faire une facture par dossier.
5. Les acomptes sont possibles dès la validation du devis.

---

## Cas d’usage supportés

| Cas | Description |
|-----|-------------|
| Facture simple | 1 dossier → 1 facture |
| Facture cumulative | Plusieurs interventions sur le **même véhicule** regroupées |
| Facture multi-véhicules | Plusieurs dossiers de **plusieurs véhicules** du même client |
| Acompte | Facture d’acompte sur devis validé |
| Facture partielle | Facturer seulement certaines lignes (MO ou pièces) |
| Avoir | Correction d’une facture déjà émise |

---

## Structure d’une facture

Une facture contient :

- En-tête client
- Liste des dossiers d’intervention inclus
- Lignes de facturation (provenant des LignePiece + LigneTravail + éventuels forfaits)
- Totaux HT / TVA / TTC
- Acomptes déjà versés
- Net à payer

---

## Règles importantes

1. Une ligne de pièce ou de main d’œuvre ne peut être facturée qu’une seule fois (sauf avoir).
2. On doit pouvoir voir facilement, sur un dossier, ce qui est déjà facturé et ce qui ne l’est pas.
3. Tant que le dossier n’est pas `FERME_DEFINITIF`, on peut encore ajouter des lignes et les facturer.
4. Après `FERME_DEFINITIF`, seule la création d’un avoir est possible.

---

## Lien avec le stock

Les pièces facturées doivent correspondre aux pièces réellement sorties et affectées au dossier.  
Écart éventuel (pièce sortie non facturée ou inversement) doit être visible et justifiable.
