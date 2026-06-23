# Auditoria de Segurança Codex

Projeto: Dashboard Opticalia Boavista  
Data da auditoria: 2026-06-13  
Modo: auditoria read-only, sem alterações de código aplicadas durante a análise.

## Estado das correções (atualização)

**Grupo 1 (quick wins) — RESOLVIDO:**
- **#1** `can_export` nos relatórios: novo guard `requireExport` (403) nas rotas monthly/weekly-optica/
  weekly-clinica + botões escondidos na UI (vendas/equipa) quando falta `can_export`.
- **#4** `/api/stock/[codigo]` passou a exigir `requireModule("stock")`.
- **#5** `/api/alerts/whatsapp` (residual) REMOVIDA; `/api/alerts/send` passou a exigir `requireModule("alertas")`.
- **#9** `toggle-active` bloqueia desativar superadmin e o próprio utilizador (anti-lockout).
- **#10** convites: `randomBytes(16)` (128 bits) e o log guarda só prefixo, não o código completo.

**Grupo 2 — RESOLVIDO:**
- **#6** Limites de datas: novo `validateReportRange` (datas válidas, início<fim, duração máx., anos
  suportados) nas rotas monthly (366d), weekly-optica/clinica (186d); intervalo "custom" dos filtros
  globais também blindado (≤ ~13 meses, senão cai no mês atual).
- **#2** WAHA safe-by-default: `baileys-server.mjs` recusa arrancar se ligado a interface não-local
  (ex.: 0.0.0.0) sem `WAHA_API_KEY`. (Resta confirmar a exposição real da porta e, em VPS, firewall +
  fixar versão da imagem Docker — ações de ops.)

**#12 deps — RESOLVIDO:** `overrides` no `package.json` força `postcss ^8.5.10` (corrige o XSS de
stringify, build-time) e `uuid ^11.1.1` (a vuln só dispara com `buf`, que o exceljs não passa — era
não-explorável; mesmo assim limpa). `npm audit` = **0 vulnerabilidades**; exceljs validado (writeBuffer
OK com uuid 11) e `npm run build` OK. WAHA: ver `waha/package.json` à parte se necessário.

**#3 TOTP fora da RLS — RESOLVIDO (código; falta correr a migração 012):** segredo movido de
`profiles.totp_secret` (legível por RLS) para a tabela `totp_secrets` SEM policies (só service role).
Helper `lib/auth/totp-store.ts` (read/write via service role); setup grava no cofre e limpa o segredo
pendente da metadata; verify lê do cofre. Código **resiliente** (fallback à coluna antiga) → deploy
seguro em qualquer ordem. **Aplicar `012_totp_secrets.sql` no SQL Editor** para criar o cofre, migrar
os segredos e apagar `profiles.totp_secret`.

**#7 audit_logs — RESOLVIDO (falta correr 013):** policy de insert passa de `auth.uid() IS NOT NULL`
para `WITH CHECK (user_id = auth.uid())` (não dá para forjar logs de outro). Crons/registo usam service
role (ignoram RLS). Migração `013_audit_logs_insert.sql` → SQL Editor.

**#11 CSP — RESOLVIDO:** `next.config.ts` passa de `frame-ancestors 'none'` para uma CSP completa
(default-src self; object-src none; base-uri self; form-action self; connect-src self+Supabase;
img/font data:; script/style 'unsafe-inline' — necessário ao Next sem nonces). Build OK e login 200
com o header presente; falta validar no browser fluxos client-side (login Supabase, realtime, gráficos).

**Pendente (decisão do dono):** #8 (rate limit distribuído — infra Redis/Upstash).

Nota operacional: no fim da auditoria, `git status` mostrou 4 ficheiros de fornecedores modificados e 3 PDFs não versionados. Essas alterações não foram feitas pelo Codex durante a auditoria; foram apenas lidas para contexto.

## Sumário Executivo

A aplicação tem uma base de segurança razoável: proxy global com sessão, conta ativa e 2FA; RLS Supabase com hardening contra escalada de privilégios; service role concentrada em pontos server-only; headers básicos; registo por convite com consumo atómico; cron protegido por `CRON_SECRET`.

Os riscos principais encontrados estão em autorização fina de APIs, endpoints auxiliares expostos a qualquer utilizador autenticado, limites insuficientes em operações pesadas, exposição potencial de segredos TOTP a nível de RLS e superfície WAHA caso venha a ser exposta fora de localhost sem chave.

## Findings

### 1. Alto - exports/relatórios ignoram `can_export`

As rotas de relatórios exigem apenas `requireModule`, ou seja, permissão de visualização, não permissão de exportação.

Evidências:
- `src/app/api/reports/monthly/route.ts:13` usa `await requireModule("vendas")`.
- `src/app/api/reports/weekly-optica/route.ts:10` usa `await requireModule("equipa")`.
- `src/app/api/reports/weekly-clinica/route.ts:10` usa `await requireModule("equipa")`.
- `src/app/(dashboard)/vendas/page.tsx:96` renderiza `<MonthlyReportButton />` sem depender de `canExport`.
- `src/app/(dashboard)/equipa/page.tsx:30` renderiza `<WeeklyReportButton />` sem depender de `canExport`.

Impacto:
Um utilizador com `can_view` em `vendas` ou `equipa`, mas sem `can_export`, pode chamar diretamente as APIs de relatório e obter dados exportáveis.

Recomendação:
Criar um guard server-side `requireExport(module)` baseado em `getSession()` + `canExport()`, e aplicá-lo nas rotas de relatórios. Também esconder/desativar os botões na UI com a mesma permissão.

### 2. Alto condicional - WAHA fica perigoso se exposto sem chave

O mini-servidor WAHA custom só exige `WAHA_API_KEY` se a variável estiver definida. Em modo local liga a `127.0.0.1`, mas em Dockerfile/VPS pode escutar em `0.0.0.0`.

Evidências:
- `waha/baileys-server.mjs:28` define `BIND_HOST = process.env.BIND_HOST || "127.0.0.1"`.
- `waha/baileys-server.mjs:31` define `API_KEY = process.env.WAHA_API_KEY || ""`.
- `waha/baileys-server.mjs:166` só valida chave se `API_KEY` existir.
- `waha/baileys-server.mjs:204` expõe `/api/groups`.
- `waha/baileys-server.mjs:224` expõe `/api/sendText`.
- `waha/Dockerfile:11` define `BIND_HOST=0.0.0.0`.
- `waha/docker-compose.yml:3` usa `devlikeapro/waha:latest`.
- `waha/docker-compose.yml:9` publica `3001:3000`.
- `waha/docker-compose.yml:17` deixa `WHATSAPP_API_KEY` comentada.

Impacto:
Se WAHA ficar acessível em rede sem API key/firewall, qualquer pessoa que alcance a porta pode enviar mensagens ou listar grupos, dependendo da implementação em execução.

Recomendação:
Para qualquer ambiente que não seja estritamente localhost:
- Exigir sempre `WAHA_API_KEY`.
- Usar firewall/reverse proxy com allowlist.
- Evitar `image: latest`; fixar versão.
- Garantir que `app/.env.local` e runtime WAHA usam a mesma chave.

### 3. Médio/Alto - segredos TOTP guardados em plaintext e legíveis por RLS

O segredo TOTP vive em `profiles.totp_secret` como `TEXT`. A policy de leitura permite ao utilizador ler o próprio perfil.

Evidências:
- `supabase/migrations/001_initial_schema.sql:17` cria `totp_secret TEXT`.
- `supabase/migrations/002_security_hardening.sql:55` define `profiles_select` com `auth.uid() = id OR public.is_superadmin()`.
- `src/app/api/2fa/setup/route.ts:49` grava `totp_secret`.
- `src/app/api/2fa/verify/route.ts:20` lê `totp_secret`.

Impacto:
Se houver qualquer vetor client-side ou uso direto do anon client que leia `profiles`, o próprio utilizador pode recuperar o segredo TOTP. Superadmins também conseguem ler todos os segredos. Isto enfraquece o fator TOTP após comprometimento de sessão.

Recomendação:
Mover os segredos TOTP para tabela separada sem policies para `anon`/`authenticated`, acessível apenas via service role/RPC server-side. Alternativamente cifrar com chave server-side e nunca expor a coluna por RLS.

### 4. Médio - `/api/stock/[codigo]` não verifica permissão do módulo `stock`

A rota só exige utilizador autenticado, não `requireModule("stock")`.

Evidências:
- `src/app/api/stock/[codigo]/route.ts:8` chama `supabase.auth.getUser()`.
- `src/app/api/stock/[codigo]/route.ts:15` consulta `articleMovements` e `stockByStore`.

Impacto:
Qualquer utilizador autenticado, mesmo sem acesso ao módulo Stock, pode consultar movimentos e stock por artigo se souber ou adivinhar códigos.

Recomendação:
Substituir o check manual por `await requireModule("stock")`.

### 5. Médio - endpoints de alertas/WhatsApp sem permissão fina nem rate limit

`/api/alerts/send` e `/api/alerts/whatsapp` exigem apenas sessão. A rota `/api/alerts/whatsapp` aceita mensagem arbitrária e aparenta não ser usada pela UI.

Evidências:
- `src/app/api/alerts/send/route.ts:12` só verifica `auth.getUser()`.
- `src/app/api/alerts/send/route.ts:22` chama `sendAlert(text)`.
- `src/app/api/alerts/whatsapp/route.ts:7` só verifica `auth.getUser()`.
- `src/app/api/alerts/whatsapp/route.ts:10` lê `{ message }` sem zod/limites.
- `src/app/api/alerts/whatsapp/route.ts:13` envia a mensagem.
- Pesquisa de uso mostrou a UI a chamar apenas `/api/alerts/send`.

Impacto:
Qualquer utilizador autenticado pode disparar alertas WhatsApp. A rota livre permite abuso operacional e spam para o número/grupo configurado.

Recomendação:
Remover `/api/alerts/whatsapp` se for residual. Caso seja necessária, exigir `requireModule("alertas")`, validar com zod, limitar tamanho da mensagem e aplicar rate limit. Considerar restringir envio manual a admins/superadmin.

### 6. Médio - intervalos de datas não têm limite

Filtros custom e APIs de relatórios aceitam intervalos arbitrários.

Evidências:
- `src/lib/filters/range.ts:45` valida apenas formato `YYYY-MM-DD`.
- `src/lib/filters/range.ts:54` aceita `period === "custom"` se `from` e `to` forem YMD.
- `src/lib/filters/range.ts:59` devolve o intervalo sem validar ordem/duração.
- `src/app/api/reports/monthly/route.ts:14-15` lê `from`/`to` diretamente de query params.

Impacto:
Um utilizador autenticado pode disparar consultas muito longas contra Visual/OData, causando lentidão, timeouts e consumo excessivo.

Recomendação:
Validar server-side:
- `from < to`.
- duração máxima por tipo de endpoint.
- datas dentro de anos suportados.
- rejeitar `Invalid Date`.
- aplicar rate limit nos endpoints pesados.

### 7. Médio - audit logs podem ser forjados por qualquer utilizador autenticado

A policy permite insert em `audit_logs` para qualquer utilizador autenticado.

Evidências:
- `supabase/migrations/001_initial_schema.sql:97-98` cria `audit_logs_insert` com `WITH CHECK (auth.uid() IS NOT NULL)`.
- `supabase/migrations/002_security_hardening.sql:97` mantém essa policy.

Impacto:
Um utilizador autenticado com acesso direto ao Supabase pode inserir logs arbitrários, possivelmente com `user_id` de outra pessoa ou ações falsas, reduzindo valor forense.

Recomendação:
Trocar para `WITH CHECK (user_id = auth.uid())`, e idealmente inserir logs apenas por rotas server-side/service role/RPC controlada.

### 8. Médio - rate limiting é local em memória e cobre poucas rotas

O rate limiter é Map em memória e o próprio comentário limita-o a single-instance.

Evidências:
- `src/lib/security/rate-limit.ts:3-4` assume single-instance e recomenda store partilhado em serverless.
- `src/lib/security/rate-limit.ts:12` usa `new Map`.
- `src/lib/supabase/middleware.ts:7-11` cobre só register, invite validate, 2FA verify e 2FA setup.

Impacto:
Em Vercel/serverless, limites podem ser contornados por instância. Endpoints pesados e WhatsApp não têm proteção contra abuso por utilizador autenticado.

Recomendação:
Usar Redis/Upstash/Supabase para rate limit distribuído. Cobrir também relatórios, stock, alertas e endpoints admin mutáveis.

### 9. Médio/Baixo - `toggle-active` pode desativar superadmin ou o próprio utilizador via API

A UI esconde ações para superadmin, mas a API `toggle-active` não repete essa proteção. A rota de permissões protege contra alterar superadmin, mas a rota de ativação não.

Evidências:
- `src/app/api/admin/users/[userId]/toggle-active/route.ts:15` lê target com `role`.
- `src/app/api/admin/users/[userId]/toggle-active/route.ts:19` atualiza `is_active` sem bloquear `superadmin`.
- `src/app/api/admin/users/[userId]/permissions/route.ts:30-31` bloqueia alterar superadmin.
- `src/app/admin/utilizadores/UserActions.tsx:33` esconde ações na UI para superadmin.

Impacto:
Um superadmin pode, via chamada direta/API, desativar outro superadmin ou a si próprio, causando lockout operacional.

Recomendação:
Na rota:
- bloquear `target.role === "superadmin"`;
- bloquear `userId === user.id`;
- opcionalmente exigir confirmação/duplo controlo para ações críticas.

### 10. Baixo/Médio - convites têm só 32 bits de entropia e o código aparece em audit log

O convite é gerado com `randomBytes(4)`, resultando em 8 hex chars.

Evidências:
- `src/app/api/invite/generate/route.ts:6` usa `randomBytes(4)`.
- `src/app/api/invite/generate/route.ts:35` grava o código completo em `audit_logs.details`.

Impacto:
O rate limit reduz risco, mas 32 bits é curto para um token de convite. Gravar o código completo em logs aumenta exposição se logs forem visualizados/exportados.

Recomendação:
Usar pelo menos 96 ou 128 bits, por exemplo 16 bytes. Gravar apenas hash ou prefixo parcial do código em logs.

### 11. Baixo - CSP é mínima

Headers de segurança existem, mas CSP só define anti-framing.

Evidências:
- `next.config.ts:5` define `X-Frame-Options: DENY`.
- `next.config.ts:18` define `Content-Security-Policy: frame-ancestors 'none'`.

Impacto:
Não há política explícita para `default-src`, `script-src`, `connect-src`, `img-src`, etc. Um XSS noutra área teria menos contenção.

Recomendação:
Avaliar CSP completa compatível com Next.js, Supabase, imagens, QR codes e chamadas externas. Implementar em modo `Content-Security-Policy-Report-Only` primeiro se houver risco de quebrar runtime.

### 12. Dependências - vulnerabilidades moderadas em `npm audit`

Foi executado `npm audit --json` para `app/` e `waha/`.

App:
- 4 vulnerabilidades moderadas.
- `next` afetado via `postcss` (`GHSA-qx2v-qp2m-jg93`, XSS em CSS stringify).
- `exceljs` afetado via `uuid` (`GHSA-w5hq-g745-h8pq`).
- Dependências diretas relevantes: `package.json:28` (`exceljs`), `package.json:32` (`next`).

WAHA:
- 2 vulnerabilidades moderadas.
- `node-cron` afetado via `uuid`.
- Dependência direta relevante: `waha/package.json:12` (`node-cron`).

Recomendação:
Atualizar com cuidado. Não aceitar cegamente sugestões de downgrade do `npm audit` quando sugerem versões antigas/semver major incompatíveis. Testar build, type-check e fluxos críticos após atualização.

## Observações Positivas

- Proxy global exige sessão, conta ativa, 2FA configurado e cookie 2FA verificado.
- `getSession()` reforça proxy em server components.
- Cookie 2FA é httpOnly, assinado por HMAC, ligado a `userId` e expiração.
- Rotas cron validam `CRON_SECRET` no proxy e nas próprias rotas.
- RLS corrigiu a escalada inicial em `profiles.role`/`is_active`.
- Convites são consumidos atomicamente via RPC server-side.
- Service role está concentrada em módulos `server-only` e crons/rotas controladas.
- `.env.local`, `waha/auth/` e `waha/cron.json` estão ignorados.
- `CRON_SECRET` e `TWOFA_COOKIE_SECRET` aparecem configurados e com tamanhos adequados na leitura sanitizada.
- REST Visual e OData têm timeouts e, no caso Visual, serialização de chamadas.

## Itens Recomendados por Prioridade

1. Corrigir `can_export` nas APIs de relatórios.
2. Proteger/remover `/api/alerts/whatsapp` e aplicar permissão/rate limit em alertas.
3. Aplicar `requireModule("stock")` em `/api/stock/[codigo]`.
4. Fechar risco WAHA em qualquer cenário não-local: chave obrigatória, firewall e versão fixada.
5. Mover/cifrar segredos TOTP fora de `profiles` legível por RLS.
6. Validar e limitar intervalos de datas em páginas e APIs de relatórios.
7. Tornar rate limit distribuído e cobrir endpoints pesados.
8. Restringir insert de `audit_logs`.
9. Bloquear self/superadmin em `toggle-active`.
10. Aumentar entropia dos convites e deixar de gravar convite completo em logs.
11. Endurecer CSP progressivamente.
12. Atualizar dependências auditadas e retestar.

## Comandos Executados

Foram executados apenas comandos de leitura/auditoria, incluindo:
- `Get-ChildItem`
- `Get-Content`
- `Select-String`
- `git status --short`
- `git diff --stat`
- `git diff -- ...`
- `npm audit --json`

Não foram executados comandos destrutivos. Não foram corridos `build`, `lint` ou `tsc`, para evitar escrita em caches/artefactos.
