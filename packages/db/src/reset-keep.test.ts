import { describe, it, expect } from "vitest";
import {
  KEEP,
  KEEP_CONFIGURATION,
  KEEP_SOCLE,
  TABLES_CONFIGURATION_A_PROTEGER,
} from "./reset-keep";

/**
 * P5.3 — la liste `KEEP` de `db:reset` décide de ce qui survit à un reset.
 *
 * Elle était fausse, et silencieusement : le script vidait les 12 cibles KPI,
 * les 7 seuils d'alerte parking et le catalogue d'outillage. Rien ne protestait,
 * parce que rien ne demandait. Une liste de survie qu'on ne peut pas tester est
 * une liste qui se dégradera — c'est pourquoi elle vit dans son propre module,
 * importable, plutôt que dans un script qui s'exécute à l'import.
 */
describe("Liste de survie de db:reset", () => {
  it("protège les tables de configuration du modèle", () => {
    // Chaque table listée ici perdrait quelque chose de non réinsérable si elle
    // disparaissait : un seuil d'alerte, une cible de pilotage, un catalogue.
    const manquantes = TABLES_CONFIGURATION_A_PROTEGER.filter((t) => !KEEP.includes(t));
    expect(
      manquantes,
      `tables de configuration absentes de KEEP : [${manquantes}] — ` +
        `un reset effacerait des reglages qui ne reviennent pas tout seuls`,
    ).toEqual([]);
  });

  it("conserve le socle de securite complet", () => {
    // Sans roles/permissions/role_permissions, plus personne ne peut se
    // connecter après un reset.
    for (const t of ["roles", "permissions", "role_permissions", "utilisateurs", "agences"]) {
      expect(KEEP.includes(t), `${t} doit survivre au reset`).toBe(true);
    }
  });

  it("vide les donnees metier — c'est l'objet du script", () => {
    // Un reset qui garderait les dossiers ne serait pas un reset. Cette
    // assertion protège contre l'excès inverse : ajouter par prudence une table
    // métier à KEEP viderait le script de son sens.
    for (const t of ["vehicules", "ordres_reparation", "ventes", "parking_vehicles"]) {
      expect(KEEP.includes(t), `${t} est une donnée metier, elle doit etre purgee`).toBe(false);
    }
  });

  it("ne declare aucun doublon entre socle et configuration", () => {
    const doublons = KEEP_SOCLE.filter((t) => KEEP_CONFIGURATION.includes(t as never));
    expect(doublons).toEqual([]);
  });

  it("KEEP est un sous-ensemble sans doublon de la concaténation", () => {
    expect(new Set(KEEP).size).toBe(KEEP.length);
    expect([...KEEP_SOCLE, ...KEEP_CONFIGURATION]).toEqual([...KEEP]);
  });

  it("conserve explicitement les 12 cibles KPI et les seuils parking", () => {
    // Ces deux noms sont cités dans le plan (D6) et dans l'incident Vercel
    // `outillage_catalogue`. Les garder en toutes lettres empêche qu'un
    // refactor ultérieur les Orthograph differently.
    expect(KEEP).toContain("kpi_cibles");
    expect(KEEP).toContain("parking_configs");
    expect(KEEP).toContain("atelier_parametres");
    expect(KEEP).toContain("unites_mesure");
  });
});