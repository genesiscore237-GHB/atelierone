/**
 * ÉTAPE 7 — UN ONGLET SANS BRANCHE EST UN ONGLET INVISIBLE.
 *
 *
 * LE FAIT
 *
 * Le 2026-10-15, la fiche 360 a affiché sept onglets. Cinq d'entre eux
 * n'affichaient RIEN quand on les cliquait — un écran vide, sans erreur, sans
 * warning, sans rien dans la console.
 *
 * La suite comptait 1042 tests : tous verts. Le build : vert. L'application
 * déployée : fonctionnelle. Et l'onglet « Pièces » ne rendait pas.
 *
 * Aucun test ne rendait un composant. Pas un seul. La suite vérifiait des
 * calculs, des gardes, des requêtes — tout ce qui est au-dessus de l'écran,
 * rien de ce qui est l'écran.
 *
 *
 * CE QUE CE TEST FAIT, ET CE QU'IL NE FAIT PAS
 *
 * Il ne rend pas de React. Ajouter `jsdom` et `@testing-library/react`
 * serait la vraie réponse, mais cela modifie les dépendances pendant qu'un
 * autre chantier est en cours sur ce même dépôt : c'est le genre de geste qui
 * produit une-arbre de travail que plus personne ne sait expliquer.
 *
 * Alors ce test prend ce qu'il peut prendre : le TEXTE de la 360, et il vérifie
 * l'invariant que l'écran respecte.
 *
 *   tout onglet proposé  →  possède une branche de rendu
 *
 * C'est exactement l'invariant violé le 2026-10-15. Un onglet déclaré sans
 * branche affiche un cadre vide au clic : pas une erreur, pas un texte —
 * rien. Et rien ne se plaint.
 *
 * Un rendu complet(attraperait en plus les erreurs d'exécution. Celui-ci ne
 * prend que la moitié du problème. **La moitié restante exige `jsdom`, et elle
 * reste ouverte** — ce fichier n'est pas un remplacement, c'est ce qui pouvait
 * être pris aujourd'hui.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "src/components/vehicule/FicheVehicule360.tsx"),
  "utf8",
);

/** Les clés de `TAB_ICONS`, dans l'ordre du fichier. */
function ongletsDeclares(): string[] {
  const bloc = SRC.match(/const TAB_ICONS[^=]*=\s*\{([\s\S]*?)\n\};/);
  expect(bloc, "TAB_ICONS introuvable : la 360 a-t-elle été refaite ?").not.toBeNull();
  return [...(bloc![1] ?? "").matchAll(/"([^"]+)":/g)].map((m) => m[1]!);
}

/** Les onglets ajoutés côté garage, pris dans le `tabs` calculé. */
function ongletsGarage(): string[] {
  const bloc = SRC.match(/\[\.\.\.Object\.keys\(TAB_ICONS\),\s*([^\]]+)\]/);
  expect(bloc, "la liste des onglets garage est introuvable").not.toBeNull();
  return [...(bloc![1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/** Les branches `tab === "..."` réellement présentes dans le rendu. */
function branchesDeRendu(): string[] {
  return [...SRC.matchAll(/tab === "([^"]+)"/g)].map((m) => m[1]!);
}

describe("ÉTAPE 7 — la 360 n'affiche pas d'onglet vide", () => {
  it("1. tout onglet affiché a une branche de rendu", () => {
    const declares = ongletsDeclares();
    const garage = ongletsGarage();
    const branches = new Set(branchesDeRendu());

    expect(declares.length, "aucun onglet déclaré : la 360 a changé de forme").toBeGreaterThan(0);

    for (const t of [...declares, ...garage]) {
      // L'onglet existe dans la barre de titre ET quelqu'un a écrit le code
      // qui l'affiche. Sans ce second point, cliquer donne un écran vide —
      // silencieusement, comme le 2026-10-15.
      expect(
        branches.has(t),
        `l'onglet « ${t} » est proposé dans la barre mais n'a aucune branche de rendu : le clic affiche un écran vide`,
      ).toBe(true);
    }
  });

  it("2. aucune branche ne traîne sans onglet — du code mort se voit", () => {
    const proposes = new Set([...ongletsDeclares(), ...ongletsGarage()]);
    for (const b of branchesDeRendu()) {
      // L'inverse du premier test : une branche orpheline est du code mort.
      // Moins grave qu'un onglet vide, mais c'est la même famille — et ça
      // signale un onglet renommé sans qu'on suive le renommage.
      expect(proposes.has(b), `la branche « ${b} » rend un onglet qui n'est plus proposé`).toBe(true);
    }
  });

  it("3. les sept onglets partagés sont bien partagés", () => {
    // La 360 est un composant UNIQUE, accroché aussi bien par l'atelier que
    // par le garage. Si l'un des deux se met à afficher son propre jeu
    // d'onglets, les deux écrans divergent — ce que l'harmonisation a précisément
    // mis en place pour empêcher.
    const declares = ongletsDeclares();
    expect(declares.length, "le nombre d'onglets partagés a changé").toBe(7);
    expect(declares).toContain("Facture");
    expect(declares).toContain("Historique");
  });

  it("4. aucun nom d'onglet n'a d'espace en tête ou en queue", () => {
    // La cause la plus probable du 2026-10-15 : un `tabs.map` qui rendait
    // `{t}` et une branche `tab === " Diagnostic & devis"`. Deux chaînes
    // différentes qui se ressemblent — et un onglet qui ne rend rien.
    for (const t of [...ongletsDeclares(), ...ongletsGarage()]) {
      expect(t, `l'onglet « ${t} » a une espace parasite : il ne correspondra à aucune branche`).toBe(
        t.trim(),
      );
      expect(t.length, "nom d'onglet vide").toBeGreaterThan(0);
    }
  });

  it("5. le rendu de chaque onglet est bien conditionné par `tab ===`", () => {
    // Un onglet peut avoir sa branche ET être rendu inconditionnellement —
    // ou l'inverse, être rendu hors de toute condition. Ce test attrape le
    // cas où un `{tab === "X" && (` a perdu sa condition par accident.
    const cond = [...SRC.matchAll(/\{tab === "([^"]+)" && \(/g)].map((m) => m[1]!);
    expect(cond.length, "aucun onglet n'est rendu sous condition : la logique de rendu a été cassée").toBeGreaterThan(0);
    for (const t of ongletsDeclares()) {
      expect(cond, `« ${t} » a une branche mais pas sous la condition tab ===`).toContain(t);
    }
  });
});