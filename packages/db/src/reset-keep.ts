/**
 * Tables que `db:reset` CONSERVE, et pourquoi.
 *
 * Décision D7 : ce script ne sert pas à purger des données de test — il vide la
 * base. Sa liste `KEEP` est donc le seul endroit qui décide ce qui survit à un
 * reset, et elle était fausse.
 *
 * Trois familles sont conservées :
 *
 *   1. **Socle de sécurité** — sans lui, plus personne ne peut se connecter.
 *   2. **Référentiel et configuration** — ce ne sont PAS des données métier.
 *      Les vider casse des choses qui ne reviennent pas d'elles-mêmes : sans
 *      `kpi_cibles`, les 12 cibles de pilotage disparaissent ; sans
 *      `parking_configs`, les 7 seuils d'alerte parking disparaissent (D6 dit
 *      qu'ils restent paramétrables) ; sans `atelier_parametres`, le catalogue
 *      d'outillage disparaît — c'est-à-dire l'erreur Vercel
 *      `atelier_parametres.outillage_catalogue` déjà levée une fois.
 *   3. **Catalogue produits** — référentiel commun à tous les ateliers.
 *
 * Ce qui est vidé, et c'est voulu : véhicules, dossiers, ventes, dossiers RH,
 * lignes de parking. Ce sont des données métier, réinsérables.
 *
 * Ce fichier est séparé de `reset-db.ts` pour une raison précise : `reset-db`
 * s'exécute à l'import, il ne peut donc pas être importé par un test. Une
 * liste de survie qu'on ne peut pas tester est une liste qui se dégradera.
 */
export const KEEP_SOCLE = [
  "agences",
  "organisations",
  "cles_api",
  "utilisateurs",
  "user_roles",
  "roles",
  "permissions",
  "role_permissions",
  "verification_tokens",
  "__drizzle_migrations",
] as const;

/** Référentiel et configuration : survit à un reset, se réinstalle par seed. */
export const KEEP_CONFIGURATION = [
  // Unités de mesure : 55 lignes, base de toute saisie dimensionnelle.
  "unites_mesure",
  // 12 cibles de pilotage. Les vider, c'est perdre le référentiel des KPI.
  "kpi_cibles",
  // 7 seuils d'alerte parking — décision D6 : ils restent configurables.
  "parking_configs",
  // Catalogue d'outillage et réglages atelier.
  "atelier_parametres",
  // Configuration de paie.
  "payroll_items_config",
  "payroll_item_config_history",
  // Catalogue produits commun (319 articles).
  "produits",
] as const;

export const KEEP: readonly string[] = [...KEEP_SOCLE, ...KEEP_CONFIGURATION];

/**
 * Tables de configuration à ne jamais perdre de vue lors d'une revue de
 * `KEEP`. Sert au test de cohérence : toute nouvelle table de configuration
 * ajoutée au modèle doit être consciously protectrice ou exclue à dessein.
 */
export const TABLES_CONFIGURATION_A_PROTEGER = [
  "kpi_cibles",
  "parking_configs",
  "atelier_parametres",
  "unites_mesure",
  "payroll_items_config",
  "produits",
] as const;