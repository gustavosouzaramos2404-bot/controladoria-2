/* ==========================================================================
   modules/custos.js
   Custos e produção:
   - registro de lotes (consumo real de insumos, MOD, perdas por motivo,
     horas paradas), com baixa automática opcional no estoque (FEFO);
   - custo padrão × custo real por produto e por lote;
   - análise de variações: preço (Compras, parcialmente controlável) e
     quantidade/eficiência (Produção, controlável), em R$ e %;
   - rendimento por lote e por produto, índice de perdas por motivo;
   - rateio do CIF do mês pelo critério configurado (horas ou kg).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  /** Campos do formulário de lote. */
  function camposLote(reg) {
    const C = NS.modules.comum;
    return [
      { nome: 'produtoId', rotulo: 'Produto', tipo: 'select', obrigatorio: true, largura: 'meia', opcoes: () => C.opcoesColecao('produtos') },
      { nome: 'lote', rotulo: 'Código do lote', tipo: 'texto', obrigatorio: true, largura: 'quarto', placeholder: 'PF-2609-1' },
      { nome: 'data', rotulo: 'Data de produção', tipo: 'data', obrigatorio: true, largura: 'quarto' },
      { nome: 'qtdPlanejada', rotulo: 'Quantidade planejada', tipo: 'numero', min: 0, largura: 'quarto' },
      { nome: 'qtdProduzida', rotulo: 'Quantidade produzida (boa)', tipo: 'numero', obrigatorio: true, min: 0, largura: 'quarto' },
      { nome: 'horasProducao', rotulo: 'Horas de produção', tipo: 'numero', min: 0, largura: 'quarto', ajuda: 'Base do rateio do CIF por horas.' },
      { nome: 'horasParadas', rotulo: 'Horas paradas', tipo: 'numero', min: 0, largura: 'quarto' },
      { nome: 'modReal', rotulo: 'Mão de obra direta real do lote', tipo: 'moeda', min: 0, largura: 'meia' },
      {
        nome: 'consumo', rotulo: 'Consumo real de insumos', tipo: 'lista', rotuloItem: 'insumo', rotuloAdicionar: 'Adicionar insumo consumido',
        ajuda: 'Ao escolher o produto de um lote novo, os insumos da ficha técnica são incluídos com o preço padrão: ajuste quantidade e preço reais.',
        campos: [
          { nome: 'insumoId', rotulo: 'Insumo', tipo: 'select', obrigatorio: true, opcoes: () => C.opcoesColecao('insumos', (i) => `${i.nome} (${i.unidade})`) },
          { nome: 'qtd', rotulo: 'Quantidade real', tipo: 'numero', obrigatorio: true, min: 0, casas: 3 },
          { nome: 'precoReal', rotulo: 'Preço real unitário', tipo: 'moeda', obrigatorio: true, min: 0 }
        ]
      },
      {
        nome: 'perdas', rotulo: 'Perdas', tipo: 'lista', rotuloItem: 'perda', rotuloAdicionar: 'Adicionar perda',
        campos: [
          { nome: 'motivo', rotulo: 'Motivo', tipo: 'select', obrigatorio: true, opcoes: C.opcoes(C.ROTULOS.motivoPerda) },
          { nome: 'qtd', rotulo: 'Quantidade', tipo: 'numero', min: 0 },
          { nome: 'valor', rotulo: 'Valor perdido', tipo: 'moeda', obrigatorio: true, min: 0 }
        ]
      },
      reg ? { tipo: 'info', rotulo: 'Ao editar, os movimentos de estoque já gerados não mudam: ajuste-os em Estoque se as quantidades mudarem.' }
        : { nome: 'gerarMovimentos', rotulo: 'Baixar os insumos do estoque (FEFO) e dar entrada do produto acabado', tipo: 'checkbox' }
    ];
  }

  /** Preenche o consumo com a ficha técnica quando o produto é escolhido (lote novo). */
  function ligarFichaTecnica(janela) {
    const form = janela.corpo.querySelector('form');
    const select = form.querySelector('[data-campo="produtoId"]');
    select.addEventListener('change', () => {
      const lista = form.querySelector('[data-lista="consumo"]');
      if (lista.querySelectorAll('.linha-lista').length) return; // não sobrescreve o que já foi digitado
      const produto = NS.core.store.obter('produtos', select.value);
      if (!produto) return;
      const F = NS.core.format;
      for (const f of produto.fichaTecnica || []) {
        lista.querySelector('[data-adicionar-linha]').click();
        const linhas = lista.querySelectorAll('.linha-lista');
        const linha = linhas[linhas.length - 1];
        linha.querySelector('[data-campo="insumoId"]').value = f.insumoId;
        const ins = NS.core.store.obter('insumos', f.insumoId);
        if (ins) linha.querySelector('[data-campo="precoReal"]').value = F.numero(ins.precoPadrao, 2);
      }
      select.focus();
    });
  }

  /** Gera os movimentos de estoque de um lote novo (baixa FEFO e entrada do acabado). */
  function gerarMovimentosLote(lote) {
    const store = NS.core.store;
    const B = NS.calc.base;
    const produto = store.obter('produtos', lote.produtoId);
    const doc = `Lote ${lote.lote}`;
    let materiais = 0;
    for (const c of lote.consumo || []) {
      materiais += B.num(c.qtd) * B.num(c.precoReal);
      NS.modules.estoque.baixarFEFO({ itemTipo: 'insumo', itemId: c.insumoId, qtd: c.qtd, data: lote.data, documento: doc, precoPadrao: c.precoReal });
    }
    const custo = materiais + B.num(lote.modReal) + B.num(produto && produto.cifPadrao) * B.num(lote.qtdProduzida);
    store.inserir('movimentosEstoque', {
      data: lote.data, itemTipo: 'produto', itemId: lote.produtoId, tipo: 'entrada', qtd: lote.qtdProduzida,
      valor: Math.round(custo * 100) / 100, lote: lote.lote,
      validade: produto && produto.validadeDias ? B.somarDias(lote.data, produto.validadeDias) : null,
      documento: 'Produção', motivo: ''
    });
  }

  /** Abre o formulário de lote (novo ou edição). */
  function abrirLote(reg) {
    const store = NS.core.store;
    const janela = NS.ui.abrirFormulario({
      titulo: reg ? `Editar lote ${reg.lote}` : 'Registrar lote de produção',
      campos: camposLote(reg),
      valores: reg || { data: NS.core.hoje(), consumo: [], perdas: [], gerarMovimentos: true },
      rotuloSalvar: 'Salvar lote',
      mensagemSucesso: 'Lote salvo.',
      larga: true,
      aoSalvar: (v) => {
        const { gerarMovimentos, ...dados } = v;
        if (!dados.consumo.length) return { erros: [{ campo: 'consumo', mensagem: 'Adicione o consumo real de pelo menos um insumo.' }] };
        if (dados.qtdPlanejada === null) dados.qtdPlanejada = dados.qtdProduzida;
        store.emLote(() => {
          if (reg) store.atualizar('lotes', reg.id, dados);
          else {
            const novo = store.inserir('lotes', dados);
            if (gerarMovimentos) gerarMovimentosLote(novo);
          }
        });
        return true;
      }
    });
    if (!reg) ligarFichaTecnica(janela);
  }

  /** Item da faixa de resumo. */
  function itemResumo(rotulo, valor, detalhe) {
    const { html } = NS.ui;
    return html`<div class="resumo-item"><div class="resumo-rotulo">${rotulo}</div><div class="resumo-valor">${valor}</div><div class="resumo-detalhe">${detalhe}</div></div>`;
  }

  /** Tela principal de custos da competência. */
  function telaCompetencia(el, rota, ctx) {
    const { html, raw, icone, status, graficos, variacao } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const comp = rota.query.comp && /^\d{4}-\d{2}$/.test(rota.query.comp) ? rota.query.comp : ctx.competencia;
    const lotesMes = ctx.lotesDaCompetencia(comp);
    const r = ctx.resumoProducao(comp);
    const kg = NS.calc.orcamento.volumeProduzido(ctx.dados.lotes, ctx.produtosPorId, comp);
    const dem = ctx.demPorComp.get(comp);
    const criterio = ctx.config.criterioRateioCIF === 'kg' ? 'quilos produzidos' : 'horas de produção';

    // Por produto
    const porProduto = ctx.dados.produtos.map((p) => {
      const rp = ctx.resumoProduto(comp, p.id);
      return Object.assign({ produto: p, id: p.id, nome: p.nome, meta: p.rendimentoPadrao }, rp);
    }).filter((x) => x.lotes > 0);

    // Por insumo (variações agregadas do mês)
    const porInsumo = new Map();
    for (const a of lotesMes) {
      for (const v of a.variacoes) {
        const x = porInsumo.get(v.insumoId) || { insumoId: v.insumoId, qtdReal: 0, qtdPermitida: 0, valorReal: 0, precoPadrao: v.precoPadrao, varPreco: 0, varQtd: 0 };
        x.qtdReal += v.qtdReal; x.qtdPermitida += v.qtdPermitida; x.valorReal += v.valorReal;
        x.varPreco += v.varPreco; x.varQtd += v.varQtd;
        porInsumo.set(v.insumoId, x);
      }
    }
    const linhasInsumo = Array.from(porInsumo.values()).map((x) => Object.assign(x, {
      nome: (ctx.insumosPorId.get(x.insumoId) || { nome: 'insumo removido' }).nome,
      unidade: (ctx.insumosPorId.get(x.insumoId) || {}).unidade || '',
      precoReal: B.div(x.valorReal, x.qtdReal),
      varPrecoPct: B.variacaoPct(B.div(x.valorReal, x.qtdReal), x.precoPadrao),
      varQtdPct: B.variacaoPct(x.qtdReal, x.qtdPermitida)
    }));

    // Séries de 12 meses
    const comps12 = B.listaCompetencias(comp, 12);
    const serieRend = comps12.map((c) => ctx.resumoProducao(c).rendimento);
    const seriePerdas = comps12.map((c) => ctx.resumoProducao(c).indicePerdas);
    const serieVar = comps12.map((c) => ctx.resumoProducao(c).variacaoPct);

    const sinal = (v) => (v > 0 ? 'desfavorável' : 'favorável');
    el.innerHTML = String(html`
      ${C.cabecalho({
        titulo: 'Custos e produção',
        subtitulo: raw(String(html`Custo padrão × real, variações e perdas de <strong>${F.competenciaExtenso(comp)}</strong>. Variação positiva aumenta o custo (desfavorável).`)),
        acoes: html`${C.seletorCompetencia(ctx.competencias, comp)}
          <button type="button" class="botao botao-primario" data-acao="novo-lote">${icone('mais')}Registrar lote</button>`
      })}
      ${lotesMes.length ? html`
      <section class="resumo" aria-label="Resumo da produção">
        ${itemResumo('Produção do mês', F.porUnidade(kg, 'kg'), `${r.lotes} lotes · ${F.numero(r.horasParadas, 1)} h paradas`)}
        ${itemResumo('Custo real × padrão', F.pct(r.variacaoPct), html`${F.moeda(r.variacaoTotal)} ${sinal(r.variacaoTotal)}`)}
        ${itemResumo('Variação de preço · Compras', F.moeda(r.varPreco), html`${sinal(r.varPreco)} · parcialmente controlável`)}
        ${itemResumo('Variação de quantidade · Produção', F.moeda(r.varQtd), html`${sinal(r.varQtd)} · controlável`)}
        ${itemResumo('Rendimento médio', F.pct(r.rendimento), `Perdas: ${F.pct(r.indicePerdas)} do consumo`)}
        ${itemResumo('MOD e CIF', F.moeda(r.varMOD + r.varCIF), `MOD ${F.moeda(r.varMOD)} · CIF ${F.moeda(r.varCIF)}`)}
      </section>` : ''}

      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Custo padrão × real por produto</h2>
          <p>Custo real = materiais reais + MOD real + CIF rateado (${criterio}).</p></div>
        <div data-slot="produtos"></div>
        ${porProduto.length ? graficos.barrasAgrupadas({
          grupos: porProduto.map((p) => p.nome.replace(/ \d.*$/, '')),
          series: [{ nome: 'Custo padrão unitário', valores: porProduto.map((p) => p.custoPadraoUnit) }, { nome: 'Custo real unitário', valores: porProduto.map((p) => p.custoUnitario) }],
          formatar: (v) => F.moeda(v), titulo: 'Custo padrão × real por unidade', altura: 220
        }) : ''}
        ${C.fonteDado('lotes de produção, fichas técnicas e preços padrão dos insumos', ['lotes', 'produtos', 'insumos'])}
      </section>

      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Análise de variações por insumo</h2>
          <p>Preço: (preço real − padrão) × qtd real → Compras. Quantidade: (qtd real − qtd permitida) × preço padrão → Produção.</p></div>
        <div data-slot="insumos"></div>
      </section>

      <div class="grade-2">
        <section class="bloco">
          <div class="bloco-cabecalho"><h2>Perdas por motivo</h2><p>Índice = valor perdido ÷ valor consumido no mês</p></div>
          ${r.lotes ? graficos.barras({
            horizontal: true,
            itens: Object.entries(r.perdasPorMotivo).map(([m, v]) => ({ rotulo: `${C.ROTULOS.motivoPerda[m]} (${F.pct(B.div(v, r.materiaisReal))})`, valor: v, classe: 'barra-negativa' })),
            formatar: (v) => F.moeda(v), titulo: 'Perdas por motivo no mês'
          }) : NS.ui.vazio('Sem lotes nesta competência.')}
        </section>
        <section class="bloco">
          <div class="bloco-cabecalho"><h2>Evolução em 12 meses</h2><p>Rendimento, perdas e variação de custo</p></div>
          ${graficos.linha({
            series: [{ nome: 'Rendimento', valores: serieRend }, { nome: 'Índice de perdas', valores: seriePerdas }, { nome: 'Variação real × padrão', valores: serieVar }],
            rotulos: comps12.map(F.competencia), formatar: (v) => F.pct(v), altura: 220, incluirZero: true,
            titulo: 'Rendimento, perdas e variação de custo em 12 meses'
          })}
        </section>
      </div>

      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Lotes de ${F.competencia(comp)}</h2>
          <p>CIF do mês a ratear: ${dem ? F.moeda(dem.custosFixos) : 'sem demonstração (usado o CIF padrão)'} · critério: ${criterio}</p></div>
        <div data-slot="lotes"></div>
      </section>`);

    const tabProdutos = NS.ui.tabela({
      legenda: 'Custo padrão e real por produto', csv: `custos_produtos_${comp}`, linhas: porProduto, ordenarPor: 'nome',
      vazio: NS.ui.vazio('Nenhum lote registrado nesta competência. Registre os lotes para comparar custo real e padrão.', { rotulo: 'Registrar lote', dataAcao: 'novo-lote' }),
      classeLinha: (l) => (l.rendimento !== null && l.rendimento < l.meta ? 'linha-atencao' : ''),
      colunas: [
        { chave: 'nome', rotulo: 'Produto' },
        { chave: 'qtdProduzida', rotulo: 'Produzido', tipo: 'quantidade' },
        { chave: 'custoPadraoUnit', rotulo: 'Padrão unit.', tipo: 'moeda' },
        { chave: 'custoUnitario', rotulo: 'Real unit.', tipo: 'moeda' },
        { chave: 'variacaoPct', rotulo: 'Variação', tipo: 'pct', exibir: (l) => variacao(l.variacaoPct <= 0, F.pct(l.variacaoPct)) },
        { chave: 'varPreco', rotulo: 'Preço (Compras)', tipo: 'moeda' },
        { chave: 'varQtd', rotulo: 'Quantidade (Produção)', tipo: 'moeda' },
        { chave: 'varMOD', rotulo: 'MOD', tipo: 'moeda' },
        { chave: 'varCIF', rotulo: 'CIF', tipo: 'moeda' },
        { chave: 'rendimento', rotulo: 'Rendimento', tipo: 'pct', exibir: (l) => html`${F.pct(l.rendimento)}<span class="subtexto">meta ${F.pct(l.meta)}</span>` },
        { chave: 'indicePerdas', rotulo: 'Perdas', tipo: 'pct' }
      ],
      totais: (ls) => ({
        nome: 'Total do mês', qtdProduzida: B.soma(ls, (l) => l.qtdProduzida), varPreco: B.soma(ls, (l) => l.varPreco), varQtd: B.soma(ls, (l) => l.varQtd),
        varMOD: B.soma(ls, (l) => l.varMOD), varCIF: B.soma(ls, (l) => l.varCIF), variacaoPct: r.variacaoPct, rendimento: r.rendimento, indicePerdas: r.indicePerdas
      })
    });

    const tabInsumos = NS.ui.tabela({
      legenda: 'Variações por insumo', csv: `variacoes_insumos_${comp}`, linhas: linhasInsumo, ordenarPor: 'varPreco', ordem: 'desc',
      vazio: NS.ui.vazio('Sem consumo registrado nesta competência.'),
      colunas: [
        { chave: 'nome', rotulo: 'Insumo' },
        { chave: 'qtdReal', rotulo: 'Qtd real', tipo: 'numero', casas: 1, exibir: (l) => `${F.numero(l.qtdReal, 1)} ${l.unidade}` },
        { chave: 'qtdPermitida', rotulo: 'Qtd permitida', tipo: 'numero', casas: 1 },
        { chave: 'varQtdPct', rotulo: 'Excesso de consumo', tipo: 'pct', exibir: (l) => variacao(l.varQtdPct <= 0, F.pct(l.varQtdPct)) },
        { chave: 'precoReal', rotulo: 'Preço real médio', tipo: 'moeda' },
        { chave: 'precoPadrao', rotulo: 'Preço padrão', tipo: 'moeda' },
        { chave: 'varPrecoPct', rotulo: 'Diferença de preço', tipo: 'pct', exibir: (l) => variacao(l.varPrecoPct <= 0, F.pct(l.varPrecoPct)) },
        { chave: 'varPreco', rotulo: 'Variação de preço (Compras)', tipo: 'moeda' },
        { chave: 'varQtd', rotulo: 'Variação de quantidade (Produção)', tipo: 'moeda' }
      ],
      totais: (ls) => ({ nome: 'Total', varPreco: B.soma(ls, (l) => l.varPreco), varQtd: B.soma(ls, (l) => l.varQtd) })
    });

    const linhasLotes = lotesMes.map((a) => Object.assign({}, a, {
      id: a.loteId, produto: (ctx.produtosPorId.get(a.produtoId) || { nome: '—' }).nome,
      atingido: B.div(a.qtdProduzida, a.qtdPlanejada), base: ctx.config.criterioRateioCIF === 'kg' ? a.qtdProduzida * B.num((ctx.produtosPorId.get(a.produtoId) || {}).pesoKg) : a.horasProducao
    }));
    const tabLotes = NS.ui.tabela({
      legenda: 'Lotes da competência', csv: `lotes_${comp}`, linhas: linhasLotes, ordenarPor: 'data',
      vazio: NS.ui.vazio('Nenhum lote nesta competência.', { rotulo: 'Registrar lote', dataAcao: 'novo-lote' }),
      classeLinha: (l) => (l.rendimento !== null && l.rendimento < l.rendimentoPadrao - 0.03 ? 'linha-fora' : (l.rendimento !== null && l.rendimento < l.rendimentoPadrao ? 'linha-atencao' : '')),
      colunas: [
        { chave: 'lote', rotulo: 'Lote', exibir: (l) => html`<a href="#/custos/lote/${l.id}">${l.lote}</a>` },
        { chave: 'produto', rotulo: 'Produto' },
        { chave: 'data', rotulo: 'Data', tipo: 'data' },
        { chave: 'qtdProduzida', rotulo: 'Produzido', tipo: 'quantidade' },
        { chave: 'atingido', rotulo: '% do planejado', tipo: 'pct' },
        { chave: 'custoUnitario', rotulo: 'Custo real unit.', tipo: 'moeda' },
        { chave: 'custoPadraoUnit', rotulo: 'Padrão unit.', tipo: 'moeda' },
        { chave: 'variacaoPct', rotulo: 'Variação', tipo: 'pct' },
        { chave: 'rendimento', rotulo: 'Rendimento', tipo: 'pct', exibir: (l) => html`${F.pct(l.rendimento)} ${l.rendimento !== null && l.rendimento < l.rendimentoPadrao ? status('atencao', 'abaixo') : ''}` },
        { chave: 'indicePerdas', rotulo: 'Perdas', tipo: 'pct' },
        { chave: 'base', rotulo: ctx.config.criterioRateioCIF === 'kg' ? 'Base (kg)' : 'Base (horas)', tipo: 'numero', casas: 1 },
        { chave: 'cif', rotulo: 'CIF rateado', tipo: 'moeda', exibir: (l) => html`${F.moeda(l.cif)}${l.cifFonte === 'padrao' ? html`<span class="subtexto">padrão</span>` : ''}` },
        { chave: 'horasParadas', rotulo: 'Horas paradas', tipo: 'numero', casas: 1 },
        { rotulo: 'Ações', tipo: 'acoes', exibir: (l) => html`<button type="button" class="botao botao-texto botao-pequeno" data-acao="editar-lote" data-id="${l.id}" aria-label="Editar lote ${l.lote}">${icone('editar')}Editar</button>
          <button type="button" class="botao botao-texto botao-pequeno" data-acao="excluir-lote" data-id="${l.id}" aria-label="Excluir lote ${l.lote}">${icone('excluir')}Excluir</button>` }
      ]
    });
    NS.ui.encaixar(el, { produtos: tabProdutos, insumos: tabInsumos, lotes: tabLotes });

    el.onclick = (ev) => {
      const alvo = ev.target.closest('[data-acao]');
      if (!alvo) return;
      const acao = alvo.dataset.acao;
      if (acao === 'novo-lote') abrirLote(null);
      else if (acao === 'editar-lote') abrirLote(NS.core.store.obter('lotes', alvo.dataset.id));
      else if (acao === 'excluir-lote') excluirLote(alvo.dataset.id);
    };
    el.onchange = (ev) => {
      if (ev.target.dataset.acao === 'trocar-competencia') NS.core.router.alterarQuery({ comp: ev.target.value });
    };
  }

  /** Exclui um lote com confirmação. */
  function excluirLote(id) {
    const reg = NS.core.store.obter('lotes', id);
    if (!reg) return;
    NS.modules.comum.excluir({
      colecao: 'lotes', id, titulo: 'Excluir lote', rotulo: 'Excluir lote', sucesso: 'Lote excluído.',
      mensagem: `O lote ${reg.lote} será excluído definitivamente. Os movimentos de estoque gerados por ele não são apagados.`,
      descricaoLog: `Lote excluído: ${reg.lote}.`
    });
  }

  /** Detalhe de um lote: variações por insumo, MOD, CIF e perdas. */
  function telaLote(el, rota, ctx) {
    const { html, icone, variacao } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const a = ctx.analisePorLote.get(rota.params.id);
    const reg = NS.core.store.obter('lotes', rota.params.id);
    if (!a || !reg) {
      el.innerHTML = String(html`${C.cabecalho({ titulo: 'Lote não encontrado' })}${NS.ui.vazio('Este lote não existe ou foi excluído.', { rotulo: 'Voltar para custos', rota: 'custos' })}`);
      return;
    }
    const produto = ctx.produtosPorId.get(a.produtoId);
    const linhas = a.variacoes.map((v) => Object.assign({}, v, {
      nome: (ctx.insumosPorId.get(v.insumoId) || { nome: 'insumo removido' }).nome + (v.foraDaFicha ? ' (fora da ficha)' : ''),
      unidade: (ctx.insumosPorId.get(v.insumoId) || {}).unidade || ''
    }));
    el.innerHTML = String(html`
      ${C.cabecalho({
        titulo: `Lote ${a.lote}`,
        migalha: html`<a href="#/custos?comp=${a.competencia}">${icone('voltar')}Custos de ${F.competencia(a.competencia)}</a>`,
        subtitulo: `${produto ? produto.nome : 'Produto removido'} · produzido em ${F.data(a.data)}`,
        acoes: html`<button type="button" class="botao botao-secundario" data-acao="editar">${icone('editar')}Editar lote</button>`
      })}
      <section class="resumo" aria-label="Resumo do lote">
        <div class="resumo-item"><div class="resumo-rotulo">Produzido</div><div class="resumo-valor">${F.numero(a.qtdProduzida)}</div><div class="resumo-detalhe">${F.pct(B.div(a.qtdProduzida, a.qtdPlanejada))} do planejado (${F.numero(a.qtdPlanejada)})</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Custo real unitário</div><div class="resumo-valor">${F.moeda(a.custoUnitario)}</div><div class="resumo-detalhe">Padrão ${F.moeda(a.custoPadraoUnit)}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Variação total</div><div class="resumo-valor">${F.moeda(a.variacaoTotal)}</div><div class="resumo-detalhe">${variacao(a.variacaoTotal <= 0, F.pct(a.variacaoPct))}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Rendimento</div><div class="resumo-valor">${F.pct(a.rendimento)}</div><div class="resumo-detalhe">Meta ${F.pct(a.rendimentoPadrao)}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Perdas</div><div class="resumo-valor">${F.pct(a.indicePerdas)}</div><div class="resumo-detalhe">${F.moeda(a.perdasValor)} perdidos</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Horas</div><div class="resumo-valor">${F.numero(a.horasProducao, 1)} h</div><div class="resumo-detalhe">${F.numero(a.horasParadas, 1)} h paradas</div></div>
      </section>
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Variações por insumo</h2><p>Qtd permitida = qtd padrão × qtd produzida ÷ rendimento padrão (${F.pct(a.rendimentoPadrao)})</p></div>
        <div data-slot="insumos"></div>
      </section>
      <div class="grade-2">
        <section class="bloco">
          <div class="bloco-cabecalho"><h2>Mão de obra e CIF</h2></div>
          <dl class="lista-definicao">
            <dt>MOD real</dt><dd class="num">${F.moeda(a.modReal)}</dd>
            <dt>MOD padrão (${F.moeda(a.padrao.mod)} × ${F.numero(a.qtdProduzida)})</dt><dd class="num">${F.moeda(a.modPadraoTotal)}</dd>
            <dt>Variação de MOD (Produção)</dt><dd class="num">${variacao(a.varMOD <= 0, F.moeda(a.varMOD))}</dd>
            <dt>CIF ${a.cifFonte === 'rateado' ? 'rateado do mês' : 'padrão (sem demonstração do mês)'}</dt><dd class="num">${F.moeda(a.cif)}</dd>
            <dt>CIF padrão</dt><dd class="num">${F.moeda(a.cifPadraoTotal)}</dd>
            <dt>Variação de CIF</dt><dd class="num">${variacao(a.varCIF <= 0, F.moeda(a.varCIF))}</dd>
          </dl>
        </section>
        <section class="bloco">
          <div class="bloco-cabecalho"><h2>Perdas do lote</h2></div>
          ${(reg.perdas || []).length ? html`<dl class="lista-definicao">${reg.perdas.map((p) => html`<dt>${C.ROTULOS.motivoPerda[p.motivo]} (${F.numero(p.qtd)} un.)</dt><dd class="num">${F.moeda(p.valor)}</dd>`)}</dl>`
            : html`<p class="suave">Nenhuma perda registrada neste lote.</p>`}
        </section>
      </div>`);
    const tab = NS.ui.tabela({
      legenda: `Variações por insumo do lote ${a.lote}`, csv: `lote_${a.lote}`, linhas, ordenarPor: 'nome',
      colunas: [
        { chave: 'nome', rotulo: 'Insumo' },
        { chave: 'qtdReal', rotulo: 'Qtd real', tipo: 'numero', casas: 3, exibir: (l) => `${F.numero(l.qtdReal, 3)} ${l.unidade}` },
        { chave: 'qtdPermitida', rotulo: 'Qtd permitida', tipo: 'numero', casas: 3 },
        { chave: 'varQtdPct', rotulo: 'Excesso', tipo: 'pct' },
        { chave: 'precoReal', rotulo: 'Preço real', tipo: 'moeda' },
        { chave: 'precoPadrao', rotulo: 'Preço padrão', tipo: 'moeda' },
        { chave: 'varPreco', rotulo: 'Variação de preço (Compras)', tipo: 'moeda' },
        { chave: 'varQtd', rotulo: 'Variação de quantidade (Produção)', tipo: 'moeda' }
      ],
      totais: (ls) => ({ nome: 'Total', varPreco: B.soma(ls, (l) => l.varPreco), varQtd: B.soma(ls, (l) => l.varQtd) })
    });
    NS.ui.encaixar(el, { insumos: tab });
    el.onclick = (ev) => {
      if (ev.target.closest('[data-acao="editar"]')) abrirLote(reg);
    };
  }

  NS.modules.custos = { rotas: { custos: telaCompetencia, 'custos/lote/:id': telaLote }, abrirLote };
})(window);
