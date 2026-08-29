import { describe, it, expect } from "vitest";
import { genererSecretTOTP, verifierCodeTOTP, uriTOTP } from "./totp-service";
import { createHmac } from "node:crypto";

// Vecteur RFC 6238 Appendix B : secret "12345678901234567890"
const SECRET_RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32 du secret ASCII

function totpAtRFC(secretBase32: string, counter: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secretBase32.replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const secret = Buffer.from(bytes);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1000000).padStart(6, "0");
}

describe("totp-service", () => {
  it("génère un secret base32 de 32 caractères", () => {
    const s = genererSecretTOTP();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(genererSecretTOTP()).not.toBe(s);
  });

  it("conformité RFC 6238 : rejette un code faux", () => {
    // À counter=1 (T=59s), le code RFC est 287082 (6 digits) — un code différent doit être rejeté
    const maintenant = new Date(59 * 1000);
    expect(verifierCodeTOTP(SECRET_RFC, "123456", maintenant)).toBe(false);
  });

  it("rejette un code malformé", () => {
    const s = genererSecretTOTP();
    expect(verifierCodeTOTP(s, "12345")).toBe(false);
    expect(verifierCodeTOTP(s, "abcdef")).toBe(false);
    expect(verifierCodeTOTP(s, "")).toBe(false);
  });

  it("accepte le code correct dans la fenêtre (même implémentation)", () => {
    const maintenant = new Date(59 * 1000 + 5 * 1000); // quelques secondes après T=59
    const codeAttendu = totpAtRFC(SECRET_RFC, 1);
    // à 64s, counter = 2 ; la fenêtre ±1 couvre counter 1 → doit passer
    expect(verifierCodeTOTP(SECRET_RFC, codeAttendu, maintenant)).toBe(true);
  });

  it("produit une URI otpauth valide", () => {
    const s = genererSecretTOTP();
    const uri = uriTOTP(s, "admin@gpj.cm");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=" + s);
    expect(uri).toContain("issuer=AtelierOne");
  });
});