/* ==========================================================================
   calc/orcamento.js
   Orçamento: variação orçado × realizado (favorável/desfavorável conforme
   receita ou custo), orçamento flexível (parte variável ajustada ao volume
   real), forecast anual (realizado + orçado restante) e forecast por
   tendência dos últimos 3 meses. Funções puras.
   Fonte do realizado: a conta "Receita de contratos" usa o faturamento das
   entregas da competência; as demais contas usam os lançamentos com a mesma
   competência, centro e categoria (regime de competência: em meses fechados
   contam os pagos e os a pagar).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};
  const B = () => NS.calc.base;

  // Conta cuja fonte de realizado é o faturamento (entregas), não o caixa.
  const CONTA_FATURAMENTO = 'Receita de contratos';
  // Categorias de caixa que não são receita/custo do período (ficam fora do orçamento).
  const CATEGORIAS_PATRIMONIAIS = ['Recebimento de contratos', 'Recebimento estimado de contratos', 'Amortização de empréstimo', 'Investimentos'];

  /**
   * Variação = realizado − orçado; variação % = variação ÷ orçado.
   * Favorável se receita acima ou custo abaixo do orçado.
   * "desfavoravelPct" é positivo quando a variação é ruim (usado nos alertas).
   */
  function variacao(realizado, orcado, natureza) {
    const { sub, div } = B();
    const v = sub(realizado, orcado);
    const pct = div(v, orcado);
    const favoravel = v === null ? null : (natureza === 'receita' ? v >= 0 : v <= 0);
    const desfavoravelPct = pct === null ? null : (natureza === 'receita' ? -pct : pct);
    return { variacao: v, pct, favoravel, desfavoravelPct };
  }

  /** Orçado flexível = parte fixa + parte variável × (volume real ÷ volume orçado). */
  function orcadoFlexivel(valor, parteVariavel, volumeReal, volumeOrcado) {
    const { num, div } = B();
    const fator = div(volumeReal, volumeOrcado);
    if (fator === null) return null;
    const pv = Math.min(Math.max(num(parteVariavel), 0), 1);
    const v = num(valor);
    return v * (1 - pv) + v * pv * fator;
  }

  /** Forecast anual = realizado acumulado + orçado dos meses restantes. */
  function forecastAnual(realizadoAcumulado, orcadoRestante) {
    return B().num(realizadoAcumulado) + B().num(orcadoRestante);
  }

  /** Forecast por tendência = realizado acumulado + média dos últimos 3 meses × meses restantes. */
  function forecastTendencia(realizadoAcumulado, ultimos3, mesesRestantes) {
    const m = B().media(ultimos3);
    if (m === null) return null;
    return B().num(realizadoAcumulado) + m * mesesRestantes;
  }

  /** Volume real produzido (kg) numa competência, a partir dos lotes. */
  function volumeProduzido(lotes, produtosPorId, comp) {
    const { num } = B();
    let kg = 0;
    for (const l of lotes || []) {
      if (!B().naCompetencia(l.data, comp)) continue;
      const p = produtosPorId.get(l.produtoId);
      kg += num(l.qtdProduzida) * num(p ? p.pesoKg : 0);
    }
    return kg;
  }

  /**
   * Indica se um lançamento entra no realizado orçamentário da competência.
   * Regime de competência: em meses já fechados (até a competência atual da
   * empresa) contam os lançamentos pagos e a pagar; em meses futuros, só os pagos.
   */
  function contaNoRealizado(lanc, comp, competenciaAtual) {
    if (lanc.competencia !== comp) return false;
    if (lanc.situacao === 'realizado') return true;
    return !!competenciaAtual && comp <= competenciaAtual;
  }

  /** Realizado de uma conta/centro na competência, com a fonte do número. */
  function realizadoConta(ctx, comp, centroId, conta) {
    const { num } = B();
    if (conta === CONTA_FATURAMENTO) {
      const valor = NS.calc.contratos.faturamento(ctx.dados.empenhos, B().primeiroDia(comp), B().ultimoDia(comp));
      return { valor, fonte: 'Faturamento das entregas (contratos)' };
    }
    let valor = 0;
    for (const l of ctx.dados.lancamentos || []) {
      if (l.centroId === centroId && l.categoria === conta && contaNoRealizado(l, comp, ctx.competencia)) {
        valor += num(l.valor);
      }
    }
    return { valor, fonte: 'Lançamentos da competência (pagos e a pagar)' };
  }

  /**
   * Orçado × realizado de uma competência. Com flexivel=true, o orçado de
   * comparação é o flexível (ajustado ao volume real). Inclui também os
   * lançamentos realizados sem orçamento ("não orçado").
   */
  function apurar(ctx, comp, flexivel = false) {
    const { num } = B();
    const volumeOrcado = ctx.config.volumeOrcado ? ctx.config.volumeOrcado[comp] : null;
    const volumeReal = volumeProduzido(ctx.dados.lotes, ctx.produtosPorId, comp);
    const linhasOrc = (ctx.dados.orcamento || []).filter((o) => o.competencia === comp);
    const chaves = new Set();
    const linhas = linhasOrc.map((o) => {
      chaves.add(`${o.centroId}|${o.conta}`);
      const real = realizadoConta(ctx, comp, o.centroId, o.conta);
      const flex = orcadoFlexivel(o.valor, o.parteVariavel, volumeReal, volumeOrcado);
      const base = flexivel && flex !== null ? flex : num(o.valor);
      return Object.assign({ id: o.id, centroId: o.centroId, conta: o.conta, natureza: o.natureza,
        orcado: num(o.valor), orcadoFlexivel: flex, parteVariavel: o.parteVariavel, base,
        realizado: real.valor, fonte: real.fonte, naoOrcado: false }, variacao(real.valor, base, o.natureza));
    });

    // Lançamentos realizados sem linha de orçamento correspondente.
    const extras = new Map();
    for (const l of ctx.dados.lancamentos || []) {
      if (!contaNoRealizado(l, comp, ctx.competencia)) continue;
      if (CATEGORIAS_PATRIMONIAIS.includes(l.categoria)) continue;
      const k = `${l.centroId}|${l.categoria}`;
      if (chaves.has(k)) continue;
      const atual = extras.get(k) || { centroId: l.centroId, conta: l.categoria, natureza: l.tipo === 'entrada' ? 'receita' : 'custo', valor: 0 };
      atual.valor += num(l.valor);
      extras.set(k, atual);
    }
    for (const x of extras.values()) {
      linhas.push(Object.assign({ id: null, centroId: x.centroId, conta: x.conta, natureza: x.natureza,
        orcado: 0, orcadoFlexivel: null, parteVariavel: null, base: 0, realizado: x.valor,
        fonte: 'Lançamentos da competência (sem orçamento)', naoOrcado: true }, variacao(x.valor, 0, x.natureza)));
    }
    return { competencia: comp, flexivel, volumeOrcado, volumeReal, linhas };
  }

  /**
   * Forecast anual por centro/conta para o ano da competência:
   * realizado acumulado até a competência + orçado restante, e a
   * alternativa por tendência (média dos 3 últimos meses realizados).
   */
  function forecast(ctx, comp) {
    const { num } = B();
    const ano = comp.slice(0, 4);
    const mesAtual = Number(comp.slice(5, 7));
    const restantes = 12 - mesAtual;
    const grupos = new Map();
    for (const o of ctx.dados.orcamento || []) {
      if (!o.competencia.startsWith(ano)) continue;
      const k = `${o.centroId}|${o.conta}`;
      const g = grupos.get(k) || { centroId: o.centroId, conta: o.conta, natureza: o.natureza, orcadoAnual: 0, orcadoAteAgora: 0, orcadoRestante: 0 };
      g.orcadoAnual += num(o.valor);
      if (o.competencia <= comp) g.orcadoAteAgora += num(o.valor); else g.orcadoRestante += num(o.valor);
      grupos.set(k, g);
    }
    const linhas = [];
    for (const g of grupos.values()) {
      const mensal = [];
      for (let m = 1; m <= mesAtual; m++) {
        const c = `${ano}-${String(m).padStart(2, '0')}`;
        mensal.push(realizadoConta(ctx, c, g.centroId, g.conta).valor);
      }
      const acumulado = B().soma(mensal);
      const ult3 = mensal.slice(-3);
      const fc = forecastAnual(acumulado, g.orcadoRestante);
      const tend = forecastTendencia(acumulado, ult3, restantes);
      linhas.push(Object.assign(g, {
        realizadoAcumulado: acumulado,
        forecast: fc,
        forecastTendencia: tend,
        variacaoForecast: variacao(fc, g.orcadoAnual, g.natureza),
        variacaoTendencia: variacao(tend, g.orcadoAnual, g.natureza)
      }));
    }
    return { ano, mesesRestantes: restantes, linhas };
  }

  const orcamento = {
    CONTA_FATURAMENTO, CATEGORIAS_PATRIMONIAIS, variacao, orcadoFlexivel, forecastAnual,
    forecastTendencia, volumeProduzido, contaNoRealizado, realizadoConta, apurar, forecast
  };
  NS.calc.orcamento = orcamento;
  if (typeof module !== 'undefined' && module.exports) module.exports = orcamento;
})(typeof window !== 'undefined' ? window : globalThis);
