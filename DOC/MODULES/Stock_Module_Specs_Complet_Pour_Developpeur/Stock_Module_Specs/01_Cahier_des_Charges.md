# 01 — CAHIER DES CHARGES FONCTIONNEL
## Module Gestion de Stock (Magasin) — Garage Polyvalent Junior / AtelierOne

### 1. Vision

Concevoir et implémenter un module de gestion de stock de niveau professionnel, adapté aux réalités d’un garage automobile moderne en Afrique (Cameroun), capable de gérer :

- Un inventaire initial important
- Le reconditionnement d’huiles (fûts → petites unités)
- Les commandes externes (locales et import)
- Les sorties liées aux Ordres de Réparation
- Les pertes, vols, casses et obsolescence
- Un rayonnage intelligent et une typologie claire

Le module doit devenir la **source de vérité** du stock du garage.

### 2. Objectifs mesurables

| Objectif | Indicateur de succès |
|----------|----------------------|
| Traçabilité totale | 100 % des mouvements ont un motif + utilisateur + date + document lié |
| Zéro sortie non enregistrée | Toute pièce sortie est liée à un OR, une vente ou un ajustement |
| Reconditionnement maîtrisé | Les fûts sont transformés en unités utilisables avec traçabilité |
| Alertes actionnables | Ruptures et stocks bas visibles en < 5 secondes |
| Inventaire fiable | Écart inventaire physique vs théorique < 5 % après 2 cycles |
| Valeur du stock | Calcul automatique et historisé |

### 3. Périmètre fonctionnel (In Scope)

- Référentiel Articles (catalogue)
- Unités de mesure + conversions (reconditionnement)
- Emplacements / Rayonnage
- Mouvements de stock (entrée, sortie, transfert, ajustement, reconditionnement)
- Réceptions fournisseurs
- Sorties atelier (liées OR)
- Ventes comptoir
- Gestion des pertes / vols / casse / obsolescence
- Inventaire initial et inventaires cycliques
- Seuils min/max + alertes
- Valorisation (PMP ou dernier prix d’achat)
- Tableaux de bord stock
- Historique complet

### 4. Hors périmètre (Out of Scope pour cette version)

- Comptabilité générale complète (écriture automatique possible plus tard)
- Gestion avancée des numéros de série / lots (sauf si simple lot d’huile)
- E-commerce / catalogue public
- Multi-magasins complexes (prévoir extensibilité)

### 5. Acteurs

| Acteur | Rôle principal |
|--------|----------------|
| Magasinier | Exécute entrées, sorties, reconditionnements, inventaires |
| Chef d’atelier | Demande des pièces, valide sorties OR |
| Secrétaire / Admin | Saisie commandes, consultations |
| Dirigeant | Pilotage, alertes, valorisation, décisions |
| Système | Calculs automatiques, alertes, historisation |

### 6. Contraintes

- Doit s’intégrer à l’architecture existante du projet (AtelierOne).
- Performance : consultations et mouvements fluides même avec plusieurs milliers d’articles.
- Auditabilité : aucun mouvement ne peut être supprimé (soft-delete ou annulation compensatoire uniquement).
- Multi-utilisateurs avec droits différenciés.

### 7. Critères d’acceptation globaux du module

- [ ] Inventaire initial possible et historisé
- [ ] Reconditionnement fût → unités fonctionnel de bout en bout
- [ ] Sortie pièce vers OR avec décrément stock automatique
- [ ] Gestion des pertes/vols avec motif obligatoire
- [ ] Alertes stock bas / rupture opérationnelles
- [ ] Rayonnage codifié et recherchable
- [ ] Guide utilisateur livré et cohérent avec les modules précédents
