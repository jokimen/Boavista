# Deploy — Dashboard Opticalia Boavista

## Arquitetura

```
  Browser ──HTTPS──► Vercel (Next.js, no teu subdomínio)
                        │
                        ├── Supabase (auth/RLS/Postgres)         [cloud, já existe]
                        ├── API Visual REST + OData              [cloud da Temática]
                        └── WhatsApp: chama o servidor Baileys ──► VPS (porta 3001, com API key)
  Vercel Cron (09:30) ─► /api/cron/alerts ─► calcula alertas ─► envia via VPS
```

- **Dashboard** → Vercel (serverless).
- **WhatsApp (Baileys)** → a tua VPS (processo sempre-ligado; não pode ser na Vercel).
- **Agendamento dos alertas** → **Vercel Cron** (gerido). O `node-cron` interno do Baileys
  fica **desligado** na VPS (`cron.json` → `"enabled": false`) para não duplicar envios.

---

## Parte A — Dashboard na Vercel

1. **Push do repositório** (privado, já criado):
   ```bash
   git remote add origin <URL_DO_TEU_REPO>
   git push -u origin master
   ```
2. **Importar na Vercel** → New Project → escolher o repo. **Root Directory = `app`**
   (o Next.js vive em `app/`, não na raiz). Framework: Next.js (autodetetado).
3. **Domínio**: Project → Settings → Domains → adicionar o teu subdomínio
   (ex.: `dashboard.opticalia-boavista.pt`) e criar o registo DNS CNAME que a Vercel indicar.
4. **Variáveis de ambiente** (Project → Settings → Environment Variables) — copiar do
   `app/.env.local`, com estas DIFERENÇAS para produção:

   | Variável | Valor em produção |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://dashboard.opticalia-boavista.pt` (o teu subdomínio) |
   | `WAHA_URL` | URL público do Baileys na VPS (ex.: `https://wa.opticalia-boavista.pt`) |
   | `WAHA_API_KEY` | **segredo novo** (o MESMO na VPS) — protege o envio |
   | `CRON_SECRET` | manter (o Vercel Cron usa-o no `Authorization: Bearer`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | **colar** (Supabase → Settings → API) — registo + cron |
   | restantes (`SUPABASE_*`, `VISUAL_*`, `ODATA_*`, `RESEND_*`, `TWOFA_COOKIE_SECRET`, `ALERT_*`) | iguais ao `.env.local` |

   > `ALERT_WHATSAPP_NUMBER` = `120363411279696299@g.us` (grupo "Alertas Opticalia").

5. **Cron**: já vem configurado por `app/vercel.json` (`/api/cron/alerts` às 09:30). A Vercel
   envia `Authorization: Bearer ${CRON_SECRET}` automaticamente — por isso basta ter
   `CRON_SECRET` nas env vars.
6. **Deploy**. Validar `https://dashboard.opticalia-boavista.pt/login`.

---

## Parte B — WhatsApp (Baileys) na VPS

1. Copiar a pasta `waha/` para a VPS. **Levar a sessão já autenticada**: copiar também
   `waha/auth/` (do PC local) para não ter de reler o QR. (Alternativa: reler o QR via túnel
   SSH — ver ponto 4.)
2. `waha/cron.json` → pôr `"enabled": false` (o agendamento passa a ser o Vercel Cron).
3. **Correr** (Docker recomendado; há `waha/Dockerfile`):
   ```bash
   docker build -t opticalia-waha ./waha
   docker run -d --name waha --restart unless-stopped \
     -p 3001:3001 \
     -e BIND_HOST=0.0.0.0 \
     -e WAHA_API_KEY='<MESMO_segredo_da_Vercel>' \
     -e ALERT_WHATSAPP_NUMBER='120363411279696299@g.us' \
     -v $(pwd)/waha/auth:/app/auth \
     opticalia-waha
   ```
   (Sem Docker: `npm ci --omit=dev` + `BIND_HOST=0.0.0.0 WAHA_API_KEY=... node baileys-server.mjs`
   gerido por `pm2`/`systemd` com restart automático.)
4. **HTTPS + domínio**: pôr um reverse proxy (Caddy/Nginx) à frente em `wa.opticalia-boavista.pt` com TLS,
   a encaminhar para `127.0.0.1:3001`. O `WAHA_URL` da Vercel aponta para esse `https://wa.opticalia-boavista.pt`.
   Para reler o QR de forma segura: `ssh -L 3001:127.0.0.1:3001 user@vps` e abrir
   `http://localhost:3001/?key=<WAHA_API_KEY>`.
5. **Firewall**: só expor a porta do reverse proxy (443). A 3001 fica em `127.0.0.1`.

---

## Segurança (checklist antes de ir para produção)

- [ ] `SUPABASE_SERVICE_ROLE_KEY` definida na Vercel (e **nunca** no cliente).
- [ ] **Desativar sign-up público** no Supabase (Auth → Providers → Email → Disable sign-ups);
      o registo é só por convite via `/api/register`.
- [ ] **Supabase Auth → URL Configuration**: Site URL = `https://dashboard.opticalia-boavista.pt`
      e adicionar essa URL às Redirect URLs (senão os emails apontam para localhost).
- [ ] `WAHA_API_KEY` definida e IGUAL na Vercel e na VPS; Baileys nunca exposto sem ela.
- [ ] Rodar a password da BD e a password Visual (estiveram em texto-plano no histórico).
- [ ] Confirmar que `.env.local` **não** foi para o repo (`git ls-files | grep env` → vazio).
- [ ] `CRON_SECRET` definido (protege `/api/cron/alerts`).

## Notas

- O `.env.local` está gitignored — as credenciais vivem só localmente e nas env vars da Vercel/VPS.
- O build de produção (`cd app && npm run build`) já foi validado localmente.
