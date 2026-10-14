/* ==========================================================================
   modules/estoque.js
   Estoque e perdas:
   - saldos por item (insumos e produtos acabados), valor, mínimo, consumo
     médio diário e cobertura em dias; itens abaixo do mínimo;
   - lista FEFO (primeiro que vence, primeiro que sai) e itens próximos do
     vencimento;
   - movimentos (entrada, saída, perda, ajuste) por item, lote e validade,
     com conferência de alçada para ajustes de valor alto;
   - perdas por motivo (lotes de produção e baixas de estoque) e giro.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  const ABAS = [
    { id: 'saldos', rotulo: 'Saldos e cobertura', rota: 'estoque' },
    { id: 'fefo', rotulo: 'FEFO e vencimentos', rota: 'estoque/fefo' },
    { id: 'movimentos', rotulo: 'Movimentos', rota: 'estoque/movimentos' },
    { id: 'perdas', rotulo: 'Perdas', rota: 'estoque/perdas' }
  ];

  /** Nome e unidade de um item de estoque. */
  function infoItem(ctx, itemTipo, itemId) {
    const item = itemTipo === 'insumo' ? ctx.insumosPorId.get(itemId) : ctx.produtosPorId.get(itemId);
    return { nome: item ? item.nome : 'item removido', unidade: item ? item.unidade : '', item };
  }

  /**
   * Baixa uma quantidade do estoque seguindo o FEFO: consome primeiro os
   * lotes que vencem antes. O que faltar sai sem lote (e fica visível como
   * saldo negativo do item). Usado pelo registro de lotes de produção.
   */
  function baixarFEFO({ itemTipo, itemId, qtd, data, documento, precoPadrao }) {
    const store = NS.core.store;
    const E = NS.calc.estoque;
    const lotes = E.saldosPorLote(store.listar('movimentosEstoque').filter((m) => m.itemTipo === itemTipo && m.itemId === itemId), data)
      .sort((a, b) => ((a.validade || '9999') < (b.validade || '9999') ? -1 : 1));
    let falta = Number(qtd) || 0;
    for (const l of lotes) {
      if (falta <= 1e-9) break;
      if (l.validade && l.validade < data) continue; // lote vencido não é consumido
      const q = Math.min(l.qtd, falta);
      const custo = l.qtd > 0 ? l.valor / l.qtd : 0;
      store.inserir('movimentosEstoque', { data, itemTipo, itemId, tipo: 'saida', qtd: Math.round(q * 1000) / 1000, valor: Math.round(q * custo * 100) / 100, lote: l.lote, validade: l.validade, documento, motivo: '' });
      falta -= q;
    }
    if (falta > 1e-6) {
      store.inserir('movimentosEstoque', { data, itemTipo, itemId, tipo: 'saida', qtd: Math.round(falta * 1000) / 1000, valor: Math.round(falta * (Number(precoPadrao) || 0) * 100) / 100, lote: '', validade: null, documento, motivo: 'Saída sem saldo suficiente em lotes' });
    }
  }

  /** Aba de saldos e cobertura. */
  function abaSaldos(el, ctx) {
    const { html, status } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const E = NS.calc.estoque;
    const est = ctx.estoque(ctx.hoje);
    const movs = ctx.dados.movimentosEstoque;
    const linhas = [];
    const itens = ctx.dados.insumos.map((i) => ['insumo', i]).concat(ctx.dados.produtos.map((p) => ['produto', p]));
    for (const [tipo, item] of itens) {
      const s = est.saldos.get(`${tipo}:${item.id}`) || { qtd: 0, valor: 0 };
      const consumo = E.consumoMedioDiario(movs, tipo, item.id, ctx.hoje, 90);
      const cobertura = NS.calc.custos.coberturaDias(s.qtd, consumo);
      const minimo = tipo === 'insumo' ? B.num(item.estoqueMinimo) : 0;
      linhas.push({
        id: `${tipo}:${item.id}`, tipo, nome: item.nome, unidade: item.unidade, qtd: s.qtd, valor: s.valor,
        minimo, consumo, cobertura, abaixo: minimo > 0 && s.qtd < minimo
      });
    }
    const totalInsumos = B.soma(linhas.filter((l) => l.tipo === 'insumo'), (l) => l.valor);
    const totalProdutos = B.soma(linhas.filter((l) => l.tipo === 'produto'), (l) => l.valor);
    const abaixo = linhas.filter((l) => l.abaixo);
    const giro = ctx.avaliacoes(ctx.competencia).find((a) => a.indicador.id === 'giro_estoque');
    const vencendo = est.fefo.filter((s) => s.diasParaVencer <= (s.itemTipo === 'insumo' ? ctx.limites.insumoVencimentoDias : ctx.limites.produtoVencimentoDias));
    el.insertAdjacentHTML('beforeend', String(html`
      <section class="resumo" aria-label="Resumo do estoque">
        <div class="resumo-item"><div class="resumo-rotulo">Estoque de insumos</div><div class="resumo-valor">${F.moeda(totalInsumos)}</div><div class="resumo-detalhe">Valorizado pelo custo das entradas</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Produtos acabados</div><div class="resumo-valor">${F.moeda(totalProdutos)}</div><div class="resumo-detalhe">Pelo custo dos lotes</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Abaixo do mínimo</div><div class="resumo-valor">${abaixo.length}</div><div class="resumo-detalhe">${abaixo.length ? abaixo.map((a) => a.nome).join(', ') : 'Nenhum item'}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Lotes vencendo</div><div class="resumo-valor">${vencendo.length}</div><div class="resumo-detalhe">Insumos ≤ ${F.dias(ctx.limites.insumoVencimentoDias)}, produtos ≤ ${F.dias(ctx.limites.produtoVencimentoDias)}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Giro de estoque (a.a.)</div><div class="resumo-valor">${giro ? F.vezes(giro.valor) : 'sem dados'}</div><div class="resumo-detalhe">${giro ? status(giro.status) : ''}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Data de referência</div><div class="resumo-valor">${F.data(ctx.hoje)}</div><div class="resumo-detalhe">Saldos até hoje</div></div>
      </section>
      <section class="bloco"><div class="bloco-cabecalho"><h2>Saldos por item</h2>
        <p>Cobertura (dias) = saldo ÷ consumo médio diário das saídas dos últimos 90 dias.</p></div><div data-slot="tabela"></div>
        ${NS.modules.comum.fonteDado('movimentos de estoque', ['movimentosEstoque'])}</section>`));
    NS.ui.encaixar(el, {
      tabela: NS.ui.tabela({
        legenda: 'Saldos por item', csv: 'estoque_saldos', linhas, ordenarPor: 'cobertura', porPagina: 30,
        classeLinha: (l) => (l.abaixo ? (l.qtd <= 0 ? 'linha-fora' : 'linha-atencao') : ''),
        colunas: [
          { chave: 'nome', rotulo: 'Item' },
          { chave: 'tipo', rotulo: 'Tipo', exibir: (l) => (l.tipo === 'insumo' ? 'Insumo' : 'Produto acabado'), csv: (l) => l.tipo },
          { chave: 'qtd', rotulo: 'Saldo', tipo: 'numero', casas: 1, exibir: (l) => `${F.numero(l.qtd, 1)} ${l.unidade}` },
          { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
          { chave: 'minimo', rotulo: 'Mínimo', tipo: 'numero', casas: 0, exibir: (l) => (l.minimo ? F.numero(l.minimo) : '—') },
          { chave: 'consumo', rotulo: 'Consumo médio/dia', tipo: 'numero', casas: 1 },
          { chave: 'cobertura', rotulo: 'Cobertura', tipo: 'dias' },
          { chave: 'abaixo', rotulo: 'Situação', exibir: (l) => (l.abaixo ? status(l.qtd <= 0 ? 'fora' : 'atencao', 'Abaixo do mínimo') : status('dentro', 'Ok')), csv: (l) => (l.abaixo ? 'Abaixo do mínimo' : 'Ok') }
        ]
      })
    });
  }

  /** Aba FEFO: lotes por ordem de vencimento. */
  function abaFefo(el, ctx, filtro) {
    const { html, status, raw } = NS.ui;
    const F = NS.core.format;
    const est = ctx.estoque(ctx.hoje);
    const linhas = est.fefo.filter((s) => !filtro || s.itemTipo === filtro).map((s, i) => {
      const info = infoItem(ctx, s.itemTipo, s.itemId);
      const limite = s.itemTipo === 'insumo' ? ctx.limites.insumoVencimentoDias : ctx.limites.produtoVencimentoDias;
      return Object.assign({ id: `${s.itemTipo}:${s.itemId}:${s.lote}`, ordem: i + 1, nome: info.nome, unidade: info.unidade, limite }, s);
    });
    const situacao = (l) => {
      if (l.diasParaVencer < 0) return status('fora', `Vencido há ${F.dias(-l.diasParaVencer)}`);
      if (l.diasParaVencer <= l.limite) return status('atencao', `Vence em ${F.dias(l.diasParaVencer)}`);
      return status('dentro', `${F.dias(l.diasParaVencer)} de validade`);
    };
    el.insertAdjacentHTML('beforeend', String(html`
      <div class="filtros">
        <label class="seletor">Mostrar
          <select data-acao="filtro-tipo">
            <option value="" ${!filtro ? raw('selected') : ''}>Insumos e produtos</option>
            <option value="insumo" ${filtro === 'insumo' ? raw('selected') : ''}>Só insumos</option>
            <option value="produto" ${filtro === 'produto' ? raw('selected') : ''}>Só produtos acabados</option>
          </select></label>
      </div>
      <section class="bloco"><div class="bloco-cabecalho"><h2>Lista FEFO</h2>
        <p>Primeiro que vence, primeiro que sai. Consuma e expeça nesta ordem. Alerta: insumos ≤ ${F.dias(ctx.limites.insumoVencimentoDias)}, produtos ≤ ${F.dias(ctx.limites.produtoVencimentoDias)}.</p></div>
        <div data-slot="tabela"></div></section>`));
    NS.ui.encaixar(el, {
      tabela: NS.ui.tabela({
        legenda: 'Lista FEFO', csv: 'estoque_fefo', linhas, ordenarPor: 'validade', porPagina: 40,
        vazio: NS.ui.vazio('Nenhum lote com validade em estoque.'),
        classeLinha: (l) => (l.diasParaVencer < 0 ? 'linha-fora' : (l.diasParaVencer <= l.limite ? 'linha-atencao' : '')),
        colunas: [
          { chave: 'ordem', rotulo: 'Ordem', tipo: 'quantidade' },
          { chave: 'nome', rotulo: 'Item' },
          { chave: 'itemTipo', rotulo: 'Tipo', exibir: (l) => (l.itemTipo === 'insumo' ? 'Insumo' : 'Produto'), csv: (l) => l.itemTipo },
          { chave: 'lote', rotulo: 'Lote' },
          { chave: 'validade', rotulo: 'Validade', tipo: 'data' },
          { chave: 'diasParaVencer', rotulo: 'Situação', exibir: situacao, csv: (l) => String(l.diasParaVencer) },
          { chave: 'qtd', rotulo: 'Quantidade', tipo: 'numero', casas: 1, exibir: (l) => `${F.numero(l.qtd, 1)} ${l.unidade}` },
          { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }
        ]
      })
    });
    el.onchange = (ev) => {
      if (ev.target.dataset.acao === 'filtro-tipo') NS.core.router.alterarQuery({ tipo: ev.target.value }, true);
    };
  }

  /** Campos do formulário de movimento. */
  function camposMovimento() {
    const C = NS.modules.comum;
    const itens = () => C.opcoesColecao('insumos', (i) => `Insumo · ${i.nome}`).map((o) => ({ valor: `insumo:${o.valor}`, rotulo: o.rotulo }))
      .concat(C.opcoesColecao('produtos', (p) => `Produto · ${p.nome}`).map((o) => ({ valor: `produto:${o.valor}`, rotulo: o.rotulo })));
    return [
      { nome: 'item', rotulo: 'Item', tipo: 'select', obrigatorio: true, opcoes: itens },
      { nome: 'tipo', rotulo: 'Tipo de movimento', tipo: 'select', obrigatorio: true, largura: 'terco', opcoes: C.opcoes(C.ROTULOS.tipoMovimento) },
      { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, largura: 'terco' },
      { nome: 'qtd', rotulo: 'Quantidade', tipo: 'numero', obrigatorio: true, largura: 'terco', casas: 3,
        ajuda: 'No ajuste, use negativo para reduzir o saldo.',
        validar: (v, t) => (v !== null && t.tipo !== 'ajuste' && v <= 0 ? 'Use uma quantidade maior que zero (o sinal vem do tipo de movimento).' : null) },
      { nome: 'valor', rotulo: 'Valor total', tipo: 'moeda', largura: 'terco', ajuda: 'Custo do movimento. No ajuste, negativo reduz o valor.' },
      { nome: 'lote', rotulo: 'Lote', tipo: 'texto', largura: 'terco' },
      { nome: 'validade', rotulo: 'Validade', tipo: 'data', largura: 'terco' },
      { nome: 'documento', rotulo: 'Documento (nota fiscal, requisição)', tipo: 'texto', largura: 'meia' },
      { nome: 'motivo', rotulo: 'Motivo', tipo: 'texto', largura: 'meia', ajuda: 'Obrigatório em perdas e ajustes.',
        validar: (v, t) => ((t.tipo === 'perda' || t.tipo === 'ajuste') && !v ? 'Informe o motivo da perda ou do ajuste.' : null) }
    ];
  }

  /** Abre o formulário de movimento (novo ou edição), conferindo a alçada de ajustes. */
  function abrirMovimento(reg) {
    const store = NS.core.store;
    const valores = reg ? Object.assign({}, reg, { item: `${reg.itemTipo}:${reg.itemId}` }) : { data: NS.core.hoje(), tipo: 'entrada' };
    NS.ui.abrirFormulario({
      titulo: reg ? 'Editar movimento de estoque' : 'Registrar movimento de estoque',
      campos: camposMovimento(), valores, rotuloSalvar: 'Salvar movimento', mensagemSucesso: null,
      aoSalvar: (v) => {
        const [itemTipo, itemId] = v.item.split(':');
        const dados = { data: v.data, itemTipo, itemId, tipo: v.tipo, qtd: v.qtd, valor: v.valor, lote: v.lote || '', validade: v.validade, documento: v.documento || '', motivo: v.motivo || '' };
        const salvar = () => {
          if (reg) store.atualizar('movimentosEstoque', reg.id, dados);
          else store.inserir('movimentosEstoque', dados);
          NS.ui.avisar('Movimento salvo.');
        };
        if (v.tipo === 'ajuste' || v.tipo === 'perda') {
          // Ajustes e perdas acima da alçada exigem aprovação registrada.
          setTimeout(async () => {
            const ok = await NS.modules.comum.conferirAlcada('Ajuste de estoque', Math.abs(Number(v.valor) || 0), `${v.tipo} · ${v.documento || v.motivo}`);
            if (ok) salvar(); else NS.ui.avisar('Movimento não salvo: a aprovação acima da alçada não foi registrada.', 'erro');
          }, 0);
          return true;
        }
        salvar();
        return true;
      }
    });
  }

  /** Aba de movimentos. */
  function abaMovimentos(el, ctx, query) {
    const { html, icone, raw } = NS.ui;
    const F = NS.core.format;
    const C = NS.modules.comum;
    const filtroItem = query.item || '';
    const filtroTipo = query.mov || '';
    const linhas = ctx.dados.movimentosEstoque
      .filter((m) => (!filtroItem || `${m.itemTipo}:${m.itemId}` === filtroItem) && (!filtroTipo || m.tipo === filtroTipo))
      .map((m) => Object.assign({}, m, { nome: infoItem(ctx, m.itemTipo, m.itemId).nome, unidade: infoItem(ctx, m.itemTipo, m.itemId).unidade, sinal: NS.calc.estoque.qtdComSinal(m) }));
    const opcoesItens = C.opcoesColecao('insumos').map((o) => ({ valor: `insumo:${o.valor}`, rotulo: `Insumo · ${o.rotulo}` }))
      .concat(C.opcoesColecao('produtos').map((o) => ({ valor: `produto:${o.valor}`, rotulo: `Produto · ${o.rotulo}` })));
    el.insertAdjacentHTML('beforeend', String(html`
      <div class="filtros">
        <label class="seletor">Item
          <select data-acao="filtro-item"><option value="">Todos os itens</option>
            ${opcoesItens.map((o) => html`<option value="${o.valor}" ${o.valor === filtroItem ? raw('selected') : ''}>${o.rotulo}</option>`)}</select></label>
        <label class="seletor">Tipo
          <select data-acao="filtro-mov"><option value="">Todos</option>
            ${Object.entries(C.ROTULOS.tipoMovimento).map(([k, r]) => html`<option value="${k}" ${k === filtroTipo ? raw('selected') : ''}>${r}</option>`)}</select></label>
        <button type="button" class="botao botao-primario" data-acao="novo-movimento">${icone('mais')}Registrar movimento</button>
      </div>
      <section class="bloco"><div class="bloco-cabecalho"><h2>Movimentos de estoque</h2>
        <p>Ajustes e perdas acima da alçada exigem aprovação registrada. Baixas de lotes de produção usam FEFO.</p></div>
        <div data-slot="tabela"></div></section>`));
    NS.ui.encaixar(el, {
      tabela: NS.ui.tabela({
        legenda: 'Movimentos de estoque', csv: 'estoque_movimentos', linhas, ordenarPor: 'data', ordem: 'desc', porPagina: 30,
        vazio: NS.ui.vazio('Nenhum movimento encontrado. Registre entradas, saídas, perdas e ajustes para acompanhar saldos e validade.', { rotulo: 'Registrar movimento', dataAcao: 'novo-movimento' }),
        colunas: [
          { chave: 'data', rotulo: 'Data', tipo: 'data' },
          { chave: 'nome', rotulo: 'Item' },
          { chave: 'tipo', rotulo: 'Tipo', exibir: (l) => C.ROTULOS.tipoMovimento[l.tipo], csv: (l) => C.ROTULOS.tipoMovimento[l.tipo] },
          { chave: 'sinal', rotulo: 'Quantidade', tipo: 'numero', casas: 3, exibir: (l) => `${F.numero(l.sinal, 3)} ${l.unidade}` },
          { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
          { chave: 'lote', rotulo: 'Lote' },
          { chave: 'validade', rotulo: 'Validade', tipo: 'data' },
          { chave: 'documento', rotulo: 'Documento' },
          { chave: 'motivo', rotulo: 'Motivo' },
          { rotulo: 'Ações', tipo: 'acoes', exibir: (l) => html`<button type="button" class="botao botao-texto botao-pequeno" data-acao="editar-movimento" data-id="${l.id}" aria-label="Editar movimento de ${l.nome} em ${F.data(l.data)}">${icone('editar')}Editar</button>
            <button type="button" class="botao botao-texto botao-pequeno" data-acao="excluir-movimento" data-id="${l.id}" aria-label="Excluir movimento de ${l.nome} em ${F.data(l.data)}">${icone('excluir')}Excluir</button>` }
        ]
      })
    });
    el.onclick = (ev) => {
      const alvo = ev.target.closest('[data-acao]');
      if (!alvo) return;
      if (alvo.dataset.acao === 'novo-movimento') abrirMovimento(null);
      else if (alvo.dataset.acao === 'editar-movimento') abrirMovimento(NS.core.store.obter('movimentosEstoque', alvo.dataset.id));
      else if (alvo.dataset.acao === 'excluir-movimento') {
        C.excluir({ colecao: 'movimentosEstoque', id: alvo.dataset.id, titulo: 'Excluir movimento', rotulo: 'Excluir movimento',
          mensagem: 'O movimento será excluído e os saldos serão recalculados.', sucesso: 'Movimento excluído.', descricaoLog: 'Movimento de estoque excluído.' });
      }
    };
    el.onchange = (ev) => {
      if (ev.target.dataset.acao === 'filtro-item') NS.core.router.alterarQuery({ item: ev.target.value }, true);
      if (ev.target.dataset.acao === 'filtro-mov') NS.core.router.alterarQuery({ mov: ev.target.value }, true);
    };
  }

  /** Aba de perdas: por motivo, nos lotes (12 meses) e nas baixas de estoque. */
  function abaPerdas(el, ctx) {
    const { html, graficos } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const comps = B.listaCompetencias(ctx.competencia, 12);
    const motivos = NS.calc.custos.MOTIVOS_PERDA;
    const series = motivos.map((m) => ({ nome: C.ROTULOS.motivoPerda[m], valores: comps.map((c) => ctx.resumoProducao(c).perdasPorMotivo[m]) }));
    const perdasEstoque = ctx.dados.movimentosEstoque.filter((m) => m.tipo === 'perda')
      .map((m) => Object.assign({}, m, { nome: infoItem(ctx, m.itemTipo, m.itemId).nome, unidade: infoItem(ctx, m.itemTipo, m.itemId).unidade }));
    const total12 = B.soma(comps, (c) => ctx.resumoProducao(c).perdasValor);
    el.insertAdjacentHTML('beforeend', String(html`
      <section class="bloco"><div class="bloco-cabecalho"><h2>Perdas de produção por motivo (12 meses)</h2>
        <p>Total no período: ${F.moeda(total12)}. Meta do índice de perdas: ${ctx.indicadoresPorId.get('indice_perdas') ? NS.modules.comum.textoMeta(ctx.indicadoresPorId.get('indice_perdas')) : 'a definir'}.</p></div>
        ${graficos.barrasAgrupadas({ grupos: comps.map(F.competencia), series, formatar: (v) => F.moedaCompacta(v), titulo: 'Perdas por motivo por mês', altura: 240 })}
        ${graficos.linha({ series: [{ nome: 'Índice de perdas', valores: comps.map((c) => ctx.resumoProducao(c).indicePerdas) }], rotulos: comps.map(F.competencia),
          meta: (ctx.indicadoresPorId.get('indice_perdas') || {}).meta, formatar: (v) => F.pct(v), altura: 180, titulo: 'Índice de perdas mensal', incluirZero: true })}
      </section>
      <section class="bloco"><div class="bloco-cabecalho"><h2>Baixas por perda no estoque</h2><p>Vencimento, avaria e outras perdas registradas como movimento.</p></div>
        <div data-slot="tabela"></div></section>`));
    NS.ui.encaixar(el, {
      tabela: NS.ui.tabela({
        legenda: 'Baixas por perda no estoque', csv: 'estoque_perdas', linhas: perdasEstoque, ordenarPor: 'data', ordem: 'desc',
        vazio: NS.ui.vazio('Nenhuma perda registrada no estoque.'),
        colunas: [
          { chave: 'data', rotulo: 'Data', tipo: 'data' },
          { chave: 'nome', rotulo: 'Item' },
          { chave: 'lote', rotulo: 'Lote' },
          { chave: 'qtd', rotulo: 'Quantidade', tipo: 'numero', casas: 1, exibir: (l) => `${F.numero(l.qtd, 1)} ${l.unidade}` },
          { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
          { chave: 'motivo', rotulo: 'Motivo' }
        ],
        totais: (ls) => ({ data: 'Total', valor: B.soma(ls, (l) => l.valor) })
      })
    });
  }

  /** Tela de estoque (uma aba por vez). */
  function tela(el, rota, ctx) {
    const { html } = NS.ui;
    const C = NS.modules.comum;
    const aba = rota.params.aba && ['fefo', 'movimentos', 'perdas'].includes(rota.params.aba) ? rota.params.aba : 'saldos';
    el.innerHTML = String(html`${C.cabecalho({ titulo: 'Estoque e perdas', subtitulo: 'Saldos, cobertura, validade (FEFO) e perdas. Estoque parado é capital de giro parado.' })}
      ${C.abas(ABAS, aba)}`);
    if (aba === 'saldos') abaSaldos(el, ctx);
    else if (aba === 'fefo') abaFefo(el, ctx, rota.query.tipo || '');
    else if (aba === 'movimentos') abaMovimentos(el, ctx, rota.query);
    else abaPerdas(el, ctx);
  }

  NS.modules.estoque = { rotas: { estoque: tela, 'estoque/:aba': tela }, baixarFEFO, abrirMovimento };
})(window);
