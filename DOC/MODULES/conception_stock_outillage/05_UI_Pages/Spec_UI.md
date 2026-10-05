# UI recommandée

## Page 1 — Catalogue / Articles

**Liste**
- Recherche globale (code, code-barres, désignation, marque, OEM)
- Filtres : type, catégorie, emplacement, sous seuil, actif
- Colonnes : code, désignation, type, stock total, stock bureau, prix vente (si renseigné)
- Bouton « Nouvel article » (formulaire rapide + complet)

**Fiche article**
- Onglet Général (identité, type, catégorie, refs, prix facultatifs)
- Onglet Stock (tableau par emplacement + seuils)
- Onglet Mouvements
- Onglet Fournisseurs (optionnel)

Conformité UX : recherche dès >10 lignes, toast, loading, empty state, confirmation si désactivation.

## Page 2 — Bureau & Outillage

**Tableau de bord bureau**
- Tuiles : articles sous seuil | prêts en cours | prêts en retard | mouvements du jour
- Liste stock bureau (quantité, seuil, actions rapides)
- Liste prêts en cours / en retard

**Actions principales**
- Approvisionner le bureau
- Prêter un outil
- Retourner un outil
- Dotation consommable
- Déclarer perte / casse

**Fiche outil**
- Statut + détenteur actuel
- Historique des prêts
- Historique des états

## Page 3 — Mouvements (transverse)

- Liste filtrable de tous les mouvements
- Accès depuis article, bureau, OR

## Intégration OR

Depuis l’onglet Pièces d’un OR :
- Demande de pièce → magasinier sert depuis bureau ou magasin
- Sortie liée OR
- Dotation conso liée OR
- Prêt d’outil lié OR (optionnel)
