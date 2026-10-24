# Plan de correction — Réception d’un véhicule

> Statut : **exécuté et vérifié** le 2026-10-24.
> Audit associé : `docs/AUDIT-RECEPTION-VEHICULE-2026-10-24.md`.
> Rapport final : `docs/RAPPORT-CORRECTION-RECEPTION-2026-10-24.md`.

## 1. Lots de travail

### Lot R1 — État de l’écran et identités

- [x] Reset complet au changement de véhicule : photos, notes d’outillage, erreurs, doublon écarté.
- [x] « Nouveau véhicule » réinitialise tout l’état.
- [x] Véhicule existant : identité en lecture seule.
- [x] Client existant : coordonnées en lecture seule.
- [x] Bouton « Changer de client » limité aux véhicules sans propriétaire.
- [x] Type de véhicule initialisé à `voiture`.
- [x] Date de réception initialisée à maintenant.
- [x] Reset complet après succès.

### Lot R2 — Règles client / véhicule

- [x] Adopter le propriétaire historique quand aucun client n’est saisi.
- [x] Refuser un téléphone sans nom.
- [x] Filtrer les clients supprimés/inactifs et véhicules inactifs dans la recherche.
- [x] Filtrer les clients supprimés dans le contrôle de doublon serveur.
- [x] Vérifier l’agence du véhicule dans le chemin `vehicule.id`.
- [x] Convertir le conflit de propriétaire en `TRPCError` métier.
- [x] Ajouter le type de client et la raison sociale à la création.
- [x] Interdire deux passages actifs en concurrence (verrou par véhicule).

### Lot R3 — Validation et métier

- [x] Kilométrage facultatif dans l’UI, le payload et la validation.
- [x] Refuser un km inférieur au dernier connu.
- [x] Date de réception non future ; cohérence `dateOuverture` / `dateReception`.
- [x] Même date pour le passage parking.
- [x] `datePromesse` >= date de réception.
- [x] Permissions : `canReception = or.modifier`, formulaire et submit désactivés sans permission.
- [x] Type d’intervention limité à `ATELIER` / `DEPANNAGE`.
- [x] Dépannage : pas de passage parking.
- [x] Confirmation explicite d’un nouveau dossier sur véhicule déjà ouvert (UI + serveur).
- [x] Signature : libellé clarifié.
- [x] Photos : avertissement si aucune photo.

### Lot R4 — Exploitation

- [x] Panneau de succès avec lien OR et lien fiche véhicule.
- [x] Brouillon local (hors photos) avec restauration explicite.
- [x] Recherche debouncée, normalisée plaque/téléphone, avec loading/erreur.
- [x] Filtrer les résultats inactifs/supprimés.
- [x] Invalidations complètes.
- [x] Tests serveur et validation renforcés.

## 2. Tests ajoutés / renforcés

- Réception : passage parking, ancien `SORTI`, confirmation de dossier ouvert.
- Propriétaire adopté, téléphone seul refusé, client supprimé, client entreprise.
- Km inférieur, date future, promesse antérieure, dépannage sans passage.
- Véhicule inactif, plaque incohérente.
- Recherche téléphone normalisée et exclusion des clients supprimés.
- Validation : km vide accepté, téléphone sans nom refusé, dépannage et promesse.
- Suite complète : **1270 passés, 3 ignorés**.

## 3. Definition of done

- [x] `vitest` complet vert.
- [x] `next build` vert.
- [x] `tsc` sans nouvelle erreur dans les fichiers du lot (305 baseline).
- [x] `db:check` schéma identique (29 divergences de données tolérées).
- [x] Rapport final écarts / prévu / réalisé.
- [x] `graphify update .`.

## 4. Journal d’exécution

| Date | Lot | Résultat | Preuve |
|---|---|---|---|
| 2026-10-24 | Audit | Constats figés | `AUDIT-RECEPTION-VEHICULE-2026-10-24.md` |
| 2026-10-24 | R1 | État et identités sécurisés | tests + build |
| 2026-10-24 | R2 | Règles client/véhicule | tests d’intégration |
| 2026-10-24 | R3 | Validation et métier | tests d’intégration |
| 2026-10-24 | R4 | Exploitation et UX | suite complète + build |
| 2026-10-24 | Final | 1270 / 3, build, base | `vitest-reception-final.log`, `next-build-reception-final.log`, `db-check-reception-final.log` |
