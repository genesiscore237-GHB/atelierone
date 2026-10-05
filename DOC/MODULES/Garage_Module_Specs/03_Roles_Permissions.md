# 03 – Rôles et Permissions

## Rôles définis

| Rôle          | Description                                      |
|---------------|--------------------------------------------------|
| Admin         | Accès total + configuration                      |
| Manager       | Gérant – supervision + validation                |
| Storekeeper   | Magasinier – gestion quotidienne du stock        |
| Mechanic      | Mécanicien – sortie et retour d’outils/pièces    |

---

## Matrice de Permissions

| Action                                      | Admin | Manager | Storekeeper | Mechanic |
|---------------------------------------------|-------|---------|-------------|----------|
| **OUTILLAGE**                               |       |         |             |          |
| Voir la liste des outils                    | Oui   | Oui     | Oui         | Oui      |
| Créer / Modifier un outil                   | Oui   | Oui     | Oui         | Non      |
| Faire un Check-out (sortie)                 | Oui   | Oui     | Oui         | Oui      |
| Faire un Check-in (retour)                  | Oui   | Oui     | Oui         | Oui      |
| Déclarer perdu / cassé / volé               | Oui   | Oui     | Oui         | Non*     |
| Voir historique complet                     | Oui   | Oui     | Oui         | Limité   |
| **PIÈCES**                                  |       |         |             |          |
| Rechercher une pièce                        | Oui   | Oui     | Oui         | Oui      |
| Créer / Modifier une pièce                  | Oui   | Oui     | Oui         | Non      |
| Sortir une pièce pour réparation            | Oui   | Oui     | Oui         | Oui      |
| Sortir une pièce pour stock                 | Oui   | Oui     | Oui         | Non      |
| Ajustement de stock / inventaire            | Oui   | Oui     | Oui         | Non      |
| Voir alertes stock bas                      | Oui   | Oui     | Oui         | Non      |
| **HUILES**                                  |       |         |             |          |
| Voir stocks d’huile                         | Oui   | Oui     | Oui         | Oui      |
| Enregistrer un nouveau fût                  | Oui   | Oui     | Oui         | Non      |
| Sortir de l’huile (litres)                  | Oui   | Oui     | Oui         | Oui      |
| **TABLEAUX DE BORD & RAPPORTS**             | Oui   | Oui     | Oui         | Non      |
| **CONFIGURATION** (catégories, seuils…)     | Oui   | Oui     | Non         | Non      |

\* Le mécanicien peut signaler un problème, mais la validation est faite par le magasinier ou le gérant.

---

## Règles importantes

- Un mécanicien ne peut sortir un outil que s’il est **disponible**.
- Un mécanicien ne peut pas modifier les quantités de stock.
- Toute déclaration de perte / vol / casse doit être justifiée (champ notes obligatoire).
- Les gérants et magasiniers voient les alertes en temps réel.
