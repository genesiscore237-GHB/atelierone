# CONTEXTE D'IMPLÉMENTATION — GARAGE POLYVALENT JUNIOR (GPJ) / ATELIERONE

> **Synthèse de référence** issue de la lecture intégrale des 4 documents de `DOSSIER GPJ\digitalisation` :
> 1. `01_Manuel_Procedures_Organisation_GPJ_V2.docx` (V2, 70 lignes)
> 2. `02_Architecture_Logicielle_Digitalisation_GPJ.docx` (cahier de conception, 113 lignes)
> 3. `03_Cartographie_Processus_Modules.docx` (mapping procédures → modules, 47 lignes)
> 4. `Manuel des Procedures et d'Organisation - GPJ.docx` (manuel complet V1, 1752 lignes / 31 procédures)
>
> Ce document sert de **référence métier** pour guider l'implémentation de l'application AtelierOne.

---

## 1. L'ENTREPRISE (contexte réel)

| Élément | Valeur |
|---|---|
| Raison sociale | GARAGE POLYVALENT JUNIOR (GPJ / ETS GPJ) |
| Activité | Mécanique générale & commerce général |
| Création / Capital | 1996 · 50 000 000 FCFA |
| PDG / Gérant | TATSIANDA Norbert |
| NIU / Adresse | P117300138756B · Carrefour Bastos, derrière station Neptune, B.P. 13541 Yaoundé |
| Site | ~5 000 m² · parking 75 véhicules · clôture + vidéosurveillance |
| Horaires | Lun–Ven 08h00–17h30 · Sam 08h00–12h00 · astreinte clients réguliers |
| TVA | **19,25 %** |
| Effectifs | ~30 personnes : 1 direction, RAF + comptable + assistante, chef d'atelier + 3 chefs de section, 12 mécaniciens, 3 tôliers, 1 clim, 1 magasinier, apprentis/stagiaires |

---

## 2. ORGANISATION & PROFILS (15 profils — base des rôles utilisateur)

| # | Profil | Responsabilités clés |
|---|---|---|
| 1 | Propriétaire / Gérant | Stratégie, pilotage, validation, financier, commercial |
| 2 | Chef d'atelier | Organisation atelier, équipe, qualité, relation client, reporting |
| 3 | Conseiller service / Réceptionnaire | Accueil, prise en charge véhicule, devis & vente, suivi, restitution |
| 4 | Réceptionniste / Accueil | Accueil, administratif, support |
| 5 | Mécanicien / Technicien | Diagnostic, réparation, documentation, outillage, sécurité |
| 6 | Mécanicien senior / Diagnosticien | Expertise, support, formation, qualité |
| 7 | Chef d'équipe / Shop Foreman | Coordination, support technique, management proximité |
| 8 | Carrossier | Diagnostic carrosserie, réparation, qualité |
| 9 | Peintre carrosserie | Préparation, peinture, qualité |
| 10 | Magasinier / Gestionnaire de pièces | Stock, commandes, délivrance atelier, vente comptoir, reporting |
| 11 | Vendeur pièces / Comptoir | Vente, support atelier |
| 12 | Comptable / RAF | Comptabilité, paie, RH, reporting, fiscalité |
| 13 | Agent d'entretien / Laveur | Nettoyage, support |
| 14 | Apprenti / Stagiaire | Apprentissage, support |
| 15 | Contrôleur qualité / Inspecteur | Contrôle final, non-conformités, amélioration |

**4 niveaux de pilotage** : Direction (décide) → Responsables opérationnels (organisent) → Responsables de service (supervisent) → Exécutants (réalisent et renseignent).

---

## 3. VISION LOGICIELLE (Architecture Logicielle §1)

Système de gestion intégré **type DMS adapté au contexte camerounais**. Le dirigeant doit pouvoir savoir à tout moment :
- Quels véhicules sont dans le garage (et pourquoi)
- Qui travaille dessus
- Quelles pièces ont été sorties / commandées
- Ce qui a été facturé et ce qui reste dû
- L'état des contrats flottes et des créances
- La charge de l'atelier et les alertes (stock, retards, immobilisations)

**Principe directeur : le dossier véhicule unique (OR) est le pivot de toute la chaîne** — relié aux clients, contrats, pièces, factures, paiements et emplacements.

---

## 4. MODULES FONCTIONNELS (Architecture §3) → état dans AtelierOne

| Module requis | Contenu attendu | État AtelierOne actuel |
|---|---|---|
| **Clients & Contrats** | Fiches clients (Particulier / Entreprise sous contrat / ponctuelle), contrats maintenance flottes, conditions paiement, limites crédit, soldes, relances, vue 360° | Module `clients` / `contrats` / `customers` / `creances` — à vérifier/renforcer (vue 360°, limites crédit) |
| **Véhicules & OR** | Fiche véhicule + historique, réception (état des lieux, photos, accessoires, km, carburant), OR (plaintes, diagnostic, travaux, temps, pièces, avenants), statuts véhicule (En diagnostic, En cours, Attente pièce, Terminé, Immobilisé, Transféré site 2, Sorti), planning + affectation | Module `vehicules` / `ordres-reparation` / `planning` — existant |
| **Stock / Magasin** | Référentiel + typologie + emplacements, mouvements (entrées, sorties OR, ventes comptoir, transferts, ajustements, pertes/vols/casse), reconditionnement fûts→unités, commandes + réceptions, seuils/alertes/inventaires/valorisation PMP | Module `stock` — **implémenté** (specs stock) |
| **Facturation & Caisse** | Pro-formas/Devis, factures (immédiates/groupées/périodiques), encaissements multi-modes (espèces, MoMo, virement, chèque, crédit), créances + relances | Module `finance` / `cash` / `pos` — existant |
| **RH & Présences** | Employés, contrats, présences, congés, lien paie | Module `rh` — **implémenté complet (RH-00 → RH-09)** |
| **Pilotage / Tableaux de bord** | KPIs Direction : CA, créances, occupation atelier, immobilisations, ruptures stock ; vues Chef d'atelier et Magasinier | Module `pilotage` / dashboards — partiel |
| **Modules supports** | Documents & numérotation N°XX/GPJ/MM/YY, GED simple, paramétrage (TVA 19,25 %, grilles, seuils, droits) | Paramétrage partiel ; GED/numérotation à vérifier |

---

## 5. MAPPING PROCÉDURES → MODULES (Cartographie)

### Cœur métier (P01–P15)
| Procédure | Module logiciel |
|---|---|
| P01 Réception véhicule (photos, accessoires, km, carburant, état des lieux) | Véhicules / OR |
| P02 Diagnostic (anomalies, validation chef atelier) | OR |
| P03 Devis / Pro-forma (HT / TVA 19,25 % / TTC, masque N°XX/GPJ/MM/YY) | Facturation |
| P04 Validation client (règle d'or : pas de travaux sans accord tracé) | OR + Facturation |
| P05 Planification (planning, affectation, priorité, délais) | OR / Planning |
| P06 Travaux (temps, observations, photos) | OR (+ RH temps) |
| P07 Pièces (demande, délivrance, retours, **sortie liée à l'OR**) | Stock |
| P08 Avenants (accord client obligatoire) | OR + Facturation |
| P09 Contrôle qualité (check-list, non-conformités, **bloque restitution**) | OR / Qualité |
| P10 Restitution & encaissement | Facturation + Caisse + OR |
| P11 Facturation (numérotation, TVA, bordereau, attestation) | Facturation |
| P12 Créances / crédit / recouvrement (relances, blocage, remises autorisées) | Clients + Facturation + Relances |
| P13 Livraison flottes (bordereau, attestation service fait) | Clients & Contrats + OR |
| P14 Sinistres / assurances (expertise, rachat épave) | Clients + OR |
| P15 Relation client / rappels (campagnes, réclamations, satisfaction) | Clients |

### Administratif & financier (P16–P23)
| Procédure | Module |
|---|---|
| P16 Appels d'offres | GED (non prioritaire V1) |
| P17 Contrats & marchés publics (BC, CCA, virements) | Clients & Contrats |
| P18 Achats fournisseurs (CAMI TOYOTA, commande, réception) | Stock (commandes + réceptions) |
| P19 Stock & inventaires | Stock |
| P20 Comptabilité & trésorerie | Facturation/Caisse + exports |
| P21 Paie & personnel | RH |
| P22 Fiscalité & social (TVA 19,25 %, TSR, ACF) | Exports + Facturation |
| P23 Archivage | GED |

### RH, Sécurité, Qualité (P24–P31)
| Procédure | Module |
|---|---|
| P24 Recrutement & intégration | RH |
| P25 Formation | RH (plan de formation) |
| P26 Congés / absences / remplacements | RH (présences & congés) |
| P27–P28 Sécurité / Hygiène (EPI, 5S) | Organisationnel (check-lists) |
| P29 Charte chauffeurs & livraisons (caution solidaire) | RH + suivi missions |
| P30 Qualité / amélioration continue (taux de reprise) | OR / Qualité |
| P31 Réclamations & litiges | Clients (registre) |

---

## 6. RÈGLES MÉTIER NON NÉGOCIABLES (manuel V1 §1.5 + V2 §1.3)

1. **Aucun travail ne démarre sans pro-forma validée** par le client (sauf urgence d'astreinte tracée, régularisée le jour ouvré suivant).
2. **Toute pièce sortie du magasin est imputée à un OR ou à une vente comptoir.**
3. Tout véhicule présent sur site doit avoir une **fiche / statut à jour**.
4. Les mouvements de stock, OR, factures et paiements forment une **chaîne de traçabilité continue**.
5. Numérotation : **N°XX/GPJ/MM/YY** (séquences par client et par année).
6. **TVA 19,25 %** appliquée partout.
7. Solde client = **calcul dynamique** (factures − paiements).
8. Statuts véhicule et OR **synchronisés**.
9. **Aucun document critique n'est supprimable** (annulation compensatoire uniquement).
10. Avenants : **accord client obligatoire** avant poursuite des travaux.
11. Contrôle qualité : **bloque la restitution** en cas de non-conformité majeure.
12. Remises / annulations de créances : **motif écrit + autorisation du directeur**, historique conservé.
13. **Reconditionnement des fluides (fûts → unités)** et inventaires cycliques obligatoires.

---

## 7. PRIORITÉS DE DIGITALISATION (Cartographie §3)

1. Véhicules + OR + Réception + Diagnostic + Devis + Validation
2. Stock (sorties liées OR + entrées + alertes)
3. Facturation + Caisse + Créances de base
4. Clients & Contrats flottes + facturation groupée + relances
5. Planning atelier + temps + qualité
6. RH / Présences
7. Tableaux de bord complets + GED + automatisations

**Règle d'or :** toute fonctionnalité doit répondre à une question du dirigeant ou d'un responsable, et améliorer la traçabilité, le contrôle ou la vitesse d'exécution d'une procédure existante.

---

## 8. EXIGENCES NON FONCTIONNELLES

- Droits d'accès **fins par profil** (15 profils)
- **Traçabilité complète** (qui a fait quoi, quand)
- Fonctionnement correct avec connexion internet stable (+ mode dégradé si possible)
- **Sauvegardes régulières**
- Interface simple pour magasinier et techniciens (**peu de clics**)
- Support TVA 19,25 % et **modes de paiement locaux (Mobile Money)**

---

## 9. INDICATEURS CIBLES (à suivre dans les tableaux de bord)

- Taux d'occupation des ponts
- Délai moyen de restitution
- Taux de reprise (qualité)
- Taux de recouvrement des créances
- Écarts d'inventaire
- Satisfaction client

---

## 10. CONSTATS POUR L'IMPLÉMENTATION ATELIERONE

**Déjà implémenté et conforme :**
- ✅ Module **RH complet** (RH-00 → RH-09) : 15 profils alignables sur les rôles, présences, congés, paie camerounaise (TVA/IRPP/CNPS), compétences, documents, disciplinaire, dashboard
- ✅ Module **Stock** (specs stock) : référentiel, emplacements, mouvements tracés, reconditionnement fûts→unités, inventaires, alertes, PMP
- ✅ **RBAC corrigé** (permissions par rôle effectives)

**À renforcer / vérifier pour être aligné sur le manuel :**
- ⚠️ **Sortie pièce liée à un OR** (P07 §2 et règle n°2) — écart critique stock restant
- ⚠️ **Numérotation N°XX/GPJ/MM/YY** sur factures/pro-formas
- ⚠️ **Pro-forma validée obligatoire avant travaux** (P04) — contrôle système à implémenter
- ⚠️ **Statuts véhicule complets** (En diagnostic, Attente pièce, Immobilisé, Transféré site 2, Sorti…)
- ⚠️ **Vue 360° client** (historique véhicules + créances + contrats + réclamations)
- ⚠️ **Contrôle qualité** (check-list, non-conformités, blocage restitution) — P09/P30
- ⚠️ **Créances & relances** avec historique (P12)
- ⚠️ **Vue Chef d'atelier** (charge, planning, immobilisations) dans le pilotage

---

*Référence établie le 19/08/2026 à partir des 4 documents de digitalisation GPJ. À conserver comme source métier pour toute évolution de l'application.*