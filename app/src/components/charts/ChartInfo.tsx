"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { MARGIN_MIN_COVERAGE } from "@/lib/utils";

/**
 * Botão de informação ("i") para gráficos. Cada gráfico passa um `id`; o texto
 * explicativo vive no registo abaixo, para ficar centralizado e fácil de editar.
 * Uso: `<ChartInfo id="sales-trend" />` ao lado do título do gráfico.
 */

type InfoEntry = { title: string; body: ReactNode };

const Li = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-2">
    <span className="text-[#3b82f6] mt-0.5">•</span>
    <span>{children}</span>
  </li>
);

export const CHART_INFO: Record<string, InfoEntry> = {
  "sales-trend": {
    title: "Evolução de Vendas",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>
          Mostra a <strong>venda líquida</strong> (já sem descontos) do período escolhido,
          comparada com o <strong>mesmo período do ano anterior</strong>.
        </p>
        <ul className="space-y-1.5">
          <Li>Uma linha por ano; a do ano atual está a cheio e em destaque, as anteriores a tracejado.</Li>
          <Li>Se filtrares um mês, compara com o mesmo mês do ano anterior; num período personalizado, compara com o intervalo homólogo do ano anterior.</Li>
          <Li>Os pontos são por dia (períodos curtos) ou por mês (períodos longos).</Li>
          <Li>Anos sem dados (loja ainda não existia) não aparecem.</Li>
        </ul>
      </div>
    ),
  },
  category: {
    title: "Vendas por Categoria",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>
          Reparte a <strong>venda líquida</strong> do período por tipo de produto. Cada
          <strong> linha de venda</strong> conta na sua categoria, de forma independente
          (classificação do próprio sistema Visual):
        </p>
        <ul className="space-y-1.5">
          <Li><strong>Lentes Oftálmicas</strong> — lentes graduadas (incl. lentes de laboratório por encomenda).</Li>
          <Li><strong>Armações</strong> — armações/montagens.</Li>
          <Li><strong>Óculos de Sol</strong> — óculos de sol.</Li>
          <Li><strong>Lentes de Contacto</strong> — lentes de contacto e descartáveis.</Li>
          <Li><strong>Saúde Ocular</strong> — lágrimas artificiais, líquidos de manutenção e outros produtos da lista definida no Admin.</Li>
          <Li><strong>Diversos</strong> — tudo o resto (acessórios, serviços, etc.).</Li>
        </ul>
        <p className="text-xs text-text-muted">
          A percentagem de margem por categoria é calculada só sobre as vendas com custo conhecido.
        </p>
      </div>
    ),
  },
  "kpi-vendas": {
    title: "Vendas do Mês — como é calculado",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Soma da <strong>venda líquida</strong> de todas as vendas concretizadas do período (exclui orçamentos).</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          venda líquida = preço bruto − desconto de linhas − desconto global
        </p>
        <ul className="space-y-1.5">
          <Li>Valores <strong>sem IVA</strong>.</Li>
          <Li>Inclui <strong>todas</strong> as linhas (armações, lentes, contacto, etc.).</Li>
        </ul>
      </div>
    ),
  },
  "kpi-margem-bruta": {
    title: "Margem Bruta (€) — como é calculada",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Lucro estimado: venda líquida menos o <strong>custo</strong> dos produtos vendidos.</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          margem = vendas (com custo conhecido) − custo
        </p>
        <ul className="space-y-1.5">
          <Li>Só conta nas linhas onde <strong>conhecemos o custo</strong> (preço de compra no catálogo).</Li>
          <Li>As <strong>lentes graduadas de laboratório</strong> não têm custo exposto pelo sistema → contam nas vendas mas <strong>não</strong> na margem. Por isso a margem é conservadora (nunca inventamos custos).</Li>
        </ul>
      </div>
    ),
  },
  "kpi-margem-pct": {
    title: "Margem % — como é calculada",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Percentagem de lucro sobre as vendas <strong>com custo conhecido</strong>.</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          margem % = margem ÷ vendas (com custo conhecido) × 100
        </p>
        <ul className="space-y-1.5">
          <Li>O divisor são só as vendas com custo — <strong>não</strong> o total. Senão a margem apareceria diluída pelas lentes sem custo conhecido.</Li>
        </ul>
      </div>
    ),
  },
  "kpi-ticket": {
    title: "Ticket Médio — como é calculado",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Valor médio gasto por venda.</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          ticket médio = vendas líquidas ÷ nº de vendas
        </p>
      </div>
    ),
  },
  "kpi-num-vendas": {
    title: "Nº de Vendas — como é calculado",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Número de vendas <strong>concretizadas</strong> no período. Os orçamentos não contam (só quando se transformam em venda).</p>
      </div>
    ),
  },
  "kpi-conversao": {
    title: "Taxa de Conversão — como é calculada",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Quantos dos <strong>orçamentos feitos</strong> no período acabaram em <strong>encomenda</strong>.</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          conversão = orçamentos convertidos ÷ orçamentos feitos × 100
        </p>
        <ul className="space-y-1.5">
          <Li>«Convertido» = o orçamento <strong>gerou encomenda</strong> (a linha ganhou nº de encargo no Visual) — não é uma aproximação.</Li>
          <Li>Um orçamento que ficou só em cotação (sem encomenda) conta como não convertido.</Li>
        </ul>
      </div>
    ),
  },
  "kpi-descontos": {
    title: "Descontos — como é calculado",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Total de descontos concedidos no período (descontos de linha + desconto global das vendas).</p>
      </div>
    ),
  },
  "emp-vendas": {
    title: "Vendas do vendedor — como é calculado",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Soma da <strong>venda líquida</strong> das vendas atribuídas a este vendedor (campo <em>Usuario</em> da venda), no período escolhido.</p>
        <p>O valor por baixo (▲/▼) compara com o <strong>mesmo período do ano anterior</strong>.</p>
      </div>
    ),
  },
  "emp-roi": {
    title: "ROI do vendedor (margem € gerada)",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>O <strong>lucro em €</strong> que o vendedor gerou: venda líquida menos o custo dos produtos.</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          ROI = vendas (com custo conhecido) − custo
        </p>
        <ul className="space-y-1.5">
          <Li>Não há salários/custos do vendedor na API — por isso o «retorno» é medido pela <strong>margem gerada</strong>.</Li>
          <Li>As lentes de laboratório sem custo exposto não entram (margem conservadora).</Li>
        </ul>
      </div>
    ),
  },
  "emp-orcamentos": {
    title: "Orçamentos — feitos vs convertidos",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p><strong>Feitos</strong> = orçamentos emitidos pelo vendedor. <strong>Convertidos</strong> = os que geraram <strong>encomenda</strong> (a linha ganhou nº de encargo no Visual).</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          conversão = convertidos ÷ feitos × 100
        </p>
      </div>
    ),
  },
  "emp-armacoes-sol": {
    title: "Armações vs Óculos de Sol",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Venda líquida e unidades das linhas de <strong>armações</strong> (classe G) e de <strong>óculos de sol</strong> (classe S) deste vendedor.</p>
        <p>Por baixo, o valor do mesmo período do ano anterior.</p>
      </div>
    ),
  },
  "emp-lentes-tipo": {
    title: "Lentes oftálmicas por tipo",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Unidades de lentes graduadas por tipo — <strong>monofocais</strong>, <strong>progressivos</strong> e <strong>bifocais</strong>.</p>
        <p className="text-xs text-text-muted">O tipo vem da ficha da linha no Visual (AGRUPACION/tipo de graduação); o que não é classificável fica de fora.</p>
      </div>
    ),
  },
  "emp-marcas": {
    title: "Marcas que mais vende",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Top de <strong>marcas</strong> por unidades vendidas pelo vendedor no período. Nas lentes oftálmicas, a «marca» é o fornecedor/laboratório.</p>
      </div>
    ),
  },
  "emp-fornecedores-peso": {
    title: "Peso por fornecedor",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Quanto pesa cada <strong>fornecedor</strong> nas vendas do vendedor, em % do <strong>valor</strong> de venda do período.</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          peso % = vendas do fornecedor ÷ vendas totais do vendedor × 100
        </p>
      </div>
    ),
  },
  "emp-por-entregar": {
    title: "Vendas por entregar",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Linhas já <strong>vendidas mas ainda não entregues</strong> ao cliente, pelo <strong>estado</strong> da linha no Visual.</p>
        <ul className="space-y-1.5">
          <Li><strong>Por entregar</strong> / <strong>Recebido</strong> / <strong>Pedido ao fornecedor</strong> / <strong>Pendente de envio</strong> / <strong>Entrega parcial</strong>.</Li>
          <Li>Já entregue, cancelado e devolvido não aparecem.</Li>
        </ul>
      </div>
    ),
  },
  "kpi-cobertura": {
    title: "Cobertura da margem — o que é",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Percentagem do <strong>valor de venda</strong> em que <strong>conhecemos o custo</strong> (e portanto entra no cálculo da margem).</p>
        <ul className="space-y-1.5">
          <Li>Quanto maior, mais fiável é a % de margem mostrada.</Li>
          <Li>As lentes de laboratório sem custo exposto baixam a cobertura.</Li>
        </ul>
      </div>
    ),
  },
  "sup-best-sellers": {
    title: "Best sellers",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Produtos deste fornecedor mais vendidos no período, por <strong>unidades</strong> (com vendas € e margem onde há custo).</p>
      </div>
    ),
  },
  "sup-ranking": {
    title: "Ranking de vendedores",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Quem mais vende deste fornecedor, por <strong>valor</strong>, com unidades, nº de vendas e o <strong>produto-estrela</strong> (o que mais vende dele).</p>
      </div>
    ),
  },
  "sup-genero": {
    title: "Comprador por género",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Género do <strong>cliente que comprou</strong> (do registo do cliente no Visual) — não o género-alvo do produto.</p>
      </div>
    ),
  },
  "sup-idade": {
    title: "Comprador por faixa etária",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Idade do cliente à data da compra (da data de nascimento no registo). Clientes sem data não entram.</p>
      </div>
    ),
  },
  "sup-armacoes": {
    title: "Armações / Óculos de sol",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Repartição por <strong>género-alvo</strong> e por <strong>material</strong> — campos da ficha do produto no Visual (não estimativas).</p>
      </div>
    ),
  },
  "sup-lc": {
    title: "Lentes de contacto",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p><strong>Periodicidade</strong> (diárias/mensais/…) lida da descrição; <strong>tipo ótico</strong> (esférica/tórica/multifocal) pela prescrição (esfera/cilindro/adição).</p>
      </div>
    ),
  },
  "sup-lentes": {
    title: "Lentes oftálmicas",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Tipo (monofocal/progressiva/bifocal), <strong>2º par</strong> (vendas que levaram graduado + sol) e, quando aplicável, SmartLife por vendedor.</p>
      </div>
    ),
  },
  "pipeline-funnel": {
    title: "Funil do Pipeline",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>
          Mostra quantas encomendas/trabalhos estão em cada <strong>estado</strong>, do pedido
          até à entrega ao cliente.
        </p>
        <ul className="space-y-1.5">
          <Li>Cada barra é um estado; o comprimento é proporcional ao nº de encomendas nesse estado.</Li>
          <Li>Ajuda a ver onde há acumulação (ex.: muitas prontas por entregar ou pedidos por enviar).</Li>
        </ul>
      </div>
    ),
  },
  "stock-brand": {
    title: "Análise por marca",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>
          Cruza o <strong>stock atual</strong> da marca com as unidades
          <strong> vendidas e compradas</strong> nos últimos 4 anos.
        </p>
        <ul className="space-y-1.5">
          <Li>O histórico de 4 anos vem do snapshot <code>brand_history</code>, pré-calculado no PC da loja (a API Visual é lenta a partir da Vercel).</Li>
          <Li><strong>Rotação por modelo</strong> = unidades vendidas em 4 anos ÷ stock atual. Alta = vende-se bem, repor; baixa = parado, não repor.</Li>
          <Li>As repartições (categoria, material, género) são contagens de peças sobre o stock atual da marca.</Li>
        </ul>
      </div>
    ),
  },
  "entidades-vendas": {
    title: "Vendas por Entidade",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>As <strong>vendas</strong> com seguro do período filtrado, por entidade. A seguradora só está na <strong>fatura</strong> (a venda não a regista), mas a fatura diz a que venda pertence — daí tudo o resto sair da venda.</p>
        <ul className="space-y-1.5">
          <Li><strong>Nº de vendas</strong> = vendas reais (não faturas: uma venda gera vários documentos).</Li>
          <Li><strong>Valor total</strong> = venda líquida, ou seja o que o cliente pagou.</Li>
          <Li><strong>Comparticipação</strong> = o € que o cliente <strong>não pagou</strong> por ter seguro.</Li>
          <Li><strong>Desconto médio</strong> = essa comparticipação a dividir pelo nº de vendas — é a média em vez do total.</Li>
        </ul>
        <p className="text-xs text-text-muted">Entidades sem nome aparecem como &quot;Seguro «código»&quot;: o Visual não guarda o nome da seguradora. Dá-lhes nome em Admin → Seguradoras.</p>
      </div>
    ),
  },
  "entidades-margem": {
    title: "Margem das vendas com seguro",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Margem <strong>real</strong> das vendas desta entidade: custo do maestro para os artigos de stock e, nas <strong>encomendas</strong> (lentes), o custo verdadeiro da cadeia <strong>entrada → fatura do fornecedor</strong>.</p>
        <ul className="space-y-1.5">
          <Li>Calculada só sobre as linhas <strong>com custo conhecido</strong> — a <strong>cobertura</strong> diz sobre que % do valor.</Li>
          <Li>Num mês fechado a cobertura anda pelos <strong>~94%</strong>. Se estiver bem mais baixa, é porque as <strong>faturas do laboratório ainda não chegaram</strong> — é a cobertura que está incompleta, não a margem que é má.</Li>
        </ul>
      </div>
    ),
  },
  "fat-seguros-desc": {
    title: "Descontos por Seguradora",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Desconto <strong>médio</strong> concedido em vendas com cada <strong>seguradora</strong> e o total <strong>comparticipado</strong> (o que o cliente não pagou por ter seguro).</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          desc. médio % = Σ comparticipação ÷ Σ valor bruto das faturas
        </p>
        <ul className="space-y-1.5">
          <Li>Cada venda com seguro gera faturas em que o <strong>Importe_descuento</strong> é a comparticipação da seguradora.</Li>
          <Li>Só contam as <strong>seguradoras mapeadas</strong> em Admin → Seguradoras (as outras não têm nome).</Li>
        </ul>
      </div>
    ),
  },
  "caixa-por-dia": {
    title: "Recebido por Dia",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Total <strong>recebido em caixa</strong> por dia (só «Ventas generales» — exclui fundos de abertura/fecho, pagamentos a fornecedores e devoluções).</p>
        <ul className="space-y-1.5">
          <Li>Clica numa linha para <strong>abrir o detalhe do dia</strong>: repartição por <strong>forma de pagamento</strong> e por <strong>vendedor</strong>.</Li>
          <Li>É dinheiro efetivamente recebido nesse dia — pode não coincidir com as vendas do dia (entregas/pagamentos diferidos).</Li>
        </ul>
      </div>
    ),
  },
  "kpi-margem-cobertura": {
    title: "Margem % — porque às vezes aparece «—»",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>A margem só é mostrada quando temos o <strong>custo da maior parte do que foi vendido</strong> (cobertura ≥ {`${MARGIN_MIN_COVERAGE}`}%).</p>
        <ul className="space-y-1.5">
          <Li>As <strong>lentes de laboratório</strong> só ganham custo quando a <strong>fatura do fornecedor</strong> é rececionada — o que demora dias/semanas.</Li>
          <Li>Enquanto a cobertura está baixa (mês recente), a margem seria <strong>enganadora</strong> (só refletia armações/sol). Por isso mostra-se <strong>«—»</strong> até haver dados suficientes.</Li>
          <Li>Em meses já liquidados a margem aparece normalmente.</Li>
        </ul>
      </div>
    ),
  },
  "clientes-novos": {
    title: "Novos este Mês — como é calculado",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Clientes cuja <strong>data de alta</strong> (registo no Visual) cai no <strong>mês civil corrente</strong>.</p>
        <ul className="space-y-1.5">
          <Li>Conta o <strong>registo</strong> do cliente, não a última compra.</Li>
          <Li>Depende do pré-cálculo de clientes (cron <code>heavy</code>) — só aparece depois de o snapshot incluir a data de alta.</Li>
        </ul>
      </div>
    ),
  },
  "hoje-objetivo": {
    title: "Objetivo do Dia — como é calculado",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>Parte do <strong>objetivo global do mês</strong> (Admin → Objetivos) dividido pelos <strong>dias úteis</strong> do mês (segunda a sábado).</p>
        <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
          objetivo do dia = objetivo global do mês ÷ dias úteis
        </p>
        <ul className="space-y-1.5">
          <Li>Se não houver objetivo global definido, aparece <strong>«Sem objetivo»</strong>.</Li>
          <Li>Um valor estranho (ex.: 1€) significa que o <strong>objetivo global desse mês está mal preenchido</strong> no Admin → Objetivos.</Li>
        </ul>
      </div>
    ),
  },
  "stock-brand-benchmark": {
    title: "Comparação com a média (armações/sol)",
    body: (
      <div className="space-y-3 text-sm text-text-strong">
        <p>
          Posiciona esta marca face ao <strong>conjunto de todas as marcas de armações e óculos de sol</strong> da loja.
        </p>
        <ul className="space-y-1.5">
          <Li><strong>Margem do stock</strong> = (PVP − custo) ÷ PVP do stock atual.</Li>
          <Li><strong>Margem das vendas</strong> = lucro ÷ faturação nos últimos 4 anos (custo real da linha).</Li>
          <Li><strong>Rotação</strong> = unidades vendidas em 4 anos ÷ stock atual.</Li>
          <Li><strong>Ticket médio</strong> = faturação ÷ unidades vendidas (4 anos).</Li>
          <Li>A <strong>média</strong> é o valor global da categoria (todas as marcas juntas). O <strong>percentil</strong> diz quantas marcas ficam abaixo desta.</Li>
        </ul>
        <p className="text-xs text-text-muted">Custo e faturação por linha vêm fiáveis para armações/sol (campos COSTE_TOTAL/IMPORTE_TOTAL do Visual).</p>
      </div>
    ),
  },
};

export function ChartInfo({ id, size = 14 }: { id: keyof typeof CHART_INFO | string; size?: number }) {
  const [open, setOpen] = useState(false);
  const entry = CHART_INFO[id];
  if (!entry) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`O que mostra: ${entry.title}`}
        title="O que mostra este gráfico?"
        className="inline-flex items-center justify-center rounded-full w-5 h-5 text-text-muted hover:text-[#3b82f6] hover:bg-border transition-colors"
      >
        <Info size={size} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={entry.title} size="md">
        {entry.body}
      </Modal>
    </>
  );
}
