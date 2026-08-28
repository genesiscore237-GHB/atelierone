/**
 * AGENT SAAS AUTOMATIQUE — tourne uniquement sur les instances garages
 * configurées (LICENCE_MODE=on + CENTRAL_URL + SITE_CODE + SITE_CLE_API).
 * Toutes les 5 minutes : heartbeat (renouvellement licence) + push des deltas.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.CENTRAL_URL && process.env.SITE_CODE && process.env.SITE_CLE_API) {
    const { heartbeatCentral, pousserDelta } = await import("~/server/api/routers/sync-router");
    const { logger } = await import("~/server/lib/logger");
    logger.info({ siteCode: process.env.SITE_CODE, central: process.env.CENTRAL_URL }, "Agent SaaS démarré (heartbeat + sync)");

    const cycle = async () => {
      try {
        const hb = await heartbeatCentral();
        const push = await pousserDelta();
        logger.info({ hb, push }, "Cycle agent SaaS");
      } catch (e) {
        logger.warn({ e }, "Cycle agent SaaS en échec");
      }
    };

    // Premier cycle après 10 s, puis toutes les 5 minutes
    setTimeout(cycle, 10_000);
    setInterval(cycle, 5 * 60_000);
  }
}