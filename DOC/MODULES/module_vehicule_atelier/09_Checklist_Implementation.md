# 09 – Checklist d’Implémentation (ne rien oublier)

Utilisez cette checklist pour valider que l’implémentation est complète.

## Réception & Création de dossier

- [ ] Recherche unifiée (plaque + châssis + nom + téléphone)
- [ ] Création rapide client + véhicule depuis le même écran
- [ ] Check-list outillage complète (tous les éléments de la fiche papier + « Autres »)
- [ ] Enregistrement kilométrage, niveau carburant, pannes déclarées
- [ ] Génération automatique du numéro de dossier (OR-AAAA-XXXXX)
- [ ] Photos de réception possibles
- [ ] Signature / validation du déposant

## Lien Véhicule ↔ Client

- [ ] Un véhicule a toujours un propriétaire
- [ ] Historique complet des interventions par véhicule
- [ ] Historique complet par client (multi-véhicules)
- [ ] Changement de propriétaire historisé

## Cycle de vie du dossier

- [ ] Tous les statuts listés dans `06_Cycle_de_Vie_Dossier.md` existent
- [ ] Transitions respectées
- [ ] Fermeture définitive protégée (droit + confirmation)
- [ ] Après fermeture → plus aucune modification possible

## Diagnostic / Devis / Travaux

- [ ] Diagnostic modifiable jusqu’à fermeture
- [ ] Devis versionné (historique des versions)
- [ ] Possibilité d’ajouter des travaux supplémentaires en cours de route
- [ ] Temps barémé + temps réel

## Stock (critique)

- [ ] Impossible de sortir une pièce sans dossier d’intervention ouvert
- [ ] Toute sortie crée une LignePiece liée
- [ ] Contrôle du stock disponible
- [ ] Retour de pièces possible et justifié
- [ ] Traçabilité complète pièce → dossier → véhicule

## Facturation

- [ ] Facture sur un seul dossier
- [ ] Facture cumulative (plusieurs dossiers même client)
- [ ] Acompte possible
- [ ] Facture partielle possible
- [ ] Visibilité « déjà facturé / restant à facturer » sur le dossier

## Traçabilité & Audit

- [ ] Journal des actions (qui, quand, quoi)
- [ ] Historique des modifications de devis / diagnostic
- [ ] Impossible de supprimer un dossier fermé

## Expérience utilisateur

- [ ] L’utilisateur sait toujours sur quel véhicule/dossier il travaille
- [ ] Pas de perte de contexte
- [ ] Messages d’erreur clairs quand une règle métier bloque une action
- [ ] Version mobile utilisable pour la réception et le suivi atelier

## Intégration

- [ ] Lien avec le module Stock (catégories déjà définies)
- [ ] Lien avec le module Clients
- [ ] Lien avec le module Facturation / Comptabilité

---

**Quand toutes les cases sont cochées → le module est complet et sans faille majeure.**
