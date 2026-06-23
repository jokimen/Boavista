/**
 * Design system de PDF — réplica do template dos relatórios Opticalia.
 *
 * Cliente-side (jsPDF corre no browser). Sem imports de servidor. Fornece
 * primitivas reutilizáveis que desenham as páginas tal como nos modelos:
 * capa, formas diagonais (coral/azul-escuro), cabeçalhos, blocos "top 3" com
 * círculos, gráficos de barras (vertical/horizontal), rankings e contracapa.
 *
 * Unidades em mm; página A4 retrato (210 × 297).
 */
import type { jsPDF } from "jspdf";

// ─── Paleta (cores do template) ───────────────────────────────────────────────
export const NAVY = "#0e2d46";
export const CORAL = "#f94c3b";
export const INK = "#3f4651";
export const GREYTXT = "#8a9099";
export const LIGHT = "#ededed";
export const WHITE = "#ffffff";

export const PAGE_W = 210;
export const PAGE_H = 297;

/** Paleta de séries (para barras multi-categoria), aproximada ao template. */
export const SERIES = [
  "#f94c3b", "#5b3f7a", "#f4a64b", "#f1693f", "#fc6f5f", "#2f6f9f",
  "#f4cf2e", "#f59e0b", "#e8731f", "#c9b79a", "#a8423f", "#1c1c1c",
  "#5a8a86", "#8a7a1f",
];

type RGB = [number, number, number];
function rgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function fill(doc: jsPDF, hex: string) { const [r, g, b] = rgb(hex); doc.setFillColor(r, g, b); }
function stroke(doc: jsPDF, hex: string) { const [r, g, b] = rgb(hex); doc.setDrawColor(r, g, b); }
function text(doc: jsPDF, hex: string) { const [r, g, b] = rgb(hex); doc.setTextColor(r, g, b); }

/** Formata número à PT: 13 673,25 / 1 476. */
export function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─── Decoração de página ──────────────────────────────────────────────────────

/** Canto coral (triângulo) em cima à esquerda + banda azul diagonal à direita. */
export function decorHeader(doc: jsPDF) {
  fill(doc, CORAL);
  doc.triangle(0, 0, 95, 0, 0, 70, "F"); // triângulo coral canto sup. esquerdo
  fill(doc, NAVY);
  // banda diagonal azul no canto superior direito
  doc.triangle(PAGE_W, 0, PAGE_W, 38, PAGE_W - 70, 0, "F");
  fill(doc, CORAL);
  doc.triangle(PAGE_W - 70, 0, PAGE_W, 38, PAGE_W - 52, 0, "F");
}

/** Rodapé com número de página (canto inferior direito, cinza). */
export function pageNumber(doc: jsPDF, n: number) {
  text(doc, GREYTXT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(String(n), PAGE_W - 12, PAGE_H - 10, { align: "right" });
}

/** Título de secção centrado (uma ou mais linhas), a azul-escuro. */
export function sectionTitle(doc: jsPDF, lines: string[], y = 52) {
  text(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  let yy = y;
  for (const l of lines) { doc.text(l, PAGE_W / 2, yy, { align: "center" }); yy += 11; }
  return yy;
}

// ─── Capa e contracapa ────────────────────────────────────────────────────────

export function coverPage(doc: jsPDF, opts: { title: string; subtitle: string; author?: string; role?: string }) {
  // metade inferior coral em diagonal
  fill(doc, NAVY); doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  fill(doc, CORAL);
  doc.triangle(0, PAGE_H, PAGE_W, PAGE_H, PAGE_W, 70, "F");
  // título
  text(doc, WHITE); doc.setFont("helvetica", "bold"); doc.setFontSize(34);
  doc.text(opts.title.toUpperCase(), 20, 175);
  stroke(doc, NAVY); doc.setLineWidth(1.2); doc.line(20, 184, 120, 184);
  text(doc, WHITE); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(opts.subtitle, 20, 200);
  if (opts.author) {
    text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("REALIZADO POR:", PAGE_W - 20, 232, { align: "right" });
    doc.text(opts.author.toUpperCase(), PAGE_W - 20, 244, { align: "right" });
    if (opts.role) doc.text(opts.role.toUpperCase(), PAGE_W - 20, 252, { align: "right" });
  }
}

export function closingPage(doc: jsPDF, lines = ["OBRIGADO", "PELA", "CONFIANÇA"]) {
  fill(doc, WHITE); doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  fill(doc, NAVY); doc.triangle(0, PAGE_H, 70, PAGE_H, 0, PAGE_H - 40, "F");
  fill(doc, CORAL); doc.triangle(70, PAGE_H, 150, PAGE_H, 150, PAGE_H - 35, "F");
  stroke(doc, CORAL); doc.setLineWidth(1.5); doc.line(28, 120, 60, 120);
  text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(30);
  let y = 145; for (const l of lines) { doc.text(l, 28, y); y += 14; }
}

// ─── Bloco "Top 3" (círculos com nome + valor) ────────────────────────────────

export interface TopItem { name: string; value: string; pct?: string; unit?: string }

export function topThreeBlock(doc: jsPDF, items: TopItem[], startY = 78) {
  const rowH = 58;
  // Composição centrada na página (réplica do template): círculo coral ~ao centro,
  // nome à esquerda, valor + unidade à direita.
  const CIRC_X = 102, CIRC_R = 19;
  const BLOCK_L = 14;                                   // borda esquerda do bloco cinza
  const NAME_CX = (BLOCK_L + (CIRC_X - CIRC_R)) / 2;    // centro do bloco cinza (à esquerda do círculo)
  const VALUE_X = CIRC_X + CIRC_R + 4; // valor/unidade alinhados à esquerda, após o círculo
  items.slice(0, 3).forEach((it, i) => {
    const cy = startY + i * rowH + 22;
    // triângulo de fundo cinza-claro (decorativo)
    fill(doc, LIGHT);
    doc.triangle(BLOCK_L, cy + 16, CIRC_X - 6, cy - 16, BLOCK_L, cy + 16, "F");
    doc.rect(BLOCK_L, cy - 2, CIRC_X - 20, 18, "F");
    // círculo coral
    fill(doc, CORAL); doc.circle(CIRC_X, cy, CIRC_R, "F");
    if (it.pct) { text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(it.pct, CIRC_X, cy + 1.5, { align: "center" }); }
    // nome: centrado no bloco cinza (horizontal e vertical).
    // O retângulo vai de cy-2 a cy+16 → centro vertical em cy+7 (baseline "middle").
    text(doc, GREYTXT); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(it.name.toUpperCase(), NAME_CX, cy + 7, { align: "center", baseline: "middle" });
    // valor grande (coral) + unidade por baixo, ambos alinhados à mesma margem
    text(doc, CORAL); doc.setFont("helvetica", "bold"); doc.setFontSize(27);
    doc.text(it.value, VALUE_X, cy);
    if (it.unit) { text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(it.unit, VALUE_X, cy + 8); }
  });
}

// ─── Gráfico de barras vertical ───────────────────────────────────────────────

export interface BarDatum { label: string; value: number; color?: string }

export function vBarChart(doc: jsPDF, data: BarDatum[], opts: { x?: number; y?: number; w?: number; h?: number; yLabel?: string } = {}) {
  const x = opts.x ?? 22, y = opts.y ?? 80, w = opts.w ?? PAGE_W - 44, h = opts.h ?? 90;
  const niceMax = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const n = data.length;
  const gap = w / n;
  const barW = Math.min(gap * 0.62, 13);
  // grelha + escala (esquerda)
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  for (let g = 0; g <= 4; g++) {
    const gy = y + h - (h * g) / 4;
    stroke(doc, "#ededed"); doc.setLineWidth(0.2); doc.line(x, gy, x + w, gy);
    text(doc, GREYTXT); doc.text(fmt((niceMax * g) / 4), x - 2, gy + 1.4, { align: "right" });
  }
  // eixos
  stroke(doc, "#bdbdbd"); doc.setLineWidth(0.3);
  doc.line(x, y, x, y + h); doc.line(x, y + h, x + w, y + h);
  // Rótulos: horizontais e centrados quando cabem na largura da banda (poucos, ou
  // muitos mas curtos — ex.: faixas etárias "0-9"…"90-99"); senão rotacionados 90°
  // (ex.: nomes de vendedores compridos quando são muitos).
  const labelSize = n <= 6 ? 8 : 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(labelSize);
  const horizFit = data.every((d) => doc.getTextWidth(d.label.toUpperCase()) <= gap - 1.5);
  data.forEach((d, i) => {
    const cx = x + i * gap + gap / 2;
    const bx = cx - barW / 2;
    const bh = Math.max((h * d.value) / niceMax, 0);
    fill(doc, d.color ?? SERIES[i % SERIES.length]);
    doc.rect(bx, y + h - bh, barW, bh, "F");
    // valor acima da barra
    text(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(fmt(d.value), cx, y + h - bh - 1.6, { align: "center" });
    // rótulo abaixo do eixo
    text(doc, INK); doc.setFontSize(labelSize);
    if (n <= 6 || horizFit) doc.text(d.label.toUpperCase(), cx, y + h + (n <= 6 ? 5 : 4), { align: "center" });
    else doc.text(d.label.toUpperCase(), cx + 1.6, y + h + 2, { angle: 90, align: "right" });
  });
  // rótulo do eixo Y (rotacionado à esquerda)
  if (opts.yLabel) {
    text(doc, GREYTXT); doc.setFontSize(7);
    doc.text(opts.yLabel, x - 9, y + h / 2, { angle: 90, align: "center" });
  }
}

// ─── Gráfico de barras horizontal ─────────────────────────────────────────────

export function hBarChart(doc: jsPDF, data: BarDatum[], opts: { x?: number; y?: number; w?: number; h?: number; labelW?: number; valueFmt?: (n: number) => string } = {}) {
  const x = opts.x ?? 50, y = opts.y ?? 80, w = opts.w ?? PAGE_W - 80, h = opts.h ?? 100;
  const niceMax = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const n = data.length;
  const rowH = Math.min(h / Math.max(n, 1), 15);
  const barH = Math.min(rowH * 0.6, 7);
  // eixo vertical (base das barras)
  stroke(doc, "#bdbdbd"); doc.setLineWidth(0.3); doc.line(x, y, x, y + n * rowH);
  data.forEach((d, i) => {
    const ry = y + i * rowH + rowH / 2;
    // nome: à esquerda do eixo, alinhado à direita (encostado às barras)
    text(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(d.label.toUpperCase(), x - 2, ry + 1.2, { align: "right" });
    const bw = Math.max((w * d.value) / niceMax, 0.4);
    fill(doc, d.color ?? SERIES[i % SERIES.length]);
    doc.rect(x, ry - barH / 2, bw, barH, "F");
    // valor à direita da barra
    text(doc, INK); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text((opts.valueFmt ?? fmt)(d.value), x + bw + 2, ry + 1.2, { align: "left" });
  });
}

// ─── Gráfico de barras horizontais AGRUPADAS (multi-série) ────────────────────
// Cada grupo (ex.: vendedor) tem uma barra por série (ex.: fornecedor de lentes).
// Réplica das páginas "VENDAS POR FORNECEDOR - LENTES" e "LC por vendedor".

export interface BarGroup { label: string; values: number[] }

export function groupedHBarChart(
  doc: jsPDF,
  groups: BarGroup[],
  series: { name: string; color: string }[],
  opts: { x?: number; y?: number; w?: number; h?: number; valueFmt?: (n: number) => string; xLabel?: string; yLabel?: string } = {},
) {
  const x = opts.x ?? 48, y = opts.y ?? 85, w = opts.w ?? 120, h = opts.h ?? 150;
  const fmtV = opts.valueFmt ?? ((n: number) => fmt(n));
  const niceMax = niceCeil(Math.max(1, ...groups.flatMap((g) => g.values)));
  const G = Math.max(groups.length, 1);
  const S = Math.max(series.length, 1);
  const bandH = h / G;
  const barH = Math.min((bandH * 0.82) / S, 4.2);
  const usedH = barH * S;

  // grelha vertical + escala (eixo X em baixo)
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  for (let g = 0; g <= 4; g++) {
    const gx = x + (w * g) / 4;
    stroke(doc, "#ededed"); doc.setLineWidth(0.2); doc.line(gx, y, gx, y + h);
    text(doc, GREYTXT); doc.text(fmt((niceMax * g) / 4), gx, y + h + 4, { align: "center" });
  }
  // eixos
  stroke(doc, "#bdbdbd"); doc.setLineWidth(0.3);
  doc.line(x, y, x, y + h); doc.line(x, y + h, x + w, y + h);

  groups.forEach((grp, gi) => {
    const bandY = y + gi * bandH;
    const startY = bandY + (bandH - usedH) / 2;
    text(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(grp.label.toUpperCase(), x - 2, bandY + bandH / 2 + 1, { align: "right" });
    grp.values.forEach((v, si) => {
      if (v <= 0) return;
      const ry = startY + si * barH + barH / 2;
      const bw = Math.max((w * v) / niceMax, 0.4);
      fill(doc, series[si]?.color ?? SERIES[si % SERIES.length]);
      doc.rect(x, ry - barH / 2, bw, barH, "F");
      text(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text(fmtV(v), x + bw + 1.4, ry + 1, { align: "left" });
    });
  });

  // rótulos de eixo
  if (opts.yLabel) { text(doc, GREYTXT); doc.setFontSize(7); doc.text(opts.yLabel, x - 16, y + h / 2, { angle: 90, align: "center" }); }
  if (opts.xLabel) { text(doc, GREYTXT); doc.setFontSize(7); doc.text(opts.xLabel, x + w / 2, y + h + 9, { align: "center" }); }

  // legenda vertical à direita
  const lx = x + w + 6;
  let ly = y + 2;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  for (const s of series) {
    fill(doc, s.color); doc.rect(lx, ly - 2.6, 3.2, 3.2, "F");
    text(doc, INK); doc.text(s.name.toUpperCase(), lx + 4.6, ly, { maxWidth: PAGE_W - lx - 8 });
    ly += 6;
  }
}

// ─── Ícones de indicadores (line-art, réplica da página "Indicadores chave") ──
// Desenhados só com primitivas (linha/círculo/rect/triângulo). Contorno azul-escuro
// + acentos coral, centrados em (cx, cy). Aproximações fiéis ao template.

export type KpiIconKind = "growth" | "units" | "new" | "loyal" | "top" | "products";

export function kpiIcon(doc: jsPDF, kind: KpiIconKind, cx: number, cy: number) {
  stroke(doc, NAVY); fill(doc, NAVY); doc.setLineWidth(0.6);
  switch (kind) {
    case "growth": { // barras crescentes + seta coral
      const base = cy + 6;
      ([[-7.5, 5], [-1.8, 8], [3.9, 11]] as const).forEach(([dx, h]) => doc.rect(cx + dx, base - h, 3.6, h, "S"));
      stroke(doc, CORAL); doc.setLineWidth(0.9);
      doc.line(cx - 7, cy - 2.5, cx + 7, cy - 9);
      doc.line(cx + 7, cy - 9, cx + 3.4, cy - 8.4);
      doc.line(cx + 7, cy - 9, cx + 6.4, cy - 5.4);
      break;
    }
    case "units": { // carrinho de compras + sinal de mais
      doc.line(cx - 9, cy - 6, cx - 6.5, cy - 6);
      doc.line(cx - 6.5, cy - 6, cx - 4, cy + 2.5);
      doc.line(cx - 4, cy + 2.5, cx + 5.5, cy + 2.5);
      doc.line(cx - 6, cy - 2.5, cx + 7.5, cy - 2.5);
      doc.line(cx + 7.5, cy - 2.5, cx + 5.5, cy + 2.5);
      doc.circle(cx - 2.5, cy + 5.5, 1.1, "F");
      doc.circle(cx + 4, cy + 5.5, 1.1, "F");
      stroke(doc, CORAL); doc.setLineWidth(0.9);
      doc.line(cx + 0.6, cy - 6.6, cx + 0.6, cy - 2.4); doc.line(cx - 1.5, cy - 4.5, cx + 2.7, cy - 4.5);
      break;
    }
    case "new": { // pessoa + sinal de mais coral
      doc.circle(cx - 1.5, cy - 4, 2.6, "S");
      doc.line(cx - 5.5, cy + 6, cx - 4.2, cy + 0.5);
      doc.line(cx + 2.2, cy + 0.5, cx + 3.5, cy + 6);
      doc.line(cx - 4.2, cy + 0.5, cx + 2.2, cy + 0.5);
      stroke(doc, CORAL); doc.setLineWidth(0.9);
      doc.line(cx + 5.5, cy - 6.5, cx + 5.5, cy - 2.5); doc.line(cx + 3.5, cy - 4.5, cx + 7.5, cy - 4.5);
      break;
    }
    case "loyal": { // grupo de pessoas (3 cabeças + ombros)
      doc.circle(cx - 5, cy - 3, 2.1, "S");
      doc.circle(cx + 5, cy - 3, 2.1, "S");
      fill(doc, CORAL); stroke(doc, CORAL); doc.circle(cx, cy - 4.5, 2.4, "FD"); fill(doc, NAVY); stroke(doc, NAVY);
      doc.line(cx - 8.5, cy + 6, cx - 7.5, cy + 1); doc.line(cx - 2.5, cy + 1, cx - 1.5, cy + 6); doc.line(cx - 7.5, cy + 1, cx - 2.5, cy + 1);
      doc.line(cx + 1.5, cy + 6, cx + 2.5, cy + 1); doc.line(cx + 7.5, cy + 1, cx + 8.5, cy + 6); doc.line(cx + 2.5, cy + 1, cx + 7.5, cy + 1);
      doc.line(cx - 3.5, cy + 7, cx - 2.5, cy + 0.5); doc.line(cx + 2.5, cy + 0.5, cx + 3.5, cy + 7); doc.line(cx - 2.5, cy + 0.5, cx + 2.5, cy + 0.5);
      break;
    }
    case "top": { // relógio
      doc.circle(cx, cy, 8, "S");
      stroke(doc, CORAL); doc.setLineWidth(0.9);
      doc.line(cx, cy, cx, cy - 5); doc.line(cx, cy, cx + 3.5, cy + 1.5);
      break;
    }
    case "products": { // velocímetro (semicírculo + agulha)
      doc.circle(cx, cy + 2, 8.5, "S");
      fill(doc, WHITE); doc.rect(cx - 10, cy + 2.6, 20, 9, "F"); // tapa metade inferior
      stroke(doc, NAVY); doc.line(cx - 9, cy + 2.5, cx + 9, cy + 2.5);
      stroke(doc, CORAL); doc.setLineWidth(1); doc.line(cx, cy + 2, cx + 5, cy - 3);
      fill(doc, NAVY); doc.circle(cx, cy + 2, 1, "F");
      break;
    }
  }
}

// ─── Ranking (nome … valor) ───────────────────────────────────────────────────

export function rankingRows(doc: jsPDF, items: { name: string; value: string }[], startY = 80) {
  const rowH = (PAGE_H - startY - 60) / Math.max(items.length, 1);
  const h = Math.min(rowH, 13);
  items.forEach((it, i) => {
    const ry = startY + i * h;
    text(doc, GREYTXT); doc.setFont("helvetica", "normal"); doc.setFontSize(15);
    doc.text(it.name.toUpperCase(), 26, ry);
    text(doc, CORAL); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(it.value, PAGE_W - 40, ry, { align: "right" });
  });
}

// ─── Legenda (swatches) ───────────────────────────────────────────────────────

export function legend(doc: jsPDF, items: { label: string; color: string }[], y: number, margin = 18) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const sw = 3.2, pad = 1.6, itemGap = 7, lineH = 6, maxW = PAGE_W - margin * 2;
  const w = (it: { label: string }) => sw + pad + doc.getTextWidth(it.label.toUpperCase());
  // agrupa em linhas que cabem na largura útil
  const rows: { items: { label: string; color: string }[]; width: number }[] = [];
  let cur: { label: string; color: string }[] = [], curW = 0;
  for (const it of items) {
    const iw = w(it) + itemGap;
    if (curW + iw > maxW && cur.length) { rows.push({ items: cur, width: curW - itemGap }); cur = []; curW = 0; }
    cur.push(it); curW += iw;
  }
  if (cur.length) rows.push({ items: cur, width: curW - itemGap });
  let yy = y;
  for (const row of rows) {
    let x = (PAGE_W - row.width) / 2; // centra a linha
    for (const it of row.items) {
      fill(doc, it.color); doc.rect(x, yy - 2.7, sw, sw, "F");
      stroke(doc, "#d0d0d0"); doc.setLineWidth(0.1); doc.rect(x, yy - 2.7, sw, sw, "S"); // contorno p/ cores claras
      text(doc, INK); doc.text(it.label.toUpperCase(), x + sw + pad, yy);
      x += w(it) + itemGap;
    }
    yy += lineH;
  }
  return yy;
}

// arredonda o topo da escala para um número "redondo"
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * pow;
}
