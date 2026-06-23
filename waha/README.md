# WhatsApp para o dashboard — SEM Docker (Baileys)

O dashboard envia alertas/resumos por WhatsApp através de um endpoint compatível com o WAHA.
Como o Docker não é viável nesta máquina, usamos um **mini-servidor em Node (Baileys)** que
imita a API do WAHA na porta **3001**. **Nada muda no código da app** — o `app/.env.local`
já aponta `WAHA_URL=http://localhost:3001` e `ALERT_WHATSAPP_NUMBER=351917005877`.

## Arrancar (sempre que quiseres enviar WhatsApp)

Nesta pasta (`waha/`):

```powershell
npm start
```

Fica a correr e mostra os logs. Deixa esta janela aberta.

## Autenticar (só na 1ª vez — precisa do telemóvel)

1. Abre no browser: <http://localhost:3001>
2. No telemóvel: **WhatsApp → Aparelhos ligados → Ligar um aparelho** e lê o QR code.
3. A página passa a "✓ WhatsApp ligado". A sessão fica guardada na pasta `auth/`
   (não é preciso repetir o QR nos próximos arranques).

## Testar pelo dashboard

Com a app a correr (`npm run dev` em `app/`), entra em **Alertas** e usa o botão de envio.
Deixa de mostrar "WAHA não configurado" e a mensagem chega ao número configurado.

## API exposta (compatível WAHA)

- `GET /` — página de estado / QR code.
- `GET /api/sessions` — `[{ "name": "default", "status": "WORKING" | "SCAN_QR_CODE" | "STARTING" }]`.
- `POST /api/sendText` — body `{ "session": "default", "chatId": "...", "text": "..." }`.
  Aceita `chatId` em formato WAHA (`351...@c.us`), Baileys (`@s.whatsapp.net`) ou número cru.

## Envio AUTOMÁTICO de alertas (agendador)

O servidor Baileys tem um **agendador** embutido (node-cron). Lê `waha/cron.json` e, à
hora marcada, dispara o endpoint `POST /api/cron/alerts` do dashboard, que calcula os
alertas e envia-os por WhatsApp para o destino configurado — **sem ninguém carregar em botões**.

`waha/cron.json`:
```json
{ "enabled": true, "schedule": "30 9 * * *", "timezone": "Europe/Lisbon",
  "url": "http://localhost:3000/api/cron/alerts", "secret": "<igual a CRON_SECRET>" }
```
- `schedule` em formato cron (`min hora dia mês diasemana`). `30 9 * * *` = todos os dias às 09:30.
- O `secret` tem de ser **igual** a `CRON_SECRET` no `app/.env.local` (o proxy só deixa passar
  `/api/cron` com esse segredo no header `x-cron-key`).
- Alterar a hora: edita `schedule` e reinicia o servidor WAHA.

## Arranque automático no Windows (opcional, sem Docker nem admin)

Para nunca teres de iniciar nada à mão, há o lançador `start-all.ps1` (na raiz do projeto) que
sobe **App + WAHA** em background. Para correr no teu login, cria um atalho na pasta Startup:

1. Abre a pasta: tecla Windows → escreve `shell:startup` → Enter.
2. Cria aí um ficheiro `OpticaliaDashboard.cmd` com:
   ```bat
   @echo off
   powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "F:\Claude\claude_code\Dashboard OpticaliaBoavista\start-all.ps1"
   ```
Assim, ao ligar o PC, ambos arrancam sozinhos. (Não foi criado automaticamente por segurança —
ativa-o só se quiseres este comportamento.)

## Notas

- Porta **3001** para não colidir com o Next.js (3000).
- Para forçar nova autenticação: pára o servidor, apaga a pasta `auth/` e arranca de novo.
- Se a sessão cair (logout no telemóvel), o servidor limpa as credenciais e gera novo QR automaticamente.
- `install-docker.ps1` e `docker-compose.yml` continuam aqui como alternativa, mas **não são
  necessários** com esta solução.
