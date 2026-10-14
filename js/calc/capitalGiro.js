/* ==========================================================================
   calc/capitalGiro.js
   Ciclo e capital de giro (PMR, PME, PMP, ciclo operacional, ciclo de caixa
   e NCG) e projeção de caixa de 13 semanas. Na projeção, os recebimentos de
   contratos usam o prazo médio REAL de pagamento de cada órgão, e não o
   prazo contratual. Funções puras.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};
  const B = () => NS.calc.base;

  /** PMR = contas a receber ÷ receita bruta do período × dias. */
  function pmr(contasReceber, receitaBruta, dias) {
    return B().mult(B().div(contasReceber, receitaBruta), dias);
  }

  /** PME = estoque médio ÷ CPV do período × dias. */
  function pme(estoqueMedio, cpv, dias) {
    return B().mult(B().div(estoqueMedio, cpv), dias);
  }

  /** PMP = fornecedores ÷ compras do período × dias. */
  function pmp(fornecedores, compras, dias) {
    return B().mult(B().div(fornecedores, compras), dias);
  }

  /** Ciclo operacional = PME + PMR. */
  function cicloOperacional(pmeDias, pmrDias) {
    const { ehNumero } = B();
    return ehNumero(pmeDias) && ehNumero(pmrDias) ? pmeDias + pmrDias : null;
  }

  /** Ciclo de caixa = ciclo operacional − PMP. */
  function cicloCaixa(operacional, pmpDias) {
    return B().sub(operacional, pmpDias);
  }

  /** NCG = (contas a receber + estoques) − (fornecedores + obrigações operacionais). */
  function ncg({ contasReceber, estoques, fornecedores, obrigacoesOperacionais }) {
    const { num } = B();
    return num(contasReceber) + num(estoques) - num(fornecedores) - num(obrigacoesOperacionais);
  }

  /**
   * Apura o ciclo de uma competência a partir da demonstração do mês e da
   * do mês anterior (para o estoque médio). Sem mês anterior, usa o saldo final.
   */
  function apurarCiclo(dem, demAnterior, dias) {
    if (!dem) return null;
    const { num } = B();
    const estoqueMedio = demAnterior ? (num(dem.estoques) + num(demAnterior.estoques)) / 2 : num(dem.estoques);
    const vPme = pme(estoqueMedio, dem.cpv, dias);
    const vPmr = pmr(dem.contasReceber, dem.receitaBruta, dias);
    const vPmp = pmp(dem.fornecedores, dem.compras, dias);
    const operacional = cicloOperacional(vPme, vPmr);
    return {
      competencia: dem.competencia,
      estoqueMedio,
      pme: vPme,
      pmr: vPmr,
      pmp: vPmp,
      operacional,
      caixa: cicloCaixa(operacional, vPmp),
      ncg: ncg(dem)
    };
  }

  /** Saldo de caixa até a data: saldo inicial + entradas − saídas realizadas. */
  function saldoCaixa(lancamentos, saldoInicial, ate) {
    const { num } = B();
    let saldo = num(saldoInicial);
    for (const l of lancamentos || []) {
      if (l.situacao !== 'realizado' || (ate && l.data > ate)) continue;
      saldo += l.tipo === 'entrada' ? num(l.valor) : -num(l.valor);
    }
    return saldo;
  }

  /**
   * Recebimentos previstos de contratos, a partir dos empenhos ainda não pagos:
   * - liquidado: data da liquidação + prazo médio real desde a liquidação;
   * - entregue e não liquidado: data da entrega + prazo médio real desde a entrega;
   * - entrega futura: data prevista + prazo médio real desde a entrega.
   * Sem histórico de pagamento do órgão, usa o prazo contratual.
   * Datas já passadas são deslocadas para hoje (recebimento atrasado).
   */
  function recebimentosPrevistos({ empenhos, contratosPorId, orgaosPorId, prazosReais, hoje }) {
    const { num, ehNumero, somarDias } = B();
    const lista = [];
    for (const emp of empenhos || []) {
      if (emp.pagamento && emp.pagamento.data) continue;
      const contrato = contratosPorId.get(emp.contratoId);
      if (!contrato) continue;
      const orgao = orgaosPorId.get(contrato.orgaoId);
      const contratual = orgao ? num(orgao.prazoPagamentoContratual) : 30;
      const real = prazosReais.get(contrato.orgaoId) || {};
      const prazoLiq = ehNumero(real.desdeLiquidacao) ? real.desdeLiquidacao : contratual;
      const prazoEnt = ehNumero(real.desdeEntrega) ? real.desdeEntrega : contratual;
      const base = { contratoId: contrato.id, orgaoId: contrato.orgaoId, empenhoId: emp.id };

      if (emp.liquidacao && emp.liquidacao.data) {
        const data = somarDias(emp.liquidacao.data, Math.round(prazoLiq));
        lista.push(Object.assign({}, base, {
          data: data < hoje ? hoje : data, dataOriginal: data, valor: num(emp.liquidacao.valor),
          criterio: 'liquidação + prazo médio real', prazoUsado: prazoLiq, atrasado: data < hoje
        }));
        continue;
      }
      for (const e of emp.entregas || []) {
        const referencia = e.real || (e.prevista < hoje ? hoje : e.prevista);
        const data = somarDias(referencia, Math.round(prazoEnt));
        lista.push(Object.assign({}, base, {
          data: data < hoje ? hoje : data, dataOriginal: data, valor: num(e.valor),
          criterio: e.real ? 'entrega + prazo médio real' : 'entrega prevista + prazo médio real',
          prazoUsado: prazoEnt, atrasado: data < hoje
        }));
      }
    }
    return lista;
  }

  /**
   * Projeção de caixa em semanas (padrão 13) a partir de hoje.
   * entradas/saídas: [{data, valor}]. Itens fora do horizonte são ignorados.
   * Devolve as semanas com saldo final e a menor posição de caixa.
   */
  function projecao13Semanas({ hoje, saldoInicial, entradas, saidas, semanas = 13 }) {
    const { num, diasEntre, somarDias } = B();
    const lista = [];
    for (let s = 0; s < semanas; s++) {
      lista.push({
        semana: s + 1,
        inicio: somarDias(hoje, s * 7),
        fim: somarDias(hoje, s * 7 + 6),
        entradas: 0,
        saidas: 0,
        saldoInicial: 0,
        saldoFinal: 0,
        itensEntrada: [],
        itensSaida: []
      });
    }
    const alocar = (item, campo, campoItens) => {
      const d = diasEntre(hoje, item.data < hoje ? hoje : item.data);
      const idx = Math.floor(d / 7);
      if (idx < 0 || idx >= semanas) return;
      lista[idx][campo] += num(item.valor);
      lista[idx][campoItens].push(item);
    };
    for (const e of entradas || []) alocar(e, 'entradas', 'itensEntrada');
    for (const s of saidas || []) alocar(s, 'saidas', 'itensSaida');

    let saldo = num(saldoInicial);
    let menor = { saldo: saldo, semana: 0 };
    for (const sem of lista) {
      sem.saldoInicial = saldo;
      saldo = saldo + sem.entradas - sem.saidas;
      sem.saldoFinal = saldo;
      if (saldo < menor.saldo || menor.semana === 0) menor = { saldo, semana: sem.semana };
    }
    return {
      semanas: lista,
      saldoInicial: num(saldoInicial),
      saldoFinal: saldo,
      menorSaldo: menor.saldo,
      semanaMenorSaldo: menor.semana,
      semanasNegativas: lista.filter((s) => s.saldoFinal < 0).map((s) => s.semana)
    };
  }

  const capitalGiro = {
    pmr, pme, pmp, cicloOperacional, cicloCaixa, ncg, apurarCiclo, saldoCaixa,
    recebimentosPrevistos, projecao13Semanas
  };
  NS.calc.capitalGiro = capitalGiro;
  if (typeof module !== 'undefined' && module.exports) module.exports = capitalGiro;
})(typeof window !== 'undefined' ? window : globalThis);
