# 04 – Écran de Réception Véhicule (Spécification détaillée)

## Objectif

Remplacer et améliorer la fiche papier actuelle tout en respectant les habitudes de l’utilisateur.  
L’écran doit permettre de **rechercher ou créer** très rapidement un véhicule et son propriétaire, puis d’enregistrer la réception.

---

## Layout recommandé (Desktop)

```
+-----------------------------------------------------------------------+
|  RÉCEPTION VÉHICULE                          [Nouvelle réception]     |
+-----------------------------------------------------------------------+
|                                                                       |
|  Recherche rapide : [________________________]  (plaque, châssis,     |
|                     nom, téléphone, n° client)                        |
|                                                                       |
|  Résultats de recherche (si trouvés) :                                |
|  ┌─────────────────────────────────────────────────────────────────┐  |
|  │ AA-123-BB  |  Peugeot 308  |  M. Dupont  |  06 12 34 56 78     │  |
|  │ CC-456-DD  |  Renault Clio |  Mme Martin |  07 98 76 54 32     │  |
|  └─────────────────────────────────────────────────────────────────┘  |
|                                                                       |
|  ou                                                                   |
|                                                                       |
|  [ Créer un nouveau véhicule + client ]                               |
+-----------------------------------------------------------------------+
```

Une fois le véhicule sélectionné ou créé, le formulaire principal s’affiche.

---

## Formulaire principal de réception

### Section 1 – Véhicule

| Champ                    | Type              | Obligatoire | Comportement |
|--------------------------|-------------------|-------------|--------------|
| Immatriculation           | Text + recherche  | Oui         | Auto-formatage + recherche live |
| N° de châssis            | Text              | Recommandé  | |
| Type de véhicule         | Select            | Oui         | VP / VU / PL / Moto / Engin… |
| Marque                   | Select / Autocomplete | Oui     | |
| Modèle                   | Select / Autocomplete | Oui     | |
| Version / Finition       | Text              | Non         | |
| Année                    | Number            | Non         | |
| Couleur                  | Text              | Non         | |
| Énergie                  | Select            | Non         | |

### Section 2 – Client / Propriétaire

| Champ                    | Type              | Obligatoire | Comportement |
|--------------------------|-------------------|-------------|--------------|
| Nom / Raison sociale     | Text + recherche  | Oui         | Recherche live |
| Prénom                   | Text              | Non         | |
| Téléphone principal      | Tel               | Oui         | |
| Téléphone secondaire     | Tel               | Non         | |
| Email                    | Email             | Non         | |
| Adresse                  | Textarea          | Non         | |

**Si le client existe déjà** → pré-remplissage + possibilité de le modifier.

### Section 3 – Chauffeur (si différent du propriétaire)

| Champ                    | Type     | Obligatoire |
|--------------------------|----------|-------------|
| Nom du chauffeur         | Text     | Non         |
| Téléphone du chauffeur   | Tel      | Non         |

### Section 4 – Informations d’entrée

| Champ                    | Type     | Obligatoire | Notes |
|--------------------------|----------|-------------|-------|
| Date & heure de réception| DateTime | Oui         | Défaut = maintenant |
| Kilométrage d’entrée     | Number   | Oui         | |
| Niveau de carburant      | Select   | Recommandé  | Vide / ¼ / ½ / ¾ / Plein |
| Réceptionniste           | Select   | Oui         | Utilisateur connecté par défaut |

### Section 5 – Check-list Outillage & Accessoires

Reprendre **exactement** les éléments de la fiche papier actuelle + possibilité d’en ajouter :

- CRIC
- CLÉ DE ROUE
- MANIVELLE
- ROUE DE SECOURS
- EXTINCTEUR
- RADIO
- TRIANGLE
- CD
- DOCUMENTS
- PARAPLUIE
- PIÈCES DU VÉHICULE
- NATTES
- BOUGIES
- HUILE DE FREIN
- SACS
- BÂCHE DU VÉHICULE
- BOÎTE À PHARMACIE
- AUTRES (texte libre)

Chaque élément = Case à cocher (Présent) + zone observation optionnelle.

### Section 6 – Pannes & Observations

| Champ                    | Type     | Obligatoire |
|--------------------------|----------|-------------|
| Pannes déclarées         | Textarea | Oui         |
| Observations             | Textarea | Non         |

### Section 7 – Photos (fortement recommandé)

- Zone d’upload multiple (avant, arrière, côtés, tableau de bord, dommages…)
- Possibilité de prendre la photo directement depuis mobile

### Section 8 – Validation

- Nom et signature du déposant (ou case « Validé verbalement » + nom)
- Bouton **« Valider la réception et créer le dossier »**

---

## Comportements intelligents

1. **Recherche unifiée** : un seul champ de recherche qui interroge plaques, châssis, noms, téléphones.
2. **Création rapide** : si rien n’est trouvé, un bouton permet de créer client + véhicule en restant sur le même écran.
3. **Pré-remplissage** : dès qu’un véhicule connu est sélectionné, tout est pré-rempli (y compris le dernier kilométrage connu).
4. **Duplication d’outillage** : possibilité de reprendre la check-list de la dernière visite du même véhicule.
5. **Génération automatique** du numéro de dossier d’intervention à la validation.

---

## Version Mobile

- Recherche en haut
- Formulaire en sections repliables (accordéon)
- Check-list outillage en grille de cases à cocher
- Bouton flottant « Valider la réception »
