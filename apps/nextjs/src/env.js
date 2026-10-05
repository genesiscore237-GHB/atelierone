import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

let parsed;

/**
 * Validation paresseuse : ce module est importé par /api/trpc/[trpc], donc lu
 * pendant le build Next (`collecting page data`). Les variables ne sont
 * validées qu'au premier accès réel, côté requête — jamais au build, où
 * DATABASE_URL et les variables Supabase ne sont pas présentes.
 */
function getEnv() {
  if (!parsed) {
    parsed = createEnv({
      server: {
        NODE_ENV: z.enum(["development", "test", "production"]),
        DATABASE_URL: z.string().url(),
        SUPABASE_SERVICE_ROLE_KEY: z.string(),
      },

      client: {
        NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
      },

      runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
