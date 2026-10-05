import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

let parsed;

/**
 * Validation paresseuse : ce module est importé par /api/trpc/[trpc], donc lu
 * pendant le build Next (`collecting page data`). Les variables ne sont
 * validées qu'au premier accès réel, côté requête — jamais au build, où
 * DATABASE_URL n'est pas présente.
 *
 * Seules les variables encore lues par le code sont déclarées. Les variables
 * Supabase héritées ont été retirées : aucun consommateur, mais t3-oss
 * validait quand même chacune d'elles à la première lecture et faisait échouer
 * /api/trpc sur Vercel.
 */
function getEnv() {
  if (!parsed) {
    parsed = createEnv({
      server: {
        NODE_ENV: z.enum(["development", "test", "production"]),
        DATABASE_URL: z.string().url(),
      },
      runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
      },
      skipValidation: !!process.env.SKIP_ENV_VALIDATION,
      emptyStringAsUndefined: true,
    });
  }
  return parsed;
}

export const env = new Proxy(
  {},
  {
    get: (_target, prop) => getEnv()[prop],
    has: (_target, prop) => Reflect.has(getEnv(), prop),
    ownKeys: () => Reflect.ownKeys(getEnv()),
    getOwnPropertyDescriptor: (_target, prop) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(getEnv(), prop);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  },
);
