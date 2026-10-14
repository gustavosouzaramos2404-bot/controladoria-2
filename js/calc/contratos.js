/* ==========================================================================
   calc/contratos.js
   Contratos públicos (B2G): margem prevista × atual por item, defasagem de
   custo, erosão de margem, saldo da ata, ritmo de consumo e data estimada
   de esgotamento, entregas no prazo, glosas, resultado de contribuição do
   contrato, prazo médio real de pagamento e recebíveis por órgão.
   Funções puras. As análises recebem um "ctx" montado em calc/contexto.js.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};
  const B = () => NS.calc.base;

  /** Margem do item = (preço contratado − custo) ÷ preço contratado. */
  function margemItem(preco, custo) {
    const { ehNumero, div } = B();
    if (!ehNumero(preco) || !ehNumero(custo)) return null;
    return div(preco - custo, preco);
  }

  /** Defasagem de custo = (custo atual − custo da proposta) ÷ custo da proposta. */
  function defasagemCusto(custoAtual, custoProposta) {
    const { ehNumero, div } = B();
    if (!ehNumero(custoAtual) || !ehNumero(custoProposta)) return null;
    return div(custoAtual - custoProposta, custoProposta);
  }

  /** Erosão de margem (em pontos percentuais, como fração) = margem prevista − margem atual. */
  function erosaoMargem(prevista, atual) {
    return B().sub(prevista, atual);
  }

  /**
   * Custo atual do produto = custo real médio dos últimos n lotes até a data
   * de corte (ponderado pela quantidade). Sem lotes, usa o custo padrão atual
   * e indica isso em "fonte".
   */
  function custoAtualProduto(produtoId, analisesLotes, padrao, corte, n = 3) {
    const { soma, div } = B();
    const lotes = (analisesLotes || [])
      .filter((a) => a.produtoId === produtoId && a.data <= corte && a.qtdProduzida > 0)
      .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
      .slice(0, n);
    if (lotes.length === 0) {
      return {
        custo: padrao ? padrao.total : null,
        custoVariavel: padrao ? padrao.variavel : null,
        ineficiencia: 0,
        fonte: 'padrao', n: 0, lotes: []
      };
    }
    const qtd = soma(lotes, (l) => l.qtdProduzida);
    return {
      custo: div(soma(lotes, (l) => l.custoTotal), qtd),
      custoVariavel: div(soma(lotes, (l) => l.custoVariavelTotal), qtd),
      // Parcela unitária do custo causada por consumo acima do padrão (quantidade + MOD).
      ineficiencia: div(soma(lotes, (l) => (l.varQtd || 0) + (l.varMOD || 0)), qtd),
      fonte: 'lotes', n: lotes.length, lotes: lotes.map((l) => l.lote)
    };
  }

  /** Quantidade empenhada por produto: Map produtoId -> qtd. */
  function qtdEmpenhada(empenhos) {
    const mapa = new Map();
    for (const e of empenhos || []) {
      for (const it of e.itens || []) {
        mapa.set(it.produtoId, (mapa.get(it.produtoId) || 0) + B().num(it.qtd));
      }
    }
    return mapa;
  }

  /** Saldo da ata = qtd registrada − qtd empenhada; % consumido. */
  function saldo(qtdRegistrada, qtdEmp) {
    const { num, div } = B();
    const reg = num(qtdRegistrada);
    const emp = num(qtdEmp);
    return { saldo: reg - emp, pctConsumido: div(emp, reg), pctSaldo: div(reg - emp, reg) };
  }

  /** Ritmo médio diário de empenho do produto na janela (padrão: 90 dias). */
  function ritmoConsumo(empenhos, produtoId, corte, janelaDias = 90) {
    const { somarDias, div, num } = B();
    const inicio = somarDias(corte, -janelaDias);
    let total = 0;
    for (const e of empenhos || []) {
      if (e.data <= inicio || e.data > corte) continue;
      for (const it of e.itens || []) if (it.produtoId === produtoId) total += num(it.qtd);
    }
    return div(total, janelaDias);
  }

  /** Data estimada de esgotamento do saldo pelo ritmo médio; null sem ritmo. */
  function dataEsgotamento(saldoQtd, ritmoDiario, corte) {
    const { ehNumero, somarDias } = B();
    if (!ehNumero(saldoQtd)) return null;
    if (saldoQtd <= 0) return corte;
    if (!ehNumero(ritmoDiario) || ritmoDiario <= 0) return null;
    return somarDias(corte, Math.ceil(saldoQtd / ritmoDiario));
  }

  /** Valor ainda a faturar = Σ(saldo × preço contratado), ignorando saldos negativos. */
  function valorAFaturar(itens) {
    return B().soma(itens || [], (it) => Math.max(B().num(it.saldo), 0) * B().num(it.precoContratado));
  }

  /**
   * Entregas no prazo = entregas com data real ≤ prevista ÷ total de entregas
   * devidas até o corte. Entrega com prevista vencida e não realizada conta
   * como fora do prazo.
   */
  function entregasNoPrazo(entregas, corte) {
    let total = 0;
    let noPrazo = 0;
    let pendentesAtrasadas = 0;
    for (const e of entregas || []) {
      const realizada = e.real && e.real <= corte;
      if (realizada) {
        total += 1;
        if (e.real <= e.prevista) noPrazo += 1;
      } else if (e.prevista < corte) {
        total += 1;
        pendentesAtrasadas += 1;
      }
    }
    return { noPrazo, total, pendentesAtrasadas, pct: B().div(noPrazo, total) };
  }

  /** Glosas % = valor glosado ÷ valor faturado. */
  function glosasPct(valorGlosado, valorFaturado) {
    return B().div(valorGlosado, valorFaturado);
  }

  /** Resultado de contribuição = receita − custo variável − frete − multas − glosas. */
  function resultadoContribuicao({ receita, custoVariavel, frete, multas, glosas }) {
    const { num } = B();
    return num(receita) - num(custoVariavel) - num(frete) - num(multas) - num(glosas);
  }

  /** Concentração de receita = receita do órgão ÷ receita total. */
  function concentracao(receitaOrgao, receitaTotal) {
    return B().div(receitaOrgao, receitaTotal);
  }

  /** Data da última entrega realizada de um empenho (ou null). */
  function ultimaEntrega(empenho) {
    const datas = (empenho.entregas || []).map((e) => e.real).filter(Boolean).sort();
    return datas.length ? datas[datas.length - 1] : null;
  }

  /**
   * Prazo médio real de pagamento = média de (pagamento − liquidação) e de
   * (pagamento − última entrega), para empenhos pagos até "ate".
   */
  function prazoMedioPagamento(empenhos, ate) {
    const { diasEntre, media } = B();
    const pagos = (empenhos || []).filter((e) => e.pagamento && e.pagamento.data && (!ate || e.pagamento.data <= ate));
    const desdeLiq = pagos.filter((e) => e.liquidacao && e.liquidacao.data)
      .map((e) => diasEntre(e.liquidacao.data, e.pagamento.data));
    const desdeEnt = pagos.map((e) => {
      const u = ultimaEntrega(e);
      return u ? diasEntre(u, e.pagamento.data) : null;
    });
    return { desdeLiquidacao: media(desdeLiq), desdeEntrega: media(desdeEnt), n: pagos.length };
  }

  /**
   * Recebíveis em aberto até o corte, separados em: aguardando liquidação,
   * liquidado a receber e vencido (liquidado e não pago após o prazo
   * contratual do órgão).
   */
  function recebiveis(empenhos, prazoContratual, corte) {
    const { num, soma, somarDias, diasEntre } = B();
    const titulos = [];
    let aguardandoLiquidacao = 0;
    let liquidadoAReceber = 0;
    let vencido = 0;
    for (const emp of empenhos || []) {
      if (emp.pagamento && emp.pagamento.data && emp.pagamento.data <= corte) continue;
      const liq = emp.liquidacao;
      if (liq && liq.data && liq.data <= corte) {
        const valor = num(liq.valor);
        const vencimento = somarDias(liq.data, num(prazoContratual));
        const atraso = diasEntre(vencimento, corte);
        const estaVencido = atraso > 0;
        liquidadoAReceber += valor;
        if (estaVencido) vencido += valor;
        titulos.push({
          empenho: emp, situacao: estaVencido ? 'vencido' : 'a-vencer', valor,
          liquidacao: liq.data, vencimento, diasAtraso: Math.max(0, atraso)
        });
      } else {
        const faturado = soma((emp.entregas || []).filter((e) => e.real && e.real <= corte), (e) => e.valor);
        if (faturado > 0) {
          aguardandoLiquidacao += faturado;
          titulos.push({
            empenho: emp, situacao: 'aguardando', valor: faturado,
            liquidacao: null, vencimento: null, diasAtraso: 0, ultimaEntrega: ultimaEntrega(emp)
          });
        }
      }
    }
    return {
      aguardandoLiquidacao, liquidadoAReceber, vencido,
      emAberto: aguardandoLiquidacao + liquidadoAReceber, titulos
    };
  }

  /** Faturamento (entregas realizadas) entre duas datas, inclusive. */
  function faturamento(empenhos, ini, fim) {
    let total = 0;
    for (const emp of empenhos || []) {
      for (const e of emp.entregas || []) {
        if (e.real && e.real >= ini && e.real <= fim) total += B().num(e.valor);
      }
    }
    return total;
  }

  /**
   * Análise completa de um contrato ou ata até a data de corte.
   * ctx precisa de: analisesLotes, custosPadrao, produtosPorId, empenhosPorContrato.
   */
  function analisarContrato(contrato, ctx, corte) {
    const { num, soma, div, diasEntre, ehNumero, maximo } = B();
    const empenhos = (ctx.empenhosPorContrato.get(contrato.id) || []).filter((e) => e.data <= corte);
    const empenhado = qtdEmpenhada(empenhos);
    const custoPorProduto = new Map();

    const itens = (contrato.itens || []).map((item) => {
      const padrao = ctx.custosPadrao.get(item.produtoId) || null;
      const custo = custoAtualProduto(item.produtoId, ctx.analisesLotes, padrao, corte);
      custoPorProduto.set(item.produtoId, custo);
      const qtdEmp = empenhado.get(item.produtoId) || 0;
      const s = saldo(item.qtdRegistrada, qtdEmp);
      const ritmo = ritmoConsumo(empenhos, item.produtoId, corte);
      const margemPrevista = margemItem(item.precoContratado, item.custoProposta);
      const margemAtual = margemItem(item.precoContratado, custo.custo);
      return Object.assign({}, item, {
        produto: ctx.produtosPorId.get(item.produtoId) || null,
        custoAtual: custo.custo,
        custoVariavelAtual: custo.custoVariavel,
        fonteCusto: custo.fonte,
        lotesUsados: custo.lotes,
        qtdEmpenhada: qtdEmp,
        saldo: s.saldo,
        pctConsumido: s.pctConsumido,
        pctSaldo: s.pctSaldo,
        ritmoDiario: ritmo,
        dataEsgotamento: dataEsgotamento(s.saldo, ritmo, corte),
        margemPrevista,
        margemAtual,
        erosao: erosaoMargem(margemPrevista, margemAtual),
        defasagem: defasagemCusto(custo.custo, item.custoProposta),
        // Defasagem sem a ineficiência interna (só preço de insumos, MOD e CIF no padrão de consumo).
        ineficienciaUnit: custo.ineficiencia,
        defasagemSemIneficiencia: ehNumero(custo.custo) && ehNumero(custo.ineficiencia)
          ? defasagemCusto(custo.custo - custo.ineficiencia, item.custoProposta) : null,
        valorRegistrado: num(item.qtdRegistrada) * num(item.precoContratado),
        valorAFaturar: Math.max(s.saldo, 0) * num(item.precoContratado)
      });
    });

    // Margens do contrato ponderadas pelo valor registrado de cada item.
    const valorRegistrado = soma(itens, (i) => i.valorRegistrado);
    const margemPrevista = div(soma(itens, (i) => num(i.qtdRegistrada) * (num(i.precoContratado) - num(i.custoProposta))), valorRegistrado);
    const itensComCusto = itens.filter((i) => ehNumero(i.custoAtual));
    const margemAtual = itensComCusto.length
      ? div(soma(itensComCusto, (i) => num(i.qtdRegistrada) * (num(i.precoContratado) - i.custoAtual)),
        soma(itensComCusto, (i) => i.valorRegistrado))
      : null;

    // Entregas, glosas, multas e resultado de contribuição.
    const entregas = [];
    for (const emp of empenhos) for (const e of emp.entregas || []) entregas.push(Object.assign({ empenhoId: emp.id, empenhoNumero: emp.numero }, e));
    const realizadas = entregas.filter((e) => e.real && e.real <= corte);
    const receitaEntregue = soma(realizadas, (e) => e.valor);
    const frete = soma(realizadas, (e) => e.frete);
    const custoVariavel = soma(realizadas, (e) => {
      const c = custoPorProduto.get(e.produtoId);
      const padrao = ctx.custosPadrao.get(e.produtoId);
      const unit = c && ehNumero(c.custoVariavel) ? c.custoVariavel : (padrao ? padrao.variavel : null);
      return ehNumero(unit) ? num(e.qtd) * unit : 0;
    });
    const glosas = soma(empenhos.filter((e) => e.liquidacao && e.liquidacao.data && e.liquidacao.data <= corte), (e) => e.liquidacao.glosa);
    const faturadoLiquidado = soma(empenhos.filter((e) => e.liquidacao && e.liquidacao.data && e.liquidacao.data <= corte),
      (e) => soma(e.entregas || [], (x) => x.valor));
    const multas = soma((contrato.penalidades || []).filter((p) => p.data <= corte), (p) => p.valor);
    const prazo = entregasNoPrazo(entregas, corte);

    return {
      contrato,
      corte,
      empenhos,
      itens,
      entregas,
      valorRegistrado,
      margemPrevista,
      margemAtual,
      erosao: erosaoMargem(margemPrevista, margemAtual),
      defasagemMaxima: maximo(itens, (i) => i.defasagem),
      qtdRegistrada: soma(itens, (i) => i.qtdRegistrada),
      pctConsumido: div(soma(itens, (i) => i.qtdEmpenhada * num(i.precoContratado)), valorRegistrado),
      pctSaldo: div(soma(itens, (i) => Math.max(i.saldo, 0) * num(i.precoContratado)), valorRegistrado),
      valorAFaturar: valorAFaturar(itens),
      receitaEntregue,
      custoVariavel,
      frete,
      glosas,
      glosasPct: glosasPct(glosas, faturadoLiquidado),
      multas,
      resultadoContribuicao: resultadoContribuicao({ receita: receitaEntregue, custoVariavel, frete, multas, glosas }),
      margemContribuicaoPct: div(resultadoContribuicao({ receita: receitaEntregue, custoVariavel, frete, multas, glosas }), receitaEntregue),
      entregasNoPrazo: prazo,
      diasParaFimVigencia: diasEntre(corte, contrato.vigenciaFim),
      vigente: contrato.vigenciaInicio <= corte && contrato.vigenciaFim >= corte
    };
  }

  /**
   * Análise de um órgão: prazo médio real × contratual, recebíveis e
   * receita dos últimos 12 meses até o corte.
   */
  function analisarOrgao(orgao, ctx, corte) {
    const { somarDias, sub } = B();
    const contratos = (ctx.dados.contratos || []).filter((c) => c.orgaoId === orgao.id);
    const empenhos = [];
    for (const c of contratos) for (const e of ctx.empenhosPorContrato.get(c.id) || []) if (e.data <= corte) empenhos.push(e);
    const prazo = prazoMedioPagamento(empenhos, corte);
    const rec = recebiveis(empenhos, orgao.prazoPagamentoContratual, corte);
    const inicio12m = somarDias(corte, -365);
    return {
      orgao,
      contratos,
      empenhos,
      prazoMedioLiquidacao: prazo.desdeLiquidacao,
      prazoMedioEntrega: prazo.desdeEntrega,
      pagamentosConsiderados: prazo.n,
      atrasoMedio: sub(prazo.desdeLiquidacao, orgao.prazoPagamentoContratual),
      recebiveis: rec,
      receita12m: faturamento(empenhos, somarDias(inicio12m, 1), corte)
    };
  }

  const contratos = {
    margemItem, defasagemCusto, erosaoMargem, custoAtualProduto, qtdEmpenhada, saldo, ritmoConsumo,
    dataEsgotamento, valorAFaturar, entregasNoPrazo, glosasPct, resultadoContribuicao, concentracao,
    ultimaEntrega, prazoMedioPagamento, recebiveis, faturamento, analisarContrato, analisarOrgao
  };
  NS.calc.contratos = contratos;
  if (typeof module !== 'undefined' && module.exports) module.exports = contratos;
})(typeof window !== 'undefined' ? window : globalThis);
