/* ==========================================================================
   calc/indicadores.js
   Registro central de indicadores (Balanced Scorecard) e motor de status.
   - PADRAO: estrutura de cada indicador (fórmula legível, fonte, unidade,
     sentido, se é controlável, ação sugerida). Meta, tolerâncias e
     responsável começam EM BRANCO: são definidos pelo usuário em
     Configurações; sem meta, o status é 'sem-meta' (nada é inventado).
   - funcoes: cálculo de cada indicador para uma competência.
   - calcularStatus: compara realizado × meta e classifica em dentro,
     atenção ou fora (ou sem dados).
   Tolerâncias ficam na unidade do indicador (p.p. como fração para %,
   dias, R$ ou vezes). Desvio desfavorável d: até a tolerância de atenção
   está "dentro"; até a de fora, "atenção"; acima, "fora".
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};
  const B = () => NS.calc.base;

  const PERSPECTIVAS = [
    { id: 'financeira', nome: 'Financeira' },
    { id: 'clientes', nome: 'Clientes (órgãos públicos)' },
    { id: 'processos', nome: 'Processos internos' },
    { id: 'aprendizado', nome: 'Aprendizado e crescimento' }
  ];

  // Janela de cada frequência de controle interno, em dias.
  const JANELA_FREQUENCIA = { semanal: 7, quinzenal: 15, mensal: 31, trimestral: 92, semestral: 183, anual: 366 };

  // Estrutura dos indicadores. Metas, tolerâncias e responsáveis em branco (preencher em Configurações).
  const PADRAO = [
    // ---------------------------- Financeira ----------------------------
    {
      id: 'mc_pct', nome: 'Margem de contribuição %', perspectiva: 'financeira', unidade: 'pct',
      formula: 'MC % = (receita líquida − custos variáveis − despesas variáveis) ÷ receita líquida',
      funcaoCalculo: 'mc_pct', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Revisar mix de contratos e custos variáveis dos itens com menor margem.',
      fonte: 'Demonstração mensal (DRE gerencial)', colecoesFonte: ['demonstracoes'], historico: true, pareadoCom: 'entregas_prazo'
    },
    {
      id: 'margem_ebitda', nome: 'Margem EBITDA', perspectiva: 'financeira', unidade: 'pct',
      formula: 'Margem EBITDA = (EBIT + depreciação) ÷ receita líquida',
      funcaoCalculo: 'margem_ebitda', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Comparar custos e despesas fixas com o orçamento e atacar as maiores variações.',
      fonte: 'Demonstração mensal (DRE gerencial)', colecoesFonte: ['demonstracoes'], historico: true, pareadoCom: ''
    },
    {
      id: 'roi', nome: 'ROI (margem × giro, a.a.)', perspectiva: 'financeira', unidade: 'pct',
      formula: 'ROI = margem operacional (EBIT ÷ receita líquida) × giro do ativo anualizado (receita líquida × 12 ÷ ativo total médio)',
      funcaoCalculo: 'roi', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Ver na decomposição se a queda veio da margem ou do giro e agir sobre o fator dominante.',
      fonte: 'Demonstração mensal (DRE gerencial e balanço)', colecoesFonte: ['demonstracoes'], historico: true, pareadoCom: ''
    },
    {
      id: 'ciclo_caixa', nome: 'Ciclo de caixa', perspectiva: 'financeira', unidade: 'dias',
      formula: 'Ciclo de caixa = PME + PMR − PMP (prazos médios de estocagem, recebimento e pagamento)',
      funcaoCalculo: 'ciclo_caixa', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Cobrar liquidações e pagamentos atrasados dos órgãos e revisar estoques parados.',
      fonte: 'Demonstração mensal (balanço, receita, CPV e compras)', colecoesFonte: ['demonstracoes'], historico: true, pareadoCom: 'entregas_prazo'
    },
    {
      id: 'dl_ebitda', nome: 'Dívida líquida ÷ EBITDA', perspectiva: 'financeira', unidade: 'vezes',
      formula: 'DL ÷ EBITDA = (empréstimos CP + LP − disponível) ÷ EBITDA dos últimos 12 meses',
      funcaoCalculo: 'dl_ebitda', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Rever cronograma de amortização e geração de caixa antes de novas captações.',
      fonte: 'Demonstrações dos últimos 12 meses', colecoesFonte: ['demonstracoes'], historico: true, pareadoCom: ''
    },
    {
      id: 'eva', nome: 'EVA do mês', perspectiva: 'financeira', unidade: 'moeda',
      formula: 'EVA = NOPAT (EBIT × (1 − alíquota efetiva)) − capital investido (PL + empréstimos) × custo de capital do período',
      funcaoCalculo: 'eva', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Aumentar o retorno operacional ou reduzir capital parado (estoques, recebíveis vencidos).',
      fonte: 'Demonstração mensal e cadastro da empresa (alíquota e custo de capital)', colecoesFonte: ['demonstracoes'], historico: true, pareadoCom: ''
    },
    // ----------------------------- Clientes -----------------------------
    {
      id: 'entregas_prazo', nome: 'Entregas no prazo %', perspectiva: 'clientes', unidade: 'pct',
      formula: 'Entregas no prazo = entregas com data real ≤ data prevista ÷ entregas previstas no mês (pendentes vencidas contam como atraso)',
      funcaoCalculo: 'entregas_prazo', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Revisar programação de produção e expedição dos empenhos com prazo curto.',
      fonte: 'Entregas dos empenhos', colecoesFonte: ['empenhos'], historico: true, pareadoCom: ''
    },
    {
      id: 'glosas_pct', nome: 'Glosas %', perspectiva: 'clientes', unidade: 'pct',
      formula: 'Glosas % = valor glosado nas liquidações do mês ÷ valor faturado desses empenhos',
      funcaoCalculo: 'glosas_pct', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Levantar o motivo de cada glosa (qualidade, documentação, quantidade) e corrigir na origem.',
      fonte: 'Liquidações dos empenhos', colecoesFonte: ['empenhos'], historico: true, pareadoCom: ''
    },
    {
      id: 'prazo_recebimento', nome: 'Prazo médio real de recebimento', perspectiva: 'clientes', unidade: 'dias',
      formula: 'Prazo médio = média de (data do pagamento − data da última entrega) dos empenhos pagos no mês',
      funcaoCalculo: 'prazo_recebimento', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Acompanhar liquidação junto ao fiscal do contrato e cobrar formalmente pagamentos vencidos.',
      fonte: 'Pagamentos e entregas dos empenhos', colecoesFonte: ['empenhos'], historico: true, pareadoCom: ''
    },
    {
      id: 'margem_contratos', nome: 'Margem atual média dos contratos', perspectiva: 'clientes', unidade: 'pct',
      formula: 'Média ponderada pelo valor registrado de (preço contratado − custo real médio dos últimos 3 lotes) ÷ preço contratado, contratos vigentes',
      funcaoCalculo: 'margem_contratos', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Avaliar reequilíbrio dos itens com maior defasagem e rever custos de produção.',
      fonte: 'Contratos, empenhos e lotes de produção', colecoesFonte: ['contratos', 'lotes'], historico: true, pareadoCom: ''
    },
    {
      id: 'concentracao', nome: 'Concentração no maior órgão', perspectiva: 'clientes', unidade: 'pct',
      formula: 'Concentração = faturamento do maior órgão nos últimos 12 meses ÷ faturamento total',
      funcaoCalculo: 'concentracao', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Priorizar licitações de outros órgãos e esferas para diluir o risco.',
      fonte: 'Entregas dos empenhos', colecoesFonte: ['empenhos'], historico: true, pareadoCom: ''
    },
    // ------------------------ Processos internos ------------------------
    {
      id: 'variacao_custo', nome: 'Variação de custo real × padrão', perspectiva: 'processos', unidade: 'pct',
      formula: 'Variação = (custo real dos lotes do mês − custo padrão da produção) ÷ custo padrão. Aberta em preço (Compras), quantidade (Produção), MOD e CIF',
      funcaoCalculo: 'variacao_custo', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Separar o que é preço (Compras) do que é consumo (Produção) e tratar cada parte com o responsável.',
      fonte: 'Lotes de produção e fichas técnicas', colecoesFonte: ['lotes', 'produtos', 'insumos'], historico: true, pareadoCom: 'glosas_pct'
    },
    {
      id: 'rendimento', nome: 'Rendimento médio', perspectiva: 'processos', unidade: 'pct',
      formula: 'Rendimento = qtd produzida ÷ produção teórica do insumo consumido (consumo valorizado a preço padrão ÷ materiais padrão por unidade)',
      funcaoCalculo: 'rendimento', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Verificar regulagem de equipamentos e perdas de processo nos lotes com menor rendimento.',
      fonte: 'Lotes de produção', colecoesFonte: ['lotes'], historico: true, pareadoCom: ''
    },
    {
      id: 'indice_perdas', nome: 'Índice de perdas', perspectiva: 'processos', unidade: 'pct',
      formula: 'Índice de perdas = valor perdido (processo, validade, avaria, qualidade) ÷ valor total consumido nos lotes do mês',
      funcaoCalculo: 'indice_perdas', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Atacar o motivo de perda mais relevante do mês.',
      fonte: 'Lotes de produção (perdas por motivo)', colecoesFonte: ['lotes'], historico: true, pareadoCom: 'rendimento'
    },
    {
      id: 'giro_estoque', nome: 'Giro de estoque (a.a.)', perspectiva: 'processos', unidade: 'vezes',
      formula: 'Giro = CPV do mês × 12 ÷ estoque médio (saldo do mês e do mês anterior)',
      funcaoCalculo: 'giro_estoque', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Reduzir compras de itens com cobertura alta e acelerar a saída pelo FEFO.',
      fonte: 'Demonstração mensal (CPV e estoques)', colecoesFonte: ['demonstracoes'], historico: true, pareadoCom: 'entregas_prazo'
    },
    {
      id: 'contratos_defasagem', nome: 'Contratos com defasagem acima do limite', perspectiva: 'processos', unidade: 'quantidade',
      formula: 'Quantidade de contratos vigentes com algum item cuja defasagem de custo é ≥ limite de atenção (padrão 5%)',
      funcaoCalculo: 'contratos_defasagem', sentido: 'menor-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'parcial',
      acaoSugerida: 'Montar a evidência de custos e levar ao jurídico para avaliar reequilíbrio ou reajuste.',
      fonte: 'Contratos e lotes de produção', colecoesFonte: ['contratos', 'lotes'], historico: true, pareadoCom: ''
    },
    // --------------------- Aprendizado e crescimento ---------------------
    {
      id: 'planos_prazo', nome: 'Planos de ação concluídos no prazo', perspectiva: 'aprendizado', unidade: 'pct',
      formula: 'Planos concluídos até o prazo ÷ planos com prazo no mês (cancelados não entram)',
      funcaoCalculo: 'planos_prazo', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Cobrar os responsáveis pelos planos vencidos na reunião mensal de resultados.',
      fonte: 'Planos de ação', colecoesFonte: ['planosAcao'], historico: true, pareadoCom: ''
    },
    {
      id: 'controles_testados', nome: 'Controles internos testados no período', perspectiva: 'aprendizado', unidade: 'pct',
      formula: 'Controles com teste dentro da frequência definida (semanal, mensal etc.) ÷ total de controles',
      funcaoCalculo: 'controles_testados', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Agendar os testes atrasados com os responsáveis de cada área.',
      fonte: 'Controles internos (histórico de testes)', colecoesFonte: ['controles'], historico: true, pareadoCom: ''
    },
    {
      id: 'documentos_dia', nome: 'Documentos de habilitação em dia', perspectiva: 'aprendizado', unidade: 'pct',
      formula: 'Documentos com vencimento posterior à data de corte ÷ total de documentos',
      funcaoCalculo: 'documentos_dia', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Renovar imediatamente os documentos vencidos: sem eles a empresa pode ser inabilitada.',
      fonte: 'Documentos de habilitação (só a situação atual; não há histórico)', colecoesFonte: ['documentos'], historico: false, pareadoCom: ''
    },
    {
      id: 'producao_funcionario', nome: 'Produção por funcionário', perspectiva: 'aprendizado', unidade: 'kg',
      formula: 'Produção do mês em kg (qtd produzida × peso) ÷ número de funcionários',
      funcaoCalculo: 'producao_funcionario', sentido: 'maior-melhor', meta: null, toleranciaAtencao: null, toleranciaFora: null,
      responsavel: '', periodicidade: 'mensal', controlavel: 'sim',
      acaoSugerida: 'Rever paradas de linha e alocação de equipes.',
      fonte: 'Lotes de produção e cadastro da empresa', colecoesFonte: ['lotes'], historico: true, pareadoCom: ''
    }
  ];

  /* ---------------------- Funções de cálculo ---------------------- */

  /** Todas as entregas de todos os empenhos (achatadas). */
  function todasEntregas(ctx) {
    return ctx.memo('entregas:todas', () => {
      const r = [];
      for (const emp of ctx.dados.empenhos || []) for (const e of emp.entregas || []) r.push(e);
      return r;
    });
  }

  const funcoes = {
    mc_pct(ctx, comp) {
      const a = ctx.apuracao(comp);
      return a ? a.dre.mcPct : null;
    },
    margem_ebitda(ctx, comp) {
      const a = ctx.apuracao(comp);
      return a ? a.dre.margemEbitda : null;
    },
    roi(ctx, comp) {
      const a = ctx.apuracao(comp);
      if (!a) return null;
      return {
        valor: a.roi.roi,
        detalhe: [
          { rotulo: 'Margem operacional', valor: a.roi.margem, unidade: 'pct' },
          { rotulo: 'Giro do ativo (a.a.)', valor: a.roi.giro, unidade: 'vezes' }
        ]
      };
    },
    ciclo_caixa(ctx, comp) {
      const a = ctx.apuracao(comp);
      if (!a || !a.ciclo) return null;
      return {
        valor: a.ciclo.caixa,
        detalhe: [
          { rotulo: 'PME', valor: a.ciclo.pme, unidade: 'dias' },
          { rotulo: 'PMR', valor: a.ciclo.pmr, unidade: 'dias' },
          { rotulo: 'PMP', valor: a.ciclo.pmp, unidade: 'dias' }
        ]
      };
    },
    dl_ebitda(ctx, comp) {
      const a = ctx.apuracao(comp);
      if (!a) return null;
      return {
        valor: a.dlEbitda,
        detalhe: [
          { rotulo: 'Dívida líquida', valor: a.dividaLiquida, unidade: 'moeda' },
          { rotulo: `EBITDA 12 meses (${a.mesesEbitda} meses de dados)`, valor: a.ebitda12m, unidade: 'moeda' }
        ]
      };
    },
    eva(ctx, comp) {
      const a = ctx.apuracao(comp);
      if (!a) return null;
      return {
        valor: a.eva,
        detalhe: [
          { rotulo: 'NOPAT', valor: a.nopat, unidade: 'moeda' },
          { rotulo: 'Capital investido', valor: a.capitalInvestido, unidade: 'moeda' },
          { rotulo: 'Custo de capital do período', valor: a.custoCapitalPeriodo, unidade: 'pct' }
        ]
      };
    },
    entregas_prazo(ctx, comp) {
      const { primeiroDia } = B();
      const corte = ctx.corte(comp);
      const lista = todasEntregas(ctx).filter((e) => e.prevista >= primeiroDia(comp) && e.prevista <= corte);
      const r = NS.calc.contratos.entregasNoPrazo(lista, corte);
      return {
        valor: r.pct,
        detalhe: [
          { rotulo: 'Entregas no prazo', valor: r.noPrazo, unidade: 'quantidade' },
          { rotulo: 'Entregas devidas no mês', valor: r.total, unidade: 'quantidade' },
          { rotulo: 'Pendentes em atraso', valor: r.pendentesAtrasadas, unidade: 'quantidade' }
        ]
      };
    },
    glosas_pct(ctx, comp) {
      const { soma, naCompetencia } = B();
      const liq = (ctx.dados.empenhos || []).filter((e) => e.liquidacao && naCompetencia(e.liquidacao.data, comp));
      const glosado = soma(liq, (e) => e.liquidacao.glosa);
      const faturado = soma(liq, (e) => soma(e.entregas || [], (x) => x.valor));
      return {
        valor: NS.calc.contratos.glosasPct(glosado, faturado),
        detalhe: [
          { rotulo: 'Valor glosado', valor: glosado, unidade: 'moeda' },
          { rotulo: 'Valor faturado liquidado', valor: faturado, unidade: 'moeda' }
        ]
      };
    },
    prazo_recebimento(ctx, comp) {
      const { naCompetencia } = B();
      const pagos = (ctx.dados.empenhos || []).filter((e) => e.pagamento && naCompetencia(e.pagamento.data, comp));
      const r = NS.calc.contratos.prazoMedioPagamento(pagos);
      return {
        valor: r.desdeEntrega,
        detalhe: [
          { rotulo: 'Desde a liquidação', valor: r.desdeLiquidacao, unidade: 'dias' },
          { rotulo: 'Empenhos pagos no mês', valor: r.n, unidade: 'quantidade' }
        ]
      };
    },
    margem_contratos(ctx, comp) {
      const { soma, div, ehNumero } = B();
      const vigentes = ctx.contratosAnalisados(ctx.corte(comp)).filter((a) => a.vigente && ehNumero(a.margemAtual));
      return {
        valor: div(soma(vigentes, (a) => a.margemAtual * a.valorRegistrado), soma(vigentes, (a) => a.valorRegistrado)),
        detalhe: [{ rotulo: 'Contratos vigentes considerados', valor: vigentes.length, unidade: 'quantidade' }]
      };
    },
    concentracao(ctx, comp) {
      const { soma, div } = B();
      const orgaos = ctx.orgaosAnalisados(ctx.corte(comp));
      const total = soma(orgaos, (o) => o.receita12m);
      let maior = null;
      for (const o of orgaos) if (!maior || o.receita12m > maior.receita12m) maior = o;
      return {
        valor: maior ? div(maior.receita12m, total) : null,
        detalhe: maior ? [
          { rotulo: `Maior órgão: ${maior.orgao.nome}`, valor: maior.receita12m, unidade: 'moeda' },
          { rotulo: 'Faturamento total 12 meses', valor: total, unidade: 'moeda' }
        ] : []
      };
    },
    variacao_custo(ctx, comp) {
      const r = ctx.resumoProducao(comp);
      if (!r.lotes) return null;
      return {
        valor: r.variacaoPct,
        detalhe: [
          { rotulo: 'Variação de preço (Compras)', valor: r.varPreco, unidade: 'moeda' },
          { rotulo: 'Variação de quantidade (Produção)', valor: r.varQtd, unidade: 'moeda' },
          { rotulo: 'Variação de MOD (Produção)', valor: r.varMOD, unidade: 'moeda' },
          { rotulo: 'Variação de CIF (volume e gastos fixos)', valor: r.varCIF, unidade: 'moeda' }
        ]
      };
    },
    rendimento(ctx, comp) {
      const r = ctx.resumoProducao(comp);
      return r.lotes ? r.rendimento : null;
    },
    indice_perdas(ctx, comp) {
      const r = ctx.resumoProducao(comp);
      if (!r.lotes) return null;
      return {
        valor: r.indicePerdas,
        detalhe: Object.entries(r.perdasPorMotivo).map(([motivo, v]) => ({ rotulo: `Perdas por ${motivo}`, valor: v, unidade: 'moeda' }))
      };
    },
    giro_estoque(ctx, comp) {
      const a = ctx.apuracao(comp);
      if (!a || !a.ciclo) return null;
      const dem = ctx.demPorComp.get(comp);
      return {
        valor: NS.calc.custos.giroEstoque(B().mult(dem.cpv, a.fatorAnual), a.ciclo.estoqueMedio),
        detalhe: [
          { rotulo: 'CPV do mês', valor: dem.cpv, unidade: 'moeda' },
          { rotulo: 'Estoque médio', valor: a.ciclo.estoqueMedio, unidade: 'moeda' }
        ]
      };
    },
    contratos_defasagem(ctx, comp) {
      const limite = ctx.limites.defasagemAtencao ?? 0.05;
      const vigentes = ctx.contratosAnalisados(ctx.corte(comp)).filter((a) => a.vigente);
      if (!vigentes.length) return null; // sem contratos vigentes, não há o que contar
      const lista = vigentes.filter((a) => a.defasagemMaxima !== null && a.defasagemMaxima >= limite);
      return {
        valor: lista.length,
        detalhe: lista.map((a) => ({ rotulo: `Contrato ${a.contrato.numero}`, valor: a.defasagemMaxima, unidade: 'pct' }))
      };
    },
    planos_prazo(ctx, comp) {
      const { primeiroDia, div } = B();
      const corte = ctx.corte(comp);
      const planos = (ctx.dados.planosAcao || []).filter((p) => p.status !== 'cancelado' && p.prazo >= primeiroDia(comp) && p.prazo <= corte);
      const noPrazo = planos.filter((p) => p.status === 'concluido' && p.dataConclusao && p.dataConclusao <= p.prazo).length;
      return {
        valor: div(noPrazo, planos.length),
        detalhe: [
          { rotulo: 'Concluídos no prazo', valor: noPrazo, unidade: 'quantidade' },
          { rotulo: 'Planos com prazo no mês', valor: planos.length, unidade: 'quantidade' }
        ]
      };
    },
    controles_testados(ctx, comp) {
      const { diasEntre, div } = B();
      const corte = ctx.corte(comp);
      const controles = ctx.dados.controles || [];
      let emDia = 0;
      for (const c of controles) {
        const datas = (c.testes || []).map((t) => t.data).filter((d) => d && d <= corte);
        if (!datas.length && c.ultimoTeste && c.ultimoTeste <= corte) datas.push(c.ultimoTeste);
        if (!datas.length) continue;
        const ultimo = datas.sort()[datas.length - 1];
        if (diasEntre(ultimo, corte) <= (JANELA_FREQUENCIA[c.frequencia] || 31)) emDia += 1;
      }
      return {
        valor: div(emDia, controles.length),
        detalhe: [
          { rotulo: 'Controles testados dentro da frequência', valor: emDia, unidade: 'quantidade' },
          { rotulo: 'Total de controles', valor: controles.length, unidade: 'quantidade' }
        ]
      };
    },
    documentos_dia(ctx, comp) {
      const corte = ctx.corte(comp);
      const docs = ctx.dados.documentos || [];
      const emDia = docs.filter((d) => d.vencimento >= corte).length;
      return {
        valor: B().div(emDia, docs.length),
        detalhe: [
          { rotulo: 'Documentos em dia', valor: emDia, unidade: 'quantidade' },
          { rotulo: 'Total de documentos', valor: docs.length, unidade: 'quantidade' }
        ]
      };
    },
    producao_funcionario(ctx, comp) {
      const kg = NS.calc.orcamento.volumeProduzido(ctx.dados.lotes, ctx.produtosPorId, comp);
      const func = ctx.empresa.numeroFuncionarios;
      if (!ctx.lotesDaCompetencia(comp).length) return null;
      return {
        valor: B().div(kg, func),
        detalhe: [
          { rotulo: 'Produção do mês', valor: kg, unidade: 'kg' },
          { rotulo: 'Funcionários', valor: func, unidade: 'quantidade' }
        ]
      };
    }
  };

  /* ---------------------- Motor de status ---------------------- */

  /**
   * Classifica o valor em relação à meta:
   * desvio desfavorável d = (meta − valor) se maior-melhor, (valor − meta) se menor-melhor.
   * d ≤ tolerância de atenção → 'dentro'; d ≤ tolerância de fora → 'atencao'; senão 'fora'.
   * Meta não definida → 'sem-meta'. Valor ausente → 'sem-dados'.
   */
  function calcularStatus(valor, ind) {
    const { ehNumero, num } = B();
    if (!ind || !ehNumero(ind.meta)) return { status: 'sem-meta', desvio: null, desvioDesfavoravel: null };
    if (!ehNumero(valor)) return { status: 'sem-dados', desvio: null, desvioDesfavoravel: null };
    const desvio = valor - ind.meta;
    const d = ind.sentido === 'menor-melhor' ? desvio : -desvio;
    let status = 'fora';
    if (d <= num(ind.toleranciaAtencao) + 1e-12) status = 'dentro';
    else if (d <= num(ind.toleranciaFora) + 1e-12) status = 'atencao';
    return { status, desvio, desvioDesfavoravel: d };
  }

  /** Executa a função do indicador e normaliza o resultado em {valor, detalhe}. */
  function calcularValor(ctx, ind, comp) {
    const fn = funcoes[ind.funcaoCalculo];
    if (!fn) return { valor: null, detalhe: [], erro: `Função de cálculo desconhecida: ${ind.funcaoCalculo}` };
    let r;
    try {
      r = fn(ctx, comp);
    } catch (erro) {
      return { valor: null, detalhe: [], erro: erro.message };
    }
    if (r && typeof r === 'object') {
      return { valor: B().ehNumero(r.valor) ? r.valor : null, detalhe: r.detalhe || [] };
    }
    return { valor: B().ehNumero(r) ? r : null, detalhe: [] };
  }

  /** Avalia um indicador numa competência: valor, detalhe e status. */
  function avaliar(ctx, ind, comp) {
    const v = calcularValor(ctx, ind, comp);
    return Object.assign({ indicador: ind, competencia: comp }, v, calcularStatus(v.valor, ind));
  }

  /** Avalia todos os indicadores cadastrados numa competência. */
  function avaliarTodos(ctx, comp) {
    return (ctx.dados.indicadores || []).map((ind) => avaliar(ctx, ind, comp));
  }

  /** Série histórica de n meses até a competência (vazia se o indicador não tem histórico). */
  function serie(ctx, ind, comp, n = 12) {
    if (ind.historico === false) return [];
    return B().listaCompetencias(comp, n).map((c) => {
      const v = calcularValor(ctx, ind, c);
      return { competencia: c, valor: v.valor, status: calcularStatus(v.valor, ind).status };
    });
  }

  const indicadores = { PERSPECTIVAS, PADRAO, JANELA_FREQUENCIA, funcoes, calcularStatus, calcularValor, avaliar, avaliarTodos, serie };
  NS.calc.indicadores = indicadores;
  if (typeof module !== 'undefined' && module.exports) module.exports = indicadores;
})(typeof window !== 'undefined' ? window : globalThis);
