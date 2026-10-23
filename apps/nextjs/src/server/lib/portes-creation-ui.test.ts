import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A5 — trois endpoints créent un véhicule/client/OR :
 *
 *   - `vehicules.create`
 *   - `garage.create`
 *   - `or.createVehicule`
 *
 * Ils restent côté serveur pour les scripts d'import et les tests, mais aucun
 * écran ne doit les appeler : la réception atelier est l'unique porte de
 * création UI. Sans cette garde, un nouveau bouton « Créer » réintroduirait
 * silencieusement les doublons et les clients sans véhicule que la réception
 * corrige.
 *
 * Le test lit la source plutôt que le routeur : le risque est un APPEL dans un
 * composant, pas la présence de l'endpoint.
 */
function fichiersSource(dossier: string): string[] {
  const resultat: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) resultat.push(...fichiersSource(chemin));
    else if (/\.(ts|tsx)$/.test(entree.name)) resultat.push(chemin);
  }
  return resultat;
}

const INTERDITS: Array<{ motif: RegExp; endpoint: string }> = [
  { motif: /api\.vehicules\.create\b/, endpoint: "vehicules.create" },
  { motif: /api\.garage\.create\b/, endpoint: "garage.create" },
  { motif: /api\.or\.createVehicule\b/, endpoint: "or.createVehicule" },
];

describe("A5 — les écrans ne créent pas de dossier hors réception", () => {
  it("aucun composant de src/app n'appelle les endpoints de création directs", () => {
    const racine = join(process.cwd(), "src", "app");
    const fichiers = fichiersSource(racine);
    expect(fichiers.length).toBeGreaterThan(50);

    const offenses: string[] = [];
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, "utf8");
      for (const { motif, endpoint } of INTERDITS) {
        if (motif.test(source)) {
          offenses.push(`${endpoint} → ${fichier.slice(racine.length + 1)}`);
        }
      }
    }

    expect(offenses, `Création hors réception :\n${offenses.join("\n")}`).toEqual([]);
  });
});
