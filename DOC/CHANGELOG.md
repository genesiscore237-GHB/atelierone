# CHANGELOG — AtelierOne

## SaaS — Mise en conformité (P1→P8)

### P8 — Business & ops (en cours de livraison)
- Mailer transactionnel en file `boite_envoi` : bienvenue essai, relance licence J-7, quittance de paiement, suspension — `mailer-saas.ts`
- Endpoint de supervision `/api/health` (uptime, état DB, rôle, version)
- CI GitHub Actions (`.github/workflows/ci.yml`) : lint, typecheck, unitaires, build
- Documentation de déploiement dans `deploy/` (Ubuntu, Nginx, PM2, réplication, pgBackRest)

### P6+P7 — Responsive & PWA + UX/UI
- Test responsive Playwright : 11 pages × 3 viewports (375/768/1440) = 33/33 sans débordement ni erreur
- Manifest PWA corrigé (AtelierOne garage) — installable
- Pages d'erreur globales : `global-error.tsx`, `error.tsx`, `not-found.tsx`
- Guide d'onboarding 5 étapes au premier login
- Quittance d'abonnement PDF (jsPDF) dans Mon abonnement

### P5 — Sécurité durcie
- CSP, COOP/COEP/CORP ; rate limiting global par IP (auth 10/min, uploads 15/min, tRPC 300/min → 429)
- Session JWT 7 jours ; **2FA TOTP complet** (RFC 6238, Google Authenticator, activation/confirmation/désactivation, champ code au login)
- Rotation des clés API des sites avec fenêtre de bascule 24 h (le garage récupère automatiquement la nouvelle clé)

### P4 — Analytique d'usage
- Adoption des modules par garage (tenant_usage) → base de l'upsell

### P3 — Rôles éditeur & audit
- `central.consulter` / `central.gerer` ; journal des actions éditeur (tenant_audit) ; anti-brute-force vérifié

### P2 — Dashboard éditeur complet
- MRR, ARPU, churn, graphique 12 mois ; santé VERT/ORANGE/ROUGE ; fiche tenant (drill-down) ; relances persistées ; exports CSV ; journal

### P1 — Espace client « Mon abonnement »
- Licence (décompte), paiements, timeline des périodes, sync par table, version pack, 2FA, quittance PDF

## Modules métier livrés (précédemment)
- Fiche véhicule 360° · Fiche client 360° avec période · Dashboard Performance & Qualité · Fournisseurs & Factures (archive + scans) · Simulation SaaS locale (licence + sync + central) · Landing page
- Cycle complet : Clients → Véhicules → OR (diagnostic/devis/pièces/fournisseur) → Facturation → Parc V2 → RH → Stock V2 → KPI