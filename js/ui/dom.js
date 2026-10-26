/* ==========================================================================
   ui/dom.js
   Utilitários de interface:
   - html`...`: template seguro que escapa automaticamente os valores
     interpolados (proteção contra injeção de HTML vindo dos dados);
   - raw(): marca um trecho como HTML já seguro;
   - ícones SVG embutidos (sem arquivos externos);
   - etiquetas de status, gravidade e variação (sempre ícone + texto);
   - helpers de seleção e criação de elementos e download de arquivos.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.ui = NS.ui || {};

  /** Envolve um HTML já seguro, para não ser escapado de novo. */
  class Seguro {
    constructor(texto) { this.texto = texto; }
    toString() { return this.texto; }
  }

  /** Escapa caracteres especiais de HTML. */
  function esc(v) {
    if (v === null || v === undefined || v === false) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Marca texto como HTML seguro (use só com conteúdo gerado pelo sistema). */
  function raw(texto) {
    return new Seguro(String(texto));
  }

  /** Converte um valor interpolado: listas são concatenadas, o resto é escapado. */
  function valorHtml(v) {
    if (v instanceof Seguro) return v.texto;
    if (Array.isArray(v)) return v.map(valorHtml).join('');
    return esc(v);
  }

  /** Template seguro: html`<td>${valor}</td>` escapa "valor". */
  function html(partes, ...valores) {
    let saida = '';
    partes.forEach((p, i) => {
      saida += p;
      if (i < valores.length) saida += valorHtml(valores[i]);
    });
    return new Seguro(saida);
  }

  // Ícones (24×24, traço). Desenhos simples para não depender de bibliotecas.
  const ICONES = {
    dentro: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16.5 9"/>',
    atencao: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5"/><path d="M12 17.2v.3"/>',
    fora: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    'sem-dados': '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    critico: '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"/><path d="M12 7.5v5.5"/><path d="M12 16.2v.3"/>',
    painel: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 15l4-5"/><path d="M4 19h16"/>',
    cadastros: '<path d="M3 6.5h6l2 2h10v10.5H3z"/>',
    custos: '<path d="M3 20V10l5 3V10l5 3V6l8 4v10z"/><path d="M3 20h18"/>',
    estoque: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/>',
    contratos: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h7M9 16h5"/>',
    orcamento: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    caixa: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3"/><path d="M16.5 13.5h1"/>',
    demonstracoes: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    controles: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
    planos: '<path d="M4 5h16M4 12h16M4 19h10"/><path d="M17 17.5l1.6 1.6L21.5 16"/>',
    relatorios: '<path d="M7 8V3h10v5"/><path d="M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2z"/><path d="M7 14h10"/>',
    configuracoes: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    excluir: '<path d="M4 7h16"/><path d="M10 7V4h4v3"/><path d="M6 7l1 13h10l1-13"/>',
    ordenar: '<path d="M8 10l4-5 4 5M8 14l4 5 4-5"/>',
    'ordem-asc': '<path d="M7 14l5-6 5 6"/>',
    'ordem-desc': '<path d="M7 10l5 6 5-6"/>',
    'seta-cima': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'seta-baixo': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M4 19h16"/>',
    imprimir: '<path d="M7 8V3h10v5"/><path d="M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.3"/>',
    acao: '<path d="M5 12l4 4L19 6"/>',
    voltar: '<path d="M15 6l-6 6 6 6"/>',
    videoaula: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.2v5.6l4.6-2.8z"/>'
  };

  /** Ícone SVG. Com "rotulo", vira imagem acessível; sem ele, decorativo. */
  function icone(nome, rotulo) {
    const desenho = ICONES[nome] || ICONES.info;
    const acess = rotulo ? `role="img" aria-label="${esc(rotulo)}"` : 'aria-hidden="true" focusable="false"';
    return raw(`<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${acess}>${desenho}</svg>`);
  }

  // Textos dos status (o status nunca é comunicado só pela cor).
  const ROTULO_STATUS = {
    dentro: 'Dentro da meta',
    atencao: 'Atenção',
    fora: 'Fora da meta',
    'sem-dados': 'Sem dados',
    'sem-meta': 'Sem meta'
  };

  /** Etiqueta de status de indicador: ícone + texto. "Sem meta" usa o visual neutro de "sem dados". */
  function status(chave, texto) {
    const k = ROTULO_STATUS[chave] ? chave : 'sem-dados';
    const visual = k === 'sem-meta' ? 'sem-dados' : k;
    return html`<span class="status status-${visual}">${icone(visual)}${texto || ROTULO_STATUS[k]}</span>`;
  }

  /** Etiqueta de gravidade de alerta: ícone + texto. */
  function gravidade(g) {
    return g === 'critico'
      ? html`<span class="status status-critico">${icone('critico')}Crítico</span>`
      : html`<span class="status status-atencao">${icone('atencao')}Atenção</span>`;
  }

  /** Etiqueta genérica neutra. */
  function etiqueta(texto, classe = '') {
    return html`<span class="etiqueta ${classe}">${texto}</span>`;
  }

  /**
   * Variação favorável/desfavorável: a seta mostra a direção do número
   * (sinal do texto) e a cor + a palavra mostram se é bom ou ruim.
   */
  function variacao(favoravel, texto) {
    if (favoravel === null || favoravel === undefined) return html`<span class="suave">${texto || 'sem dados'}</span>`;
    const seta = /^\s*[−-]/.test(String(texto)) ? icone('seta-baixo') : icone('seta-cima');
    return favoravel
      ? html`<span class="favoravel">${seta} ${texto} · favorável</span>`
      : html`<span class="desfavoravel">${seta} ${texto} · desfavorável</span>`;
  }

  /** Formata um valor conforme a unidade (atalho para core/format). */
  function valor(v, unidade, casas) {
    const F = NS.core.format;
    if (unidade === 'pp') return F.pp(v, casas ?? 1);
    if (unidade === 'numero') return F.numero(v, casas ?? 1);
    return F.porUnidade(v, unidade, casas);
  }

  /** Texto de uma evidência de alerta ({rotulo, valor, unidade} ou {rotulo, texto}). */
  function evidencia(ev) {
    return ev.texto !== undefined ? ev.texto : valor(ev.valor, ev.unidade);
  }

  /** Atalhos de seleção. */
  function qs(seletor, base = document) { return base.querySelector(seletor); }
  function qsa(seletor, base = document) { return Array.from(base.querySelectorAll(seletor)); }

  /** Cria um elemento a partir de HTML (devolve o primeiro elemento). */
  function elemento(conteudo) {
    const t = document.createElement('template');
    t.innerHTML = String(conteudo).trim();
    return t.content.firstElementChild;
  }

  /** Substitui os marcadores <div data-slot="nome"> pelos elementos informados. */
  function encaixar(base, mapa) {
    for (const [nome, el] of Object.entries(mapa)) {
      const alvo = base.querySelector(`[data-slot="${nome}"]`);
      if (alvo && el) alvo.replaceWith(el);
    }
  }

  /** Gera o download de um arquivo (funciona também em file://). */
  function baixarArquivo(nome, conteudo, tipo = 'text/plain;charset=utf-8') {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Carimbo de data e hora para nomes de arquivo: 2026-10-02_14-35. */
  function carimboArquivo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
  }

  Object.assign(NS.ui, {
    Seguro, esc, raw, html, icone, ROTULO_STATUS, status, gravidade, etiqueta, variacao, valor,
    evidencia, qs, qsa, elemento, encaixar, baixarArquivo, carimboArquivo
  });
})(typeof window !== 'undefined' ? window : globalThis);
