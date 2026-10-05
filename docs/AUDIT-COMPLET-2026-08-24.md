# 🔍 AUDIT COMPLET — ATELIERONE ERP

> **Rapport de référence pour les corrections futures** — à consulter avant toute modification structurelle.
> Chaque constat est étayé par un chemin de fichier (+ ligne quand pertinent). Cocher les cases au fur et à mesure des corrections.

| | |
|---|---|
| **Date de l'audit** | 2026-08-24 |
| **Commit audité** | `0294c6e` — "Module Véhicules & Atelier (cœur du cycle)" |
| **Périmètre** | Monorepo complet : `apps/nextjs`, `packages/{db,auth,api,ui,design-system,validators}`, CI, git |
| **Méthode** | Lecture directe du code + greps quantifiés + graphify query. Aucune modification effectuée. |
| **Verdict global** | **7/10 — très bon socle métier, pas encore « production-hardened »** |

---

## 1. Scores par axe

| Axe | Note | Synthèse |
|---|---:|---|
| Complétude fonctionnelle | **8.5/10** | Couverture métier garage remarquable ; devis embryonnaire, RDV client à clarifier |
| Sécurité | **7.5/10** | RBAC serveur + audit logs au-dessus du standard ; tenant middleware fail-open |
| Robustesse & UX | **7/10** | Règle UX quasi conforme ; error boundaries absents |
| Cohérence & logique | **6.5/10** | Doublon clients/customers + double couche DB |
| Maintenabilité | **6/10** | Tests + CI bons ; ~1 031 `any`, monolithes, débris |
| Performance / rapidité | **5.5/10** | ⚠️ Zéro index en base = risque majeur |

---

## 2. Architecture constatée

- **Monorepo** Turbo/pnpm (`package.json` racine, `turbo.json`), Node ≥18.
- **App T3** : Next.js App Router (`apps/nextjs/src/app`), tRPC v11 + superjson (`src/server/api/trpc.ts`), React Query (`src/trpc/react.tsx`), Tailwind, sonner, recharts, framer-motion, jspdf/exceljs côté client.
- **Données** : PostgreSQL via Drizzle ORM — `packages/db/src/schema/` : **77 fichiers, ~90 tables**, faits pré-agrégés (`entrepot.ts`). Deux clients Drizzle coexistent (cf. §6.3).
- **Auth** : NextAuth v5 Credentials + JWT 24h (`packages/auth/src/config.ts`), bcryptjs, rate limiter login IP+email.
- **API** : **40 routers tRPC** déclarés dans `apps/nextjs/src/server/api/root.ts`.
- **UI** : ~40 modules dashboard sous `src/app/(dashboard)/dashboard/<module>`, hook permissions `src/hooks/usePermissions.tsx`.
- **CI** : `.github/workflows/ci.yml` → `pnpm lint && pnpm typecheck && pnpm test` sur push/PR main+develop. ✅
- **Graphify** : graphe présent (`graphify-out/graph.json`) — utilisable pour naviguer avant chaque correction.

### Répartition des procédures tRPC (comptage réel sur `src/server/api/routers/*.ts`)

| Procédure | Usages |
|---|---:|
| `requirePermissionProcedure` (RBAC granulaire) | 206 |
| `protectedProcedure` | 116 |
| `rhProcedure` | 68 |
| `adminProcedure` | 59 |
| `stockProcedure` | 33 |
| `posProcedure` | 30 |
| `caisseProcedure` | 12 |
| `financeProcedure` | 11 |
| `publicProcedure` | **1** (uniquement `organization.setup`, gardé) |

---

## 3. ✅ Points forts (à préserver absolument)

1. **Cycle OR complet** : `or-router.ts` — list/getById/create/update/addLigne/updateLigne/deleteLigne/addPieceClient/remettrePieceClient/facturer. Commentaire L24 : « réception → diagnostic → devis → validation → travaux → clôture ».
2. **Sécurité serveur sincère** :
   - `agenceId` TOUJOURS issu de `ctx.user` côté serveur, jamais de l'input client (vérifié dans pos.ts, customers.ts, finance.ts).
   - Audit log automatique de toute mutation réussie, avec masquage `password`/`token` (`trpc.ts:91-114`).
   - Login : bcrypt.compare + zod (`loginSchema`) + rate limiting double IP/email (`packages/auth/src/config.ts:58-72`).
   - Endpoint setup verrouillé après initialisation (`organization.ts:29-37`).
   - Middleware global : redirection login + headers `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` (`apps/nextjs/src/middleware.ts`).
   - Secrets : `.gitignore` couvre `.env`, `.env*.local`, `.env.supabase`, `.env.superadmin` ; `.env.example` ne contient que des placeholders.
3. **Intégrité des écritures** : **40 transactions `db.transaction`** dans les routers critiques (stock ×19, procurement ×11, or-router, finance, inventory, pos, sales, returns, partner, contrats). Checkout POS : validation stock → transaction vente+lignes (`pos.ts:687-750`).
4. **Argent typé correctement** : colonnes `numeric(12,2)` partout (`ventes.ts:19-21`, `ventesLignes`), jamais de float.
5. **RBAC métier garage** : `packages/db/src/security-socle.ts` — 10 rôles (superadmin → consultation) + permissions fines (`pos.vente.creer`, `caisse.fermer`, `stock.inventaire`…).
6. **Règle UX (AGENTS.md)** largement respectée : **401 appels `toast()`**, `<Toaster richColors>` monté (`app/layout.tsx:58`), zéro `alert()` natif sauf 9 occurrences résiduelles (§7), recherche/filtres dans les listes (customers search, pos searchPreInvoices), pagination généralisée (**331 appels `.limit(`**).
7. **Tests ciblés sur la logique d'argent** : 19 fichiers de tests unitaires dans `apps/nextjs/src/server/lib/` (payroll-engine, facturation-service, stock-engine/calculs, inventaire-service, presence-engine, evaluation-engine, skills-engine, leave-engine, disciplinary-engine, documents-engine, kit-service, lot-service, sale-service, vehicule-service, piece-client-service, rh-stats-engine, client-service) + exécutés en CI.

---

## 4. 🔴 Constats CRITIQUES

### C1. Zéro index en base de données
- **Preuve** : 0 occurrence de `index(`/`uniqueIndex(` dans les 77 fichiers de `packages/db/src/schema/`. Seuls PK et contraintes unique existent.
- **Impact** : PostgreSQL n'indexe PAS automatiquement les colonnes FK ni les colonnes de filtrage. Dès quelques centaines de milliers de lignes (`mouvements_stock`, `ventes_lignes`, `audit_logs`, `faits_*`), chaque requête dashboard/liste fera des **full scans**. Les 331 `.limit(` ne sauveront pas les `WHERE agence_id = … AND created_at > …` sans index.
- **Colonnes prioritaires à indexer** : `ventes(agence_id, statut, created_at)`, `ventes(session_caisse_id, operateur_id, client_id)`, `ventes_lignes(vente_id, produit_id, lot_id)`, `mouvements_stock(produit_id, agence_id, created_at)`, `stocks(agence_id, produit_id)` [unique], `audit_logs(user_id, created_at)`, toutes les FK de `sessions_caisse`, `transferts_stock`, `paiements`, `dettes*`, `rh_presences(employe_id, date)`.
- **Action** : migration Drizzle dédiée + mesure EXPLAIN avant/après. ☐

---

## 5. 🟠 Constats ÉLEVÉS

### E1. Tenant middleware *fail-open* (fuite inter-agences potentielle)
- **Fichier** : `apps/nextjs/src/server/api/trpc.ts:65-75`.
- **Constat** : si `SELECT set_current_agence_id(...)` échoue → `logger.warn` puis `next()`. La requête continue **sans contexte d'isolation**.
- **Scénario** : incident DB transitoire sur la variable de session ⇒ requêtes renvoyant potentiellement des données d'autres agences si les policies RLS s'appuient dessus.
- **Correctif** : throw `FORBIDDEN/INTERNAL_SERVER_ERROR` (fail-closed). Vérifier aussi que les policies RLS Postgres existent bien côté SQL (`schema-extras.sql`) et sont actives pour le rôle applicatif. ☐

### E2. Double couche d'accès DB + duplication clients/customers
- **Preuves** :
  - `apps/nextjs/src/server/db/index.ts` crée un **second pool postgres/drizzle** distinct de `packages/db/src/client.ts`.
  - `apps/nextjs/src/server/db/schema.ts` ré-exporte les tables sous alias anglais (`customers=clients`, `organizations=organisations`, `profiles=utilisateurs`…) + enums legacy.
  - Deux routers concurrents sur la MÊME table : `routers/customers.ts` (POS-oriented, `clients` table) vs `routers/clients-router.ts` (fiche 360°, contacts/adresses/interactions). Idem UI : `dashboard/clients/` vs `dashboard/customers/`.
  - Import hétérogène : `clients-router.ts:3` importe `db` depuis `~/server/db` alors que les autres importent `@atelierone/db`.
- **Impact** : deux conventions de nommage, deux pools de connexions, dette de confusion croissante.
- **Correctif** : supprimer `apps/nextjs/src/server/db`, faire migrer tous les imports vers `@atelierone/db`, fusionner customers→clients (garder le router 360°), rediriger/réécrire la route UI `customers`. ☐

### E3. Module Devis embryonnaire (cœur commercial garage manquant)
- **Preuves** : le cycle annoncé `or-router.ts:24` cite le devis, mais seule une colonne booléenne existe (`ordresReparation.devisAccepte`, cf. `or-router.ts:175` et input L297). Aucun router/table/UI/PDF devis. *(NB : les occurrences « devise » de settings.ts sont la monnaie XAF, sans rapport.)*
- **Correctif** : table `devis` + `devis_lignes`, router (créer/modifier/valider/refuser/expirer), conversion devis→OR→facture, PDF. S'appuyer sur le pattern existant de `or-router`. ☐

### E4. Érosion typage : ~1 031 `any`
- **Comptage** (`apps/nextjs/src`, hors node_modules) : `as any` ×694, `: any` ×337.
- **Exemples dans des chemins financiers** : `pos.ts:688` (`sessionConditions: any[]`), `pos.ts:697` (`as any` sur résultat de requête caisse), `trpc.ts:108` (`as any` sur insert audit log), `config.ts:40`.
- **Impact** : neutralise la type-safety end-to-end de tRPC précisément là où les erreurs coûtent cher.
- **Correctif** : campagne progressive, en commençant par pos/cash/finance/or-router. ☐

---

## 6. 🟡 Constats MOYENS

### M1. Error boundaries / états globaux absents
- Un seul `loading.tsx` (governance) sur tout l'arbre `(dashboard)` ; **aucun** `error.tsx`, `global-error.tsx`, `not-found.tsx`.
- Impact : toute erreur runtime non interceptée = écran d'erreur Next brut.
- Correctif : ajouter `app/error.tsx` + `app/global-error.tsx` + `not-found.tsx`, et des `loading.tsx` par module. ☐

### M2. Violations résiduelles de la règle UX n°3 (9 occurrences)
| Fichier:Ligne | Occurrence |
|---|---|
| `dashboard/alerts/page.tsx:16` | `onError: (e) => alert(e.message)` |
| `dashboard/marge/page.tsx:83` | `alert("Échec de l'export…")` |
| `dashboard/rapports/page.tsx:385` | `alert("Échec de l'export…")` |
| `dashboard/settings/page.tsx:485` | `onError: (e) => alert(e.message)` |
| `dashboard/rh/_components/ParametrageRH.tsx:308` | `window.confirm(suppression cycle)` |
| `ParametrageRH.tsx:106, 640, 743, 842` | boutons destructifs sans état de confirmation React visible |

- Correctif : remplacer par `toast.error()` + dialogue de confirmation React (pattern déjà utilisé ailleurs). ☐

### M3. Fichiers monolithes
| Fichier | Lignes |
|---|---:|
| `server/api/routers/procurement.ts` | 2 072 |
| `dashboard/procurement/page.tsx` | 1 646 |
| `dashboard/cash/page.tsx` | 1 586 |
| `server/api/routers/stock.ts` | 1 582 |
| `dashboard/pos/page.tsx` | 1 391 |
| `server/api/routers/catalog.ts` | 1 318 |

- Correctif progressif : extraire sous-routers (`procurement.receptions`, `procurement.factures`…) et composants. ☐

### M4. Débris de dev versionnés dans `packages/db/`
`probe-act.mjs`, `probe-ap.mjs`, `probe-co.mjs`, `probe-drop.mjs`, `probe-local.mjs`, `probe-schema.mjs`, `probe-state.mjs`, `tmp-schema.ts`, `drizzle.mini.ts`, `drizzle.test.ts`, `check-rh.ts`, `schema-export.cjs`, `data/old-*.json`. → Supprimer ou déplacer hors repo. ☐

### M5. README mensonger
`README.md` est le boilerplate T3 resté en l'état (« LibraCore Platform », mentionne **Prisma** alors que le projet utilise Drizzle). La vraie documentation vit dans `DOC/` et `docs/`. → Réécrire (présentation, stack réelle, scripts db:*, guide DOC/). ☐

### M6. Divers
- **TOCTOU POS** : la vérification de stock (`pos.ts:663-685`) a lieu AVANT la transaction d'insertion (L687) → course possible sous forte concurrence. Déplacer la vérification + décrément dans la transaction (ou verrou `FOR UPDATE`). ☐
- **Pas de CSP** ; headers limités à nosniff/X-Frame/Referrer (`middleware.ts`). Ajouter CSP + HSTS selon déploiement. ☐
- **Audit log uniquement sur succès** (`trpc.ts:94` : `if (result.ok)`) et inséré hors transaction de la mutation. Journaliser aussi les échecs sensibles (login, annulation vente, remboursement). ☐
- **Doublon copy-paste** : `enforceRole(["secretaire", "secretaire", ...])` (`trpc.ts:119-120`). ☐

---

## 7. Grille de conformité UX (règle obligatoire AGENTS.md)

| # | Règle | Conformité | Preuve |
|---|---|---|---|
| 1 | Recherche/filtrage sur listes >10 éléments | 🟢 ~90 % | search ILIKE dans customers, pos.searchPreInvoices, etc. Vérifier les modules secondaires |
| 2 | Bouton Enregistrer + `invalidate()` backend | 🟢 majoritaire | mutations tRPC + invalidations observées ; audit exhaustif restant |
| 3 | toast() jamais alert()/confirm() | 🟠 9 violations | cf. §M2 (401 toasts sinon) |
| 4 | Loading / empty / erreur affichés | 🟠 partiel | skeletons locaux présents mais 0 `error.tsx`, 1 seul `loading.tsx` global |
| 5 | Confirmation destructive + reflet liste | 🟢 majoritaire | pattern React OK ; exceptions ParametrageRH |
| 6 | Permissions sincères UI↔serveur | 🟢 bon | `usePermissions` + guards serveur (206 requirePermissionProcedure) |

---

## 8. Plan d'action priorisé (à suivre pour les corrections)

### P0 — Bloquant mise en production sérieuse
- [ ] **C1** Migration d'index Drizzle (FK + agence_id + dates + statuts) + EXPLAIN before/after. *(1-2 j)*
- [ ] **E1** `tenantMiddleware` fail-closed + vérification policies RLS actives. *(½ j)*

### P1 — Forte valeur
- [ ] **E2** Supprimer `apps/nextjs/src/server/db` (double pool + alias anglais), fusionner customers→clients, homogénéiser les imports vers `@atelierone/db`. *(2-3 j)*
- [ ] **M1** `error.tsx` / `global-error.tsx` / `not-found.tsx` / `loading.tsx` globaux. *(½ j)*
- [ ] **M2** Remplacer les 9 alert/confirm restants par toast + confirmation React. *(½ j)*
- [ ] **M6-TOCTOU** Déplacer la vérification/décrément de stock dans la transaction POS. *(½ j)*

### P2 — Structurels (planifier)
- [ ] **E3** Module Devis complet (tables, router, UI, PDF, conversion OR). *(~1 sem)*
- [ ] **E4** Campagne `any` sur routers financiers (pos, cash, finance, or-router, trpc.ts). *(progressif)*
- [ ] **M3** Découpage procurement.ts / stock.ts / pages géantes. *(progressif)*
- [ ] **M4/M5/M6** Nettoyage débris, réécriture README, CSP, audit log des échecs, fix doublon secretaire. *(1 j cumulé)*

---

## 9. Annexes

### A. Commandes utiles pour re-vérifier après corrections
```powershell
# Index manquants (doit rester > 0 après correction C1)
Select-String -Path packages\db\src\schema\*.ts -Pattern 'index\(|uniqueIndex\(' | Measure-Object

# Violations UX règle 3 (cible : 0)
Get-ChildItem apps\nextjs\src -Recurse -Include *.tsx,*.ts | Select-String -Pattern '\balert\(|window\.confirm\(|window\.prompt\('

# Dette `any` (tendance à la baisse attendue)
Get-ChildItem apps\nextjs\src -Recurse -Include *.ts,*.tsx | Select-String -Pattern 'as any' | Measure-Object

# Transactions préservées (ne doit pas baisser)
Get-ChildItem apps\nextjs\src\server\api\routers\*.ts | Select-String -Pattern 'db\.transaction'
```

### B. Périmètre réellement inspecté (extraits)
`tRPC : trpc.ts (137 lignes), root.ts (40 routers) · Auth : config.ts, auth.config.ts, rate-limiter (référencé), middleware.ts · Routers : organization.ts, pos.ts (checkout L660-779), customers.ts, clients-router.ts, or-router.ts (procédures complètes) · Schéma : ventes.ts, security-socle.ts, entrepot.ts, index des 77 fichiers · Qualité : comptages any/toast/alert/use client/tests/CI/git log/.gitignore/.env.example/README`.

### C. Points vérifiés et infirmés (fausses alertes évitées)
- Les pages `vehicules/[id]`, `customers/[id]` etc. **ne sont pas vides** : ce sont des wrappers server components vers des composants `_components/*Detail` légitimes.
- Les mentions « devise » de `settings.ts` concernent la **monnaie** (XAF), pas le module devis.
- `.env` racine et `packages/db/.env` sont ignorés par `.gitignore` (motif `.env` sans slash matche tous niveaux).

---
*Rapport généré le 2026-08-24 · Base : commit 0294c6e · À mettre à jour après chaque chantier P0/P1.*
