# Module Véhicule + Atelier - Spécifications Complètes

**Objectif** : Fournir à une IA / équipe de développement tout ce qui est nécessaire pour implémenter un module complet, cohérent et sans faille de gestion des véhicules et de l'atelier dans un logiciel de garage.

## Contenu du package

| Fichier | Description |
|---------|-------------|
| `01_Architecture_Module.md` | Vue d'ensemble de l'architecture et des principes directeurs |
| `02_Flux_Complet_Intervention.md` | Flux métier complet de A à Z (Réception → Fermeture) |
| `03_Modele_Donnees.md` | Entités, relations et attributs principaux |
| `04_Ecran_Reception_Vehicule.md` | Spécification détaillée de l'écran de réception (évolution de la fiche papier) |
| `05_Regles_Metier.md` | Règles métier strictes (stock, traçabilité, modifications...) |
| `06_Cycle_de_Vie_Dossier.md` | États possibles d'un dossier d'intervention et transitions |
| `07_Facturation.md` | Logique de facturation cumulative et distinguée |
| `08_Structures_JSON.md` | Exemples de structures de données (JSON) pour implémentation |
| `09_Checklist_Implementation.md` | Checklist pour ne rien oublier lors du développement |

## Principes fondamentaux (à respecter absolument)

1. **Tout part de la réception** du véhicule.
2. Un véhicule est toujours lié à un client.
3. Aucune pièce ne sort du stock sans être affectée à une intervention précise.
4. Diagnostic, devis, bilan et facture restent modifiables jusqu'à la **fermeture définitive** du dossier.
5. Traçabilité complète de toutes les actions.
6. L'utilisateur doit pouvoir **rechercher ou saisir** en même temps (expérience fluide).

## Comment utiliser ce package

Transmettez l'intégralité de ce dossier (ou le ZIP) à votre IA / développeur avec la consigne :

> "Implémente le module Véhicule + Atelier en respectant strictement toutes les spécifications de ce package. Ne rien omettre, notamment les règles de stock et la traçabilité."

---

*Package généré pour GPJ Garage - 2026*
