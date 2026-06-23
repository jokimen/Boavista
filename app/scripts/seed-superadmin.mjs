/**
 * Cria (ou promove) o utilizador SUPERADMIN no Firebase.
 * Sem segredos no ficheiro — lê FIREBASE_* do .env.local.
 *
 * Cria o utilizador no Firebase Auth (se não existir) e escreve o documento
 * profiles/{uid} com role=superadmin, is_active=true. O 2FA é configurado no
 * 1º login (a app encaminha para /2fa/setup).
 *
 * Uso:
 *   node scripts/seed-superadmin.mjs <email> <password> ["Nome Completo"]
 */
import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const [email, password, name] = process.argv.slice(2);
if (!email || !password) {
  console.error("Uso: node scripts/seed-superadmin.mjs <email> <password> [\"Nome\"]");
  process.exit(1);
}

const env = loadEnv();
const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY em falta no .env.local");
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth();
const db = getFirestore();

try {
  // Cria o utilizador no Auth, ou reutiliza-o se já existir.
  let uid;
  try {
    const u = await auth.createUser({ email, password, displayName: name ?? "Superadmin", emailVerified: true });
    uid = u.uid;
    console.log(`Utilizador criado no Firebase Auth: ${uid}`);
  } catch (e) {
    if (e?.code === "auth/email-already-exists") {
      const u = await auth.getUserByEmail(email);
      uid = u.uid;
      await auth.updateUser(uid, { password });
      console.log(`Utilizador já existia (${uid}); password atualizada.`);
    } else {
      throw e;
    }
  }

  // Documento de perfil: superadmin ativo (permissões totais são derivadas do role).
  await db.collection("profiles").doc(uid).set({
    id: uid,
    email,
    name: name ?? "Superadmin",
    role: "superadmin",
    is_active: true,
    totp_enabled: false,
    totp_verified: false,
    permissions: [],
    created_at: new Date().toISOString(),
  }, { merge: true });

  console.log(`Perfil superadmin gravado (profiles/${uid}). Faz login e configura o 2FA.`);
} catch (e) {
  console.error("ERRO:", e?.message ?? e);
  process.exitCode = 1;
}
