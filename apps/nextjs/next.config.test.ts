import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * G — l'en-tête `Permissions-Policy` est la cause racine du blocage caméra.
 *
 * `camera=()` est un refus PAR DÉFAUT pour tout le site. L'agent autorise la
 * caméra dans son navigateur, et `getUserMedia` échoue quand même, sans lever
 * la moindre invite : l'en-tête a plus d'autorité que le choix de l'utilisateur.
 *
 * Symptôme décrit sur le terrain : « sur mobile le navigateur bloque l'accès à
 * l'appareil photo ». Ce n'était pas l'agent qui avait refusé. C'était
 * l'application qui s'était interdit la caméra à elle-même — et aucun message
 * côté navigateur ne l'explique, donc personne n'avait de piste.
 *
 * Ce test lit la configuration RÉELLE, pas une constante : un durcissement
 * écrit à la main peut revenir par un merge sans que rien ne le signale.
 */
describe("Permissions-Policy — caméra", () => {
  const config = readFileSync(resolve(process.cwd(), "next.config.js"), "utf8");

  function valeurPolitique(): string {
    const m = /key:\s*"Permissions-Policy",\s*value:\s*"([^"]+)"/.exec(config);
    expect(m, "Permissions-Policy doit être déclaré dans next.config.js").not.toBeNull();
    return m![1]!;
  }

  it("1. la caméra est autorisée pour la page elle-même", () => {
    const p = valeurPolitique();
    expect(p).toMatch(/camera=\(self\)/);
    // Le refus par défaut est exactement ce qui bloquait les agents.
    expect(p).not.toMatch(/camera=\(\s*\)/);
  });

  it("2. la caméra n'est jamais accordée à une origine tierce", () => {
    // `camera=*` laisserait n'importe quel tiers utiliser la caméra des
    // visiteurs. L'ouverture doit rester strictement locale au site — c'est la
    // différence entre « réparer le blocage » et « ouvrir les vannes ».
    const p = valeurPolitique();
    expect(p).not.toMatch(/camera=\*/);
    expect(p).not.toMatch(/camera=\(\*\)/);

    // La seule valeur acceptable est `(self)` : ni refus, ni tout le monde.
    const extrait = /camera=([^,]*)/.exec(p)?.[1]?.trim();
    expect(extrait).toBe("(self)");
  });

  it("3. microphone et géolocalisation restent refusés", () => {
    // Ouvrir la caméra n'a jamais valu ouvrir un micro : on garde le refus.
    const p = valeurPolitique();
    expect(p).toMatch(/microphone=\(\s*\)/);
    expect(p).toMatch(/geolocation=\(\s*\)/);
  });
});