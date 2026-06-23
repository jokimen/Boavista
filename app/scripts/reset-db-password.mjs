import { readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { Client } from "pg";

const envPath = new URL("../.env.local", import.meta.url);
let env = readFileSync(envPath, "utf8");
const cur = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!cur) { console.error("DATABASE_URL não encontrada"); process.exit(1); }

const newPass = randomBytes(18).toString("hex"); // só [0-9a-f] → seguro inline + URL-safe

try {
  const c1 = new Client({ connectionString: cur, ssl: { rejectUnauthorized: false } });
  await c1.connect();
  await c1.query(`ALTER ROLE postgres WITH PASSWORD '${newPass}'`);
  await c1.end();

  const newUrl = `postgresql://postgres.ocvbulzbhamewowqroge:${newPass}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
  env = env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${newUrl}`);
  writeFileSync(envPath, env);

  const c2 = new Client({ connectionString: newUrl, ssl: { rejectUnauthorized: false } });
  await c2.connect();
  const r = await c2.query("SELECT 1 AS ok");
  await c2.end();
  console.log("Password rodada + .env.local atualizado. Verificação:", r.rows[0].ok === 1 ? "OK" : "FALHOU");
} catch (e) {
  console.error("ERRO ao rodar password:", e.message);
  process.exitCode = 1;
}
