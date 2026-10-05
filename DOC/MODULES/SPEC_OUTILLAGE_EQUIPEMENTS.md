# SPEC — MODULE OUTILLAGE & ÉQUIPEMENTS (Garage)

**AtelierOne — Garage Polyvalent Junior**
**Statut : document de référence — à valider avant implémentation**

---

## 0. Principe fondamental : MODÈLE ≠ EXEMPLAIRE

| Notion | Définition | Exemple |
|---|---|---|
| **MODÈLE** (article OUTIL) | La référence de l'outil | Clé dynamométrique FACOM 40–200 Nm — S.208-200 |
| **EXEMPLAIRE** (variante OUTIL) | L'unité physique réellement suivie | OT-00041 — N° série 12345 — état : disponible — emplacement : Poste M04 |

**Règle d'or : trois outils identiques = trois exemplaires distincts**, chacun avec son propre numéro d'inventaire, son état, son emplacement, son historique de prêt, son éventuel responsable. C'est indispensable pour le suivi des prêts et des pertes.

---

## 1. Séparation des univers (jamais mélanger)

```
GARAGE
 ├── STOCK          → pièces, consommables, lubrifiants, produits (module Articles)
 ├── OUTILLAGE      → outils réutilisables (prêt/retour)
 ├── ÉQUIPEMENTS    → machines et installations (pont, compresseur…)
 ├── IMMOBILISATIONS→ équipements à valeur comptable importante
 └── SERVICES       → prestations (sans stock)
```

Ils restent **liés** dans une intervention : remplacement d'embrayage = 1 kit (stock) + 1 nettoyant (consommable) + 3 h (service) + chèvre moteur (équipement) + coffret (outillage).

---

## 2. Modèle de données

| Table | Rôle | Champs clés |
|---|---|---|
| `produit_articles` (type OUTIL/EQUIPEMENT) | **MODÈLE** | designation, categorieId (famille Outillage/Équipement), typeOutil |
| `produits` (variantes OUTIL) | **EXEMPLAIRE** | articleId→modèle, titre (OT-00041), marque, référence, n° série, typeOutil (INDIVIDUEL/KIT/JEU/MACHINE), numeroImmobilisation, etatEquipement, calibrable, responsableId, dateAchat, valeurAcquisition |
| `prets_outils` | Prêt/retour | outilId (exemplaire), technicienId, orId, dateSortie, dateRetour, etatRetour (OK/ENDOMMAGE/PERDU), remarque, actif |
| `outillage_maintenance` | Historique maintenance | outilId, type (PRÉVENTIVE/CURATIVE/CONTROLE), date, prestataire, coût, rapport, prochaine |
| `outillage_calibration` | Étalonnage | outilId, date, organisme, certificat, résultat, tolérance, prochaine |
| `article_documents` | Documents | manuel, certificat, facture, garantie, rapports |
| `stocks` + `mouvements_stock` | Stock par emplacement + mouvements (sortie/retour outil, approvisionnement bureau…) | produitId (exemplaire), emplacementId |

**Localisation hiérarchique** (arborescence d'emplacements existante) : Site → Zone → Atelier → Poste → Armoire → Rayon → Casier.

---

## 3. Les types d'outils

| Type | Gestion |
|---|---|
| **INDIVIDUEL** | 1 exemplaire = 1 unité suivie (n° inventaire, n° série, état, historique) |
| **KIT / COFFRET** | Un modèle contenant des composants (table `kits_lignes`) ; suivi de **complétude** (⚠️ 2 éléments manquants) |
| **JEU** | Ex. jeu de clés 6–32 mm — prêté en bloc ou par élément |
| **MACHINE** | Équipement : maintenance, calibration, garantie, immobilisation |
| **CONSOMMABLE d'outillage** | Disque de meulage, électrode… géré comme consommable (pas d'équipement durable) |

---

## 4. Les grandes familles d'outillage (catégories, seedées)

A. Outillage mécanique à main · B. Spécialisé automobile (calage distribution, extracteurs…) · C. Électrique/électronique (multimètre, fer à souder…) · D. Diagnostic électronique (valise, OBD, oscilloscope…) · E. Pneumatique (clé à choc, soufflette…) · F. Électroportatif (perceuse, meuleuse…) · G. Levage & manutention (cric, chandelles, chèvre, transpalette, pont…) · H. Soudage/découpe (MIG/TIG/MMA, plasma…) · I. Tôlerie/peinture (débosseleur, pistolets…) · J. Climatisation (station, manifold, détecteur de fuite…) · K. Pneumatiques (démonte-pneu, équilibreuse, gonfleur…) · L. Mesure & contrôle (pied à coulisse, micromètre, clé dynamométrique, couplemètre…) · M. Sécurité (EPI, extincteurs, harnais…).

---

## 5. Écran « Enregistrer un outil » — 11 blocs

1. **Identification** : Réf. interne (OT-000154), code outil, désignation, catégorie/sous-catégorie, **type d'outil**, marque, modèle, réf. fabricant, **n° série**, code-barres, QR, photo, description.
2. **Caractéristiques techniques** (dynamiques selon le type) : clé dynamométrique → plage min/max Nm, entraînement, précision, sens de serrage, calibration ; cric → capacité, hauteurs, type, poids, norme ; multimètre → tensions/courants, CAT rating, précision ; pont → capacité, hauteur de levage, temps de montée/descente, nb colonnes, alimentation.
3. **Localisation** : Site → Zone → Atelier → Poste → Armoire → Rayon → Casier (+ QR sur l'armoire).
4. **Affectation / Responsable** : Disponible · Affecté (technicien/équipe/atelier) · En prêt · En réparation · En maintenance · Hors service · Perdu · Volé · Réformé ; responsable actuel, date d'affectation, date de retour prévue, motif, état au départ/retour.
5. **État de l'outil** : état physique (Neuf / Très bon / Bon / Moyen / Usé / Endommagé / Hors service) + état opérationnel (Disponible / Utilisable / Utilisable sous réserve / En maintenance / Non disponible) + commentaire, photos, date du dernier contrôle.
6. **Maintenance** : date achat, mise en service, dernière/prochaine maintenance, type, fréquence, prestataire, coût, rapport, pièces remplacées, observations. Ex. : pont — contrôle tous les 6 mois.
7. **Calibration / étalonnage** (si `calibrable`) : oui/non, date, organisme, certificat, résultat, tolérance, prochaine ; statut automatique 🟢 Conforme / 🟠 Bientôt due / 🔴 Expirée.
8. **Achat & valeur** : fournisseur, date achat, prix, devise, TVA, coût total, facture, bon de commande, garantie ; pour les équipements : valeur d'acquisition, durée d'amortissement, valeur comptable, statut immobilisation.
9. **Garantie** : applicable, durée, début/fin, fournisseur/constructeur, conditions, n° de garantie, document ; alerte 🟠 garantie expire dans 23 jours.
10. **Documents** : manuel, fiche technique, certificats, facture, bon de livraison, garantie, photos, rapports.
11. **Historique** : ligne du temps complète (achat → affectations → prêts/retours → maintenances → calibrations) — **aucune modification n'écrase l'historique**.

---

## 6. Cycle de vie d'un exemplaire

```
Achat (fournisseur, valeur, garantie)
  → Enregistrement au bureau (approvisionnement tracé depuis un magasin)
  → PRÊT (technicien, date retour prévue, OR optionnel)  → stock bureau −1
  → RETOUR (contrôle d'état)
        ├── OK        → disponible, stock bureau +1
        ├── Endommagé → statut CASSE (+ remarque obligatoire)
        ├── Perdu     → statut PERDU (+ déduction stock, responsabilité tracée)
        └── Usé       → statut USÉ (remplacement)
  → MAINTENANCE (préventive/curative, prestataire, coût, prochaine date)
  → CALIBRATION (organisme, certificat, validité)
  → RÉFORME / sortie définitive (mouvement de sortie tracé)
```

**Règles :** un exemplaire en prêt ne peut pas être prêté à nouveau ; retour ≠ OK ⇒ remarque obligatoire ; prêts en retard visibles (J+0 technicien, J+1 magasinier, J+2 chef) ; toute opération génère un mouvement de stock tracé.

---

## 7. QR Code

Chaque exemplaire reçoit un QR (contenu : OT-000154). Le technicien scanne → fiche instantanée : désignation, état 🟢, emplacement, calibration, **boutons Emprunter / Retourner / Signaler un problème / Historique** — le prêt enregistre automatiquement technicien → outil → date/heure → état → emplacement.

---

## 8. Kits / coffrets

Modèle KIT avec sa composition (table `kits_lignes`) : OT-KIT-023 (coffret distribution BMW/Mercedes/PSA) contient OT-023-01…06. Suivi de **complétude** : Coffret complet ✅ / ⚠️ 2 éléments manquants. Prêt du kit = prêt des composants.

---

## 9. État actuel de l'implémentation

**Déjà fait (à valider) :**
- ✅ **Bureau du magasinier** : emplacement « Bureau », approvisionnement tracé (magasin → bureau), dotation consommable, stock du bureau avec seuils locaux, mouvements bureau, prêts en cours/retards (page `/dashboard/stock/outillage`)
- ✅ **Prêt/retour** : `preter` (date retour prévue, contrôle « déjà prêté »), `retourner` (OK/ENDOMMAGE/PERDU + remarque obligatoire), `declarerStatut` (perdu/volé/cassé/usé/réparation/réformé), `leverStatut`, `historiquePrets`, `pretsEnCours`
- ✅ **Modèle → exemplaires** : article OUTIL = modèle ; variantes = exemplaires (typeOutil, etatEquipement, n° série via suiviSerie)
- ✅ Tables : `outillage_maintenance`, `outillage_calibration`, `article_documents`, colonnes équipement (numeroImmobilisation, dateAchat, valeurAcquisition, responsableId, etatEquipement, calibrable)
- ✅ Familles d'outillage (13 sous-catégories OUTIL/EQUIPEMENT seedées)
- ✅ Permission `stock.utiliser` (magasinier + technicien), intégration nav « Outillage & Matériel », alertes bureau dans la Vue d'ensemble
- ✅ Vérifications : typecheck 257, build OK, tests API (approvisionnement, prêt, retour) concluants

**Reste à faire (après validation) :**
1. **Fiche exemplaire (outil)** : onglets État / Localisation / Affectation / Maintenance / Calibration / Achat & Garantie / Documents / Historique (endpoints maintenance & calibration à brancher)
2. **Fiche modèle (article OUTIL)** : liste des exemplaires avec état et détenteur
3. **Maintenance** : endpoint `addMaintenance`/`listMaintenances` + UI (fréquence, prochaine date, alertes)
4. **Calibration** : endpoint `addCalibration`/`listCalibrations` + statut 🟢🟠🔴 (alertes automatiques)
5. **Localisation détaillée** : écran Site/Zone/Atelier/Poste/Armoire/Rayon/Casier + QR sur l'armoire
6. **QR Code** : génération (librairie), scan téléphone, actions Emprunter/Retourner/Signaler
7. **Kits** : écran de composition + indicateur de complétude (table `kits_lignes` existante)
8. **Blocage facultatif** : technicien en retard ne peut plus emprunter
9. **Historique consolidé** de l'exemplaire (prêts + maintenance + calibration + mouvements)

---

## 10. Ordre d'implémentation proposé (après validation)

1. Fiche exemplaire (onglets + données existantes)
2. Endpoints + UI Maintenance & Calibration
3. Localisation hiérarchique + QR code
4. Kits (composition + complétude)
5. Alertes & blocages (retards, garantie, calibration expirée)