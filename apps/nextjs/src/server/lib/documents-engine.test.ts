import { describe, it, expect } from "vitest";
import {
  daysUntilExpiry,
  expiryStatus,
  expiryAlerts,
  latestValid,
} from "./documents-engine";

const doc = (over: Partial<{ id: number; dateExpiration: string | null; hasExpiration: boolean; titre: string | null; statut: string }> = {}) => ({
  id: 1,
  documentTypeId: 1,
  titre: "Contrat CDI",
  dateExpiration: "2026-12-31",
  hasExpiration: true,
  statut: "actif",
  ...over,
});

const today = new Date("2026-08-15");

describe("daysUntilExpiry", () => {
  it("jours restants positifs, négatifs si expiré", () => {
    expect(daysUntilExpiry("2026-08-20", today)).toBe(5);
    expect(daysUntilExpiry("2026-08-10", today)).toBe(-5);
    expect(daysUntilExpiry("2026-08-15", today)).toBe(0);
  });
});

describe("expiryStatus", () => {
  it("expiré / expirant / valide / sans expiration", () => {
    expect(expiryStatus("2026-08-01", true, today, 30)).toBe("expire");
    expect(expiryStatus("2026-08-20", true, today, 30)).toBe("expire_bientot");
    expect(expiryStatus("2026-12-31", true, today, 30)).toBe("valide");
    expect(expiryStatus(null, true, today, 30)).toBe("sans_expiration");
    expect(expiryStatus("2026-12-31", false, today, 30)).toBe("sans_expiration");
  });
});

describe("expiryAlerts", () => {
  it("ne signale que les expirés + expirants, triés par urgence", () => {
    const docs = [
      doc({ id: 1, dateExpiration: "2026-09-01", titre: "CIN" }), // 17 j → expire_bientot
      doc({ id: 2, dateExpiration: "2026-07-01", titre: "Contrat CDD" }), // expiré
      doc({ id: 3, dateExpiration: "2026-12-31", titre: "Passeport" }), // valide
      doc({ id: 4, dateExpiration: null, titre: "Attestation" }), // sans expiration
      doc({ id: 5, dateExpiration: "2026-08-20", titre: "Archivé", statut: "archive" }), // archivé ignoré
    ];
    const alerts = expiryAlerts(docs, today, 30);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].documentId).toBe(2); // expiré en premier
    expect(alerts[0].status).toBe("expire");
    expect(alerts[1].documentId).toBe(1);
    expect(alerts[1].status).toBe("expire_bientot");
    expect(alerts[1].daysLeft).toBe(17);
  });

  it("aucune alerte si tout est valide", () => {
    expect(expiryAlerts([doc({ dateExpiration: "2026-12-31" })], today, 30)).toHaveLength(0);
  });
});

describe("latestValid", () => {
  it("retourne le dernier document valide (non expiré)", () => {
    const docs = [
      doc({ id: 1, dateExpiration: "2026-06-01", titre: "Ancien contrat" }), // expiré
      doc({ id: 2, dateExpiration: "2027-01-01", titre: "Nouveau contrat" }),
    ];
    expect(latestValid(docs, today)?.id).toBe(2);
  });

  it("null si aucun document valide", () => {
    expect(latestValid([doc({ dateExpiration: "2026-01-01" })], today)).toBeNull();
  });
});
