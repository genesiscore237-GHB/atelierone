# 01 – Product Requirements Document (PRD)
## Module de Gestion Outillage – Pièces – Huiles

**Version :** 1.0  
**Objectif :** Module production-ready pour garage automobile

---

## 1. Vision

Créer un module intelligent et complet de gestion de l’outillage, des pièces détachées (neuf + occasion) et des huiles, permettant au magasinier et aux gérants de :
- Connaître en temps réel ce qu’ils possèdent
- Éviter les rachats inutiles
- Contrôler les sorties et retours d’outils
- Gérer les pertes, casses et vols
- Consommer les huiles de façon précise (fûts → litres)
- Lier les pièces aux réparations

---

## 2. Utilisateurs cibles

| Rôle              | Objectif principal                                      |
|-------------------|---------------------------------------------------------|
| Magasinier        | Gérer le stock quotidiennement                          |
| Gérant            | Superviser, valider, voir les tableaux de bord          |
| Mécanicien        | Prendre et rendre des outils / pièces                   |
| Admin             | Configuration complète                                  |

---

## 3. Modules fonctionnels

### 3.1 Gestion de l’Outillage (Tool Crib)

**Doit permettre :**
- Enregistrement de tous les outils (progressif)
- Identification unique de chaque outil (référence + barcode/QR optionnel)
- Check-out (sortie) par un mécanicien avec date de retour prévue
- Check-in (retour) avec contrôle d’état
- Gestion des statuts : Disponible, En prêt, En réparation, Usé, Cassé, Perdu, Volé, Réformé
- Alertes de non-retour
- Historique complet des mouvements
- Quantité par type d’outil (si plusieurs exemplaires)

### 3.2 Gestion des Pièces & Matériel

**Doit permettre :**
- Enregistrement progressif de toutes les pièces existantes (neuf + occasion)
- Recherche ultra-rapide avant toute commande
- Si la pièce existe → la sortir du stock
- Si elle n’existe pas → créer une demande de commande
- Distinction claire :
  - Pièces destinées à une **réparation précise**
  - Pièces destinées au **stock général**
- Lien automatique avec les Ordres de Réparation (quand une pièce est utilisée, le stock diminue)
- Seuils min / max + alertes de stock bas
- Emplacement physique (rayon, bac, zone)
- Gestion des pièces d’occasion / récupérées

### 3.3 Gestion des Huiles

**Doit permettre :**
- Achat en grands fûts (volume en litres)
- Conversion et consommation en litres
- Suivi du volume restant en temps réel
- Sortie d’huile liée ou non à une vidange
- Alertes de seuil bas par type d’huile
- Historique de consommation

---

## 4. Exigences non-fonctionnelles

- Interface simple et rapide (moins de 3 clics pour les actions quotidiennes)
- Traçabilité totale de tous les mouvements
- Impossible d’avoir un stock négatif
- Justification obligatoire pour les pertes / vols / casses
- Compatible usage tablette / mobile (atelier)
- Performance : recherche de pièce < 1 seconde
- Possibilité d’importer / enregistrer progressivement le stock existant

---

## 5. Critères de succès (Production-Ready)

Le module est considéré production-ready si :
1. Un magasinier peut enregistrer et sortir un outil en moins de 30 secondes
2. On ne peut plus commander une pièce déjà en stock sans le savoir
3. Les huiles sont correctement converties et suivies en litres
4. Tous les mouvements sont historisés
5. Les gérants ont une vision claire des outils en circulation et des stocks bas
