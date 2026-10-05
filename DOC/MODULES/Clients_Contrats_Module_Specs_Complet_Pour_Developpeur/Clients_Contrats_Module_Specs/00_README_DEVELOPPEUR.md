# MODULE CLIENTS & CONTRATS — CAHIER DE SPÉCIFICATIONS COMPLET
## À l’attention de l’IA Développeur

**Projet :** Garage Polyvalent Junior / AtelierOne  
**Module :** Clients & Contrats (Flottes + Particuliers)  
**Rôle de ce package :** Spécifications fonctionnelles + techniques + processus + tests pour implémentation  
**Auteur des specs :** Architecte / Expert Métier Garage Moderne  
**Date :** Août 2026  

---

## 1. Instructions impératives pour le développeur

1. **Lis d’abord ce README en entier**, puis les fichiers dans l’ordre numérique.
2. **Travaille de façon progressive** selon le fichier `08_Priorites_et_Roadmap.md`.
3. **À chaque fin d’étape (ou user story majeure)** :
   - Écris les tests (unitaires + intégration + scénarios métier)
   - Exécute-les
   - Vérifie que le comportement correspond exactement aux acceptance criteria
   - Documente le résultat avant de passer à l’étape suivante
4. **Respecte l’architecture existante** du projet (AtelierOne).  
   Si une instruction entre en conflit avec l’architecture déjà en place, **nuance** et adapte en documentant clairement le choix technique.
5. **Ne devine pas** les règles métier. Tout est spécifié ici. En cas d’ambiguïté, signale-la explicitement.
6. **À la fin du module**, rédige le **Guide Utilisateur** en te basant sur le template fourni et sur le style des guides des modules précédents.
7. **Livrables attendus de ta part** :
   - Code source du module
   - Migrations / modèles de données
   - Tests automatisés + rapport d’exécution
   - Guide Utilisateur final
   - Notes d’architecture (si adaptations)

---

## 2. Ordre de lecture obligatoire

| Ordre | Fichier | Contenu |
|-------|---------|---------|
| 00 | README (ce fichier) | Instructions globales |
| 01 | Cahier_des_Charges.md | Vision, objectifs, périmètre |
| 02 | Modele_Donnees.md | Entités, champs, relations |
| 03 | Typologie_Clients_Contrats.md | Types de clients, types de contrats, segmentation |
| 04 | Processus_Metier.md | Flux complets (création client, contrat, facturation groupée, relances…) |
| 05 | Regles_Metier.md | Règles strictes + cas d’exception |
| 06 | User_Stories_Acceptance.md | User stories + critères d’acceptance |
| 07 | UI_UX_Specifications.md | Écrans et parcours |
| 08 | Priorites_et_Roadmap.md | Ordre d’implémentation |
| 09 | Architecture_et_Integrations.md | Intégrations avec Stock, OR, Facturation, Véhicules… |
| 10 | Plan_de_Tests.md | Stratégie et cas de tests |
| 11 | Guide_Utilisateur_Template.md | Structure du guide final |
| Annexes | Glossaire + Statuts + Checklist | Références |

---

## 3. Contexte métier critique (à ne jamais oublier)

Le garage travaille **majoritairement avec des entreprises sous contrat de maintenance**.  
C’est un centre de maintenance de flottes + atelier classique.

Il existe 4 réalités clients :
1. Entreprise sous contrat (récurrent, facturation souvent différée ou groupée)
2. Entreprise ponctuelle (sans contrat)
3. Particulier
4. Véhicule immobilisé / en attente (statut transverse)

Le système doit permettre de :
- Distinguer clairement ces types
- Gérer les contrats (durée, conditions de paiement, véhicules couverts, fréquence)
- Suivre les créances et faire des relances
- Facturer de façon groupée en fin de période si nécessaire
- Lier chaque intervention / OR / facture à un client et éventuellement à un contrat
- Donner au dirigeant une vision claire : « Qui doit de l’argent ? Depuis quand ? Quels véhicules sont sous contrat ? »

Bon développement. Travaille étape par étape, teste, et documente.

— Architecte Module Clients & Contrats
