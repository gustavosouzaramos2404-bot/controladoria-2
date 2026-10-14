/* ==========================================================================
   calc/contexto.js
   Monta o "contexto de cálculo" a partir dos dados brutos: mapas por id,
   custo padrão de cada produto, rateio do CIF, análise de todos os lotes,
   empenhos por contrato e acessores memorizados (calculam uma vez e
   reaproveitam) para apuração mensal, contratos, órgãos, estoque, caixa,
   alertas e indicadores. Puro: recebe dados e a data de hoje.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};

  /** Cria o contexto de cálculo para os dados e a data de hoje informados. */
  function criar(dados, hoje) {
    const B = NS.calc.base;
    const Cu = NS.calc.custos;
    const empresa = dados.empresa || {};
    const config = dados.configuracoes || {};
    const memoria = new Map();

    const ctx = {
      hoje,
      dados,
      empresa,
      config,
      limites: config.alertas || {},
      competencia: empresa.competenciaAtual,
      /** Calcula uma vez por chave e reaproveita nas chamadas seguintes. */
      memo(chave, fn) {
        if (!memoria.has(chave)) memoria.set(chave, fn());
        return memoria.get(chave);
      }
    };

    // Mapas por id
    ctx.insumosPorId = B.mapaPorId(dados.insumos);
    ctx.produtosPorId = B.mapaPorId(dados.produtos);
    ctx.orgaosPorId = B.mapaPorId(dados.orgaos);
    ctx.contratosPorId = B.mapaPorId(dados.contratos);
    ctx.centrosPorId = B.mapaPorId(dados.centros);
    ctx.indicadoresPorId = B.mapaPorId(dados.indicadores);
    ctx.pesoKg = new Map((dados.produtos || []).map((p) => [p.id, p.pesoKg]));

    // Custo padrão unitário de cada produto
    ctx.custosPadrao = new Map((dados.produtos || []).map((p) => [p.id, Cu.custoPadraoUnitario(p, ctx.insumosPorId)]));

    // Demonstrações por competência
    ctx.demPorComp = new Map((dados.demonstracoes || []).map((d) => [d.competencia, d]));

    // Rateio do CIF do mês (custos fixos de produção) entre os lotes do mês
    const rateio = new Map();
    const lotesPorComp = B.agruparPor(dados.lotes, (l) => B.competenciaDe(l.data));
    for (const [comp, lotes] of lotesPorComp) {
      const dem = ctx.demPorComp.get(comp);
      if (!dem || !B.ehNumero(dem.custosFixos)) continue;
      const m = Cu.rateioCIF(dem.custosFixos, lotes, config.criterioRateioCIF || 'horas', ctx.pesoKg);
      for (const [id, v] of m) if (v !== null) rateio.set(id, v);
    }
    ctx.rateioPorLote = rateio;

    // Análise de cada lote (ordenada por data)
    ctx.analisesLotes = (dados.lotes || [])
      .map((l) => {
        const p = ctx.produtosPorId.get(l.produtoId);
        if (!p) return null;
        const a = Cu.analisarLote(l, p, ctx.insumosPorId, rateio.has(l.id) ? rateio.get(l.id) : null);
        return Object.assign(a, { loteId: l.id, produtoId: l.produtoId, lote: l.lote, data: l.data, competencia: B.competenciaDe(l.data) });
      })
      .filter(Boolean)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    ctx.analisePorLote = new Map(ctx.analisesLotes.map((a) => [a.loteId, a]));

    // Empenhos por contrato
    ctx.empenhosPorContrato = B.agruparPor(dados.empenhos, (e) => e.contratoId);

    // Competências com algum dado (para seletores e séries)
    const comps = new Set();
    for (const d of dados.demonstracoes || []) comps.add(d.competencia);
    for (const l of dados.lotes || []) comps.add(B.competenciaDe(l.data));
    if (empresa.competenciaAtual) comps.add(empresa.competenciaAtual);
    ctx.competencias = Array.from(comps).filter(Boolean).sort();

    /* ----------------------- Acessores memorizados ----------------------- */

    /** Data de corte de uma competência (último dia, ou hoje se ainda não terminou). */
    ctx.corte = (comp) => B.corteDaCompetencia(comp, hoje);

    /** Análises dos lotes de uma competência. */
    ctx.lotesDaCompetencia = (comp) => ctx.analisesLotes.filter((a) => a.competencia === comp);

    /** Resumo da produção do mês (geral). */
    ctx.resumoProducao = (comp) => ctx.memo(`prod:${comp}`, () => Cu.resumirAnalises(ctx.lotesDaCompetencia(comp)));

    /** Resumo da produção do mês para um produto. */
    ctx.resumoProduto = (comp, produtoId) => ctx.memo(`prod:${comp}:${produtoId}`,
      () => Cu.resumirAnalises(ctx.lotesDaCompetencia(comp).filter((a) => a.produtoId === produtoId)));

    /** Apuração financeira completa da competência (DREs, balanço, indicadores). */
    ctx.apuracao = (comp) => ctx.memo(`fin:${comp}`, () => {
      const dem = ctx.demPorComp.get(comp);
      if (!dem) return null;
      const ant = ctx.demPorComp.get(B.somarCompetencia(comp, -1)) || null;
      const ult12 = B.listaCompetencias(comp, 12).map((c) => ctx.demPorComp.get(c)).filter(Boolean);
      return NS.calc.financeiros.apurarMes(dem, ant, empresa, ult12);
    });

    /** Análise de todos os contratos na data de corte. */
    ctx.contratosAnalisados = (corte = hoje) => ctx.memo(`contratos:${corte}`,
      () => (dados.contratos || []).map((c) => NS.calc.contratos.analisarContrato(c, ctx, corte)));

    /** Análise de um contrato na data de corte. */
    ctx.contratoAnalisado = (id, corte = hoje) => ctx.contratosAnalisados(corte).find((a) => a.contrato.id === id) || null;

    /** Análise de todos os órgãos na data de corte. */
    ctx.orgaosAnalisados = (corte = hoje) => ctx.memo(`orgaos:${corte}`,
      () => (dados.orgaos || []).map((o) => NS.calc.contratos.analisarOrgao(o, ctx, corte)));

    /** Prazos médios reais por órgão: Map orgaoId -> {desdeLiquidacao, desdeEntrega}. */
    ctx.prazosReais = (corte = hoje) => ctx.memo(`prazos:${corte}`, () => new Map(ctx.orgaosAnalisados(corte)
      .map((a) => [a.orgao.id, { desdeLiquidacao: a.prazoMedioLiquidacao, desdeEntrega: a.prazoMedioEntrega }])));

    /** Estoque atual: saldos por item, por lote e lista FEFO. */
    ctx.estoque = (ate = hoje) => ctx.memo(`estoque:${ate}`, () => {
      const E = NS.calc.estoque;
      const saldos = E.saldos(dados.movimentosEstoque, ate);
      const lotes = E.saldosPorLote(dados.movimentosEstoque, ate);
      return { saldos, lotes, fefo: E.fefo(lotes, ate) };
    });

    /** Saldo de caixa realizado até hoje (saldo inicial + realizados após a data do saldo inicial). */
    ctx.saldoCaixa = () => ctx.memo('caixa:saldo', () => {
      const desde = empresa.dataSaldoInicial;
      const lista = (dados.lancamentos || []).filter((l) => !desde || l.data > desde);
      return NS.calc.capitalGiro.saldoCaixa(lista, empresa.saldoInicialCaixa, hoje);
    });

    /** Projeção de caixa de 13 semanas (recebimentos de contratos pelo prazo médio real). */
    ctx.projecaoCaixa = () => ctx.memo('caixa:projecao', () => {
      const CG = NS.calc.capitalGiro;
      const recebimentos = CG.recebimentosPrevistos({
        empenhos: dados.empenhos, contratosPorId: ctx.contratosPorId, orgaosPorId: ctx.orgaosPorId,
        prazosReais: ctx.prazosReais(hoje), hoje
      });
      const previstos = (dados.lancamentos || []).filter((l) => l.situacao === 'previsto');
      // Entradas previstas de contratos já vêm dos empenhos; evita contar duas vezes.
      const entradas = recebimentos.map((r) => Object.assign({ origem: 'contrato' }, r)).concat(
        previstos.filter((l) => l.tipo === 'entrada' && l.categoria !== 'Recebimento de contratos')
          .map((l) => ({ data: l.data, valor: l.valor, origem: 'lancamento', lancamentoId: l.id, categoria: l.categoria })));
      const saidas = previstos.filter((l) => l.tipo === 'saida')
        .map((l) => ({ data: l.data, valor: l.valor, origem: 'lancamento', lancamentoId: l.id, categoria: l.categoria }));
      const proj = CG.projecao13Semanas({
        hoje, saldoInicial: ctx.saldoCaixa(), entradas, saidas, semanas: ctx.limites.caixaSemanas || 13
      });
      proj.recebimentos = recebimentos;
      return proj;
    });

    /** Vendas (entregas realizadas) por produto na competência: qtd, valor e preço médio. */
    ctx.vendasPorProduto = (comp) => ctx.memo(`vendas:${comp}`, () => {
      const mapa = new Map();
      for (const emp of dados.empenhos || []) {
        for (const e of emp.entregas || []) {
          if (!B.naCompetencia(e.real, comp)) continue;
          const v = mapa.get(e.produtoId) || { produtoId: e.produtoId, q: 0, valor: 0 };
          v.q += B.num(e.qtd);
          v.valor += B.num(e.valor);
          mapa.set(e.produtoId, v);
        }
      }
      for (const v of mapa.values()) v.p = B.div(v.valor, v.q);
      return mapa;
    });

    /**
     * Custo variável unitário real do produto na competência e a parcela de
     * ineficiência (variação de quantidade + MOD por unidade). Sem lotes no mês,
     * usa os últimos 3 lotes até o corte; sem lotes, o padrão.
     */
    ctx.custoVariavelProduto = (produtoId, comp) => ctx.memo(`cv:${produtoId}:${comp}`, () => {
      let lotes = ctx.lotesDaCompetencia(comp).filter((a) => a.produtoId === produtoId);
      let fonte = 'lotes do mês';
      if (lotes.length === 0) {
        const corte = ctx.corte(comp);
        lotes = ctx.analisesLotes.filter((a) => a.produtoId === produtoId && a.data <= corte).slice(-3);
        fonte = 'últimos lotes';
      }
      if (lotes.length === 0) {
        const p = ctx.custosPadrao.get(produtoId);
        return { c: p ? p.variavel : null, ve: 0, fonte: 'padrão' };
      }
      const r = Cu.resumirAnalises(lotes);
      return { c: r.custoVariavelUnit, ve: B.div(r.varQtd + r.varMOD, r.qtdProduzida), fonte };
    });

    /** Itens da ponte de margem de uma competência (vendas × custo variável). */
    ctx.itensPonte = (comp) => Array.from(ctx.vendasPorProduto(comp).values()).map((v) => {
      const c = ctx.custoVariavelProduto(v.produtoId, comp);
      return { produtoId: v.produtoId, q: v.q, p: v.p, c: c.c, ve: c.ve };
    });

    /** Ponte de margem entre a competência anterior e a atual. */
    ctx.ponteMargem = (comp) => ctx.memo(`ponte:${comp}`,
      () => NS.calc.financeiros.ponteMargem(ctx.itensPonte(B.somarCompetencia(comp, -1)), ctx.itensPonte(comp)));

    /** Avaliação de todos os indicadores na competência. */
    ctx.avaliacoes = (comp) => ctx.memo(`ind:${comp}`, () => NS.calc.indicadores.avaliarTodos(ctx, comp));

    /** Alertas ativos (Central de desvios). */
    ctx.alertas = () => ctx.memo('alertas', () => NS.calc.alertas.gerar(ctx));

    return ctx;
  }

  const contexto = { criar };
  NS.calc.contexto = contexto;
  if (typeof module !== 'undefined' && module.exports) module.exports = contexto;
})(typeof window !== 'undefined' ? window : globalThis);
