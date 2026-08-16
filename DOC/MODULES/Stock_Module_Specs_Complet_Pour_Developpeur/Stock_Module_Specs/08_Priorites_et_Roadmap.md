# 08 — PRIORITÉS & ROADMAP D’IMPLÉMENTATION

### Principe

Travaille **strictement** dans cet ordre.  
Ne passe à l’étape N+1 que lorsque les tests de l’étape N sont verts et validés.

### Phase A — Fondations (MVP critique)

1. Modèle de données Articles + Catégories + Emplacements
2. CRUD Articles + Emplacements
3. Mouvement de base (Entrée / Sortie / Transfert / Ajustement)
4. Calcul du stock actuel
5. Inventaire initial
6. Historique des mouvements

**Critère de sortie Phase A :** On peut inventorier le magasin actuel et faire des entrées/sorties simples avec traçabilité.

### Phase B — Spécificités Garage

7. Reconditionnement (fût → unités) — **critique**
8. Sortie liée à OR / Véhicule
9. Gestion Pertes / Vols / Casse avec motif
10. Statuts article (Obsolète, Hors série)
11. Seuils min/max + alertes de base

**Critère de sortie Phase B :** Le magasinier peut travailler au quotidien avec les cas réels du garage.

### Phase C — Pilotage & Robustesse

12. Tableau de bord
13. Inventaires cycliques
14. Valorisation PMP
15. Droits utilisateurs fins
16. Améliorations UX + recherche avancée

### Phase D — Finalisation

17. Guide Utilisateur complet
18. Recette globale
19. Documentation technique + notes d’architecture

---

**Rappel :**  
Après chaque user story ou groupe de stories, exécute les tests, corrige, documente, puis seulement avance.
