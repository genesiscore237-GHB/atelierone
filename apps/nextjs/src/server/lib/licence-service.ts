/**
 * MODULE SAAS — LICENCE À DÉCOMPTE (lib pure, sans DB).
 * Le central émet un jeton signé (HMAC-SHA256) contenant la période payée.
 * Le garage vérifie localement : OK → AVERTISSEMENT (J-7) → LECTURE_SEULE (échéance)
 * → BLOQUE (échéance + grâce dépassée). Jeton infalsifiable : la signature
 * dépend d'un secret partagé (en prod : clé publique RSA embarquée dans le pack).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type LicenceStatut = "OK" | "AVERTISSEMENT" | "LECTURE_SEULE" | "BLOQUE";

export interface LicencePayload {
  siteId: string;
  nomGarage: string;
  dateDebut: string; // ISO date
  dateFin: string; // ISO date (fin de période payée)
  graceJours: number;
  mode: "ESSAI" | "ABONNEMENT";
  emitLe: string; // ISO
}

export interface LicenceVerification {
  valide: boolean;
  statut: LicenceStatut;
  payload: LicencePayload | null;
  joursRestants: number; // négatif si dépassée
  joursGrace: number; // jours restants de grâce (négatif si bloqué)
  erreur?: string;
}

export function signerLicence(payload: LicencePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifierLicence(jeton: string, secret: string, maintenant: Date = new Date()): LicenceVerification {
  try {
    const [body, sig] = jeton.split(".");
    if (!body || !sig) return { valide: false, statut: "BLOQUE", payload: null, joursRestants: 0, joursGrace: 0, erreur: "Jeton malformé" };

    const attendu = createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(attendu);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valide: false, statut: "BLOQUE", payload: null, joursRestants: 0, joursGrace: 0, erreur: "Signature invalide" };
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LicencePayload;
    const dateFin = new Date(payload.dateFin);
    const grace = payload.graceJours ?? 7;

    const joursRestants = Math.ceil((dateFin.getTime() - maintenant.getTime()) / 86400000);
    const joursGrace = Math.ceil((dateFin.getTime() + grace * 86400000 - maintenant.getTime()) / 86400000);

    let statut: LicenceStatut;
    if (joursRestants > 7) statut = "OK";
    else if (joursRestants >= 0) statut = "AVERTISSEMENT";
    else if (joursGrace >= 0) statut = "LECTURE_SEULE";
    else statut = "BLOQUE";

    return { valide: true, statut, payload, joursRestants, joursGrace };
  } catch (e: any) {
    return { valide: false, statut: "BLOQUE", payload: null, joursRestants: 0, joursGrace: 0, erreur: e.message };
  }
}

/** Jours restants d'usage complet (avant échéance). */
export function joursAvantEcheance(payload: LicencePayload, maintenant: Date = new Date()): number {
  return Math.ceil((new Date(payload.dateFin).getTime() - maintenant.getTime()) / 86400000);
}

/** Extension d'une période (renouvellement mensuel). */
export function etendrePeriode(payload: LicencePayload, mois: number): LicencePayload {
  const fin = new Date(payload.dateFin);
  const base = fin.getTime() > Date.now() ? fin : new Date();
  const nouvelleFin = new Date(base);
  nouvelleFin.setMonth(nouvelleFin.getMonth() + mois);
  return { ...payload, dateFin: nouvelleFin.toISOString().slice(0, 10) };
}