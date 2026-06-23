/**
 * TOTP (Google Authenticator) — API funcional do otplib v13.
 * v13 deixou de expor `authenticator`; usam-se funções: generateSecret,
 * generateURI, verifySync.
 */
import { generateSecret, generateURI, verifySync } from "otplib";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    // epochTolerance em segundos: ±30s para desvio de relógio do telemóvel.
    return verifySync({ token, secret, epochTolerance: 30 }).valid === true;
  } catch {
    return false;
  }
}

export function getTotpUri(email: string, secret: string): string {
  return generateURI({ secret, label: email, issuer: "Opticalia Boavista" });
}
