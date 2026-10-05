# 02 — MODÈLE DE DONNÉES
## Module Clients & Contrats

### 1. Entité Client (Partner / Customer)

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| id | UUID/PK | Oui | |
| type_client | Enum | Oui | particulier / entreprise_contrat / entreprise_ponctuelle |
| raison_sociale ou nom_prenom | String | Oui | |
| nom_commercial | String | Non | |
| telephone_principal | String | Oui | |
| telephone_secondaire | String | Non | |
| email | String | Non | |
| adresse | Text | Non | |
| ville | String | Non | |
| numero_contribuable / RCCM | String | Non | Pour entreprises |
| conditions_paiement_defaut | Enum/String | Non | Comptant, 7j, 15j, 30j, Fin de mois… |
| limite_credit | Decimal | Non | |
| solde_actuel | Decimal | Calculé | Factures ouvertes – paiements |
| statut | Enum | Oui | Actif, Bloqué, Inactif, Contentieux |
| notes | Text | Non | |
| created_at / updated_at | DateTime | Oui | |

### 2. Entité Contrat

| Champ | Type | Description |
|-------|------|-------------|
| id | UUID/PK | |
| numero_contrat | String unique | Ex: CONT-2026-001 |
| client_id | FK | Obligatoire (entreprise) |
| date_debut | Date | |
| date_fin | Date | Nullable si tacite reconduction |
| date_signature | Date | |
| statut | Enum | Brouillon, Actif, Suspendu, Expiré, Résilié |
| type_contrat | String/Enum | Maintenance préventive, Forfait, À l’intervention… |
| conditions_paiement | String | |
| delai_paiement_jours | Integer | |
| frequence_facturation | Enum | Par intervention, Mensuelle, Trimestrielle… |
| montant_forfait (si applicable) | Decimal | |
| description / clauses | Text | |
| responsable_interne | FK User | |

### 3. Lien Contrat ↔ Véhicule (flotte)

Table d’association :
- contrat_id
- vehicule_id
- date_debut_affectation
- date_fin_affectation
- notes

Un véhicule peut changer de contrat dans le temps (historique conservé).

### 4. Entité Relance (Dunning)

| Champ | Description |
|-------|-------------|
| id | |
| client_id | |
| date_relance | |
| type_relance | Appel, WhatsApp, Email, Lettre, Visite… |
| montant_concerne | |
| factures_concernees | (lien ou texte) |
| resultat | Promesse de paiement, Injoignable, Litige… |
| prochaine_action | |
| user_id | Qui a fait la relance |
| commentaire | |

### 5. Calculs dérivés importants

- **Solde client** = Somme (Factures validées non soldées) – Somme (Paiements)
- **Jours de retard** = Aujourd’hui – Date d’échéance de la facture la plus ancienne non soldée
- **Encours** = Total des factures ouvertes

### 6. Relations clés

- Client 1 → N Contrats
- Contrat 1 → N Véhicules (via table de liaison)
- Client 1 → N OR / Factures / Paiements / Relances
- Véhicule N → 1 Client (propriétaire actuel) + historique éventuel
