# PLAN DE TESTS RÉELS — MODULES CATALOGUE & STOCK

> Objectif : vérifier en conditions réelles — sans jargon — que le système
> répond au besoin. Chaque scénario indique ce que vous faites, puis ce que
> vous DEVEZ voir. Cochez la case du registre à la fin quand c'est passé.

---

## 1. Les besoins du client, tels que retenus

| # | Besoin exprimé | Où il est couvert |
|---|----------------|-------------------|
| B1 | Une fiche article précise : code, désignation, plusieurs références (négociant, DRB, AFIC...) avec source et niveau de vérification | Catalogue > Articles > fiche article > Références |
| B2 | Un stock clair : ce que j'ai, où c'est rangé, ce que ça vaut, ce qui manque | Stock > Aperçu, Mouvements, Emplacements, Alertes |
| B3 | Le recensement de fin de journée et un usage contrôlé (qui prend quoi, pour quel travail) | Stock > Recensement ; sortie de pièces sur OR |
| B4 | Une recherche fiable : par désignation, par référence, par véhicule | Catalogue > Recherche ; fiche véhicule > onglet Pièces |
| B5 | Gérer aussi l'outillage et le matériel (pas des pièces de rechange) | Catalogue > onglet Outillage & Matériel |
| B6 | Préparer les commandes fournisseurs à partir du réel, et regarder en premier dans les autres agences avant de commander | Stock > Prévisions, Chercher avant de commander, Transfert |

---

## 2. Ce qui a été développé (mappé sur les besoins)

- **Catalogue** : articles avec variantes grand public ; références équivalentes
  triées par usage réel ; compatibilités véhicules (y compris exclusion d'une
  année) ; recherche multi-accès ; aide à la saisie ; onglet Outillage &
  Matériel ; import de masse par fichiers ; statistiques.
- **Stock** : aperçu avec 6 indicateurs et alertes ; emplacements ; mise en
  rayon ; transferts ; contenants (fûts, DLC) ; déconditionnement ;
  reconditionnement ; recensement du garage ; inventaire par sessions ;
  ajustement manuel ; réception ; prévisions d'achat ; inter-agences ; outillage.
- **Règle d'or respectée partout** : le catalogue ne porte jamais de quantité —
  tout ce qui est compté vit dans le stock ; le stock ne descend jamais sous
  zéro ; toute sortie de pièce est rattachée à un ordre de réparation ou à une
  vente comptoir.

---

## 3. Chapitre A — Catalogue : articles et variantes

<!-- TESTS A1 à A7 : rédigés avec le client, exécution manuelle -->

**A1 — Créer un article pièce**
1. Catalogue > Articles > **Nouvel article**.
2. Suivre le guide écran : type (pièce), code, désignation, catégorie.
3. Enregistrer.
✅ Attendu : l'article apparaît dans la liste ; sa fiche s'ouvre ; son code
   devient non modifiable.

**A2 — Plusieurs variantes (ex. filtre à huile, 3 modèles)**
1. Fiche article > **Nouvelle variante**.
2. Saisir le libellé, le prix de vente, état NEUF ; enregistrer.
3. Créer une seconde variante.
✅ Attendu : deux variantes distinctes avec leur prix, chacune modifiable
   par son bouton Éditer.

**A3 — Où se monte la pièce (positions dans le véhicule)**
1. Édition de la variante filtre à huile : choisir **BAS MOTEUR** dans
   « Emplacement ».
2. Ampoule de feu avant : choisir **AVANT** dans « Côté ».
3. Pare-brise : **INTÉRIEUR** puis zone **SUPÉRIEUR**.
✅ Attendu : des sélecteurs séparés pour le côté, l'essieu, la zone,
   l'emplacement moteur ; « Non applicable » sélectionné par défaut.

**A4 — Variante d'occasion (pneu sorti d'une voiture)**
1. Nouvelle variante sur un article pneu : état **OCCASION**.
2. Choisir l'usure (ex. 70 %) ; enregistrer.
3. Éditer de nouveau et corriger le prix.
✅ Attendu : l'usure ne s'affiche qu'en état occasion ; l'enregistrement
   passe ; la relecture montre la valeur corrigée.

**A5 — Références fournisseurs (négociant, DRB, AFIC…)**
1. Fiche article > Références : ajouter une référence avec fournisseur.
2. Tenter d'enregistrer une surface marquée **Confirmé** sans source.
3. Corriger : source = Manuelle puis niveau = Catalogue.
✅ Attendu : un avertissement explicite apparaît à l'étape 2, sans
   empêcher l'enregistrement ; la correction passe sans erreur.

**A6 — Compatibilité véhicule (et exclusion négative)**
1. Fiche article > Compatibilité > ajouter un modèle, ex. 2005–2015.
2. Ajouter une compatibilité **négative** pour une année dans cette plage.
3. Retester l'ajout du même modèle exact.
✅ Attendu : le conflit est refusé avec un message clair ; l'exclusion
   d'année est enregistrée ; les dates bornées passent.

**A7 — Pont vers le véhicule**
1. Ouvrir un véhicule dont le modèle est attaché > onglet **Pièces**.
2. Ouvrir un OR du même véhicule > onglet **Pièces**.
✅ Attendu : les variantes compatibles s'affichent ; l'année exclue
   n'apparaît pas ; une pièce peut être ajoutée à l'OR depuis ce panneau.

---

## 4. Chapitre B — Stock : le magasin

**B1 — La photo permanente (Aperçu)**
- Ouvrir Stock > Aperçu.
✅ Attendu : six indicateurs (articles, valeur, alertes, emplacements, ...),
   un panneau « Articles sans emplacement » (stock présent mais pas encore
   rangé), un panneau Alertes (rupture : quantité à zéro ; critique : ≤ seuil
   critique ; faible : ≤ seuil d'alerte).

**B2 — Entrer du stock (réception physique)**
1. Stock > Mouvements > onglet Entrée : article, quantité, emplacement,
   prix d'achat unitaire ; valider.
✅ Attendu : le stock augmente ; le mouvement est dans l'historique avec sa
   référence ; la valeur du stock prend en compte le prix saisi.

**B3 — Ranger le stock**
1. Stock > Emplacements > créer `MAG-A-01-03` (zone-allée-rayon-niveau).
2. Stock > Mise en rayon : article + quantité.
✅ Attendu : en ouvrant l'emplacement, l'article est listé avec quantité et
   valeur ; le panneau « Articles sans emplacement » de l'Aperçu diminue.

**B4 — Sortie de pièces sur ordre de réparation (usage contrôlé)**
1. Ordres de réparation > ouvrir un OR > onglet **Pièces**.
2. **Réserver** une pièce (le disponible baisse, le stock actuel reste).
3. **Sortir** la pièce (le stock actuel descend maintenant).
4. **Retourner** une piece inutilisée (le stock est réintégré).
✅ Attendu : chaque action crée un mouvement tracé, rattaché à l'OR ; les
   actions sont bloquées sur un OR clos ; impossible de sortir plus que le
   disponible.

**B5 — Recensement de fin de journée**
1. Stock > Recensement : filtrer l'article, saisir la quantité vue, choisir
   la zone de rangement, passer à la ligne suivante.
2. Scanner un code-barres si disponible.
3. Valider l'ensemble.
✅ Attendu : le stock déjà connu s'affiche à côté de la saisie ; chaque
   ligne validée passe en vert ; les écarts (vu vs système) sont visibles
   avant validation finale.

**B6 — Inventaire par session**
1. Stock > Inventaire > **Nouvelle session** (statut Brouillon) > **Démarrer**.
2. Saisir les quantités physiques d'une zone > **Valider**.
✅ Attendu : la validation applique les écarts au stock et génère des
   mouvements référencés ; la session passe Validée puis Clôturée ; le
   comptage n'est autorisé qu'à l'état « En cours ».

**B7 — Ajustements, casse, perte**
1. Stock > Ajustement manuel : nature Perte, type Casse, quantité,
   motif (3 caractères minimum).
2. Tenter le même ajustement **sans** motif.
✅ Attendu : sans motif, l'enregistrement est refusé avec message ; avec
   motif, le stock baisse et la perte financière est tracée ; aucun ajustement
   n'est supprimable — on corrige par un mouvement inverse.

**B8 — Transferts et inter-agences**
1. Stock > Transfert : article + emplacement source + destination + quantité.
2. Stock > **Chercher avant de commander** : pour un article bas, voir s'il
   existe dans une autre agence, puis lancer le transfert.
✅ Attendu : le transfert est refusé si la source est insuffisante ; les
   mouvements sont liés (traçables) ; la commande n'est lancée qu'après
   vérification des autres agences.

**B9 — Fûts, DLC, déconditionnement, reconditionnement**
1. Stock > Contenants : choisir un fût **fermé** > action **Ouverture**.
2. Lire la DLC proposée pour les prélèvements futurs.
3. Stock > Déconditionnement : sortir 2 bidons de 5 L depuis ce fût.
4. Stock > Reconditionnement : transfert fût → petits contenants.
✅ Attendu : le nombre de bidons est **calculé** (jamais demandé à la
   saisie) ; l'ouverture est horodatée et la DLC en découle automatiquement ;
   les deux mouvements du reconditionnement existent ensemble ou pas du tout ;
   impossible de tirer plus que le contenu du fût.

---

## 5. Chapitre C — Vente et OR

**C1 — Vente comptoir (POS)**
1. Caisse POS : ajouter une pièce, régler, finaliser la vente.
✅ Attendu : le stock est décrémenté ; la sortie est liée à la vente ; la
   marge s'appuie sur le coût réel du stock.

**C2 — Mélange réservation / sortie / retour sur un OR**
✅ Voir B4 : le mélange des trois actions dans un même OR doit rester
   cohérent (disponible x stock actuel, mouvements d'historique propres).

---

## 6. Chapitre D — Préparation et import de masse

**D1 — Prévisions d'achat**
1. Stock > Prévisions : faire varier l'historique (7 à 90 jours) et la
   couverture souhaitée.
✅ Attendu : les articles sortent avec une urgence (critique / faible /
   normal) et un coût estimé de commande ; la liste change selon les réglages.

**D2 — Chercher avant de commander** ✅ voir B8.

**D3 — Import de masse**
- Le gros client dépose ses fichiers (produits, références équivalentes,
  compatibilités au format texte JSONL) ; l'import prend en charge les lots
  de 100 lignes, les rejoue un à un et termine proprement.
✅ Attendu : après l'import, les articles existent dans le catalogue avec
   leurs références ; un récapitulatif du lot est documenté dans le dossier
   `import-atelierone` ; l'import reste possible sur des fichiers partiels,
   dans l'ordre : produits → références → compatibilités.

---

## 7. Chapitre E — Outillage & Matériel

**E1 — Lister et chercher les outillages**
1. Catalogue > onglet **Outillage & Matériel**, utiliser la recherche texte.
✅ Attendu : liste des équipements, distincte des pièces ; filtre sur la
   désignation et le code.

**E2 — Gérer le parc d'outillage**
1. Ouvrir une fiche d'outillage > inventaire par agence.
2. Corriger la quantité par l'ajustement du parc.
✅ Attendu : la correction passe par un bouton Enregistrer explicite, une
   confirmation de succès apparaît, la liste se recharge à jour.

**E3 — Sortir un outil du stock**
✅ Voir B3–B4 ; l'outillage respecte les mêmes règles que les pièces.

---

## 8. Chapitre F — Recherche et aide

**F1 — Les plusieurs façons de trouver la pièce**
1. Catalogue > Recherche : recherche par désignation.
2. Recherche par référence fabricant ; par référence négociant.
3. Recherche avancée : marques, modèles, plages d'années.
✅ Attendu : chaque moyen retrouve la même pièce quand elle existe ; aucune
   pièce existante ne reste introuvable.

**F2 — L'aide intégrée**
1. Bouton **?** en haut à droite sur les pages des modules couverts.
2. Pages **Aide** de chaque module : liste pas-à-pas interactive.
✅ Attendu : les fiches ouvrent les étapes, les règles et une FAQ ; la
   progression cochée reste d'une session à l'autre sur le poste.

**F3 — Les états d'écran partout**
✅ Vérifier sur toutes les listes : état de chargement, état vide
   (message propre quand il n'y a rien), bouton Enregistrer qui écrit
   effectivement (toast de succès), message d'erreur affiché quand le
   serveur refuse.

---

## 9. Registre de suivi

| Test | Scénario | Passé ? | Observations |
|------|----------|---------|--------------|
| A1 | Créer un article | ☐ | |
| A2 | Variantes multiples | ☐ | |
| A3 | Positions véhicule | ☐ | |
| A4 | Occasion réelle | ☐ | |
| A5 | Références fournisseurs | ☐ | |
| A6 | Compatibilité + exclusion | ☐ | |
| A7 | Pont véhicule / OR | ☐ | |
| B1 | Aperçu & alertes | ☐ | |
| B2 | Entrée stock | ☐ | |
| B3 | Emplacements + mise en rayon | ☐ | |
| B4 | Sortie / réservation OR | ☐ | |
| B5 | Recensement | ☐ | |
| B6 | Inventaire session | ☐ | |
| B7 | Ajustement + perte | ☐ | |
| B8 | Transferts inter-agences | ☐ | |
| B9 | Fûts, DLC, dé/reconditionnement | ☐ | |
| C1 | Vente comptoir | ☐ | |
| D1 | Prévisions d'achat | ☐ | |
| D2 | Chercher avant de commander | ☐ | |
| D3 | Import de masse | ☐ | |
| E1 | Recherche outillage | ☐ | |
| E2 | Parc outillage | ☐ | |
| F1 | Recherches versions | ☐ | |
| F2 | Aide intégrée | ☐ | |
| F3 | États UX | ☐ | |

---

## 10. Points de vigilance

1. **Quantité dans le catalogue = bug.** Tout ce qui est compté vit dans le
   stock ; si un écran du catalogue propose de saisir une quantité, le
   signaler comme défaut.
2. **Stock jamais négatif.** Une sortie sur stock insuffisant est refusée
   avec un message clair.
3. **Coût réel (PMP).** Un achat à 3 000 puis un achat à 4 000 ramènent une
   sortie valorisée autour de 3 500 ; vérifier la valeur de sortie de stock.
4. **DLC du contenu du fût.** Un bidon pris dans un fût ouvert hier porte
   une DLC différente de celle d'un bidon sorti d'un fût encore fermé.
5. **Positions « Non applicable » par défaut.** Une pièce moteur exige au
   moins l'emplacement ; un accessoire d'intérieur n'exige pas d'essieu.
6. **Confirmé sans source = avertissement, pas blocage.** L'enregistrement
   passe mais l'avertissement doit s'afficher.
7. **L'outillage suit les règles du stock** : le maintien d'affichage
   distinct du catalogue pieces/outillage et du stock parc/outillage.
