/**
 * 2FA TOTP (RFC 6238, compatible Google Authenticator / Aegis).
 * Lib pure : génération de secret, URI otpauth, vérification de code.
 */

import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const WINDOW = 1; // ±1 période (tolérance horloge)

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

function totpAt(secret: Buffer, timestampMs: number, digits = 6): string {
  const counter = Math.floor(timestampMs / 1000 / STEP_SECONDS);
  return hotp(secret, counter, digits);
}

/** Génère un secret TOTP (20 octets → 32 caractères base32). */
export function genererSecretTOTP(): string {
  return base32Encode(randomBytes(20));
}

/** URI otpauth:// pour Google Authenticator. */
export function uriTOTP(secret: string, compte: string, emetteur = "AtelierOne"): string {
  return `otpauth://totp/${encodeURIComponent(emetteur)}:${encodeURIComponent(compte)}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** Vérifie un code TOTP (fenêtre ±WINDOW périodes). */
export function verifierCodeTOTP(secret: string, code: string, maintenant: Date = new Date(), digits = 6): boolean {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const secretBuf = base32Decode(secret);
  const expected = parseInt(clean, 10);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const t = maintenant.getTime() + i * STEP_SECONDS * 1000;
    if (parseInt(totpAt(secretBuf, t, digits), 10) === expected) return true;
  }
  return false;
}