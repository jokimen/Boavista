// Mini-servidor WhatsApp baseado em Baileys, compativel com a API do WAHA que o
// dashboard ja usa (POST /api/sendText, GET /api/sessions). Sem Docker, sem Chromium.
//
// Arrancar:  npm start   (dentro da pasta waha/)
// Autenticar: abrir http://localhost:3001 e ler o QR code com o telemovel
//             (WhatsApp -> Aparelhos ligados -> Ligar um aparelho).
//
// O app/.env.local ja aponta WAHA_URL=http://localhost:3001, por isso nada muda na app.

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rm, readFile } from "node:fs/promises";
import cron from "node-cron";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, "auth");
const PORT = Number(process.env.PORT || 3001);
// Interface de escuta: 127.0.0.1 local (seguro); na VPS pôr BIND_HOST=0.0.0.0.
const BIND_HOST = process.env.BIND_HOST || "127.0.0.1";
// Se definido, exige header x-api-key (page: ?key=) em todos os pedidos. OBRIGATÓRIO
// quando o servidor está exposto (VPS), pois o dashboard chama-o pela internet.
const API_KEY = process.env.WAHA_API_KEY || "";

const logger = pino({ level: "silent" });

let sock = null;
let qrDataUrl = null; // QR atual (data URL) enquanto nao estiver ligado
let connState = "connecting"; // connecting | qr | open | close
let meId = null;
let cronCfg = null;       // config de cron.json (carregada no arranque)
let startupFired = false; // garante 1 disparo de alertas por arranque

function jidFromChatId(chatId) {
  if (!chatId) return null;
  const s = String(chatId);
  // Grupo: manter tal e qual (ex.: 1203...@g.us)
  if (s.endsWith("@g.us")) return s;
  // Individual ja em formato Baileys
  if (s.endsWith("@s.whatsapp.net")) return s;
  // WAHA usa @c.us; ou numero cru -> normalizar para @s.whatsapp.net
  const digits = s.replace(/@.*/, "").replace(/\D/g, "");
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function isGroupJid(jid) {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ["Opticalia Dashboard", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      qrDataUrl = await QRCode.toDataURL(qr);
      connState = "qr";
      console.log("[waha] QR pronto -> abre http://localhost:" + PORT + " para ler.");
    }

    if (connection === "open") {
      connState = "open";
      qrDataUrl = null;
      meId = sock.user?.id ?? null;
      console.log("[waha] LIGADO como", meId);
      // No ARRANQUE (quando o PC liga): atualiza os agregados diários e envia alertas.
      if (cronCfg?.onStartup && !startupFired) {
        startupFired = true;
        if (cronCfg.dailyUrl) fireUrl(cronCfg.dailyUrl, "arranque-daily");
        if (cronCfg.heavyUrl) fireUrl(cronCfg.heavyUrl, "arranque-heavy");
        if (cronCfg.brandHistoryUrl) fireUrl(cronCfg.brandHistoryUrl, "arranque-brand-history");
        if (cronCfg.alertsUrl) fireUrl(cronCfg.alertsUrl, "arranque-alertas");
      }
    }

    if (connection === "close") {
      connState = "close";
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[waha] ligacao fechada (code=${code}, loggedOut=${loggedOut}).`);
      if (loggedOut) {
        // Sessao invalida -> limpar credenciais e recomecar para gerar novo QR.
        await rm(AUTH_DIR, { recursive: true, force: true });
        console.log("[waha] credenciais apagadas; a gerar novo QR...");
      }
      setTimeout(start, 2000); // reconectar
    }
  });
}

// ---- HTTP (compativel com WAHA) -------------------------------------------

function sessionStatus() {
  // Mapeia para os estados do WAHA que a app/diagnostico esperam.
  if (connState === "open") return "WORKING";
  if (connState === "qr") return "SCAN_QR_CODE";
  return "STARTING";
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

function statusPage() {
  const refresh = connState === "open" ? "" : '<meta http-equiv="refresh" content="3">';
  let inner;
  if (connState === "open") {
    inner = `<h1 style="color:#22c55e">✓ WhatsApp ligado</h1>
      <p>Sessao <b>default</b> ativa como <code>${meId ?? "?"}</code>.</p>
      <p>O dashboard ja pode enviar alertas. Podes fechar esta pagina (deixa o servidor a correr).</p>`;
  } else if (connState === "qr" && qrDataUrl) {
    inner = `<h1>Liga o WhatsApp</h1>
      <p>No telemovel: <b>WhatsApp -> Aparelhos ligados -> Ligar um aparelho</b> e le o codigo.</p>
      <img src="${qrDataUrl}" alt="QR" style="width:320px;height:320px;image-rendering:pixelated"/>
      <p style="color:#888">A pagina atualiza sozinha.</p>`;
  } else {
    inner = `<h1>A iniciar...</h1><p>Estado: <code>${connState}</code>. Aguarda o QR.</p>`;
  }
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8">${refresh}
    <title>Opticalia WAHA (Baileys)</title>
    <style>body{font-family:system-ui,sans-serif;background:#0b0b0f;color:#eee;
      display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
      div{max-width:420px;padding:24px} code{background:#1c1c25;padding:2px 6px;border-radius:4px}
      img{border:8px solid #fff;border-radius:8px;margin:16px 0}</style></head>
    <body><div>${inner}</div></body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Autenticacao por API key (se configurada): header x-api-key ou ?key= na pagina.
  // Sem API_KEY definida (uso local em 127.0.0.1) tudo fica aberto como antes.
  if (API_KEY) {
    const provided = req.headers["x-api-key"] || url.searchParams.get("key");
    if (provided !== API_KEY) {
      sendJson(res, 401, { error: "API key invalida ou em falta" });
      return;
    }
  }

  // Pagina de estado / QR
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(statusPage());
    return;
  }

  // Health-check estilo WAHA
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, 200, [{ name: "default", status: sessionStatus() }]);
    return;
  }

  // Diagnostico: confirma se um numero existe no WhatsApp e devolve o jid canonico
  if (req.method === "GET" && url.pathname === "/api/check") {
    if (connState !== "open" || !sock) {
      sendJson(res, 503, { error: "WhatsApp nao ligado", state: connState });
      return;
    }
    const digits = String(url.searchParams.get("number") || "").replace(/\D/g, "");
    try {
      const r = await sock.onWhatsApp(`${digits}@s.whatsapp.net`);
      sendJson(res, 200, { number: digits, me: meId, result: r });
    } catch (e) {
      sendJson(res, 500, { error: String(e?.message ?? e) });
    }
    return;
  }

  // Diagnostico: lista os grupos onde a conta participa (para obter o jid do grupo)
  if (req.method === "GET" && url.pathname === "/api/groups") {
    if (connState !== "open" || !sock) {
      sendJson(res, 503, { error: "WhatsApp nao ligado", state: connState });
      return;
    }
    try {
      const all = await sock.groupFetchAllParticipating();
      const groups = Object.values(all).map((g) => ({
        jid: g.id,
        subject: g.subject,
        participants: g.participants?.length ?? null,
      }));
      sendJson(res, 200, groups);
    } catch (e) {
      sendJson(res, 500, { error: String(e?.message ?? e) });
    }
    return;
  }

  // Envio de texto (o que o waha.ts do dashboard chama)
  if (req.method === "POST" && url.pathname === "/api/sendText") {
    if (connState !== "open" || !sock) {
      sendJson(res, 503, { error: "WhatsApp nao ligado", state: connState });
      return;
    }
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      let jid = jidFromChatId(body.chatId);
      if (!jid || !body.text) {
        sendJson(res, 400, { error: "chatId e text sao obrigatorios" });
        return;
      }
      // Para individuais, resolver o jid canonico via onWhatsApp. Grupos vao diretos.
      if (!isGroupJid(jid)) {
        const digits = jid.replace(/@.*/, "");
        const check = await sock.onWhatsApp(`${digits}@s.whatsapp.net`);
        const hit = Array.isArray(check) ? check.find((c) => c?.exists) : null;
        if (!hit) {
          sendJson(res, 422, { error: "numero nao existe no WhatsApp", number: digits });
          return;
        }
        jid = hit.jid;
      }
      const sent = await sock.sendMessage(jid, { text: String(body.text) });
      console.log(`[waha] enviado para ${jid} id=${sent?.key?.id}`);
      sendJson(res, 200, { sent: true, id: sent?.key?.id ?? null, jid });
    } catch (e) {
      console.log("[waha] erro no envio:", e?.message ?? e);
      sendJson(res, 500, { error: String(e?.message ?? e) });
    }
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

// ---- Agendador de alertas automaticos -------------------------------------
// Le waha/cron.json e, na hora marcada, dispara o endpoint /api/cron/alerts do
// dashboard (autenticado por segredo). Assim os alertas saem sozinhos, sem
// ninguem ter de carregar em botoes nem reiniciar servidores.
// Dispara um endpoint do dashboard (precompute/alertas). Com retentativas, porque
// no arranque do PC o app local (porta 3000) pode ainda não estar pronto.
async function fireUrl(url, motivo, tries = 8) {
  if (!cronCfg || !url) return;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-cron-key": cronCfg.secret, "Content-Type": "application/json" },
      });
      const txt = await res.text();
      console.log(`[cron] (${motivo}) ${new Date().toISOString()} -> HTTP ${res.status} ${txt.slice(0, 200)}`);
      if (res.status >= 200 && res.status < 500) return; // 2xx/4xx = app respondeu; não repetir
    } catch (e) {
      console.log(`[cron] (${motivo}) tentativa ${i}/${tries} falhou: ${e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, 15000)); // espera o app local arrancar
  }
  console.log(`[cron] (${motivo}) desisti após ${tries} tentativas.`);
}

async function setupCron() {
  try {
    cronCfg = JSON.parse(await readFile(join(__dirname, "cron.json"), "utf8"));
  } catch {
    console.log("[cron] sem cron.json -> automações desligadas.");
    return;
  }
  // Agendamento periódico: AGREGADOS DIÁRIOS (dias recentes frescos) + leituras
  // PESADAS (stock/clientes/LC) — mantém os snapshots do Supabase atualizados.
  const tz = cronCfg.timezone || "Europe/Lisbon";
  // Agregados DIÁRIOS (leves: dias recentes) — schedule principal, frequente (ex.: */30).
  if (cronCfg.enabled && cronCfg.dailyUrl && cron.validate(cronCfg.schedule)) {
    cron.schedule(cronCfg.schedule, () => fireUrl(cronCfg.dailyUrl, "agendado-daily"), { timezone: tz });
    console.log(`[cron] daily agendado "${cronCfg.schedule}" (${tz})`);
  }
  // Leituras PESADAS (stock/clientes/LC + histórico por marca de 4 anos) — schedule
  // PRÓPRIO e menos frequente (heavySchedule, ex.: 1×/dia); se ausente, cai no schedule
  // principal. Não convém correr de 30 em 30 min: cada uma varre muito da API Visual.
  const heavySchedule = cronCfg.heavySchedule || cronCfg.schedule;
  if (cronCfg.enabled && (cronCfg.heavyUrl || cronCfg.brandHistoryUrl) && cron.validate(heavySchedule)) {
    cron.schedule(heavySchedule, () => {
      if (cronCfg.heavyUrl) fireUrl(cronCfg.heavyUrl, "agendado-heavy");
      if (cronCfg.brandHistoryUrl) fireUrl(cronCfg.brandHistoryUrl, "agendado-brand-history");
    }, { timezone: tz });
    console.log(`[cron] heavy/brand-history agendados "${heavySchedule}" (${tz})`);
  }
  if (cronCfg.onStartup) {
    console.log("[cron] modo ARRANQUE ativo -> pré-cálculo + alertas ao ligar.");
  }
}

// Safe-by-default: se o servidor for ligado a uma interface NÃO-local (ex.: 0.0.0.0
// na VPS/Docker) SEM WAHA_API_KEY, recusa arrancar — senão qualquer máquina da rede
// poderia enviar WhatsApp / listar grupos. Em 127.0.0.1 (default) fica aberto como antes.
const LOCAL_BINDS = ["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"];
if (!LOCAL_BINDS.includes(BIND_HOST) && !API_KEY) {
  console.error(`[waha] RECUSADO: BIND_HOST=${BIND_HOST} expõe o servidor na rede sem WAHA_API_KEY.`);
  console.error("[waha] Define WAHA_API_KEY (e usa-a no dashboard) ou liga só a 127.0.0.1.");
  process.exit(1);
}

// Bind SÓ a localhost (127.0.0.1): o app e o cron chamam localmente. Evita expor
// o envio de WhatsApp / listagem de grupos a outras máquinas da rede.
server.listen(PORT, BIND_HOST, () => {
  console.log(`[waha] mini-servidor (Baileys) em http://${BIND_HOST}:${PORT}` + (API_KEY ? " [protegido por API key]" : " [sem API key — só local]"));
  console.log("[waha] abre essa pagina para ler o QR na 1a vez.");
  start().catch((e) => console.error("[waha] erro ao iniciar:", e));
  setupCron();
});
