# Audit — Réception d’un véhicule (2026-10-24)

> Audit en lecture seule. Aucun fichier de code modifié pendant la phase d’audit.
> Périmètre : `/dashboard/atelier/reception`, `or.receptionner`, résolution client/véhicule, passage parking, validation, photos, outillage.

## 1. Verdict

Le socle serveur est transactionnel et les tests passent, mais l’interface peut produire des dossiers faux dans plusieurs manipulations normales. Les défauts ne sont pas cosmétiques : ils touchent l’identité du véhicule, le propriétaire, les preuves photographiques et le kilométrage.

## 2. Constats classés

### P0 — données fausses possibles

| # | Constat | Preuve | Impact |
|---|---|---|---|
| P0-1 | Les photos et notes d’outillage ne sont pas vidées quand on change de véhicule | `ReceptionVehicule.tsx:79,119-132,161` ; reset seulement `:100-101` | Les photos du véhicule A peuvent être enregistrées sur B |
| P0-2 | « Créer un nouveau véhicule » ne réinitialise pas l’identifiant chargé | `ReceptionVehicule.tsx:349` | Le dossier est créé sur l’ancien véhicule |
| P0-3 | Les champs véhicule/client restent éditables alors que le serveur ignore leurs modifications | `FormulaireVehicule.tsx:147` ; `or-router.ts:1005-1024` | L’écran affiche une identité, la base en garde une autre |
| P0-4 | Un véhicule possédé peut produire un OR sans client | `or-router.ts:1030-1065` | Dossier « à wartier » alors que le propriétaire existe |
| P0-5 | Un téléphone seul est perdu | `validation-reception.ts:106` ; `or-router.ts:942-943` | Le numéro de rappel n’est pas enregistré |
| P0-6 | Un kilométrage inférieur écrase la fiche véhicule | `or-router.ts:1148-1160` | Référence km fausse pour les passages suivants |
| P0-7 | Le doublon client n’est pas calculé sur la même population côté UI et serveur | `clients-router.ts:836` ; `or-router.ts:970-973` | Refus incohérent, clients supprimés utilisables |

### P1 — permissions, contrat et cohérence métier

| # | Constat | Preuve |
|---|---|---|
| P1-1 | `canReception = modifier || creer` alors que le serveur exige `or.modifier` | `or-status-machine.ts:125` ; `or-router.ts:852` |
| P1-2 | Le type « voiture » est affiché mais non initialisé | `ReceptionVehicule.tsx:75-77` ; `FormulaireVehicule.tsx:147` ; `validation-reception.ts:86-88` |
| P1-3 | Le contrat de complétude diffère UI/serveur (km, type, marque) | `validation-reception.ts:75-124` ; `or-router.ts:874-896` |
| P1-4 | Le dossier déjà ouvert est annoncé comme « à confirmer », sans confirmation réelle | `ReceptionVehicule.tsx:194-200` |
| P1-5 | Tout nouveau client est créé `PART`, sans type/raison sociale | `or-router.ts:978-979` |
| P1-6 | Motif d’entrée et type d’intervention se recouvrent | `ReceptionVehicule.tsx:530-541` |
| P1-7 | Un dépannage sur site crée un passage parking `EN_PARKING` | `or-router.ts` appel `ouvrirPassageReception` ; service |
| P1-8 | Après succès, pas de lien OR, pas d’impression, pas de synthèse | `ReceptionVehicule.tsx:86-105` |
| P1-9 | Aucun brouillon/autosauvegarde malgré photos et signature | état local uniquement |
| P1-10 | Recherche non normalisée, sans debounce, sans états de chargement/erreur | `or-router.ts:810-849` ; `ReceptionVehicule.tsx:85,143-154` |
| P1-11 | Invalidations incomplètes (`listeCanonique`, `vehicules.get`, `garage.vehicles`) | `invalidation-reception.ts:22-33` |
| P1-12 | Pas de mouvement parking `ENTREE` pour la réception | `parking-passage-service.ts` |

### P2 — finitions

- `errors` et `telDoublonEcarte` non réinitialisés.
- `resultats` est un état mort.
- « client sans véhicule lié » est faux pour un client possédant des véhicules.
- Signature = nom tapé, alors que le libellé dit « signature ».
- Aucune photo obligatoire malgré « pièce à conviction ».
- Date de réception non initialisée et incohérence avec `dateOuverture`/`dateEntree`.
- `datePromesse` non contrôlée par rapport à la réception.
- `lieuDepannage` non obligatoire en dépannage.
- `vehicule.id` sans filtre d’agence explicite ; RLS à confirmer.
- Conflit de propriétaire levé comme `Error` générique.
- Risque de deux passages actifs en concurrence.

## 3. Décisions produit prises pour la correction

1. **Kilométrage facultatif** mais explicite : aucune valeur inventée. Le champ indique « laisser vide si non relevé ».
2. **Identité d’un véhicule existant verrouillée** dans la réception. La correction passe par la fiche véhicule/parking.
3. **Client existant verrouillé**. Un bouton « Changer » ne détache que si le véhicule n’a pas déjà un propriétaire ; sinon la cession est requise.
4. **Nouveau client typé** : particulier, entreprise, administration, assurance ou flotte. La raison sociale est conservée.
5. **Dépannage sur site** : crée un OR mais **pas** de passage parking.
6. **Dossier déjà ouvert** : confirmation explicite obligatoire, côté UI et côté serveur.
7. **Photos** : recommandées, non bloquantes ; un avertissement explicite s’affiche si aucune photo.
8. **Date de réception** : préremplie à maintenant, non future ; la même date alimente l’OR et le passage parking.
9. **Signature** : nom tapé assumé ; le libellé est clarifié.
10. **Un seul passage parking actif** : garde applicative et test de concurrence ; pas de suppression d’historique.

## 4. Preuves d’audit

- 7 fichiers de tests réception, 44 tests passés.
- Aucun test composant React sur `ReceptionVehicule` : les défauts d’état ne sont pas couverts.
- `db:check` et build ne sont pas concernés par cette phase d’audit.
