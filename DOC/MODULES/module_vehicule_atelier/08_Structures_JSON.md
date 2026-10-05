# 08 – Structures JSON (exemples pour implémentation)

## 1. Création d’une réception (payload)

```json
{
  "vehicule": {
    "immatriculation": "AA-123-BB",
    "numero_chassis": "VF3XXXXXXXXXXXXXX",
    "type_vehicule": "VP",
    "marque": "Peugeot",
    "modele": "308",
    "annee": 2019,
    "energie": "Diesel"
  },
  "client": {
    "nom": "Dupont",
    "prenom": "Jean",
    "telephone_principal": "0612345678",
    "email": "jean.dupont@email.com"
  },
  "chauffeur": {
    "nom": "Martin",
    "telephone": "0698765432"
  },
  "reception": {
    "kilometrage_entree": 87540,
    "niveau_carburant": "1/2",
    "pannes_declarees": "Voyant moteur allumé + bruit à l’accélération",
    "observations": "Client pressé, souhaite devis rapide",
    "outillage": {
      "cric": true,
      "cle_de_roue": true,
      "manivelle": false,
      "roue_de_secours": true,
      "extincteur": false,
      "triangle": true,
      "documents": true,
      "boite_a_pharmacie": true,
      "autres": "1 gilet de sécurité"
    }
  }
}
```

## 2. Dossier d’intervention (exemple complet simplifié)

```json
{
  "id": "or_01HXYZ...",
  "numero": "OR-2026-00482",
  "statut": "EN_COURS_TRAVAUX",
  "vehicule_id": "veh_01H...",
  "client_id": "cli_01H...",
  "date_reception": "2026-09-02T09:15:00",
  "kilometrage_entree": 87540,
  "pannes_declarees": "Voyant moteur allumé...",
  "lignes_diagnostic": [
    {
      "id": "diag_1",
      "description": "Défaut sonde lambda banc 1",
      "gravite": "Moyenne",
      "technicien_id": "user_42"
    }
  ],
  "lignes_pieces": [
    {
      "produit_id": "prod_filtre_huile",
      "quantite": 1,
      "prix_vente": 18.90,
      "mouvement_stock_id": "mvt_987"
    }
  ],
  "lignes_travail": [
    {
      "libelle": "Diagnostic électronique + contrôle",
      "temps_bareme": 0.5,
      "temps_reel": 0.6,
      "taux_horaire": 65.00
    }
  ]
}
```

## 3. Sortie de pièce (payload minimal)

```json
{
  "dossier_intervention_id": "or_01HXYZ...",
  "produit_id": "prod_123",
  "quantite": 2,
  "prix_vente_unitaire": 24.90
}
```

Le backend doit :
1. Vérifier que le dossier est ouvert
2. Vérifier le stock disponible
3. Créer le mouvement de stock
4. Créer la LignePiece liée
