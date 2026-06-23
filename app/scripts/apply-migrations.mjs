/**
 * Aplica migrações SQL ao Postgres do Supabase.
 * Sem segredos no ficheiro — lê DATABASE_URL do .env.local.
 *
 * Uso: node scripts/apply-migrations.mjs 002_security_hardening.sql [003_...sql ...]
 */
import { readFileSync } from "fs";
import { Client } from "pg";

function getDatabaseUrl() {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL não definida em .env.local");
  return m[1].trim();
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Indica os ficheiros de migração a aplicar.");
  process.exit(1);
}

const client = new Client({
  connectionString: getDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Ligado à base de dados.");
  for (const f of files) {
    const sql = readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8");
    process.stdout.write(`A aplicar ${f} ... `);
    await client.query(sql);
    console.log("OK");
  }
  console.log("Todas as migrações aplicadas com sucesso.");
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
