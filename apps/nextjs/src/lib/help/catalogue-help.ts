import type { HelpFiche } from "~/lib/help/rh-help";
import type { EtapeGuide } from "~/components/help/GuideInteractif";

export const CATALOGUE_HELP_FICHES: HelpFiche[] = [
  {
    id: "catalog-articles",
    titre: "Articles (pièces, outillage, fluides)",
    courte:
      "Créer les articles du catalogue, leurs types, puis leurs variantes commerciales.",
    priorite: "P0",
    route: "/dashboard/catalog/articles",
    prerequis: [
      "Comprendre la règle d'or : le catalogue ne gère jamais de quantité — tout ce qui est compté vit dans le module Stock.",
    ],
    fonctionnalites: [
      "Créer un article : code unique, désignation, catégorie, unités et seuils de stock",
      "Types : pièce de rechange, outillage et matériel, fluide (huile, colle...)",
      "Deux niveaux : l'article (l'identité technique) puis les variantes (ce que le vendeur montre au comptoir)",
      "Assistant de création pas-à-pas pour un nouvel article",
      "Import de masse : fichiers JSONL (produits, références équivalentes, compatibilités) par lots de 100 lignes",
    ],
    etapes: [
      { titre: "Créer un article", detail: "Articles > Nouvel article > suivre les écrans > Enregistrer." },
      { titre: "Lire la fiche", detail: "Cliquez un article dans la liste : la fiche montre les onglets Références et Compatibilité, avec toutes les variantes." },
      { titre: "Créer une variante", detail: "Fiche article > Nouvelle variante > libellé, prix, état > Enregistrer." },
      { titre: "Import de masse", detail: "Préparez les fichiers JSONL dans le dossier d'import et respectez l'ordre décrit dans la fiche Import de masse." },
    ],
    regles: [
      { titre: "La quantité vit au stock", detail: "Le stock et l'inventaire comptent les quantités ; le catalogue décrit les pièces. Si un écran du catalogue propose une quantité, signalez-le comme un bug." },
      { titre: "Article vs variante", detail: "Un même filtre à huile est un article avec plusieurs variantes (un par modèle vendu) : le prix et la vente se font sur la variante." },
    ],
    faq: [
      { q: "Puis-je modifier le code d'un article après création ?", r: "Non : le code est fixé à la création et sert d'identifiant partout (stock, OR, factures)." },
      { q: "Un article sans variante est-il vendable ?", r: "Non : il apparaît dans les recherches techniques mais pas au comptoir tant qu'il n'a pas de variante grand public." },
    ],
  },
  {
    id: "catalog-variantes",
    titre: "Variantes et positions véhicule",
    courte:
      "La variante vendable : libellé, prix, état (neuf ou occasion) et là où elle se monte.",
    priorite: "P1",
    route: "/dashboard/catalog/articles",
    prerequis: ["Un article existant (ou créé via Nouvel article)."],
    fonctionnalites: [
      "Libellé d'affichage + prix de vente par variante",
      "État du produit : neuf, occasion, reconditionné...",
      "Origine : constructeur (genuine), OEM, après-marché, reconditionné, autre",
      "Positions dans le véhicule : côté / essieu / zone / emplacement moteur, boîte, roue, habitacle, carrosserie, freinage, climatisation, châssis",
      "Usure réservée aux variantes d'occasion (pourcentage)",
      "Édition par variante, avec bouton Enregistrer explicite",
    ],
    etapes: [
      { titre: "Créer la variante", detail: "Fiche article > Nouvelle variante > libellé + prix + état > Enregistrer." },
      { titre: "Indiquer la position", detail: "Dans l'édition : choisissez l'emplacement (ex. bas moteur) et le côté (ex. avant)." },
      { titre: "Cas particulier d'occasion", detail: "État Occasion > choisissez le pourcentage d'usure puis Enregistrer." },
    ],
    regles: [
      { titre: "Positions Non applicable", detail: "Les sélecteurs démarrent sur Non applicable : une pièce moteur exige au moins l'emplacement, un accessoire d'intérieur n'exige pas d'essieu." },
      { titre: "Deux états = deux variantes", detail: "Le même pneu en neuf et en occasion sont deux variantes distinctes, chacune avec son prix." },
    ],
    faq: [
      { q: "Pourquoi tant de sélecteurs de position ?", r: "Pour retrouver la pièce selon le montage réel du véhicule : un filtre à huile se cherche comme bas moteur, pas comme habitacle." },
      { q: "Modifier le prix change-t-il les ventes passées ?", r: "Non : les ventes passées restent au prix d'époque ; l'édition ne vaut que pour les ventes à venir." },
    ],
  },
  {
    id: "catalog-references",
    titre: "Références équivalentes (sources du magasin)",
    courte:
      "Plusieurs références pour un même article, avec source et niveau de vérification.",
    priorite: "P1",
    route: "/dashboard/catalog/articles",
    prerequis: ["L'article existe et sa fiche est ouverte."],
    fonctionnalites: [
      "Ajouter une référence avec son fournisseur (négociant, DRB, AFIC, identique constructeur...)",
      "Niveau de vérification : suggéré, interrogé, confirmé",
      "Source de vérification : catalogue, manuel, pièce conforme, informations du fournisseur",
      "Avertissement à l'enregistrement d'un confirmé sans source",
      "Tri des références par usage réel",
    ],
    etapes: [
      { titre: "Ajouter une référence", detail: "Fiche article > Références > la référence + le fournisseur > Enregistrer." },
      { titre: "Qualifier", detail: "Choisissez le niveau (suggéré / interrogé / confirmé) et la source si la pièce a été vérifiée." },
      { titre: "Avertissement confirmé sans source", detail: "Un confirmé sans source s'enregistre mais l'interface affiche un avertissement explicite." },
    ],
    regles: [
      { titre: "Avertissement, pas blocage", detail: "Un confirmé sans source signale une fiche à renforcer : l'interface le montre mais ne bloque pas le travail du magasin." },
      { titre: "Source par défaut", detail: "Sans source précisée, la référence est rangée comme saisie manuelle." },
    ],
    faq: [
      { q: "Je ne sais pas si la référence est juste — comment l'indiquer ?", r: "Niveau suggéré : la référence est conservée pour la recherche mais ne prétend pas être vérifiée." },
      { q: "Une référence peut-elle être supprimée ?", r: "Oui, depuis la fiche article ; le retrait apparaît dans l'historique des modifications de la fiche." },
    ],
  },
  {
    id: "catalog-compatibilites",
    titre: "Compatibilité véhicule (et exclusion d'année)",
    courte:
      "Rattacher l'article aux véhicules qui l'acceptent — et exclure les exceptions.",
    priorite: "P1",
    route: "/dashboard/catalog/articles",
    prerequis: ["Connaître la marque / le modèle / la plage d'années de la pièce."],
    fonctionnalites: [
      "Compatibilité par marque, modèle et plage d'années (de – à)",
      "Compatibilité négative : exclure une année précise à l'intérieur d'une plage acceptée",
      "Détection de conflit : un rattachement exact déjà existant est refusé avec message",
      "La fiche véhicule (onglet Pièces) et l'onglet Pièces des OR consomment ces rattachements",
    ],
    etapes: [
      { titre: "Rattacher un modèle", detail: "Fiche article > Compatibilité > marque / modèle / années de et à > Enregistrer." },
      { titre: "Exclure une année", detail: "Compatibilité négative > même famille puis l'année à exclure > Enregistrer." },
      { titre: "Conflit", detail: "Retentez exactement le même rattachement : le système refuse avec un message clair." },
    ],
    regles: [
      { titre: "Compatibilité au niveau article", detail: "Le rattachement vit sur l'article, donc vaut pour toutes ses variantes." },
      { titre: "L'exclusion gagne", detail: "Une année marquée négative n'apparaît jamais, même dans une plage rattachée positivement." },
    ],
    faq: [
      { q: "Puis-je rattacher une variante seule à un véhicule ?", r: "Non : la compatibilité vit sur l'article et vaut pour toutes ses variantes." },
      { q: "Une pièce adaptée à plusieurs véhicules ?", r: "Ajoutez chaque modèle concerné dans la même page Compatibilité." },
    ],
  },
  {
    id: "catalog-recherche",
    titre: "Recherche (désignation, référence, avancée)",
    courte:
      "Quatre moyens de trouver la pièce : texte, référence fabricant, référence négociant, véhicule.",
    priorite: "P1",
    route: "/dashboard/catalog/recherche",
    prerequis: ["Un article existant, avec au moins une variante grand public."],
    fonctionnalites: [
      "Recherche par texte (désignation, code)",
      "Recherche par référence fabricant",
      "Recherche par référence négociant (les références équivalentes)",
      "Recherche avancée : marques, modèles, plages d'années",
      "Chaque variante affiche son prix et sa disponibilité",
    ],
    etapes: [
      { titre: "Par désignation", detail: "Catalogue > Recherche > un mot-clé (ex. filtre huile) > les fiches s'affichent." },
      { titre: "Par référence", detail: "Saisissez la référence du fabricant ou du négociant ; la recherche n'est pas sensible à la casse." },
      { titre: "Recherche avancée", detail: "Choisissez la marque, le modèle puis la plage d'années du véhicule à servir." },
    ],
    regles: [
      { titre: "La pièce ne remonte pas ? Vérifiez le rattachement", detail: "L'onglet Pièces d'une fiche véhicule n'affiche que ce qui est rattaché dans le catalogue." },
      { titre: "Le prix affiché est celui de la variante", detail: "Une variante d'occasion affiche le prix occasion, une variante neuve le prix neuf." },
    ],
    faq: [
      { q: "Ma référence négociante ne remonte pas", r: "Vérifiez sur la fiche article qu'elle a été ajoutée avec le bon fournisseur dans l'onglet Références." },
      { q: "La recherche ne renvoie rien", r: "Raccourcissez le mot-clé : une recherche trop précise peut revenir vide." },
    ],
  },
  {
    id: "catalog-outillage",
    titre: "Outillage & Matériel",
    courte:
      "Les équipements (machines, outils, consommables) : un parc géré par agence.",
    priorite: "P1",
    route: "/dashboard/catalog",
    prerequis: ["L'article est de type Outillage ou Matériel (pas une pièce de rechange)."],
    fonctionnalites: [
      "Onglet dédié Outillage & Matériel dans la navigation du catalogue",
      "Recherche par désignation ou par code, comme pour les pièces",
      "Fiche équipement : quantité visible au parc de chaque agence",
      "Ajustement du parc via un bouton Enregistrer explicite",
    ],
    etapes: [
      { titre: "Ouvrir l'onglet", detail: "Catalogue > onglet Outillage & Matériel > cherchez le matériel visé." },
      { titre: "Corriger le parc", detail: "Fiche outillage > inventaire par agence > ajustez la quantité > Enregistrer." },
    ],
    regles: [
      { titre: "Les mêmes règles de stock", detail: "Le parc d'outillage suit les règles du stock : tout mouvement est tracé, à l'agence et horodaté." },
    ],
    faq: [
      { q: "Mon outillage n'apparaît pas ici", r: "Vérifiez que le type de l'article est bien Outillage / Matériel et non pièce de rechange." },
      { q: "Un équipement à sortir ?", r: "Les sorties suivent les mouvements de stock du module Stock : affectez l'équipement à une agence puis sortez-le." },
    ],
  },
  {
    id: "catalog-aide-saisie",
    titre: "Aide à la saisie (l'assistant du catalogue)",
    courte:
      "Trouver la pièce depuis un libellé de garage ou un code atelier, sans connaître la fiche.",
    priorite: "P2",
    route: "/dashboard/catalog/aide",
    prerequis: ["Avoir une désignation courante (ex. filtre huile Hilux) ou un code garage."],
    fonctionnalites: [
      "Saisir un besoin en langage courant et obtenir des suggestions de pièce",
      "Aide en ligne accessible depuis la navigation Catalogue et depuis le bouton ? sur les pages du catalogue",
    ],
    etapes: [
      { titre: "Ouvrir l'aide", detail: "Catalogue > Aide > saisissez le besoin (ex. filtre huile Hilux) et suivez les suggestions." },
      { titre: "Choisir", detail: "Cliquez la suggestion pour aller vers l'article associé." },
    ],
    regles: [],
    faq: [],
  },
  {
    id: "catalog-import",
    titre: "Import de masse (fichiers du grossiste)",
    courte:
      "Gros volumes via fichiers JSONL, par lots de 100, dans un ordre précis.",
    priorite: "P2",
    route: "/dashboard/catalog",
    prerequis: ["Les fichiers JSONL préparés (produits, références équivalentes, compatibilités)."],
    fonctionnalites: [
      "Import par lots de 100 lignes, avec reprise en cas de souci",
      "Ordre imposé : produits, puis références équivalentes, puis compatibilités",
      "Lots en erreur rejouables seuls, après correction du fichier",
    ],
    etapes: [
      { titre: "Préparer", detail: "Suivez le format décrit dans le dossier d'import (produits.jsonl, references_equiv.jsonl, compatibilites.jsonl)." },
      { titre: "Lancer", detail: "Exécutez l'import via le script du module ; les lots passent groupés par 100." },
      { titre: "Vérifier", detail: "Cherchez quelques articles dans Catalogue > Articles pour confirmer variantes et références." },
    ],
    regles: [
      { titre: "Jamais de quantité dans l'import", detail: "Même en masse, un article importé ne porte pas de quantité : l'inventaire se fait après l'import." },
    ],
    faq: [
      { q: "Un lot échoue — doit-on tout relancer ?", r: "Non : les lots déjà validés sont conservés, seuls les lots en erreur se rejouent après correction." },
    ],
  },
];

export const CATALOGUE_PAS_A_PAS: EtapeGuide[] = [
  {
    id: "cat-p0-regle",
    titre: "Comprendre la règle d'or du catalogue",
    ou: "Catalogue > Articles",
    route: "/dashboard/catalog",
    quoi: [
      "Le catalogue décrit ce qu'on peut vendre ou utiliser : articles, variantes, prix, références, compatibilités.",
      "Aucune quantité ne se saisit jamais ici : tout ce qui est compté vit dans le module Stock.",
    ],
    attendu: "vous savez où serait saisie une quantité (réponse : jamais dans le catalogue).",
  },
  {
    id: "cat-p1-articles",
    titre: "Créer ou retrouver un article",
    ou: "Catalogue > Articles (> Nouvel article)",
    route: "/dashboard/catalog/articles",
    quoi: [
      "Cherchez d'abord si l'article existe (recherche par texte).",
      "Sinon Nouvel article : type, code, désignation, catégorie > Enregistrer.",
    ],
    attendu: "la fiche article s'ouvre, avec ses variantes et les onglets Références / Compatibilité.",
  },
  {
    id: "cat-p2-variante",
    titre: "Créer la variante grand public",
    ou: "Fiche article > Nouvelle variante",
    route: "/dashboard/catalog/articles",
    quoi: [
      "Libellé parlant (ex. filtre huile diesel), prix de vente, état NEUF.",
      "Pour une pièce d'occasion : état OCCASION puis pourcentage d'usure.",
      "Indiquez la position dans le véhicule (ex. bas moteur, avant).",
    ],
    attendu: "la variante apparaît sur la fiche avec son prix ; la réédition se corrige sans erreur.",
  },
  {
    id: "cat-p3-references",
    titre: "Enregistrer les références fournisseurs",
    ou: "Fiche article > Références",
    route: "/dashboard/catalog/articles",
    quoi: [
      "Ajoutez la référence négociant / DRB / AFIC avec son fournisseur.",
      "Choisissez le niveau de vérification, et la source si la pièce a été vérifiée.",
    ],
    attendu: "les références s'affichent triées ; un confirmé sans source produit un avertissement (non bloquant).",
  },
  {
    id: "cat-p4-compatibilite",
    titre: "Rattacher l'article aux véhicules",
    ou: "Fiche article > Compatibilité",
    route: "/dashboard/catalog/articles",
    quoi: [
      "Ajoutez marque, modèle, et la plage d'années (de – à).",
      "En cas d'exception : compatibilité négative sur l'année exacte à exclure.",
    ],
    attendu: "le rattachement est enregistré ; un rattachement identique est refusé pour conflit.",
  },
  {
    id: "cat-p5-pont",
    titre: "Vérifier le pont : fiche véhicule et OR",
    ou: "Véhicules > fiche > onglet Pièces ; OR > onglet Pièces",
    route: "/dashboard/vehicules",
    quoi: [
      "Ouvrez une fiche véhicule > onglet Pièces : les variantes rattachées au modèle s'affichent.",
      "Vérifiez que l'année exclue (compatibilité négative) n'apparaît pas.",
      "Faites la même vérification depuis un OR du même véhicule > onglet Pièces.",
    ],
    attendu: "les pièces compatibles s'affichent, pareil depuis la fiche véhicule et depuis l'OR ; l'ajout à l'OR passe.",
  },
  {
    id: "cat-p6-recherche",
    titre: "Chercher la pièce (4 moyens)",
    ou: "Catalogue > Recherche",
    route: "/dashboard/catalog/recherche",
    quoi: [
      "Recherche texte par désignation (ex. filtre huile).",
      "Recherche par référence fabricant ; par référence négociant.",
      "Recherche avancée : marque / modèle / plages d'années.",
    ],
    attendu: "la même pièce ressort par les 4 moyens quand elle est bien rattachée.",
  },
  {
    id: "cat-p7-outillage",
    titre: "Gérer l'outillage et le matériel",
    ou: "Catalogue > onglet Outillage & Matériel",
    route: "/dashboard/catalog",
    quoi: [
      "Liste et recherche du matériel, comme pour les pièces.",
      "Fiche outillage : parc par agence, ajuster la quantité, Enregistrer.",
    ],
    attendu: "le parc affiche la bonne quantité par agence après ajustement.",
  },
  {
    id: "cat-p8-masse",
    titre: "Alimenter en gros volume (import de masse)",
    ou: "Fichiers JSONL + script d'import",
    route: "/dashboard/catalog",
    quoi: [
      "Préparez produits.jsonl puis references_equiv.jsonl puis compatibilites.jsonl.",
      "Lancez l'import : les lots passent par 100, dans cet ordre.",
      "Vérifiez quelques articles dans la liste après l'import.",
    ],
    attendu: "les articles, références et compatibilités du grossiste existent dans la recherche.",
    astuce: "Un lot en erreur se rejoue seul ; les lots déjà validés ne se répètent pas.",
  },
];

export const PARCOURS_CATALOGUE = [
  { label: "1. Comprendre (règle d'or)", route: "/dashboard/catalog" },
  { label: "2. Créer un article", route: "/dashboard/catalog/articles" },
  { label: "3. Créer une variante", route: "/dashboard/catalog/articles" },
  { label: "4. Références et compatibilité", route: "/dashboard/catalog/articles" },
  { label: "5. Chercher une pièce", route: "/dashboard/catalog/recherche" },
  { label: "6. Outillage & Matériel", route: "/dashboard/catalog" },
  { label: "7. Aide à la saisie", route: "/dashboard/catalog/aide" },
];
