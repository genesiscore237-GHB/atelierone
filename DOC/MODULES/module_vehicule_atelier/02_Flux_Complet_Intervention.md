# 02 – Flux Complet d’une Intervention

## Vue d’ensemble du cycle

```
1. RÉCEPTION
   ↓
2. CRÉATION DU DOSSIER D’INTERVENTION (OR)
   ↓
3. DIAGNOSTIC TECHNICIEN
   ↓
4. ÉLABORATION / AJUSTEMENT DU DEVIS
   ↓
5. VALIDATION CLIENT (orale, SMS, signature, etc.)
   ↓
6. RÉSERVATION / COMMANDE / SORTIE DES PIÈCES
   ↓
7. EXÉCUTION DES TRAVAUX
   ↓
8. BILAN D’INTERVENTION + CONTRÔLE QUALITÉ
   ↓
9. FACTURATION (partielle ou totale)
   ↓
10. RESTITUTION DU VÉHICULE
   ↓
11. FERMETURE DÉFINITIVE DU DOSSIER
```

**Important** : Les étapes 3 à 9 restent **modifiables** tant que l’étape 11 n’est pas réalisée.

---

## Détail de chaque étape

### 1. Réception du véhicule

**Acteur** : Réceptionniste / Conseiller service

**Actions** :
- Rechercher le véhicule (plaque, châssis, nom client, téléphone)
- Si trouvé → charger fiche véhicule + client
- Si non trouvé → créer client + véhicule rapidement
- Renseigner / vérifier :
  - Type de véhicule
  - Immatriculation
  - N° de châssis
  - Propriétaire + téléphone
  - Chauffeur + téléphone (si différent)
  - Kilométrage d’entrée
  - Niveau de carburant
  - État général / photos
  - Check-list outillage & accessoires (cric, roue de secours, triangle, etc.)
  - Pannes déclarées par le client
  - Observations
- Signature du déposant (ou validation numérique)
- Génération automatique d’un **Dossier d’Intervention** (OR) en statut « Réceptionné »

### 2. Création du Dossier d’Intervention

Créé automatiquement à la validation de la réception.  
Contient un numéro unique (ex: OR-2026-00482).

### 3. Diagnostic Technicien

**Acteur** : Technicien

- Le technicien prend le dossier
- Ajoute / modifie les lignes de diagnostic
- Peut ajouter des photos, mesures, codes défaut
- Peut proposer des travaux supplémentaires

### 4. Devis

- Généré à partir du diagnostic + pièces + main d’œuvre
- Peut être ajusté plusieurs fois
- Versions historisées (Devis v1, v2…)
- Envoi possible au client (PDF / lien)

### 5. Validation Client

- Statuts possibles : En attente / Validé / Refusé partiellement / Refusé
- Enregistrement de la date et de la méthode de validation

### 6. Gestion des pièces

- Réservation de pièces en stock
- Commande fournisseur si nécessaire
- **Sortie de stock uniquement liée au dossier**
- Retour possible de pièces non utilisées

### 7. Exécution des travaux

- Suivi du temps passé (manuel ou pointeuse)
- Affectation des techniciens
- Avancement des lignes de travaux

### 8. Bilan d’intervention

- Compte-rendu final
- Travaux réalisés vs prévus
- Recommandations
- Kilométrage de sortie
- Photos de fin

### 9. Facturation

- Facture peut être générée à tout moment (acompte, partielle, totale)
- Une même facture peut regrouper plusieurs dossiers du même client
- Ou une facture par dossier

### 10. Restitution

- Check-list de sortie
- Signature client
- Remise des documents / anciennes pièces si demandé

### 11. Fermeture définitive

- Action volontaire et protégée (droits)
- Après fermeture : plus aucune modification possible sur diagnostic, devis, pièces, travaux, facture liée
- L’historique reste consultable

---

## Cas particuliers

- **Dépannage sur site** : même flux, avec indication « Dépannage » et lieu d’intervention
- **Véhicule déjà connu** : pré-remplissage maximal
- **Client multi-véhicules** : possibilité de facturer plusieurs OR ensemble
- **Acompte** : facture d’acompte possible dès validation du devis
