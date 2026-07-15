# Dashboard Óptica Boavista

Dashboard de gestão para a ótica **Óptica Boavista** (1 loja, sem multi-store).
A aplicação Next.js vive em **`app/`** (não na raiz). Trabalhar sempre dentro de `app/`.

## Development Commands
Executar dentro de `app/`:
- `npm run dev` — servidor de desenvolvimento (Next 16 + Turbopack, porta 3000).
- `npm run build` / `npm start` — produção.
- `npm run lint` — ESLint. `npx tsc --noEmit` — type-check.
- Seed do superadmin: `node scripts/seed-superadmin.mjs <email> <password> ["Nome"]`
  (lê `FIREBASE_*` do `.env.local`; cria o user no Firebase Auth + doc `profiles/{uid}`).
  Deploy das regras Firestore: `firebase deploy --only firestore:rules` (projeto `boavista-83c05`).

O `app/AGENTS.md` avisa: **este Next 16 tem breaking changes** — ler os docs em
`node_modules/next/dist/docs/` antes de escrever código. A convenção é **`proxy.ts`**
(não `middleware.ts`).

## Stack
Next.js 16 (App Router, Turbopack) + TypeScript · Tailwind v4 (`@theme` em `globals.css`, **tema
claro/escuro** — ver Convenções) ·
shadcn-style UI · Recharts · Firebase (Auth + Firestore via Admin SDK) · otplib v13 (2FA TOTP) ·
qrcode · Resend (email) · WAHA (WhatsApp) · xlsx + jspdf (export) · zod.

## Arquitetura
- **Camada de dados via adapter** (`src/lib/api/adapter.ts`): cada `fetch*` devolve a forma que
  a UI consome. **`USE_MOCK_DATA=false` (decisão do dono: SÓ dados reais)** → API real. Os mocks
  (`src/lib/mock-data/`) estão INERTES (só compilam; não tocar para realismo). Nunca importar mocks
  nas páginas.
- **DUAS fontes de dados reais**:
  1. **Visual REST (Temática, VGOnlineLink)** — cliente `visual-client.ts`, mapeamento `visual-map.ts`,
     tipos `src/types/visual.ts`. Doc `API.pdf`/`API_extracted.txt` (raiz).
  2. **Visual Cloud OData (vistas `VX_*`)** — cliente `src/lib/api/odata-client.ts`, mapeamento
     `src/lib/api/odata-map.ts`. Doc `vistas.pdf` (em `app/`). É a fonte das funcionalidades novas
     (faturação, caixa, fornecedores, custo real das lentes, classe por linha). Ver secção OData.
- **Auth/permissões**: Firebase Auth (login client SDK em `src/lib/firebase/client.ts`, guardado por
  `typeof window`); a sessão é um **cookie HMAC próprio `of_session`** (`src/lib/auth/session-cookie.ts`),
  NÃO os session cookies do Firebase. Dados de controlo via **Firestore (Admin SDK)** em
  `src/lib/firebase/admin.ts` (`adminAuth`/`adminDb`). Sessão+permissões efetivas em
  `src/lib/auth/session.ts` (`getSession`); helpers de API em `src/lib/auth/api-session.ts`
  (`requireSuperadmin`/`getApiSession`/`getSessionIdentity`). Guard por módulo em `guard.ts`. Proxy
  (porta única) via `src/proxy.ts`. **16 módulos** (`ModuleKey`): dashboard,
  hoje, mes, vendas, faturacao, caixa, pipeline, stock, clientes, equipa, descontos, entidades,
  operacao, fornecedores, alertas, admin.
- **Alertas**: `src/lib/alerts/engine.ts` calcula **13 alertas** (operacionais + comerciais:
  recall clínico, cross-sell, attach de tratamentos) a partir do adapter. Janela de **2 meses**
  para margem/descontos; objetivo de ritmo usa o objetivo mensal REAL do Firestore.
- **Filtros globais**: `src/lib/filters/range.ts` + `components/layout/GlobalFilters.tsx`
  (período/datas/colaborador/categoria). **PERSISTENTES e GLOBAIS via cookie `of_filters`** (não URL):
  o `GlobalFilters` (cliente) grava o JSON no cookie + `router.refresh()`; TODAS as páginas com âmbito
  de datas leem via `getGlobalFilters()` (`src/lib/filters/cookie.ts`, server-only) — mudar o período
  num menu aplica-se a todos. Cada página passa `value={filters}` ao `GlobalFilters` (estado SSR).
  Páginas de detalhe (`/equipa/[vendedor]`, `/fornecedores/[codigo]`) já não precisam de query string
  nos links (o cookie persiste). `resolvePreviousRange` dá o período homólogo anterior (badges "vs
  período ant." nos KPIs — variação REAL, não hardcoded). **Hoje/Pipeline** ficam fora do filtro
  (Hoje=sempre hoje; Pipeline=estado ao vivo do funil).
- **⚠️ Fronteira server/client**: constantes/tipos que componentes CLIENTE precisam vivem em
  ficheiros próprios SEM `next/headers` (`lib/targets/constants.ts`, `lib/suppliers/constants.ts`).
  Os `store.ts` (que importam o Admin SDK `firebase/admin`) têm `import "server-only"`. NUNCA importar
  um store num `"use client"` — dá Build Error (Admin SDK / `next/headers` no cliente).

## API Visual — particularidades CRÍTICAS (validadas contra a API real)
Config em `.env.local`: `VISUAL_API_URL=https://shop.tematicasoftware.com/api`,
`VISUAL_USER=MATOSINHOS`, `VISUAL_CONNECTION=vgdb26` (NÃO `vgdb026`), `VISUAL_CENTRO=1`.
- **Login**: POST com query string; a password vai **percent-encoded TOTAL** (`quoteAll`: também
  `!'()*` → ex. `*`=`%2A`). Token vem no **header `Access-Token`** (corpo vazio).
- **Respostas `/select` vêm em JSON DUPLO-CODIFICADO**: 1ª parse → string, 2ª parse → objeto
  `{dataset, data:[]}`. `request<T>` faz o 2º parse.
- **Datas de filtro = formato US `M/D/YYYY`** (sem zeros, sem hora). `YYYY-MM-DD`→ORA-01843;
  `DD/MM/YYYY` rejeitado. O limite superior do intervalo **arredonda para o dia seguinte**
  (`dateRangeFilter`), senão "hoje" daria intervalo vazio.
- **`Centro eq '1'`** (com plicas) — a tabela Ventas mistura lojas; Boavista = `'1'`.
- **404 "Not found" = conjunto VAZIO**, não erro (o `select` trata como `[]`).
- **1 ligação concorrente**: todas as chamadas serializadas por um mutex + **gap de 400ms**;
  **timeout de 25s** por pedido (`AbortSignal.timeout`) para nunca encravar.
- Filtro `OR`: `Codigo eq 'x' or Codigo eq 'y'` é suportado (usado para artigos referenciados).

### Mapeamento de dados (decisões)
- **Categorias do gráfico = 6 INDEPENDENTES, por linha** (`SaleCategory`): `lentes_oftalmicas` (L),
  `armacoes` (G), `oculos_sol` (S), `lentes_contacto` (C), `saude_ocular` (lista de códigos no
  Admin), `diversos` (resto). A classe da linha vem do **OData** (`VX_LINEAS_VENTA.CLASE_PRODUCTO`,
  via `lineClasses`) — a REST NÃO traz a classe da linha; fallback ao maestro. `categoryFromClase`
  + `lineCategory` em visual-map. (Os OBJETIVOS mantêm "Óculos Graduados" = L+G, ver Funcionalidades.)
- Linha→artigo: `Codigo_articulo` (13 díg) ou `Codigo_producto` (forma `@centro`). `norm13()`
  normaliza; `articleForLine()` resolve.
  ⚠️ **`Codigo_producto` NÃO é o mesmo espaço de códigos que o `Codigo` do artigo** (validado
  2026-07-15): o produto `0000000006@1` é a lente **BIOFINITY TORICA XR**, mas o artigo
  `0000000000006` é o líquido **SOLO CARE AQUA**. Normalizar o produto a 13 díg e procurá-lo no
  maestro dá **falsos positivos**. `VX_PRODUCTOS` também não resolve por código: a chave
  `0000000009@1` tem **9 produtos** de fornecedores diferentes (PVO de 8,30€ a 86€) — o
  `CODIGO_PRODUCTO` lá é composto (`FORNECEDOR|codigo|@centro|...`).
  ✅ **Corrigido 2026-07-15**: `articleForLine()` e `collectArticleCodes()` só usam
  `Codigo_articulo`; `lineCategory` idem. Só trazem `Codigo_producto` (→ sem artigo, de propósito):
  **lentes de lab (285/285), LC de encomenda (125/172) e serviços**; o custo dessas vem da cadeia
  entrada→fatura (`entryCosts`), que é a fonte com autoridade.
  ⚠️ **A margem estava INFLACIONADA**: as linhas sem artigo apanhavam um artigo qualquer e o seu
  `Precio_compra` **ganhava ao custo real** em `lineCostNet` (ex.: lente de 455€ custeada como
  "ARMAÇÃO MASSA STING" a 43,64€, quando a entrada real diz 258€). Lentes oftálmicas: **66,9% → 50,4%**
  num mês liquidado (Março/2026). Meses recentes dão mais baixo (~29%) porque as faturas do lab ainda
  não chegaram — é a cobertura, não a margem. Armações/sol nunca foram afetadas (têm artigo próprio).
- **Saúde ocular / líquidos = `AGRUPACION_2 = 'MANUTENCAO OCULAR'`** (validado 2026-07-15). A lista
  de códigos do Admin estava VAZIA → foi semeada com os **116 artigos** dessa agrupação (62 líquidos,
  38 lágrimas, 8 higiene palpebral, 5 suplementos, 3 limpeza enzimática; inclui 10 descontinuados,
  de propósito, p/ as vendas antigas continuarem a categorizar). Script idempotente com dry-run:
  `npx tsx --env-file=.env.local scripts/seed-saude-ocular.mts [--commit]`. ⚠️ **classe `P` ≠ saúde
  ocular** — é o balde de tudo o que não é L/G/S/C; os vizinhos NÃO entram: `PRODUTOS|MANUTENCAO LC`
  são ventosas, `ACESSORIOS|LIMPEZA`/`DIVERSOS|LIMPEZA` são anti-embaciamento/panos de óculos,
  `PRÓTESES OCULAR` é outro serviço. Nota: em `VX_ARTICULOS` o campo é `AGRUPACION_2` (underscore),
  em `VX_LINEAS_VENTA` é `AGRUPACION2` (sem).
- **Venda líquida = `Importe_bruto − Importe_descuento_lineas − Importe_DescuentoGlobal`**
  (campos da venda — KPIs de vendas/ticket/conversão não precisam de artigos).
- **PVP = `Precio_venta × (1 + IVA/100)`** (Precio_venta é SEM IVA). Produto premium =
  classe G/S com PVP > 400€ (env `VISUAL_PREMIUM_MIN_PVP`).
- **MARGEM REAL (RESOLVIDA via OData)**: o custo vem do maestro (`Precio_compra`) OU, em falta
  (lentes de laboratório), pela cadeia **venda → pedido → guia(entrada) → FATURA do fornecedor**.
  `lineEntryCostsForVentas` resolve, por linha de venda, com cascata por autoridade:
  **(1) fatura** (`VX_LINEAS_FACTURAS_PROVEEDOR.PRECIO`−descontos, casa via a linha de entrada
  `CODIGO_ENTRADA`+`CODIGO_LINEA_ENTRADA`) → **(2) entrada** (`VX_LINEAS_ENTRADA.PRECIO_COSTE`) →
  **(3) pedido** (`VX_LINEAS_PEDIDOS_REPOSICION.PRECIO_COSTE`, liga direto à venda). ⚠️ **Muitas
  entradas trazem `PRECIO_COSTE=0`** (o custo real só está na FATURA) — por isso registam-se TODAS as
  entradas (sem filtrar custo) só para chegar à fatura. Medido: o custo das lentes oftálmicas subiu de
  ~34% (só entrada) para **~74%** (com fatura) num mês liquidado (ex.: Maio/2025); meses muito recentes
  têm cobertura baixa porque ainda não foram rececionados/faturados. `lineCostNet(v,l,articles,ratio,
  entryCosts)`. (PVO de `VX_PRODUCTOS` vem 0 p/ lentes — não usar.)
- Conversão consulta→venda: liga consulta a venda do mesmo cliente em janela de 45 dias
  (`VISUAL_CONSULT_SALE_WINDOW_DAYS`). No-shows NÃO existem na API de forma estruturada (a agenda
  regista "Veio!"/"Não compareceu!" em texto livre, mas só ~20% das consultas têm cliente ligado).

## OData (Visual Cloud — vistas `VX_*`) — particularidades CRÍTICAS
Config `.env.local`: `ODATA_URL` (`.../WebServiceWcf.svc` com token no path), `ODATA_USER`
(`tematica\9001168609`), `ODATA_PASSWORD`. Cliente `odata-client.ts` (`odataSelect`, segue
`odata.nextLink`). **Basic auth · OData v3 JSON.** Doc das vistas em `app/vistas.pdf` (extrair
texto com `pdf-parse` v2: `new PDFParse({data}).getText()`).
- **`VX_LINEAS_VENTA` tem `CLASE_PRODUCTO` POR LINHA** + `TIPO_GRADUACION` + tratamentos
  (`DESCRIPCION_SUPLEMENTO_*`) + prescrição. A REST `/select/Ventas` NÃO tem a classe da linha.
- **`VX_LINEAS_ENTRADA`** liga entrega→venda (`CODIGO_VENTA`+`CODIGO_LINEA_VENTA`) com `PRECIO_COSTE`
  (custo real das lentes) e datas via `VX_ENTRADAS`.
- **Sem `$filter` → 500** (CLOBs). Filtrar SEMPRE (ex.: `CENTRO_VENTA eq 1 and (CODIGO_VENTA eq …)`)
  e usar `$select` de campos escalares. Lotes de 50 nos OR.
- **Datas OData**: `datetime'YYYY-MM-DDThh:mm:ss'`. `$count` → 415. Campos do PDF estão baralhados
  → usar `$metadata` para os nomes reais. `substringof` é **case-sensitive**.
- Vistas usáveis: VX_FACTURAS_CLIENTES, VX_MOVIMIENTOS_CAJA, VX_FACTURAS_PROVEEDORES(+linhas),
  VX_PROVEEDORES, VX_ARTICULOS_TIENDA (stock/loja), VX_ENTRADAS/VX_LINEAS_ENTRADA, VX_AGENDA.
  **NÃO usáveis**: `VX_REVISION_LENTES`→500 sempre; `VX_REVISIONES_PRUEBAS`→404 vazio;
  `VX_APLAZAMIENTOS`→vazio (não usam crédito). `VX_PRODUCTOS.PVO`=0 nas lentes.

## Funcionalidades (estado atual)
- **Objetivos mensais** (Admin → Objetivos, migração `004`): tabela `monthly_targets`
  (ano/mês/categoria/€) + `saude_ocular_products` (códigos — ✅ **semeados 2026-07-15**: 116 artigos,
  ver Saúde Ocular abaixo). Categorias-objetivo: global,
  oculos_graduados (=L+armações), oculos_sol, lentes_contacto, saude_ocular. `lib/targets/`
  (`constants.ts` client-safe + `store.ts` server). Painel no Dashboard; objetivo do Hoje =
  global ÷ dias úteis. **Objetivos POR VENDEDOR** (migração `014` `employee_targets`): em
  Admin → Objetivos (`EmployeeTargetsForm` + `/api/admin/employee-targets`) define-se € mensal por
  vendedor (Usuario do Visual); a Equipa lê via `getEmployeeTargets` (prioridade sobre o fallback
  `VISUAL_EMPLOYEE_TARGETS`). Sem objetivo → "Sem objetivo" (não divide por 0).
- **Análise por VENDEDOR** (página `/equipa/[vendedor]`, clicável dos cards da Equipa): tudo **vs
  período homólogo do ano anterior** (`employeeAnalytics`, shift −1 ano). Vendas, **ROI = margem €
  gerada**, ticket médio, nº vendas, marcas que mais vende, **peso por fornecedor** (+ mais vendido),
  armações vs sol (€/un.), monofocais/progressivos/bifocais, orçamentos feitos vs convertidos e
  **vendas por entregar** (`Estado` da linha T/I/H/C/J). Reaproveita `supplierLines` (estendido com
  marca/estado/data/referência).
- **Entidades** (menu `entidades`, substituiu o antigo "Consultas" em 2026-07-15): análise das
  **vendas com seguro**. Lista por entidade (nº de vendas, valor total, desconto médio,
  comparticipação) e detalhe clicável `/entidades/[codigo]` (ticket médio, produtos mais vendidos,
  margem + cobertura, vendedores). `insurerEntities`/`insurerEntityDetail` em visual-map.
  **Assenta nas VENDAS, não nas faturas** (decisão do dono). Particularidades **validadas contra os
  dados** (2025-2026):
  - **A seguradora só está na FATURA** (`FacturasClientes.Codigo_aseguradora`, REST); a `Ventas` NÃO
    tem nada de seguro (validado na UNIÃO dos campos de 1386 vendas: 18 de cabeçalho, 14 de linha).
    Também não é o `Codigo_cliente_pagador` (testado: só 1,3% das vendas têm pagador≠cliente e só 2
    delas têm seguro — são familiares a pagar). Nenhuma vista OData tem campo de seguro.
  - ✅ **A ponte é `VX_FACTURAS_CLIENTES.CODIGO_VENTA`** (OData) — liga fatura→venda, **96,8%** das
    faturas com seguro, nenhuma com CODIGO_VENTA vazio. (`VX_LINEAS_FACTURAS_CLIENTES` liga até à
    LINHA da venda: `CODIGO_VENTA`+`CODIGO_LINEA_VENTA`.) Adivinhar por cliente+valor só acertava 54%.
    `invoiceVentaLinks` (odata-map) + `seguroPorVenta` (visual-map, cache 60s).
  - ⚠️ **Filtrar por DATA, não por lotes de códigos**: em lotes de 50 eram ~58 chamadas × gap de
    400ms = **81s**. Com 2 varreduras por data → ~35s (detalhe 6s, já cacheado). Janela das faturas =
    `[from, to+30d]` (a fatura é da ENTREGA, nunca ANTES da venda); +30d dá exatamente os mesmos
    números que +60d em Junho/2026 (769 vendas, 211.456,06€).
  - Com a venda em mãos, **margem REAL** via `lineCostNet`+`entryCosts`: **~94% de cobertura** (vs
    ~30% que dava pelas linhas da fatura, que não têm `Codigo_producto` → lentes sem custo).
  - **Comparticipação** = desconto da VENDA (`Importe_descuento_lineas`+`Importe_DescuentoGlobal`) =
    € que o cliente não paga (ex.: bruto 281 − 56,20 = 224,80 pagos). ⚠️ **`Importe_asegurado`**
    (linha da fatura) seria o valor exato mas o Visual só o preenche em **~1%** dos casos (medido em
    Jun/25, Jan/26, Jun/26, Jul/26) → **inútil**. O "desconto médio" é a média disto, não outro campo.
  - ⚠️ O modelo **"FR(desc=0)/FT/NC"** documentado antes **NÃO se confirma** na BD própria: a FR é o
    documento dominante (1131/1468 em Junho/2026) e TEM desconto (92.312€); há ainda FS/NS/ND.
  - O **NOME da seguradora não existe na API** (só o código) → mostram-se TODAS com o rótulo
    `Seguro «código»` até serem nomeadas em Admin → Seguradoras (o dono preenche-as; filtrar pelas
    mapeadas dava menu vazio). Nos produtos tira-se o prefixo `O.D.:`/`O.E.:`, senão a mesma lente
    conta 2x (uma por olho).
- **Menus novos (OData)**: **Faturação** (VX_FACTURAS_CLIENTES), **Gestão de Caixa**
  (VX_MOVIMIENTOS_CAJA, sem 0€, KPIs por forma de pagamento/colaborador/dia), **Fornecedores/Rappel**
  (VX_FACTURAS_PROVEEDORES; Admin define grupo/objetivo/rappel — migração `005` `supplier_config`).
  **Rappel escalonado** (migração `011`, coluna `rappel_tiers`): cada fornecedor tem patamares
  `{min €, %}`; a % do patamar mais alto atingido pelas compras aplica-se ao TOTAL. Helpers
  `rappelForTotal`/`rappelPctForTotal` em `lib/suppliers/constants.ts` (client-safe).
  ⚠️ **O rappel creditado NÃO é uma compra** (corrigido 2026-07-15): o Visual lança-o como nota de
  crédito do fornecedor (linha `CANTIDAD=-1`, preço positivo), e as compras somavam-no em NEGATIVO —
  circular, porque ganhar rappel reduzia a base do próprio rappel (2026 YTD: −289.762€, dos quais
  ZEISS −238.318€). `supplierPurchases` exclui as linhas cuja `DESCRIPCION` bate `RAPPEL_LINE_RE`
  (dizem sempre "RAPPEL": "RAPPEL ZEISS - MAIO 2026", "RAPPEL VTS 24/25", "RAPPELMKT 24/25"; apanha
  também as raras positivas de "CORREÇÃO RAPPEL") e devolve-as em `rappelCreditado` — o menu mostra
  **"Rappel Creditado"** (real) a par do **"Rappel Estimado"** (patamares). As **devoluções** de
  produto (também `CANTIDAD<0`) CONTINUAM a abater: rappel é sobre compras líquidas (decisão do dono)
  — por isso um fornecedor com só devoluções no período dá negativo, e é correto. Aplicam-se também os
  `DESCUENTO_1/2` do **cabeçalho** da fatura (antes só os das linhas).
  **Análise de VENDAS por fornecedor** (página dedicada `/fornecedores/[codigo]`, clicável da lista
  "Principais Fornecedores por grupo" e da tabela de compras): KPIs (vendas/un./ticket/margem/cobertura),
  best-sellers, ranking de vendedores (valor/quantidade/produto-estrela), demografia do comprador
  (género+faixa etária via `VX_CLIENTES.SEXO/FECHA_NACIMIENTO`), e blocos por classe presente —
  **armações/sol** (género-alvo=`AGRUPACION3`, material=`AGRUPACION2`), **LC** (periodicidade por
  parse da descrição, esférica/tórica/multifocal via `ESFERA/CILINDRO/ADICION`, vendas de saúde
  ocular), **lentes oftálmicas** (tipo=`AGRUPACION3` mono/prog/bifocal, 2º par, SmartLife mono vs
  prog por vendedor). Eixo = **`VX_LINEAS_VENTA.PROVEEDOR`** (existe em TODAS as linhas, mesmo espaço
  de códigos das compras). `supplierAnalytics`/`supplierSalesByProvider` + `lineSalesDetailsForVentas`
  (OData) em visual-map/odata-map; dataset enriquecido cacheado 60s. ⚠️ **Taxonomia real validada**:
  `AGRUPACION1`=tipo (ARO/LENTE/LENTES DE CONTACTO), `AGRUPACION2`=material, `AGRUPACION3`=género
  (armações) ou tipo de lente; `COSTE_TOTAL` da linha vem preenchido p/ armações mas 0 p/ lentes lab
  (margem das lentes continua via entry-costs). Componente `components/charts/SplitBars.tsx`.
- **Análises de gestão (em Vendas/Clientes, Suspense)**: Top Marcas reais; **attach de
  progressivos/tratamentos**; **cross-sell 2º par/sol** (graduados sem sol, com drill-down);
  **recall clínico** (proxy por compras: optometria +2 anos / contactologia +1 ano);
  LC Diárias/Mensais com "data prevista de compra" (cx30→30/cx90→90/cx3→90/cx6→180 dias).
- **Stock**: `StockExplorer` (pesquisa + clicar abre histórico de movimentos + stock por loja via
  `/api/stock/[codigo]`). "Parado Há" = dias desde a ÚLTIMA ENTRADA (`lastEntryByArticle`).
- **Gráficos**: tendência compara com o **ano anterior** do mesmo período (análise restrita a 2 anos,
  ex.: 2026 vs 2025 — `TREND_PREV_YEARS=1`); botão "i" de info em todos os gráficos e KPIs
  (`components/charts/ChartInfo.tsx`).
- **Sidebar** reorganizado com **separadores neon** (`.neon-divider`).
- **Relatórios PDF** (réplica dos templates, `src/lib/reports/`): design system `pdf-kit.ts`
  (jsPDF client-side: formas diagonais, capa, top-3, barras, ranking). **Equipa** tem 2 botões
  ("óptica" + "clínica" = 2 PDF) com **datas livres De/Até** (intervalo arbitrário, não só seg-sáb);
  **Vendas** tem o botão mensal com **seletores separados de mês e ano**. O `to` enviado é o dia
  seguinte ao "Até" (limite exclusivo, ver `dateRangeFilter`); os PDFs mostram o intervalo real
  (`rangeLabel`). Dados em `visual-map`: `weeklyOpticaReport`, `weeklyClinicaReport` (optometristas
  via `VX_AGENDA` Usuario + conversão consulta→venda), `monthlyReport`. Rotas `/api/reports/*`
  (maxDuration 300). **Seguros** vêm da REST `FacturasClientes.Codigo_aseguradora` + nomes em
  **Admin → Seguradoras** (migração 010). **Comparticipação € por seguradora** = `Σ Importe_descuento`
  das faturas com seguradora (o € que o cliente NÃO pagou) — `monthlyInsurers` em visual-map; ver a
  secção "Entidades" abaixo para as particularidades validadas. **Compras por tipo**
  (página "COMPRAS MENSAIS"): `supplierPurchases` (OData) agregadas pelo **grupo** do fornecedor
  configurado no Admin (oftálmicas / LC+saúde / armações+sol — `supplier_config`); fornecedores sem
  grupo caem em "Sem grupo". **Páginas multi-série por vendedor** (`groupedHBarChart` no
  pdf-kit): "VENDAS POR FORNECEDOR - LENTES" (vendedor × top-6 fornecedores) e "LC por vendedor"
  (vendedor × diária/mensal/outras, com "GAMA DE LC" por baixo) — réplica do template.

## Performance (API lenta + 1 ligação)
- Carregar SÓ os artigos referenciados nas vendas do período (`articleIndexForRange` →
  `loadArticleIndexFor`, filtro OR em lotes de 100). NUNCA carregar o catálogo inteiro no caminho
  de vendas (~11.600 artigos, ~12s).
- Caches em memória: vendas por período (60s), artigos por período, clientes/colaboradores (30min),
  classe por linha + custos de entrada (OData) por período (60s), últimas entradas em stock (10min),
  recall clínico (10min).
- ⚠️ **Quando se restringe `fields`, todo o campo do FILTRO tem de constar em `fields`** (senão a
  REST dá 500 `'<campo>' field can't be used inside the where clause`). Apanhou `listEmployees`/`clients`.
- `salesTrend` compara o período com o **ano anterior** do mesmo período (alinhado por dia/mês;
  `TREND_PREV_YEARS=1` — análise a 2 anos, 2025-2026). 1 fetch por ano (2 total) → carrega em
  **Suspense**. O backfill diário também arranca em `now.getFullYear()-1` (só 2 anos).
- Operações pesadas em **Suspense** (não bloqueiam a página): alertas, tendência, **Stock e Clientes**
  (catálogo completo / janelas grandes / OData), recall clínico (Suspense próprio em Clientes),
  attach + cross-sell (Suspense próprios em Vendas).

### Pré-cálculo no Firestore (a API Visual NÃO é batida a cada visita)
A API Visual é lenta e só está acessível depressa a partir do **PC da loja**; a Vercel está noutra
região. Solução: o **PC da loja calcula e grava no Firestore**, a **Vercel só LÊ** (instantâneo).
Tudo via **Admin SDK** (a página já está protegida no proxy; agregados não-sensíveis).
- **Snapshots por preset** (coleção `dashboard_snapshots`): rota `POST /api/cron/precompute`
  (auth `CRON_SECRET` por `x-cron-key`/Bearer, `maxDuration=300`) pré-calcula os presets
  `today/week/month/last_month/quarter/year` via `visual-map` (sem o cache de 5 min do adapter) e faz
  upsert. Leitura: `src/lib/snapshots/store.ts` (`getSnapshot`/`saveSnapshot`).
- **Agregados diários** (coleção `daily_metrics`): rota `POST /api/cron/daily` constrói um
  resumo **aditivo por dia** (vendas, margem, por categoria, por colaborador). **Qualquer** intervalo
  (presets OU datas personalizadas 1–6 meses) = somar as linhas dos dias → instantâneo. Estratégia:
  mês atual + anterior recalculados sempre (apanha lançamentos atrasados); meses antigos só uma vez
  (backfill, do recente para o antigo). Lógica em `src/lib/snapshots/daily.ts`.
- **Leituras pesadas sem datas** (coleção `heavy_snapshots`): rota `POST /api/cron/heavy`
  pré-calcula **stock** (catálogo + entradas), **clientes**, **clientes de LC**, **pipeline**,
  **encomendas ativas** e **recall clínico** e faz upsert por chave (`stock`/`clients`/`contact_lens`/
  `pipeline`/`orders`/`clinical_recall`). Leitura: `src/lib/snapshots/heavy.ts`
  (`getStockSnapshot`/`getClientsSnapshot`/`getContactLensSnapshot`/`getPipelineSnapshot`/
  `getOrdersSnapshot`/`getClinicalRecallSnapshot`); o adapter lê o snapshot e só cai no cálculo ao
  vivo (cacheado) se estiver vazio. (Pipeline e recall clínico batiam a API ao vivo na Vercel → lentos.)
- **Dedup de alertas WhatsApp** (coleção `sent_alerts`): a rota `/api/cron/alerts` regista a
  "impressão digital" de cada alerta já enviado para não repetir o mesmo todos os dias
  (`src/lib/alerts/dedup.ts`). Acedido só pelo cron (Admin SDK).
- Os crons correm **no arranque do PC da loja** (não em Vercel Cron — ver commit `15e65d2`).
  `app/vercel.json` fixa a região `dub1` (Europa).

## Segurança (relatório Codex — todos os 7 itens tratados)
- **Acesso aos dados de controlo**: o SDK cliente do Firebase é usado SÓ para Firebase Auth; NUNCA lê/
  escreve Firestore. As regras `firestore.rules` **negam todo o acesso direto do cliente**
  (`allow read, write: if false`) — toda a leitura/escrita de `profiles`/`invite_codes`/etc. passa pelo
  Admin SDK no servidor, que contorna as regras. Campos sensíveis (`role`/`is_active`/`email`) só são
  alterados por rotas server-side com `requireSuperadmin`.
- **Enforcement** no proxy (porta única): sessão → `is_active` → 2FA configurado → 2FA verificado
  nesta sessão (cookie httpOnly assinado HMAC `of_2fa`, segredo `TWOFA_COOKIE_SECRET`). Páginas
  redirect, `/api` 401/403. `getSession` reforça (defesa em profundidade).
- **Registo por convite**: `/api/register` server-side com Admin SDK cria o utilizador no Firebase Auth
  → consome o código (doc `invite_codes/{código}`, transação) → reverte se falhar. O sign-up público
  do Firebase Auth deve estar limitado (registo só por esta rota).
- **API hardening** no proxy: CSRF (mutações de origem cruzada → 403), rate limit por IP
  (`lib/security/rate-limit.ts`), validação zod nas rotas de input.
- Headers de segurança em `next.config.ts` (X-Frame-Options, HSTS, e **CSP completa**: default-src
  self, object-src none, base-uri/form-action self, connect-src self + endpoints Firebase
  (Auth/Firestore/`googleapis.com`); script/style 'unsafe-inline' por causa do Next sem nonces).
- Credenciais SÓ em `.env.local` (gitignored). NUNCA hardcode nem em scripts.

## Firebase
A camada de controlo migrou de **Supabase → Firebase** (Auth + Firestore). Projeto `boavista-83c05`
(`.firebaserc`). Os pacotes `@supabase/*` e `pg` foram removidos; as migrações SQL em
`app/supabase/migrations/` são **histórico morto** (os números `00X` que aparecem nas secções acima
são só referência histórica — hoje são **coleções Firestore com o mesmo nome**).
- **Admin SDK** (`src/lib/firebase/admin.ts`, API modular `firebase-admin/app|auth|firestore`):
  `adminAuth`/`adminDb`. Credenciais via `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/
  `FIREBASE_PRIVATE_KEY` (service account; a private key no `.env.local` é uma linha com `\n` escapados,
  o código faz `.replace(/\\n/g,"\n")`). Sem credenciais → fallback inócuo `mock-project-id`.
- **SDK cliente** (`src/lib/firebase/client.ts`, `NEXT_PUBLIC_FIREBASE_*`): SÓ Firebase Auth, nunca
  Firestore direto.
- **Coleções Firestore**: `profiles` (com `permissions` array EMBUTIDO + flags `role`/`is_active`/
  `totp_enabled`/`totp_verified`), `monthly_targets`/`employee_targets` (1 doc por `YYYY-MM`, campo por
  categoria/usuario), `supplier_config` (inclui `rappel_tiers`), `aseguradora_config`,
  `saude_ocular_products` + `config/saude_ocular_products.codes`, `invite_codes` (doc id = código),
  `audit_logs`, `sent_alerts`, `totp_secrets` (cofre dos segredos TOTP, fora de `profiles`),
  e os pré-cálculos `dashboard_snapshots`/`daily_metrics`/`heavy_snapshots` (ver Performance).
- **Regras** `firestore.rules` negam todo o acesso direto do cliente (deploy:
  `firebase deploy --only firestore:rules`). Índices em `firestore.indexes.json`.
- **Auditoria**: `src/lib/auth/audit.ts` (`logAudit`) escreve em `audit_logs`.
- **2FA TOTP** continua custom (otplib + cookie `of_2fa`); segredo no cofre `totp_secrets`.
- **Superadmin**: criar com `node scripts/seed-superadmin.mjs <email> <password> ["Nome"]`
  (cria no Auth + doc `profiles/{uid}` role=superadmin); 1º login → `/2fa/setup` (TOTP).

## Env vars (.env.local — ver .env.local.example)
`NEXT_PUBLIC_FIREBASE_*` (API_KEY/AUTH_DOMAIN/PROJECT_ID/STORAGE_BUCKET/MESSAGING_SENDER_ID/APP_ID),
`FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` (service account, Admin SDK),
`TWOFA_COOKIE_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_*`, `WAHA_*`,
`ALERT_*` (limiares, incl. `ALERT_MIN_TREATMENT_PCT`), `VISUAL_*` (REST), **`ODATA_URL`/`ODATA_USER`/
`ODATA_PASSWORD`** (OData), `USE_MOCK_DATA=false`.

## Convenções
- **Tema claro/escuro**: as cores NEUTRAS (fundos/texto/bordas) são **tokens `@theme`** em
  `globals.css`; o escuro é o default e `html.light` sobrepõe as MESMAS variáveis `--color-*` com
  valores claros → trocar a classe `light` no `<html>` reformula tudo. **NUNCA usar hex neutro à mão**
  (`bg-[#111827]`, `text-[#f9fafb]`…) — usar as utilities semânticas (`bg-bg-card`, `text-text-primary`,
  `text-text-secondary`, `text-text-muted`, `text-text-strong`, `border-border`, `border-border-subtle`,
  `bg-bg-base`/`bg-bg-sidebar`/`bg-bg-elevated`/`bg-bg-card-hover`, `bg-success-bg`/`warning-bg`/`danger-bg`).
  Nas strings de cor dos gráficos (Recharts) usar `var(--color-...)`. As cores de **marca/semânticas**
  (azul `#3b82f6`, verde `#10b981`, vermelho `#ef4444`, âmbar `#f59e0b`, roxo `#8b5cf6`) ficam **fixas**
  em ambos os temas (hex literal é OK). Toggle: `components/layout/ThemeToggle.tsx` (no TopBar,
  `useSyncExternalStore` + localStorage `theme`); script anti-flash no `layout.tsx` aplica o tema antes
  da hidratação. **`lib/reports/*` (PDFs) NÃO usam tema** — cores próprias, não mexer.
- Páginas server-component obtêm dados via adapter; secções pesadas em `<Suspense>`.
- otplib é **v13** (API funcional: `generateSecret`/`generateURI`/`verifySync({...,epochTolerance})`,
  já NÃO há `authenticator`).
- Nunca expor segredos no cliente nem em scripts (Codex apanhou scripts `_*.mjs` com a password —
  já removidos).
- Logo em `public/logo.png`; loading com efeito neon em `components/layout/NeonLoader.tsx`
  (+ `app/(dashboard)/loading.tsx`). Logo no sidebar, login e registo.

## Por configurar / pendente
Estado do `.env.local` (verificado): `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_PROJECT_ID/CLIENT_EMAIL/
PRIVATE_KEY` (service account), `WAHA_URL`, `ALERT_WHATSAPP_NUMBER`, `RESEND_API_KEY`, `ODATA_*`,
`VISUAL_*`, `CRON_SECRET` e `VERCEL_TOKEN` estão **preenchidos**. ⚠️ Os mesmos `FIREBASE_*` têm de
estar também na **Vercel** (env de produção). Em **produção** (Vercel + `www.opticaboavista.com`).
- ✅ **Superadmin criado** no Firebase (`jokimen24@gmail.com`); falta o 1º login + `/2fa/setup`.
- ✅ **`WAHA_API_KEY` vazio é CORRETO** — verificado: a instância WAHA corre **aberta** (sem chave);
  `GET {WAHA_URL}/api/sessions` devolve 200 e a sessão `default` está `WORKING`. Não mexer.
- ⏳ **Sign-up público do Firebase Auth**: confirmar que está limitado (registo só pela rota
  `/api/register` por convite, Admin SDK). Novos perfis nascem `is_active=false` + proxy bloqueia inativos.
- ✅ **Credenciais Visual** completas e verificadas (login OK, token + dados reais). Dado como
  resolvido — a rotação da password era só higiene opcional, fica ao critério do dono.
- ✅ **Regras Firestore publicadas** (2026-07-15): `firebase deploy --only firestore:rules` feito e
  verificado com o SDK cliente — leitura, listagem, escrita e o cofre `totp_secrets` dão todos
  `permission-denied`. O Admin SDK contorna-as (app OK). Republicar sempre que `firestore.rules` mudar.
- **Operacional (na UI, pelo dono)**: o pré-mapeamento de **44 fornecedores** por marca (14 oftálmicas /
  12 LC+saúde / 18 armações+sol) estava em `app/scripts/supplier_groups_premap.sql` (Supabase, histórico).
  ✅ `supplier_config` **semeado no Firestore** (35 grupos, 2026-07-13) — o premap SQL é histórico morto.
  Falta: confirmar 3 marcados ⚠️ (Zeiss3/A.Winter, Indo, Seiko) e atribuir grupo aos restantes
  distribuidores PT genéricos (Admin → Fornecedores). 3 grupos: aros+sol JUNTOS (`armacoes_sol`).
  Definir também objetivos mensais (Admin → Objetivos — alimentam Dashboard, Hoje e alertas de ritmo).
- ✅ Já resolvidos (não mexer): margem das lentes (custo via `VX_LINEAS_ENTRADA`); WAHA URL + número
  de alertas configurados (envio dispara no arranque do PC da loja).

## Notes
Hoje (sistema) está em 2026; há dados reais em 2025 e 2026. Para validar números num período com
movimento, usar o seletor de período (incl. "Personalizado" com datas de/até).
