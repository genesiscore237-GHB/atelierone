import { describe, it, expect } from "vitest";
import {
  respectPromesse,
  leadTimeMoyenJours,
  retardMoyenJours,
  delaiDiagnosticMoyenJours,
  precisionDiagnostic,
  tauxRetouche,
  analyseComebacks,
  firstTimeQuality,
  fiabiliteAppro,
  performanceVsStandard,
  statutKPI,
  scoreSante,
  scoreTechnicien,
  satisfactionMoyenne,
  type OrKpiRecord,
} from "./kpi-service";

const or = (over: Partial<OrKpiRecord>): OrKpiRecord => ({
  id: Math.random(),
  numero: "OR-T",
  statut: "LIVRE",
  dateOuverture: "2026-08-01",
  dateCloture: "2026-08-05",
  ...over,
});

describe("Performance - ponctualité et délais", () => {
  it("ponctualité : % de promesses tenues parmi les OR livrés avec promesse", () => {
    const r = respectPromesse([
      or({ id: 1, datePromesse: "2026-08-04", dateCloture: "2026-08-04" }),
      or({ id: 2, datePromesse: "2026-08-04", dateCloture: "2026-08-06" }),
      or({ id: 3, dateCloture: "2026-08-05" }),
      or({ id: 4, statut: "EN_COURS", datePromesse: "2026-08-01" }),
    ]);
    expect(r.livreCount).toBe(3);
    expect(r.avecPromesse).toBe(2);
    expect(r.pourcent).toBe(50);
  });

  it("lead time moyen = clôture − ouverture", () => {
    expect(leadTimeMoyenJours([
      or({ dateOuverture: "2026-08-01", dateCloture: "2026-08-05" }),
      or({ dateOuverture: "2026-08-01", dateCloture: "2026-08-03" }),
    ])).toBe(3);
    expect(leadTimeMoyenJours([or({ statut: "EN_COURS", dateCloture: null })])).toBeNull();
  });

  it("retard moyen sur les livrés en retard uniquement", () => {
    expect(retardMoyenJours([
      or({ datePromesse: "2026-08-01", dateCloture: "2026-08-04" }),
      or({ datePromesse: "2026-08-01", dateCloture: "2026-08-02" }),
      or({ datePromesse: "2026-08-10", dateCloture: "2026-08-02" }),
    ])).toBe(2);
  });

  it("rapidité diagnostic : délai moyen ouverture → soumission", () => {
    const r = delaiDiagnosticMoyenJours([
      { ...or({}), dateDiagSoumis: "2026-08-03T00:00:00" },
      { ...or({}), dateDiagSoumis: "2026-08-01T00:00:00" },
    ] as any);
    expect(r).toBe(1);
  });
});

describe("Performance - qualité diagnostic et retouche", () => {
  it("précision : % validés sans renvoi", () => {
    expect(precisionDiagnostic([{ statut: "VALIDE" }, { statut: "VALIDE" }, { statut: "VALIDE", renvoye: true }])).toBe(66.7);
    expect(precisionDiagnostic([])).toBeNull();
  });
  it("taux de retouche : % d'OR repassés de CQ vers EN_COURS", () => {
    expect(tauxRetouche([
      { ...or({}), retouche: false },
      { ...or({}), retouche: true },
      { ...or({ statut: "EN_COURS" }), retouche: false },
    ])).toBe(33.3);
    expect(tauxRetouche([or({ statut: "ANNULE" })])).toBeNull();
  });
});

describe("Performance - comebacks par cause", () => {
  it("imputation par motif + taux sur OR normaux livrés", () => {
    const savOrs = [
      or({ id: 10, savOrigineOrId: 1, motifRetourSAV: "MALFACON" }),
      or({ id: 11, savOrigineOrId: 2, motifRetourSAV: "DIAGNOSTIC_ERRONE" }),
      or({ id: 12, savOrigineOrId: 3, motifRetourSAV: "CONSIGNE_NON_RESPECTEE" }),
    ];
    const livres = [or({ id: 1, savOrigineOrId: null }), or({ id: 2, savOrigineOrId: null }), or({ id: 3 })];
    const r = analyseComebacks(savOrs, livres);
    expect(r.total).toBe(3);
    expect(r.malfaçonOuDiagnostic).toBe(2);
    expect(r.consigneNonRespectee).toBe(1);
    expect(r.tauxSurLivres).toBe(100);
  });
  it("FTQ : % livrés sans retouche ni SAV lié", () => {
    const livres = [
      or({ id: 1, retouche: false }),
      or({ id: 2, retouche: true }),
      or({ id: 3, savOrigineOrId: 99 }),
    ];
    expect(firstTimeQuality(livres)).toBe(33.3);
  });
});

describe("Performance - appro, satisfaction, standards", () => {
  it("fiabilité appro : % servies directement", () => {
    expect(fiabiliteAppro([{ statut: "SERVIE" }, { statut: "MANQUANTE" }, { statut: "SERVIE" }])).toBe(66.7);
    expect(fiabiliteAppro([])).toBeNull();
  });
  it("satisfaction moyenne /5", () => {
    const ors = [{ satisfactionNote: 5 }, { satisfactionNote: 4 }] as any;
    const r = satisfactionMoyenne(ors);
    expect(r.moyenne).toBe(4.5);
    expect(r.noteCount).toBe(2);
  });
  it("temps vs standard par famille : % dans le standard", () => {
    const std = { FREINAGE: { delaiCibleJours: 1 } };
    const r = performanceVsStandard(
      [
        { ...or({ dateOuverture: "2026-08-01", dateCloture: "2026-08-02", familleService: "FREINAGE" }), statut: "LIVRE" },
        { ...or({ dateOuverture: "2026-08-01", dateCloture: "2026-08-05", familleService: "FREINAGE" }), statut: "LIVRE" },
      ],
      std,
    );
    expect(r[0].dansStandard).toBe(50);
    expect(r[0].delaiMoyenJours).toBe(2.5);
  });
});

describe("Performance - feu tricolore et score santé", () => {
  it("statut KPI sens HAUT/BAS avec seuils orange/rouge", () => {
    expect(statutKPI(90, 85, 75, 65, "HAUT")).toBe("VERT");
    expect(statutKPI(80, 85, 75, 65, "HAUT")).toBe("ORANGE");
    expect(statutKPI(70, 85, 75, 65, "HAUT")).toBe("ORANGE");
    expect(statutKPI(60, 85, 75, 65, "HAUT")).toBe("ROUGE");
    expect(statutKPI(4, 5, 8, 12, "BAS")).toBe("VERT");
    expect(statutKPI(9, 5, 8, 12, "BAS")).toBe("ORANGE");
    expect(statutKPI(13, 5, 8, 12, "BAS")).toBe("ROUGE");
    expect(statutKPI(null, 5, 8, 12, "BAS")).toBe("SANS_DATA");
  });

  it("score santé pondéré : vert=plein, orange=moitié, rouge=zéro", () => {
    const r = scoreSante([
      { code: "PONCTUALITE", statut: "VERT" },
      { code: "FTQ", statut: "ORANGE" },
      { code: "TAUX_RETOUR_SAV", statut: "ROUGE" },
      { code: "RAPIDITE_DIAG_JOURS", statut: "VERT" },
    ]);
    expect(r.score).toBe(Math.round(((25 + 15 + 0 + 15) / 90) * 100));
    expect(r.verdict).toBe("MOYEN");
  });

  it("score 100 si tout vert ; verdict CRITIQUE si tout rouge", () => {
    const toutVert = scoreSante([{ code: "PONCTUALITE", statut: "VERT" }]);
    expect(toutVert.score).toBe(100);
    const toutRouge = scoreSante([
      { code: "PONCTUALITE", statut: "ROUGE" },
      { code: "FTQ", statut: "ROUGE" },
    ]);
    expect(toutRouge.verdict).toBe("CRITIQUE");
  });
});

describe("Performance - fiche technicien (imputation objective)", () => {
  const agence = [
    or({ id: 1, responsableTechnicienId: 7, statut: "LIVRE", retouche: false }),
    or({ id: 2, responsableTechnicienId: 7, statut: "LIVRE", retouche: true }),
    or({ id: 3, responsableTechnicienId: 7, statut: "LIVRE", retouche: true }),
    or({ id: 4, responsableTechnicienId: 7, statut: "EN_COURS", retouche: false }),
  ];
  it("comptage OR responsabilités + taux retouche personnel", () => {
    const s = scoreTechnicien(agence, 7, []);
    expect(s.orResponsabilises).toBe(4);
    expect(s.livres).toBe(3);
    expect(s.retoucheTaux).toBe(50);
  });
  it("comeback imputé au responsable de l'OR d'origine", () => {
    const sav = [or({ id: 99, savOrigineOrId: 2, motifRetourSAV: "MALFACON", responsableTechnicienId: null })];
    const s = scoreTechnicien(agence, 7, sav);
    expect(s.comebacksImputes).toBe(1);
    expect(s.premierPassageTaux).toBe(33.3);
  });
  it("recommandation graduée : former avant décider (≥3 comebacks imputés → FORMATION)", () => {
    const sav = [
      or({ id: 91, savOrigineOrId: 1 }),
      or({ id: 92, savOrigineOrId: 2 }),
      or({ id: 93, savOrigineOrId: 3 }),
    ];
    const s = scoreTechnicien(agence, 7, sav);
    expect(s.recommandation).toBe("FORMATION_REQUISE");
    expect(s.comebacksImputes).toBe(3);
  });
});