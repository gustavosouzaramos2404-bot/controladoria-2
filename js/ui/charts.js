/* ==========================================================================
   ui/charts.js
   Biblioteca própria de gráficos em SVG (sem dependências):
   - linha: séries mensais com linha de meta opcional;
   - barras: verticais ou horizontais, com valores negativos;
   - barrasAgrupadas: comparação lado a lado (padrão × real, orçado × realizado);
   - bullet: realizado × meta × faixas de status (compacto, para tabelas);
   - cascata: ponte de variação (ex.: margem do mês anterior → margem atual);
   - sparkline: tendência de 12 meses em miniatura.
   Todos os gráficos têm role="img" e texto alternativo; as cores vêm de
   classes CSS (tokens), e os valores aparecem em <title> ao passar o mouse.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.ui = NS.ui || {};

  const ehNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const r1 = (v) => Math.round(v * 10) / 10;

  /** Escala "bonita" para o eixo Y: limites arredondados e marcas. */
  function escala(min, max, marcas = 5) {
    if (!ehNum(min) || !ehNum(max)) { min = 0; max = 1; }
    if (min === max) {
      if (min === 0) max = 1;
      else if (min > 0) min = 0;
      else max = 0;
    }
    const bruto = (max - min) / marcas;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || bruto;
    const ini = Math.floor(min / passo + 1e-9) * passo;
    const fim = Math.ceil(max / passo - 1e-9) * passo;
    const lista = [];
    for (let v = ini; v <= fim + passo * 1e-6; v += passo) lista.push(Math.round(v / passo) * passo);
    return { min: ini, max: fim === ini ? ini + passo : fim, marcas: lista };
  }

  /** Abre o SVG com acessibilidade (título e descrição). */
  function abrirSvg(largura, altura, titulo, descricao) {
    const { esc } = NS.ui;
    const id = `g${Math.random().toString(36).slice(2, 9)}`;
    return `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-labelledby="${id}t${descricao ? ` ${id}d` : ''}" preserveAspectRatio="xMidYMid meet">` +
      `<title id="${id}t">${esc(titulo || 'Gráfico')}</title>${descricao ? `<desc id="${id}d">${esc(descricao)}</desc>` : ''}`;
  }

  /** Grade horizontal e rótulos do eixo Y. */
  function eixoY(esc_, y, x0, x1, formatar) {
    const { esc } = NS.ui;
    let s = '<g class="grade">';
    for (const m of esc_.marcas) {
      const yy = r1(y(m));
      s += `<line x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}"/>`;
      s += `<text x="${x0 - 6}" y="${yy + 3.5}" text-anchor="end">${esc(formatar(m))}</text>`;
    }
    s += '</g>';
    if (esc_.min < 0 && esc_.max > 0) s += `<line class="eixo-zero" x1="${x0}" x2="${x1}" y1="${r1(y(0))}" y2="${r1(y(0))}"/>`;
    return s;
  }

  /** Legenda em HTML abaixo do gráfico. */
  function legenda(itens) {
    const { esc } = NS.ui;
    if (!itens.length) return '';
    return `<div class="legenda">${itens.map((i) => i.linha
      ? `<span><span class="legenda-linha" aria-hidden="true"></span>${esc(i.nome)}</span>`
      : `<span><span class="legenda-cor ${i.cor}" aria-hidden="true"></span>${esc(i.nome)}</span>`).join('')}</div>`;
  }

  /** Formatação padrão dos eixos. */
  function formatoPadrao(v) {
    return NS.core.format.numero(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0);
  }

  /**
   * Gráfico de linha. opcoes: { series:[{nome, valores:[n|null]}], rotulos:[texto],
   * formatar, formatarEixo, meta, altura, titulo, descricao }
   */
  function linha(opcoes) {
    const { raw, esc } = NS.ui;
    const { series = [], rotulos = [], meta = null, titulo = '', descricao = '' } = opcoes;
    const formatar = opcoes.formatar || formatoPadrao;
    const formatarEixo = opcoes.formatarEixo || formatar;
    const L = 640, A = opcoes.altura || 220, m = { t: 14, r: 16, b: 30, l: 70 };
    const todos = series.flatMap((s) => s.valores).filter(ehNum).concat(ehNum(meta) ? [meta] : []);
    if (!todos.length) return raw(`<div class="grafico vazio"><p>Sem dados para o gráfico.</p></div>`);
    const e = escala(Math.min(...todos, opcoes.incluirZero ? 0 : Infinity), Math.max(...todos, opcoes.incluirZero ? 0 : -Infinity));
    const n = rotulos.length;
    const pw = L - m.l - m.r, ph = A - m.t - m.b;
    const x = (i) => m.l + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
    const y = (v) => m.t + ph - ((v - e.min) / (e.max - e.min)) * ph;
    let s = abrirSvg(L, A, titulo, descricao) + eixoY(e, y, m.l, L - m.r, formatarEixo);
    const passoRotulo = n > 13 ? Math.ceil(n / 12) : 1;
    rotulos.forEach((rot, i) => {
      if (i % passoRotulo === 0 || i === n - 1) s += `<text x="${r1(x(i))}" y="${A - 10}" text-anchor="middle">${esc(rot)}</text>`;
    });
    if (ehNum(meta)) s += `<line class="linha-meta" x1="${m.l}" x2="${L - m.r}" y1="${r1(y(meta))}" y2="${r1(y(meta))}"><title>Meta: ${esc(formatar(meta))}</title></line>`;
    series.forEach((serie, k) => {
      const classe = serie.classe || `serie-${k + 1}`;
      let d = '';
      let novo = true;
      serie.valores.forEach((v, i) => {
        if (!ehNum(v)) { novo = true; return; }
        d += `${novo ? 'M' : 'L'}${r1(x(i))} ${r1(y(v))} `;
        novo = false;
      });
      if (d) s += `<path class="serie ${classe}" d="${d.trim()}"/>`;
      serie.valores.forEach((v, i) => {
        if (ehNum(v)) s += `<circle class="${classe.replace('serie', 'ponto')}" cx="${r1(x(i))}" cy="${r1(y(v))}" r="3"><title>${esc(`${serie.nome} · ${rotulos[i]}: ${formatar(v)}`)}</title></circle>`;
      });
    });
    s += '</svg>';
    const leg = series.length > 1 || ehNum(meta)
      ? legenda(series.map((sr, k) => ({ nome: sr.nome, cor: `cor-${k + 1}` })).concat(ehNum(meta) ? [{ nome: 'Meta', linha: true }] : []))
      : '';
    return raw(`<div class="grafico">${s}${leg}</div>`);
  }

  /**
   * Barras verticais (ou horizontais com horizontal:true).
   * opcoes: { itens:[{rotulo, valor, classe}], formatar, altura, titulo, descricao }
   */
  function barras(opcoes) {
    if (opcoes.horizontal) return barrasHorizontais(opcoes);
    const { raw, esc } = NS.ui;
    const { itens = [], titulo = '', descricao = '' } = opcoes;
    const formatar = opcoes.formatar || formatoPadrao;
    const valores = itens.map((i) => i.valor).filter(ehNum);
    if (!valores.length) return raw(`<div class="grafico vazio"><p>Sem dados para o gráfico.</p></div>`);
    const L = 640, A = opcoes.altura || 220, m = { t: 20, r: 12, b: 34, l: 70 };
    const e = escala(Math.min(0, ...valores), Math.max(0, ...valores));
    const pw = L - m.l - m.r, ph = A - m.t - m.b;
    const banda = pw / itens.length;
    const y = (v) => m.t + ph - ((v - e.min) / (e.max - e.min)) * ph;
    let s = abrirSvg(L, A, titulo, descricao) + eixoY(e, y, m.l, L - m.r, opcoes.formatarEixo || formatar);
    itens.forEach((it, i) => {
      const cx = m.l + banda * i + banda / 2;
      const w = Math.min(banda * 0.62, 56);
      if (ehNum(it.valor)) {
        const y0 = y(0), y1 = y(it.valor);
        const topo = Math.min(y0, y1), alt = Math.max(Math.abs(y1 - y0), 1);
        s += `<rect class="${it.classe || 'barra-1'}" x="${r1(cx - w / 2)}" y="${r1(topo)}" width="${r1(w)}" height="${r1(alt)}"><title>${esc(`${it.rotulo}: ${formatar(it.valor)}`)}</title></rect>`;
        s += `<text class="rotulo-valor" x="${r1(cx)}" y="${r1(it.valor >= 0 ? topo - 5 : topo + alt + 12)}" text-anchor="middle">${esc(formatar(it.valor))}</text>`;
      }
      const rot = String(it.rotulo);
      s += `<text x="${r1(cx)}" y="${A - 12}" text-anchor="middle">${esc(rot.length > 16 ? rot.slice(0, 15) + '…' : rot)}</text>`;
    });
    s += '</svg>';
    return raw(`<div class="grafico">${s}</div>`);
  }

  /** Barras horizontais (bom para nomes longos de produtos ou órgãos). */
  function barrasHorizontais(opcoes) {
    const { raw, esc } = NS.ui;
    const { itens = [], titulo = '', descricao = '' } = opcoes;
    const formatar = opcoes.formatar || formatoPadrao;
    const valores = itens.map((i) => i.valor).filter(ehNum);
    if (!valores.length) return raw(`<div class="grafico vazio"><p>Sem dados para o gráfico.</p></div>`);
    const L = 640, linhaA = 30, m = { t: 8, r: 90, b: 8, l: 210 };
    const A = m.t + m.b + linhaA * itens.length;
    const minV = Math.min(0, ...valores), maxV = Math.max(0, ...valores);
    const pw = L - m.l - m.r;
    const x = (v) => m.l + ((v - minV) / ((maxV - minV) || 1)) * pw;
    let s = abrirSvg(L, A, titulo, descricao);
    if (minV < 0) s += `<line class="eixo-zero" x1="${r1(x(0))}" x2="${r1(x(0))}" y1="${m.t}" y2="${A - m.b}"/>`;
    itens.forEach((it, i) => {
      const yy = m.t + i * linhaA;
      const rot = String(it.rotulo);
      s += `<text x="${m.l - 8}" y="${yy + linhaA / 2 + 4}" text-anchor="end">${esc(rot.length > 30 ? rot.slice(0, 29) + '…' : rot)}</text>`;
      if (!ehNum(it.valor)) return;
      const x0 = x(0), x1 = x(it.valor);
      s += `<rect class="${it.classe || 'barra-1'}" x="${r1(Math.min(x0, x1))}" y="${yy + 6}" width="${r1(Math.max(Math.abs(x1 - x0), 1))}" height="${linhaA - 12}"><title>${esc(`${rot}: ${formatar(it.valor)}`)}</title></rect>`;
      s += `<text class="rotulo-valor" x="${r1(Math.max(x0, x1) + 6)}" y="${yy + linhaA / 2 + 4}">${esc(formatar(it.valor))}</text>`;
    });
    s += '</svg>';
    return raw(`<div class="grafico">${s}</div>`);
  }

  /**
   * Barras agrupadas. opcoes: { grupos:[rotulo], series:[{nome, valores, classe}],
   * formatar, altura, titulo, descricao }
   */
  function barrasAgrupadas(opcoes) {
    const { raw, esc } = NS.ui;
    const { grupos = [], series = [], titulo = '', descricao = '' } = opcoes;
    const formatar = opcoes.formatar || formatoPadrao;
    const valores = series.flatMap((s) => s.valores).filter(ehNum);
    if (!valores.length) return raw(`<div class="grafico vazio"><p>Sem dados para o gráfico.</p></div>`);
    const L = 640, A = opcoes.altura || 240, m = { t: 14, r: 12, b: 34, l: 70 };
    const e = escala(Math.min(0, ...valores), Math.max(0, ...valores));
    const pw = L - m.l - m.r, ph = A - m.t - m.b;
    const banda = pw / grupos.length;
    const larguraBarra = Math.min((banda * 0.72) / series.length, 28);
    const y = (v) => m.t + ph - ((v - e.min) / (e.max - e.min)) * ph;
    let s = abrirSvg(L, A, titulo, descricao) + eixoY(e, y, m.l, L - m.r, opcoes.formatarEixo || formatar);
    grupos.forEach((g, i) => {
      const inicio = m.l + banda * i + (banda - larguraBarra * series.length) / 2;
      series.forEach((serie, k) => {
        const v = serie.valores[i];
        if (!ehNum(v)) return;
        const y0 = y(0), y1 = y(v);
        s += `<rect class="${serie.classe || `barra-${k + 1}`}" x="${r1(inicio + k * larguraBarra)}" y="${r1(Math.min(y0, y1))}" width="${r1(larguraBarra - 2)}" height="${r1(Math.max(Math.abs(y1 - y0), 1))}"><title>${esc(`${g} · ${serie.nome}: ${formatar(v)}`)}</title></rect>`;
      });
      const rot = String(g);
      s += `<text x="${r1(m.l + banda * i + banda / 2)}" y="${A - 12}" text-anchor="middle">${esc(rot.length > 16 ? rot.slice(0, 15) + '…' : rot)}</text>`;
    });
    s += '</svg>';
    return raw(`<div class="grafico">${s}${legenda(series.map((sr, k) => ({ nome: sr.nome, cor: `cor-${k + 1}` })))}</div>`);
  }

  /**
   * Bullet chart compacto: faixas de status ao fundo, barra do realizado e
   * traço da meta. opcoes: { valor, meta, faixas:[{de, ate, classe}], min, max, rotulo }
   */
  function bullet({ valor, meta, faixas = [], min, max, rotulo = '', largura = 130, altura = 18 }) {
    const { raw, esc } = NS.ui;
    if (!ehNum(min) || !ehNum(max) || max <= min) return raw('');
    const x = (v) => r1(((Math.min(Math.max(v, min), max) - min) / (max - min)) * largura);
    let s = `<svg class="bullet" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img" aria-label="${esc(rotulo)}">`;
    for (const f of faixas) s += `<rect class="${f.classe}" x="${x(f.de)}" y="0" width="${Math.max(x(f.ate) - x(f.de), 0)}" height="${altura}"/>`;
    if (ehNum(valor)) s += `<rect class="bullet-valor" x="0" y="${altura / 2 - 3}" width="${x(valor)}" height="6"/>`;
    if (ehNum(meta)) s += `<line class="bullet-meta" x1="${x(meta)}" x2="${x(meta)}" y1="2" y2="${altura - 2}"/>`;
    s += '</svg>';
    return raw(s);
  }

  /** Bullet de um indicador: calcula faixas a partir da meta, tolerâncias e sentido. */
  function bulletIndicador(valor, ind) {
    const F = NS.core.format;
    const { meta, toleranciaAtencao: ta, toleranciaFora: tf, sentido } = ind;
    if (!ehNum(meta)) return NS.ui.raw('');
    const folga = Math.max(tf * 1.6, Math.abs(meta) * 0.25, 1e-6);
    let min = Math.min(meta - folga, ehNum(valor) ? valor : meta);
    let max = Math.max(meta + folga, ehNum(valor) ? valor : meta);
    if (ind.unidade === 'pct' || meta >= 0) min = Math.max(min, Math.min(0, ehNum(valor) ? valor : 0));
    const faixas = sentido === 'menor-melhor'
      ? [{ de: min, ate: meta + ta, classe: 'faixa-dentro' }, { de: meta + ta, ate: meta + tf, classe: 'faixa-atencao' }, { de: meta + tf, ate: max, classe: 'faixa-fora' }]
      : [{ de: min, ate: meta - tf, classe: 'faixa-fora' }, { de: meta - tf, ate: meta - ta, classe: 'faixa-atencao' }, { de: meta - ta, ate: max, classe: 'faixa-dentro' }];
    const rotulo = `Realizado ${F.porUnidade(valor, ind.unidade)} contra meta ${F.porUnidade(meta, ind.unidade)}`;
    return bullet({ valor, meta, faixas, min, max, rotulo });
  }

  /**
   * Cascata (ponte de variação). opcoes: { itens:[{rotulo, valor, tipo:'total'|'delta'}],
   * formatar, altura, titulo, descricao }
   */
  function cascata(opcoes) {
    const { raw, esc } = NS.ui;
    const { itens = [], titulo = '', descricao = '' } = opcoes;
    const formatar = opcoes.formatar || formatoPadrao;
    if (!itens.length || !itens.some((i) => ehNum(i.valor))) return raw(`<div class="grafico vazio"><p>Sem dados para o gráfico.</p></div>`);
    // Calcula início e fim de cada barra.
    let acumulado = 0;
    const barrasCalc = itens.map((it) => {
      const v = ehNum(it.valor) ? it.valor : 0;
      if (it.tipo === 'total') { acumulado = v; return { it, de: 0, ate: v }; }
      const de = acumulado;
      acumulado += v;
      return { it, de, ate: acumulado };
    });
    const extremos = barrasCalc.flatMap((b) => [b.de, b.ate]);
    const L = 640, A = opcoes.altura || 250, m = { t: 22, r: 12, b: 40, l: 76 };
    const e = escala(Math.min(0, ...extremos), Math.max(0, ...extremos));
    const pw = L - m.l - m.r, ph = A - m.t - m.b;
    const banda = pw / itens.length;
    const w = Math.min(banda * 0.6, 70);
    const y = (v) => m.t + ph - ((v - e.min) / (e.max - e.min)) * ph;
    let s = abrirSvg(L, A, titulo, descricao) + eixoY(e, y, m.l, L - m.r, opcoes.formatarEixo || formatar);
    barrasCalc.forEach((b, i) => {
      const cx = m.l + banda * i + banda / 2;
      const y0 = y(b.de), y1 = y(b.ate);
      const topo = Math.min(y0, y1), alt = Math.max(Math.abs(y1 - y0), 1);
      const classe = b.it.tipo === 'total' ? 'barra-total' : (b.ate >= b.de ? 'barra-positiva' : 'barra-negativa');
      const valorTexto = b.it.tipo === 'total' ? formatar(b.it.valor) : `${b.it.valor >= 0 ? '+' : ''}${formatar(b.it.valor)}`;
      s += `<rect class="${classe}" x="${r1(cx - w / 2)}" y="${r1(topo)}" width="${r1(w)}" height="${r1(alt)}"><title>${esc(`${b.it.rotulo}: ${valorTexto}`)}</title></rect>`;
      s += `<text class="rotulo-valor" x="${r1(cx)}" y="${r1(topo - 6)}" text-anchor="middle">${esc(valorTexto)}</text>`;
      // Conector até a próxima barra
      if (i < barrasCalc.length - 1) {
        const yc = r1(y(b.ate));
        s += `<line class="conector" x1="${r1(cx + w / 2)}" x2="${r1(cx + banda - w / 2)}" y1="${yc}" y2="${yc}"/>`;
      }
      const palavras = String(b.it.rotulo).split(' ');
      const meio = Math.ceil(palavras.length / 2);
      const l1 = palavras.length > 2 ? palavras.slice(0, meio).join(' ') : b.it.rotulo;
      const l2 = palavras.length > 2 ? palavras.slice(meio).join(' ') : '';
      s += `<text x="${r1(cx)}" y="${A - 22}" text-anchor="middle">${esc(l1)}</text>`;
      if (l2) s += `<text x="${r1(cx)}" y="${A - 9}" text-anchor="middle">${esc(l2)}</text>`;
    });
    s += '</svg>';
    return raw(`<div class="grafico">${s}${legenda([{ nome: 'Total', cor: 'cor-total' }, { nome: 'Efeito positivo', cor: 'cor-positiva' }, { nome: 'Efeito negativo', cor: 'cor-negativa' }])}</div>`);
  }

  /** Sparkline de tendência: linha mínima, último ponto destacado e meta tracejada. */
  function sparkline(valores, { meta = null, largura = 96, altura = 26, rotulo = '' } = {}) {
    const { raw, esc } = NS.ui;
    const nums = valores.filter(ehNum);
    if (nums.length < 2) return raw('<span class="sem-serie">sem série</span>');
    const todos = nums.concat(ehNum(meta) ? [meta] : []);
    let min = Math.min(...todos), max = Math.max(...todos);
    if (min === max) { min -= 1; max += 1; }
    const n = valores.length;
    const x = (i) => r1(2 + (i * (largura - 4)) / Math.max(n - 1, 1));
    const y = (v) => r1(altura - 3 - ((v - min) / (max - min)) * (altura - 6));
    let d = '';
    let novo = true;
    let ultimo = null;
    valores.forEach((v, i) => {
      if (!ehNum(v)) { novo = true; return; }
      d += `${novo ? 'M' : 'L'}${x(i)} ${y(v)} `;
      novo = false;
      ultimo = i;
    });
    let s = `<svg class="sparkline" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img" aria-label="${esc(rotulo)}">`;
    if (ehNum(meta)) s += `<line class="meta" x1="0" x2="${largura}" y1="${y(meta)}" y2="${y(meta)}"/>`;
    s += `<path class="serie" d="${d.trim()}"/>`;
    if (ultimo !== null) s += `<circle class="ultimo" cx="${x(ultimo)}" cy="${y(valores[ultimo])}" r="2.5"/>`;
    s += '</svg>';
    return raw(s);
  }

  NS.ui.graficos = { escala, linha, barras, barrasHorizontais, barrasAgrupadas, bullet, bulletIndicador, cascata, sparkline };
})(typeof window !== 'undefined' ? window : globalThis);
