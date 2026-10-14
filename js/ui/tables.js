/* ==========================================================================
   ui/tables.js
   Tabela reutilizável: ordenação por coluna (com aria-sort), paginação,
   números alinhados à direita com formatação pt-BR, linha de totais,
   estado vazio que orienta a próxima ação e exportação CSV no padrão do
   Excel brasileiro (separador ";", UTF-8 com BOM, vírgula decimal).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.ui = NS.ui || {};

  const TIPOS_NUMERICOS = ['moeda', 'numero', 'pct', 'pp', 'dias', 'vezes', 'quantidade', 'kg', 'inteiro'];

  /** Valor bruto de uma célula (para ordenar e exportar). */
  function valorBruto(col, linha) {
    if (col.valor) return col.valor(linha);
    return col.chave ? linha[col.chave] : null;
  }

  /** Texto formatado de um valor conforme o tipo da coluna. */
  function formatar(v, col) {
    const F = NS.core.format;
    switch (col.tipo) {
      case 'moeda': return F.moeda(v);
      case 'pct': return F.pct(v, col.casas ?? 1);
      case 'pp': return F.pp(v, col.casas ?? 1);
      case 'dias': return F.dias(v, col.casas ?? 0);
      case 'vezes': return F.vezes(v, col.casas ?? 1);
      case 'kg': return F.porUnidade(v, 'kg', col.casas ?? 0);
      case 'quantidade':
      case 'inteiro': return F.numero(v, col.casas ?? 0);
      case 'numero': return F.numero(v, col.casas ?? 2);
      case 'data': return v ? F.data(v) : '—';
      case 'competencia': return F.competencia(v);
      default: return v === null || v === undefined || v === '' ? '—' : String(v);
    }
  }

  /** Valor para o CSV (números sem milhar e com vírgula decimal). */
  function valorCSV(col, linha) {
    const F = NS.core.format;
    if (col.csv) return col.csv(linha);
    const v = valorBruto(col, linha);
    if (TIPOS_NUMERICOS.includes(col.tipo)) {
      if (col.tipo === 'pct' || col.tipo === 'pp') return F.numeroCSV(typeof v === 'number' ? v * 100 : null, (col.casas ?? 1) + 1);
      return F.numeroCSV(v, col.tipo === 'quantidade' || col.tipo === 'inteiro' ? 0 : 2);
    }
    if (col.tipo === 'data') return v ? F.data(v) : '';
    if (col.tipo === 'competencia') return v ? F.competencia(v) : '';
    if (v && typeof v === 'object' && v.texto !== undefined) return String(v.texto).replace(/<[^>]+>/g, '');
    return v === null || v === undefined ? '' : String(v);
  }

  /** Escapa um campo de CSV (aspas quando há separador, aspas ou quebra de linha). */
  function campoCSV(texto) {
    const t = String(texto);
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }

  /** Gera o conteúdo CSV (com BOM) de colunas e linhas. */
  function gerarCSV(colunas, linhas) {
    const cols = colunas.filter((c) => c.tipo !== 'acoes' && c.exportar !== false);
    const cabecalho = cols.map((c) => campoCSV(c.rotuloCSV || (c.tipo === 'pct' ? `${c.rotulo} (%)` : (c.tipo === 'pp' ? `${c.rotulo} (p.p.)` : c.rotulo))));
    const corpo = linhas.map((l) => cols.map((c) => campoCSV(valorCSV(c, l))).join(';'));
    return '﻿' + [cabecalho.join(';'), ...corpo].join('\r\n');
  }

  /** Baixa um CSV gerado a partir de colunas e linhas. */
  function exportarCSV(nome, colunas, linhas) {
    NS.ui.baixarArquivo(`${nome}_${NS.ui.carimboArquivo()}.csv`, gerarCSV(colunas, linhas), 'text/csv;charset=utf-8');
    NS.ui.avisar('CSV exportado.');
  }

  /** Compara dois valores para ordenação (nulos sempre no fim). */
  function comparar(a, b) {
    const nuloA = a === null || a === undefined || a === '' || (typeof a === 'number' && !Number.isFinite(a));
    const nuloB = b === null || b === undefined || b === '' || (typeof b === 'number' && !Number.isFinite(b));
    if (nuloA && nuloB) return 0;
    if (nuloA) return 1;
    if (nuloB) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  /**
   * Cria a tabela. opcoes:
   *  colunas: [{ chave, rotulo, tipo, casas, valor(l), exibir(l), csv(l), ordenavel, classe, ocultarEstreito }]
   *  linhas, legenda, vazio (HTML), csv (nome do arquivo ou false), porPagina,
   *  ordenarPor, ordem ('asc'|'desc'), totais (objeto ou função), classeLinha(l), compacta
   * Devolve um HTMLElement pronto para inserir na tela.
   */
  function tabela(opcoes) {
    const { html, raw, icone, elemento } = NS.ui;
    const {
      colunas, linhas = [], legenda = '', vazio, csv = false, porPagina = 25,
      totais, classeLinha, compacta = false
    } = opcoes;
    const estado = { pagina: 1, ordenarPor: opcoes.ordenarPor || null, ordem: opcoes.ordem || 'asc' };
    const raizEl = elemento('<div class="tabela-bloco"></div>');

    /** Linhas na ordem atual. */
    function ordenadas() {
      if (!estado.ordenarPor) return linhas.slice();
      const col = colunas.find((c) => (c.chave || c.rotulo) === estado.ordenarPor);
      if (!col) return linhas.slice();
      const fator = estado.ordem === 'desc' ? -1 : 1;
      return linhas.slice().sort((x, y) => {
        const r = comparar(valorBruto(col, x), valorBruto(col, y));
        // nulos continuam no fim mesmo em ordem decrescente
        const nx = valorBruto(col, x); const ny = valorBruto(col, y);
        if (nx === null || nx === undefined) return 1;
        if (ny === null || ny === undefined) return -1;
        return r * fator;
      });
    }

    function celula(col, l) {
      const numerico = TIPOS_NUMERICOS.includes(col.tipo);
      const classes = [numerico ? 'num' : '', col.classe || '', col.ocultarEstreito ? 'ocultar-estreito' : '', col.tipo === 'acoes' ? 'celula-acoes' : ''].filter(Boolean).join(' ');
      const conteudo = col.exibir ? col.exibir(l) : formatar(valorBruto(col, l), col);
      return html`<td class="${classes}">${conteudo}</td>`;
    }

    function cabecalho(col) {
      const numerico = TIPOS_NUMERICOS.includes(col.tipo);
      const chave = col.chave || col.rotulo;
      const ordenavel = col.ordenavel !== false && col.tipo !== 'acoes';
      const ativo = estado.ordenarPor === chave;
      const aria = ativo ? raw(` aria-sort="${estado.ordem === 'asc' ? 'ascending' : 'descending'}"`) : '';
      const classes = [numerico ? 'num' : '', col.ocultarEstreito ? 'ocultar-estreito' : ''].filter(Boolean).join(' ');
      if (!ordenavel) return html`<th scope="col" class="${classes}">${col.tipo === 'acoes' ? html`<span class="visualmente-oculto">${col.rotulo || 'Ações'}</span>` : col.rotulo}</th>`;
      const ic = ativo ? icone(estado.ordem === 'asc' ? 'ordem-asc' : 'ordem-desc') : icone('ordenar');
      return html`<th scope="col" class="${classes}"${aria}><button type="button" class="ordenar" data-ordenar="${chave}">${col.rotulo}${ic}</button></th>`;
    }

    function renderizar() {
      if (!linhas.length) {
        raizEl.innerHTML = String(vazio || NS.ui.vazio('Nenhum registro para mostrar.'));
        return;
      }
      const todas = ordenadas();
      const totalPaginas = Math.max(1, Math.ceil(todas.length / porPagina));
      estado.pagina = Math.min(estado.pagina, totalPaginas);
      const ini = (estado.pagina - 1) * porPagina;
      const pagina = todas.slice(ini, ini + porPagina);
      const tot = typeof totais === 'function' ? totais(linhas) : totais;
      const rodape = tot ? html`<tfoot><tr>${colunas.map((c, i) => {
        const numerico = TIPOS_NUMERICOS.includes(c.tipo);
        const v = tot[c.chave || c.rotulo];
        let conteudo = '';
        if (i === 0 && v === undefined) conteudo = 'Total';
        else if (v !== undefined) conteudo = (v instanceof NS.ui.Seguro || typeof v === 'string') ? v : formatar(v, c);
        return html`<td class="${[numerico ? 'num' : '', c.ocultarEstreito ? 'ocultar-estreito' : ''].join(' ')}">${conteudo}</td>`;
      })}</tr></tfoot>` : '';

      raizEl.innerHTML = String(html`
        <div class="tabela-barra">
          <span>${todas.length === 1 ? '1 registro' : `${NS.core.format.numero(todas.length)} registros`}</span>
          ${csv ? html`<button type="button" class="botao botao-texto botao-pequeno" data-exportar-csv>${icone('download')}Exportar CSV</button>` : ''}
        </div>
        <div class="tabela-rolagem">
          <table class="tabela${compacta ? ' tabela-compacta' : ''}">
            ${legenda ? html`<caption class="visualmente-oculto">${legenda}</caption>` : ''}
            <thead><tr>${colunas.map(cabecalho)}</tr></thead>
            <tbody>${pagina.map((l) => html`<tr class="${classeLinha ? classeLinha(l) || '' : ''}">${colunas.map((c) => celula(c, l))}</tr>`)}</tbody>
            ${rodape}
          </table>
        </div>
        ${totalPaginas > 1 ? html`
          <nav class="paginacao" aria-label="Paginação${legenda ? ` de ${legenda}` : ''}">
            <span>Mostrando ${ini + 1}–${Math.min(ini + porPagina, todas.length)} de ${todas.length}</span>
            <button type="button" class="botao botao-secundario botao-pequeno" data-pagina="${estado.pagina - 1}" ${estado.pagina === 1 ? 'disabled' : ''}>Anterior</button>
            <span>Página ${estado.pagina} de ${totalPaginas}</span>
            <button type="button" class="botao botao-secundario botao-pequeno" data-pagina="${estado.pagina + 1}" ${estado.pagina === totalPaginas ? 'disabled' : ''}>Próxima</button>
          </nav>` : ''}`);
    }

    raizEl.addEventListener('click', (ev) => {
      const ord = ev.target.closest('[data-ordenar]');
      if (ord) {
        const chave = ord.dataset.ordenar;
        if (estado.ordenarPor === chave) estado.ordem = estado.ordem === 'asc' ? 'desc' : 'asc';
        else { estado.ordenarPor = chave; estado.ordem = 'asc'; }
        renderizar();
        const novo = raizEl.querySelector(`[data-ordenar="${CSS.escape(chave)}"]`);
        if (novo) novo.focus();
        return;
      }
      const pag = ev.target.closest('[data-pagina]');
      if (pag) {
        estado.pagina = Number(pag.dataset.pagina);
        renderizar();
        const alvo = raizEl.querySelector('.paginacao button:not([disabled])');
        if (alvo) alvo.focus();
        return;
      }
      if (ev.target.closest('[data-exportar-csv]')) {
        exportarCSV(csv, colunas, ordenadas());
      }
    });

    renderizar();
    return raizEl;
  }

  NS.ui.tabela = tabela;
  NS.ui.tabelas = { tabela, gerarCSV, exportarCSV, formatar, TIPOS_NUMERICOS };
})(typeof window !== 'undefined' ? window : globalThis);
