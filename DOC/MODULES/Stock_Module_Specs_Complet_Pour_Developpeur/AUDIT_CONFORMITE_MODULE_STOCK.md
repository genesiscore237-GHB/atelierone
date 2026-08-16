# AUDIT DE CONFORMITÉ — MODULE STOCK
## Comparaison exhaustive : exigences du cahier des charges & specs ↔ implémentation réelle

**Date :** 16/08/2026 · **Périmètre :** `Stock_Module_Specs_Complet_Pour_Developpeur` (12 fichiers + 3 annexes) vs code livré (commits `719a5f9`, `60ad5ce`, `f774b1d`, `30b4f25`)
**Verdict global :** ⚠️ **NON CONFORME — écarts majeurs.** Plusieurs exigences centrales du cahier des charges ne sont PAS implémentées (sortie liée à un OR, retours, vente comptoir, statuts d'article, expositions CRUD). Le client ne peut pas identifier son métier dans l'état actuel.

---

## A. CAHIER DES CHARGES (01_Cahier_des_Charges.md)

### A.1 Objectifs mesurables (section 2)

| Objectif exigé | État | Constat |
|---|---|---|
| Traçabilité totale (motif + utilisateur + date + document lié sur 100 % des mouvements) | 🔴 **NON** | `documentLie` n'est JAMAIS alimenté par les procédures d'écriture (réceptions, sorties, pertes, transferts). Seul l'inventaire initial (`INV-INIT-*`) le remplit. |
| Zéro sortie non enregistrée (toute pièce sortie liée à un OR, une vente ou un ajustement) | 🔴 **NON** | **Aucune procédure de sortie liée à un OR ou à un véhicule n'existe** dans le router stock. Aucune procédure de vente comptoir depuis le stock. Les sorties se font par ajustement/perte sans lien OR. |
| Reconditionnement maîtrisé (fûts → unités, tracé) | 🟡 **PARTIEL** | Inter-articles implémenté (fût → bidons, 2 mouvements atomiques liés). Mais : pas d'alerte/refus sur ratio incohérent (`verifierRatio` du moteur pur jamais appelé), pas de gestion de reste, pas de lot. |
| Alertes actionnables (ruptures et stocks bas < 5 s) | 🟢 **OK** | KPI ruptures/stocks bas/surstock calculés dans `getDashboard`. |
| Inventaire fiable (écart < 5 % après 2 cycles) | 🔴 **NON** | Pas de suivi d'objectif d'écart, pas de comparaison entre cycles, pas de filtre par zone/catégorie pour les inventaires cycliques. |
| Valeur du stock calculée et historisée | 🟡 **PARTIEL** | Valeur calculée (qte × CMUP) dans le dashboard. **Mais non historisée** (`faitsStockQuotidiens` jamais alimentée) et PMP non recalculé sur les sorties. |

### A.2 Périmètre fonctionnel « In Scope » (section 3)

| Exigence | État | Constat |
|---|---|---|
| Référentiel Articles | 🟡 PARTIEL | CRUD catalogue existant, mais **les champs specs `codeArticle`, `emplacementPrincipal`, `estReconditionnable`, `dernierPrixAchat`, `quantiteMinimale` ne sont PAS exposés dans le CRUD** (ajoutés au schéma mais inutilisables par l'UI/API). |
| Unités + conversions (reconditionnement) | 🟢 OK | `produitUnites` avec facteurs. |
| Emplacements / Rayonnage | 🟢 OK | CRUD + page (ZONE-ALLEE-RAYON-NIVEAU) + contenu par emplacement. |
| Mouvements (entrée, sortie, transfert, ajustement, reconditionnement) | 🟡 PARTIEL | Entrées (réceptions), transferts, ajustements, reconditionnement OK. **Sortie atelier liée OR : ABSENT. Sortie vente comptoir : ABSENT. Retour : ABSENT.** |
| Réceptions fournisseurs | 🟢 OK | Module procurement : mouvement `ACHAT_RECEPTION` + PMP. **Mais `dernierPrixAchat` jamais mis à jour.** |
| Sorties atelier (liées OR) | 🔴 **ABSENT** | Exigence centrale du cahier non livrée. |
| Ventes comptoir | 🔴 **ABSENT** | Pas de procédure de sortie stock pour une vente comptoir depuis le module stock. |
| Gestion pertes / vols / casse / obsolescence | 🟡 PARTIEL | Pertes/vols/casse avec motif obligatoire OK. **« Obsolescence » (statut article) : ABSENT.** |
| Inventaire initial et cycliques | 🟡 PARTIEL | `createInventaireInitial` API existe. **Mais l'UI inventaire n'utilise PAS cette procédure** (elle utilise l'ancien flux `compterProduit`). Pas de filtre cyclique par zone/catégorie. |
| Seuils min/max + alertes | 🟢 OK | `seuilAlerte`, `seuilCritique`, `stockMaximum` + calcul des alertes. |
| Valorisation (PMP / dernier prix) | 🟡 PARTIEL | PMP à l'entrée OK ; **pas de PMP sur sortie, pas de dernier prix mis à jour, pas d'historisation**. |
| Tableaux de bord stock | 🟢 OK | KPI complets (valeur, ruptures, bas, surstock, mouvements du jour). |
| Historique complet | 🟢 OK | `mouvementsStock` append-only (trigger) + page Mouvements. |

### A.3 Acteurs (section 5) et rôles

| Acteur | Rôle exigé | État |
|---|---|---|
| Magasinier | Exécute entrées, sorties, reconditionnements, inventaires | 🟢 OK (permissions `stock.*`) |
| Chef d'atelier | **Demande des pièces, valide sorties OR** | 🔴 **NON** — pas de flux sortie OR |
| Secrétaire/Admin | Saisie commandes, consultations | 🟢 OK (achats, consultations) |
| Dirigeant | Pilotage, alertes, valorisation | 🟢 OK (dashboard) |

### A.4 Critères d'acceptation globaux (section 7)

| Critère | État |
|---|---|
| Inventaire initial possible et historisé | 🟢 OK (API) — mais pas branché à l'UI |
| **Reconditionnement fût → unités fonctionnel de bout en bout** | 🟢 OK (validé : 1 fût → 40 bidons) |
| **Sortie pièce vers OR avec décrément automatique** | 🔴 **ABSENT** |
| Gestion pertes/vols avec motif obligatoire | 🟢 OK |
| Alertes stock bas / rupture opérationnelles | 🟢 OK |
| Rayonnage codifié et recherchable | 🟢 OK |
| Guide utilisateur livré | 🟢 OK (`GUIDE-UTILISATEUR-MODULE-STOCK.md`) |

---

## B. MODÈLE DE DONNÉES (02_Modele_Donnees.md)

| Entité / champ specs | État | Constat |
|---|---|---|
| Article : `code_article` unique | 🟡 PARTIEL | Colonne ajoutée en base + schéma. **Non exposée dans le CRUD catalogue** (le client ne peut pas la saisir). `codeBarre` sert de fait de code unique. |
| Article : `designation_courte` | 🔴 ABSENT | Non ajoutée. |
| Article : `marque`, `ref_oem`, `ref_aftermarket` | 🟡 PARTIEL | `marque`, `referenceFabricant` existent. **`ref_oem` / `ref_aftermarket` distincts : ABSENTS.** |
| Article : `unite_achat` / `coefficient_conversion` | 🟢 OK | Via `produitUnites` (facteurs). |
| Article : `dernier_prix_achat` | 🔴 **NON** | Colonne ajoutée en base mais **jamais mise à jour** (aucune écriture nulle part). |
| Article : `prix_vente_ht` | 🟢 OK | `prixVente`. |
| Article : `qte_min` / `qte_max` | 🟢 OK | `seuilAlerte` / `stockMaximum`. |
| Article : `qte_stock_actuel` | 🟢 OK | Somme des mouvements. |
| Article : `emplacement_principal_id` | 🔴 **NON** | Colonne ajoutée en base mais **non exposée dans le CRUD**. |
| Article : `statut` Actif/Inactif/Obsolète/Hors série | 🔴 **NON** | Le système utilise BROUILLON/ACTIF/SUSPENDU/DISCONTINUE/ARCHIVE. **Obsolète et Hors série absents.** |
| Article : `est_reconditionnable` | 🔴 **NON** | Colonne ajoutée en base mais **non exposée dans le CRUD** (le client ne peut pas cocher). |
| Catégorie / Sous-catégorie | 🟢 OK | `categories.parentId`. |
| Emplacement : code ZONE-ALLEE-RAYON-NIVEAU, zone, type, capacité, actif | 🟢 OK | code + libelle + type + parent + actif. |
| MouvementStock : type, qte, qte_abs, source/dest, document_type/id, vehicule_id/or_id, prix, montant, motif, user, date, statut (Validé/Annulé) | 🟡 PARTIEL | Colonnes présentes. **`documentLie` jamais alimenté · `or_id`/`vehicule_id` ABSENTS · statut Validé/Annulé non géré (append-only sans annulation).** |
| Reconditionnement : deux mouvements liés + ratio + lot | 🟡 PARTIEL | Deux mouvements liés + groupeOperationId OK. **Pas de gestion de reste, pas de lot, `verifierRatio` jamais appelé.** |
| Inventaire : entête (Brouillon/Validé/Clôturé) + lignes (théo, physique, écart, motif) | 🟡 PARTIEL | Entête + lignes OK. **Statuts Brouillon/Clôturé absents (seulement en_cours/valide).** |
| Fournisseur & Commande | 🟢 OK | Module procurement. |
| Index recommandés | 🟢 OK | Unique sur code_barre ; index à vérifier pour mouvements. |

---

## C. TYPOLOGIE & RAYONNAGE (03_Typologie_et_Rayonnage.md)

| Exigence | État |
|---|---|
| 11 catégories typologiques (Filtres, Freinage, Lubrifiants…) | 🟢 OK — 10 catégories existantes en base (seed) |
| Sous-catégories | 🟢 OK |
| Attributs de typage (reconditionnable, lot/DLC) | 🔴 NON — `est_reconditionnable` non exposé ; pas de DLC |
| Codification ZONE-ALLEE-RAYON-NIVEAU | 🟢 OK (validé par regex + page) |
| Paramétrage initial obligatoire (seed catégories/emplacements/unités) | 🟡 PARTIEL — unités LIT/BID/FUT créées en base (non seedées dans le code) |
| Cas huiles : parent fût + enfants bidons avec ratio | 🟢 OK (schéma inter-articles) |

---

## D. PROCESSUS MÉTIER (04_Processus_Metier.md) — 10 processus

| # | Processus exigé | État | Constat |
|---|---|---|---|
| 1 | **Inventaire initial** (session, saisie, écart, validation → ajustements) | 🟡 PARTIEL | API `createInventaireInitial` OK (mouvements INV-INIT). **UI non branchée · pas de session Brouillon.** |
| 2 | **Entrée de stock / réception** (lien commande, qte, prix, emplacement, contrôle qualité bon/réserves) | 🟡 PARTIEL | Réception → ACHAT_RECEPTION + PMP. **Contrôle qualité bon/réserves : ABSENT · emplacement destination non géré · dernier prix non mis à jour.** |
| 3 | **Reconditionnement** (source, qte, cible, qte produite, vérification ratio, 2 mouvements) | 🟡 PARTIEL | Flux OK. **Vérification ratio (`verifierRatio`) non appliquée · reste non géré.** |
| 4 | **Sortie vers atelier (OR)** (lien OR/véhicule, décrément, alerte + demande de commande si insuffisant) | 🔴 **ABSENT** | Aucune procédure. Exigence centrale non livrée. |
| 5 | **Vente comptoir** (sortie + facture) | 🔴 **ABSENT** | Aucune procédure stock. |
| 6 | **Pertes / Vols / Casse / Obsolescence** (type, motif obligatoire, double validation si élevé) | 🟡 PARTIEL | Pertes avec motif OK. **Double validation absente · obsolescence (statut) absente.** |
| 7 | **Transfert d'emplacement** | 🟢 OK | `transferer` + page. |
| 8 | **Inventaire cyclique** (par zone/catégorie) | 🔴 **ABSENT** | Pas de filtre zone/catégorie, pas de cycle. |
| 9 | **Réapprovisionnement** (articles sous qte_min → propositions commande) | 🟢 OK | `getPrevisionsAchat`. |
| 10 | **Alertes automatiques** (rupture, bas, surstock, dormant, écarts) | 🟡 PARTIEL | Rupture/bas/surstock/dormant calculés à la volée. **Écarts d'inventaire : pas d'alerte · table `alertesStock` jamais alimentée.** |

---

## E. RÈGLES MÉTIER (05_Regles_Metier.md)

| Règle (non négociable) | État |
|---|---|
| 1. Aucun mouvement sans utilisateur et timestamp | 🟢 OK |
| 2. Aucune suppression physique (annulation inverse ou statut Annulé) | 🟡 PARTIEL — trigger append-only OK, **mais aucune procédure d'annulation (mouvement inverse) n'existe** |
| 3. **Motif obligatoire perte/vol/casse** | 🟢 OK (moteur + router) |
| 4. Stock non négatif | 🟢 OK |
| 5. Reconditionnement atomique | 🟢 OK |
| 6. Sorties valorisées au PMP courant | 🟡 PARTIEL — PMP calculé à l'entrée ; **les sorties ne recalculent pas la valorisation** (PMP figé) |
| 7. **Lien OR fortement recommandé pour sorties atelier** | 🔴 **ABSENT** — aucune sortie OR |
| 8. Toute quantité toujours dans un emplacement (pas de stock flottant) | 🔴 **NON** — le stock peut exister sans emplacement (le dashboard a même un panneau « à achalander » qui le montre !) |
| 9. Obsolètes/hors série : plus commandables, stock sortable | 🔴 **NON** — statuts absents |
| 10. Droits : magasinier/c. atelier/admin | 🟢 OK (RBAC corrigé) |

| Règle paramétrable exigée | État |
|---|---|
| Autoriser/non stock négatif | 🔴 ABSENT (paramètre non prévu) |
| Forcer lien OR sur sorties atelier | 🔴 ABSENT |
| Seuil de double validation pertes > X FCFA | 🔴 ABSENT |
| Méthode de valorisation (PMP/FIFO/dernier prix) | 🟡 PARTIEL (PMP fixe, FIFO partiel sur lots) |
| Durée avant « dormant » | 🟢 OK (jours paramétrable) |

| Cas particuliers exigés | État |
|---|---|
| Pièce commandée pour véhicule précis non reçue | 🔴 ABSENT |
| **Retour de pièce non utilisée depuis l'atelier (mouvement Retour + réintégration)** | 🔴 **ABSENT** |
| Correction d'erreur (ajustement « Erreur de saisie ») | 🟢 OK (motif) |

---

## F. USER STORIES & ACCEPTANCE (06_User_Stories_Acceptance.md)

| Story | État | Détail |
|---|---|---|
| US1.1 CRUD article (code, désignation, catégorie, unités, seuils, emplacement principal) | 🟡 PARTIEL | CRUD OK **mais emplacement principal non exposé** |
| US1.2 Arborescence Catégorie/Sous-catégorie | 🟢 OK | |
| US1.3 CRUD emplacements codifiés | 🟢 OK | |
| US2.1 Inventaire initial (session, saisie, validation → stock de départ) | 🟡 PARTIEL | API OK, **UI non branchée** |
| US3.1 Entrée de stock | 🟢 OK | |
| **US3.2 Sortie atelier liée à un OR** | 🔴 **ABSENT** | |
| US3.3 Transfert | 🟢 OK | |
| US3.4 Consultation temps réel article/emplacement/catégorie | 🟢 OK | |
| US4.1 Reconditionnement fût → unités (acceptance : source+qte, cible+qte, 2 mvts atomiques, stock OK, historique) | 🟢 OK | Validé de bout en bout |
| US5.1 Perte/vol/casse avec motif | 🟢 OK | |
| **US5.2 Statut article « Obsolète » / « Hors série »** | 🔴 **ABSENT** | |
| US6.1 Tableau de bord (ruptures, bas, valeur, mouvements du jour) | 🟢 OK | |
| US6.2 Liste des articles à réapprovisionner | 🟢 OK | |
| US7.1 Inventaire partiel/complet avec écarts | 🟡 PARTIEL | Pas de cyclique par zone |
| **US8.1 Depuis un OR, sortir des pièces et voir le stock disponible** | 🔴 **ABSENT** | |
| US8.2 Lien commandes fournisseurs / réceptions | 🟢 OK | |

**Règle de test par story (nominal + cas limite + non-supprimable) :** 🔴 NON RESPECTÉE — seuls les tests du moteur pur (`stock-calculs`, 24 tests) existent ; **aucun test d'intégration des flux** (sortie OR, inventaire, réception, perte) comme exigé.

---

## G. UI/UX (07_UI_UX_Specifications.md)

| Exigence | État |
|---|---|
| Recherche article ultra-rapide (code, désignation, ref OEM) | 🟢 OK |
| Couleurs d'alerte (rouge rupture, orange bas, vert OK) | 🟢 OK |
| Mobile-friendly | 🟢 OK (tailwind responsive) |
| Liste des Articles (filtres catégorie/statut/bas/rupture, colonnes, actions rapides) | 🟢 OK (page catalogue) |
| **Fiche Article : onglets Infos / Stock par emplacement / Historique / Fournisseurs** | 🔴 **NON** — la fiche produit n'a pas ces onglets |
| Nouvel Mouvement (wizard, champs contextuels, double zone reconditionnement) | 🟡 PARTIEL — formulaires dédiés par type, pas de wizard unifié |
| Session d'Inventaire (liste à compter, saisie, validation globale) | 🟡 PARTIEL — existant, non branché à `createInventaireInitial` |
| Tableau de Bord Stock (KPIs, listes cliquables) | 🟢 OK |
| Recherche Emplacement / contenu | 🟢 OK |
| Historique article (filtres) | 🟢 OK |
| Messages : « Stock insuffisant », « 2 mouvements liés, confirmer ? », « Motif obligatoire » | 🟡 PARTIEL — stock insuffisant OK ; **messages de confirmation/motif côté UI à vérifier** |

---

## H. ROADMAP (08_Priorites_et_Roadmap.md) — respect du découpage

| Phase | Exigence | État |
|---|---|---|
| A — Fondations (1-6) | Modèle, CRUD, mouvements, stock calculé, inventaire initial, historique | 🟡 PARTIEL — inventaire initial non branché UI |
| B — Spécificités garage (7-11) | Reconditionnement, **sortie OR**, pertes, statuts, seuils | 🟡 PARTIEL — **sortie OR et statuts manquants** |
| C — Pilotage (12-16) | Tableau de bord, cycliques, PMP, droits, UX | 🟡 PARTIEL — cycliques et PMP incomplets |
| D — Finalisation (17-19) | Guide, recette, docs | 🟡 PARTIEL — guide OK ; **recette (checklist annexe) non validée** |

---

## I. ARCHITECTURE & INTÉGRATIONS (09_Architecture_et_Integrations.md)

| Intégration exigée | État |
|---|---|
| **Ordre de Réparation → sortie de stock (décrément + lien document)** | 🔴 **ABSENT** |
| **Véhicule → traçabilité (sur quel véhicule la pièce est partie)** | 🔴 **ABSENT** |
| Fournisseurs/Commandes → entrée | 🟢 OK |
| Utilisateurs/RH → audit | 🟢 OK |
| Facturation/Vente comptoir → sortie | 🔴 **ABSENT** |
| Événements (move.created, low, out, inventory.validated, reconditioning.done) | 🔴 ABSENT (pas d'event-driven) |
| Transactions atomiques | 🟢 OK |
| Soft delete / mouvement inverse | 🟡 PARTIEL (append-only, pas d'inverse) |
| Paramétrage centralisé des règles | 🟡 PARTIEL (peu de paramètres) |

---

## J. PLAN DE TESTS (10_Plan_de_Tests.md)

| Cas exigé | État |
|---|---|
| Inventaire initial (session → saisie → validation → stock + mouvements) | 🟡 PARTIEL (testé manuellement, pas de test automatisé) |
| Reconditionnement (fût → 40 bidons ; ratio incohérent → alerte/refus) | 🟡 PARTIEL (flux testé manuellement ; **ratio incohérent non testé car non implémenté**) |
| Sortie OR (suffisant → décrément + lien ; insuffisant → message) | 🔴 ABSENT (pas de sortie OR) |
| Perte/Vol (motif manquant → refus ; motif présent → OK) | 🟡 PARTIEL (vérifié en API, pas de test automatisé) |
| Annulation (impossible de supprimer ; inverse ou statut Annulé) | 🔴 ABSENT |
| Alertes (sous qte_min → liste ; à 0 → rupture) | 🟡 PARTIEL (calcul testé dans le moteur pur) |
| Concurrence (deux sorties simultanées → pas de négatif) | 🔴 ABSENT (pas de test de concurrence) |
| **Critère de fin : tous les cas critiques + guide + revue d'architecture** | 🔴 NON ATTEINT |

---

## K. CHECKLIST RECETTE FINALE (Annexe)

| Item | État |
|---|---|
| Inventaire initial fonctionnel de bout en bout | 🔴 NON (UI non branchée) |
| Reconditionnement testé avec cas réel | 🟢 OK |
| **Sortie OR décrémente correctement le stock** | 🔴 **ABSENT** |
| Perte/Vol refuse sans motif | 🟢 OK |
| Stock ne passe pas négatif | 🟢 OK |
| Alertes rupture/stock bas opérationnelles | 🟢 OK |
| Historique consultable et non destructible | 🟢 OK |
| Droits utilisateurs respectés | 🟢 OK (RBAC corrigé) |
| Tableau de bord affiche les bons KPIs | 🟢 OK |
| Guide Utilisateur rédigé | 🟢 OK |
| Tests automatisés passent | 🟡 PARTIEL (moteur pur uniquement) |
| Documentation technique des choix | 🟡 PARTIEL |

**Score : 4/12 ✔ · 5/12 🟡 · 3/12 🔴**

---

## L. SYNTHÈSE — ÉCARTS MAJEURS À CORRIGER (par priorité)

### 🔴 Critiques (le client ne peut pas travailler sans)
1. **Sortie atelier liée à un OR** (US3.2, US8.1, processus §4, objectif « zéro sortie non enregistrée ») — procédure `sortirPourOR` + lien véhicule + décrément + alerte stock insuffisant + demande de commande.
2. **Vente comptoir** (processus §5) — sortie stock liée à une vente/facture.
3. **Retour de pièce depuis l'atelier** (cas particulier §05) — mouvement Retour + réintégration stock.
4. **`documentLie` alimenté sur TOUS les mouvements** (réceptions, sorties, pertes, transferts).
5. **Champs specs exposés dans le CRUD catalogue** : `codeArticle`, `emplacementPrincipal`, `estReconditionnable`, `dernierPrixAchat`, `quantiteMinimale` — sinon le client ne peut pas les utiliser.
6. **Statuts article Obsolète / Hors série** (US5.2) avec règles associées (non commandables, stock sortable).

### 🟠 Importants
7. **`dernierPrixAchat` mis à jour à chaque réception** (et PMP recalculé à la sortie).
8. **Sessions inventaire Brouillon / En cours / Validé / Clôturé** + contrôle « tous produits comptés » + **UI branchée sur `createInventaireInitial`**.
9. **Inventaire cyclique par zone/catégorie** (filtre) + comparaison d'écarts entre cycles.
10. **Vérification du ratio de reconditionnement** (`verifierRatio` du moteur) : refus ou alerte si incohérent + gestion du reste.
11. **Procédure d'annulation** (mouvement inverse ou statut Annulé) conforme règle §05.2.
12. **Double validation pertes > seuil paramétrable**.
13. **Contrôle qualité réception** (bon / réserves) + emplacement de destination.

### 🟡 Améliorations
14. Table `alertesStock` alimentée + alerte écarts d'inventaire significatifs.
15. Tests d'intégration automatisés des flux (sortie OR, inventaire, réception, perte, annulation, concurrence).
16. Fiche article avec onglets specs (Stock par emplacement, Historique, Fournisseurs).
17. Wizard de mouvement unifié avec messages de confirmation.
18. Historisation de la valeur du stock (`faitsStockQuotidiens`).
19. Retours fournisseur + annulation de réception.

---

*Rapport d'audit généré à partir des specs officielles et d'une revue du code livré. Aucune modification n'a été apportée au code pendant cet audit.*
