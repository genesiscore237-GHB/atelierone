# 06 — USER STORIES & CRITÈRES D’ACCEPTANCE

### Epic A — Fondations (Priorité 1)
US1 : CRUD Articles avec origine/qualité, DLC, core, code-barres
US2 : CRUD Emplacements + codification
US3 : Mouvements de base (Entrée, Sortie, Transfert, Ajustement)
US4 : Calcul stock actuel et disponible
US5 : Inventaire initial complet

### Epic B — Spécificités GPJ & Automobile (Priorité 1)
US6 : Reconditionnement fût → unités (atomique)
US7 : Sortie liée à un OR avec contrôle stock disponible
US8 : Réservation de stock pour un OR
US9 : Gestion pertes/vols/casse avec motif obligatoire
US10 : Supersession / équivalences
US11 : Pièces en échange standard (cores)
US12 : Pièces fournies par le client

### Epic C — Pilotage & Robustesse (Priorité 2)
US13 : Alertes rupture / stock bas / DLC / dormants
US14 : Inventaires cycliques + écarts
US15 : Valorisation PMP
US16 : Tableau de bord stock
US17 : Retour fournisseur
US18 : Kits (composition et sortie de kit)

Chaque US doit avoir : happy path + cas limite + vérification historisation non destructible.
