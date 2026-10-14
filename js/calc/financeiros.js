/* ==========================================================================
   calc/financeiros.js
   Demonstrações e indicadores financeiros: DRE gerencial (custeio variável),
   DRE por absorção e conciliação, balanço, rentabilidade, ROI (margem ×
   giro) e sua decomposição, EVA, liquidez, endividamento, ponto de
   equilíbrio, alavancagem operacional e ponte de margem. Funções puras.
   Convenção: indicadores de rentabilidade "a.a." são anualizados pelo
   fator 360 ÷ dias do período (12 para períodos mensais de 30 dias).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};
  const B = () => NS.calc.base;

  /* -------------------------- Rentabilidade -------------------------- */

  /** Receita líquida = receita bruta − deduções (impostos sobre vendas, devoluções, glosas). */
  function receitaLiquida(receitaBruta, deducoes) {
    return B().sub(receitaBruta, deducoes);
  }

  /** Margem bruta % = (RL − CPV) ÷ RL. */
  function margemBrutaPct(rl, cpv) {
    return B().div(B().sub(rl, cpv), rl);
  }

  /** Margem de contribuição = RL − custos variáveis − despesas variáveis. */
  function margemContribuicao(rl, custosVariaveis, despesasVariaveis) {
    return B().sub(B().sub(rl, custosVariaveis), despesasVariaveis);
  }

  /** EBIT = MC − custos fixos − despesas fixas − depreciação. */
  function ebit(mc, custosFixos, despesasFixas, depreciacao) {
    const { sub } = B();
    return sub(sub(sub(mc, custosFixos), despesasFixas), depreciacao);
  }

  /** EBITDA = EBIT + depreciação e amortização. */
  function ebitda(valorEbit, depreciacao) {
    const { ehNumero } = B();
    return ehNumero(valorEbit) && ehNumero(depreciacao) ? valorEbit + depreciacao : null;
  }

  /** ROI = margem operacional × giro do ativo (devolve os dois fatores). */
  function roi({ receita, lucroOperacional, investimento }) {
    const { div, mult } = B();
    const margem = div(lucroOperacional, receita);
    const giro = div(receita, investimento);
    return { margem, giro, roi: mult(margem, giro) };
  }

  /** ROE = lucro líquido ÷ PL médio. */
  function roe(lucroLiquido, plMedio) {
    return B().div(lucroLiquido, plMedio);
  }

  /** ROA = lucro líquido ÷ ativo total médio. */
  function roa(lucroLiquido, ativoMedio) {
    return B().div(lucroLiquido, ativoMedio);
  }

  /** NOPAT = EBIT × (1 − alíquota efetiva). Sem alíquota informada, não calcula. */
  function nopat(valorEbit, aliquota) {
    if (!B().ehNumero(aliquota)) return null;
    return B().mult(valorEbit, 1 - aliquota);
  }

  /** Custo de capital do período = (1 + taxa a.a.)^(dias ÷ 360) − 1 (ano comercial). */
  function custoCapitalPeriodo(taxaAA, dias, base = 360) {
    const { ehNumero } = B();
    if (!ehNumero(taxaAA) || !ehNumero(dias) || dias <= 0) return null;
    return Math.pow(1 + taxaAA, dias / base) - 1;
  }

  /** EVA = NOPAT − (capital investido × custo de capital do período). */
  function eva(valorNopat, capitalInvestido, custoPeriodo) {
    return B().sub(valorNopat, B().mult(capitalInvestido, custoPeriodo));
  }

  /* ---------------------- Liquidez e endividamento ---------------------- */

  /** Liquidez corrente, seca, imediata e geral. */
  function liquidez({ ac, pc, estoques, disponivel, rlp, pnc }) {
    const { div, num } = B();
    return {
      corrente: div(ac, pc),
      seca: div(num(ac) - num(estoques), pc),
      imediata: div(disponivel, pc),
      geral: div(num(ac) + num(rlp), num(pc) + num(pnc))
    };
  }

  /** Endividamento geral = (PC + PNC) ÷ ativo total; composição = PC ÷ (PC + PNC). */
  function endividamento({ pc, pnc, ativoTotal }) {
    const { div, num } = B();
    return {
      geral: div(num(pc) + num(pnc), ativoTotal),
      composicao: div(pc, num(pc) + num(pnc))
    };
  }

  /** Dívida líquida = empréstimos CP + LP − disponível. */
  function dividaLiquida(emprestimosCP, emprestimosLP, disponivel) {
    const { num } = B();
    return num(emprestimosCP) + num(emprestimosLP) - num(disponivel);
  }

  /** Cobertura de juros = EBIT ÷ despesas financeiras. */
  function coberturaJuros(valorEbit, despesasFinanceiras) {
    return B().div(valorEbit, despesasFinanceiras);
  }

  /* ------------------ Ponto de equilíbrio e risco ------------------ */

  /** PE em R$ = (custos fixos + despesas fixas) ÷ MC %. */
  function pontoEquilibrioReceita(fixos, mcPct) {
    const { div, ehNumero } = B();
    if (!ehNumero(mcPct) || mcPct <= 0) return null; // sem margem positiva não há equilíbrio
    return div(fixos, mcPct);
  }

  /** PE em unidades = fixos alocados ÷ MC unitária. */
  function pontoEquilibrioUnidades(fixosAlocados, mcUnitaria) {
    const { div, ehNumero } = B();
    if (!ehNumero(mcUnitaria) || mcUnitaria <= 0) return null;
    return div(fixosAlocados, mcUnitaria);
  }

  /** MC % ponderada do mix = Σ MC ÷ Σ receita. */
  function mcPctPonderada(itens) {
    const { div, soma } = B();
    return div(soma(itens, (i) => i.mc), soma(itens, (i) => i.receita));
  }

  /** Margem de segurança = (RL − PE) ÷ RL. */
  function margemSeguranca(rl, pe) {
    return B().div(B().sub(rl, pe), rl);
  }

  /** Grau de alavancagem operacional = MC ÷ EBIT. */
  function gao(mc, valorEbit) {
    return B().div(mc, valorEbit);
  }

  /* --------------------------- Demonstrações --------------------------- */

  /** Totais do balanço e diferença de fechamento (ativo − passivo − PL). */
  function balanco(d) {
    const { num } = B();
    const ac = num(d.disponivel) + num(d.contasReceber) + num(d.estoques) + num(d.outrosAC);
    const anc = num(d.rlp) + num(d.imobilizado) + num(d.intangivel);
    const pc = num(d.fornecedores) + num(d.emprestimosCP) + num(d.obrigacoesOperacionais) + num(d.outrosPC);
    const pnc = num(d.emprestimosLP) + num(d.outrosPNC);
    const ativoTotal = ac + anc;
    const passivoMaisPL = pc + pnc + num(d.pl);
    return { ac, anc, ativoTotal, pc, pnc, pl: num(d.pl), passivoMaisPL, diferenca: ativoTotal - passivoMaisPL };
  }

  /** DRE gerencial pelo custeio variável (com margem de contribuição). */
  function dreGerencial(d) {
    const { sub, div, num } = B();
    const rl = receitaLiquida(d.receitaBruta, d.deducoes);
    const mc = margemContribuicao(rl, d.custosVariaveis, d.despesasVariaveis);
    const valorEbit = ebit(mc, d.custosFixos, d.despesasFixas, d.depreciacao);
    const valorEbitda = ebitda(valorEbit, d.depreciacao);
    const lair = valorEbit === null ? null : valorEbit + num(d.receitasFinanceiras) - num(d.despesasFinanceiras);
    const lucroLiquido = sub(lair, num(d.irCsll));
    return {
      receitaBruta: d.receitaBruta, deducoes: d.deducoes, receitaLiquida: rl,
      custosVariaveis: d.custosVariaveis, despesasVariaveis: d.despesasVariaveis,
      mc, mcPct: div(mc, rl),
      custosFixos: d.custosFixos, despesasFixas: d.despesasFixas,
      ebitda: valorEbitda, margemEbitda: div(valorEbitda, rl),
      depreciacao: d.depreciacao,
      ebit: valorEbit, margemOperacional: div(valorEbit, rl),
      receitasFinanceiras: d.receitasFinanceiras, despesasFinanceiras: d.despesasFinanceiras,
      lair, irCsll: d.irCsll, lucroLiquido, margemLiquida: div(lucroLiquido, rl)
    };
  }

  /** DRE societária pelo custeio por absorção (CPV inclui custos fixos de produção). */
  function dreAbsorcao(d) {
    const { sub, div, num } = B();
    const rl = receitaLiquida(d.receitaBruta, d.deducoes);
    const lucroBruto = sub(rl, d.cpv);
    const valorEbit = lucroBruto === null ? null
      : lucroBruto - num(d.despesasVariaveis) - num(d.despesasFixas) - num(d.depreciacao);
    const lair = valorEbit === null ? null : valorEbit + num(d.receitasFinanceiras) - num(d.despesasFinanceiras);
    const lucroLiquido = sub(lair, num(d.irCsll));
    return {
      receitaBruta: d.receitaBruta, deducoes: d.deducoes, receitaLiquida: rl,
      cpv: d.cpv, lucroBruto, margemBrutaPct: margemBrutaPct(rl, d.cpv),
      despesasVariaveis: d.despesasVariaveis, despesasFixas: d.despesasFixas, depreciacao: d.depreciacao,
      ebit: valorEbit, receitasFinanceiras: d.receitasFinanceiras, despesasFinanceiras: d.despesasFinanceiras,
      lair, irCsll: d.irCsll, lucroLiquido, margemLiquida: div(lucroLiquido, rl)
    };
  }

  /**
   * Conciliação absorção × variável: a diferença apurada entre os lucros deve
   * ser igual a (CIF fixos no estoque final − CIF fixos no estoque inicial).
   * "naoExplicada" diferente de zero indica dados inconsistentes.
   */
  function conciliacao(d) {
    const { sub } = B();
    const absorcao = dreAbsorcao(d).ebit;
    const variavel = dreGerencial(d).ebit;
    const apurada = sub(absorcao, variavel);
    const esperada = NS.calc.custos.conciliacaoAbsorcao(d.cifFixosEstoqueFinal, d.cifFixosEstoqueInicial);
    return { lucroAbsorcao: absorcao, lucroVariavel: variavel, apurada, esperada, naoExplicada: sub(apurada, esperada) };
  }

  /**
   * Decomposição da variação do ROI entre dois períodos em efeito margem e
   * efeito giro (substituição sequencial): efeito margem = (M1 − M0) × G0;
   * efeito giro = (G1 − G0) × M1. A soma dos efeitos é igual à variação.
   */
  function decomporRoi(anterior, atual) {
    const { ehNumero } = B();
    if (!anterior || !atual || ![anterior.margem, anterior.giro, atual.margem, atual.giro].every(ehNumero)) return null;
    const efeitoMargem = (atual.margem - anterior.margem) * anterior.giro;
    const efeitoGiro = (atual.giro - anterior.giro) * atual.margem;
    return {
      roiAnterior: anterior.margem * anterior.giro,
      roiAtual: atual.margem * atual.giro,
      variacao: efeitoMargem + efeitoGiro,
      efeitoMargem,
      efeitoGiro,
      explicadoPor: Math.abs(efeitoMargem) >= Math.abs(efeitoGiro) ? 'margem' : 'giro'
    };
  }

  /**
   * Ponte de margem de contribuição entre dois períodos, por produto.
   * Cada item: { produtoId, q (qtd vendida), p (preço médio), c (custo variável
   * unitário real), ve (parcela unitária de ineficiência: variação de quantidade
   * + MOD) }. Efeitos:
   *   preço   = Σ q1 × (p1 − p0)
   *   volume  = Σ (q1 − q0) × (p0 − c0)
   *   insumos = −Σ q1 × [(c1 − c0) − (ve1 − ve0)]   (preço de insumos e padrão)
   *   eficiência = −Σ q1 × (ve1 − ve0)
   * Produto sem dados num dos períodos herda preço e custo do outro.
   */
  function ponteMargem(anterior, atual) {
    const { num } = B();
    const m0 = new Map((anterior || []).map((i) => [i.produtoId, i]));
    const m1 = new Map((atual || []).map((i) => [i.produtoId, i]));
    const ids = new Set([...m0.keys(), ...m1.keys()]);
    let mcAnterior = 0, mcAtual = 0, efeitoPreco = 0, efeitoVolume = 0, efeitoInsumos = 0, efeitoEficiencia = 0;
    const detalhes = [];
    for (const id of ids) {
      const a = m0.get(id);
      const b = m1.get(id);
      const q0 = a ? num(a.q) : 0;
      const q1 = b ? num(b.q) : 0;
      const p0 = a ? num(a.p) : num(b.p);
      const p1 = b ? num(b.p) : num(a.p);
      const c0 = a ? num(a.c) : num(b.c);
      const c1 = b ? num(b.c) : num(a.c);
      const ve0 = a ? num(a.ve) : num(b.ve);
      const ve1 = b ? num(b.ve) : num(a.ve);
      const dPreco = q1 * (p1 - p0);
      const dVolume = (q1 - q0) * (p0 - c0);
      const dEfic = -q1 * (ve1 - ve0);
      const dInsumos = -q1 * ((c1 - c0) - (ve1 - ve0));
      mcAnterior += q0 * (p0 - c0);
      mcAtual += q1 * (p1 - c1);
      efeitoPreco += dPreco;
      efeitoVolume += dVolume;
      efeitoInsumos += dInsumos;
      efeitoEficiencia += dEfic;
      detalhes.push({ produtoId: id, q0, q1, p0, p1, c0, c1, preco: dPreco, volume: dVolume, insumos: dInsumos, eficiencia: dEfic });
    }
    return {
      mcAnterior, efeitoPreco, efeitoVolume, efeitoInsumos, efeitoEficiencia, mcAtual,
      residuo: mcAtual - (mcAnterior + efeitoPreco + efeitoVolume + efeitoInsumos + efeitoEficiencia),
      detalhes
    };
  }

  /**
   * Apuração completa de uma competência: DREs, balanço e todos os
   * indicadores financeiros. "ultimos12" é a lista das demonstrações dos
   * últimos 12 meses até a competência (para EBITDA dos últimos 12 meses).
   */
  function apurarMes(dem, demAnterior, empresa, ultimos12) {
    if (!dem) return null;
    const { div, num, soma, mult } = B();
    const dias = num(empresa.diasPeriodo) || 30;
    const fator = div(360, dias) || 12;
    const dg = dreGerencial(dem);
    const da = dreAbsorcao(dem);
    const bal = balanco(dem);
    const balAnt = demAnterior ? balanco(demAnterior) : null;
    const ativoMedio = balAnt ? (bal.ativoTotal + balAnt.ativoTotal) / 2 : bal.ativoTotal;
    const plMedio = demAnterior ? (num(dem.pl) + num(demAnterior.pl)) / 2 : num(dem.pl);

    // ROI anualizado: margem operacional do mês × giro anualizado do ativo.
    const r = roi({ receita: mult(dg.receitaLiquida, fator), lucroOperacional: mult(dg.ebit, fator), investimento: ativoMedio });
    const valorNopat = nopat(dg.ebit, empresa.aliquotaEfetiva);
    const custoPeriodo = custoCapitalPeriodo(empresa.custoCapitalAA, dias);
    const capitalInvestido = num(dem.pl) + num(dem.emprestimosCP) + num(dem.emprestimosLP);
    const dl = dividaLiquida(dem.emprestimosCP, dem.emprestimosLP, dem.disponivel);

    // EBITDA dos últimos 12 meses (anualizado se houver menos de 12 meses).
    const lista12 = (ultimos12 || [dem]).filter(Boolean);
    const somaEbitda = soma(lista12, (d) => dreGerencial(d).ebitda);
    const ebitda12m = lista12.length ? somaEbitda * (12 / lista12.length) : null;

    const fixos = num(dem.custosFixos) + num(dem.despesasFixas);
    const pe = pontoEquilibrioReceita(fixos, dg.mcPct);

    return {
      competencia: dem.competencia,
      dre: dg,
      absorcao: da,
      conciliacao: conciliacao(dem),
      balanco: bal,
      ativoMedio,
      plMedio,
      fatorAnual: fator,
      margemBrutaPct: da.margemBrutaPct,
      roi: r,
      roe: roe(mult(dg.lucroLiquido, fator), plMedio),
      roa: roa(mult(dg.lucroLiquido, fator), ativoMedio),
      nopat: valorNopat,
      custoCapitalPeriodo: custoPeriodo,
      capitalInvestido,
      eva: eva(valorNopat, capitalInvestido, custoPeriodo),
      liquidez: liquidez({ ac: bal.ac, pc: bal.pc, estoques: dem.estoques, disponivel: dem.disponivel, rlp: dem.rlp, pnc: bal.pnc }),
      endividamento: endividamento({ pc: bal.pc, pnc: bal.pnc, ativoTotal: bal.ativoTotal }),
      dividaLiquida: dl,
      ebitda12m,
      mesesEbitda: lista12.length,
      dlEbitda: div(dl, ebitda12m),
      coberturaJuros: coberturaJuros(dg.ebit, dem.despesasFinanceiras),
      fixos,
      pontoEquilibrio: pe,
      margemSeguranca: margemSeguranca(dg.receitaLiquida, pe),
      gao: gao(dg.mc, dg.ebit),
      ciclo: NS.calc.capitalGiro.apurarCiclo(dem, demAnterior, dias)
    };
  }

  const financeiros = {
    receitaLiquida, margemBrutaPct, margemContribuicao, ebit, ebitda, roi, roe, roa, nopat,
    custoCapitalPeriodo, eva, liquidez, endividamento, dividaLiquida, coberturaJuros,
    pontoEquilibrioReceita, pontoEquilibrioUnidades, mcPctPonderada, margemSeguranca, gao,
    balanco, dreGerencial, dreAbsorcao, conciliacao, decomporRoi, ponteMargem, apurarMes
  };
  NS.calc.financeiros = financeiros;
  if (typeof module !== 'undefined' && module.exports) module.exports = financeiros;
})(typeof window !== 'undefined' ? window : globalThis);
