/* ==========================================================================
   calc/custos.js
   Custos e produção: custo padrão pela ficha técnica, custo real do lote,
   variações de preço (Compras) e de quantidade/eficiência (Produção),
   rendimento, perdas, rateio de CIF, CPV, giro e conciliação entre
   custeio por absorção e variável. Funções puras.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};
  const B = () => NS.calc.base; // acesso tardio: permite qualquer ordem de carga

  const MOTIVOS_PERDA = ['processo', 'validade', 'avaria', 'qualidade'];

  /**
   * Custo padrão unitário pela ficha técnica:
   * [Σ(qtd padrão × preço padrão) ÷ rendimento padrão] + MOD padrão + CIF padrão.
   * Devolve também a parte variável (materiais + MOD), usada no custeio variável.
   */
  function custoPadraoUnitario(produto, insumosPorId) {
    const { num, div, soma } = B();
    const detalhes = (produto.fichaTecnica || []).map((f) => {
      const ins = insumosPorId.get(f.insumoId);
      const preco = ins ? num(ins.precoPadrao) : 0;
      return { insumoId: f.insumoId, qtdPadrao: num(f.qtdPadrao), precoPadrao: preco, valor: num(f.qtdPadrao) * preco };
    });
    const materiaisBrutos = soma(detalhes, (d) => d.valor);
    const materiais = div(materiaisBrutos, produto.rendimentoPadrao);
    const mod = num(produto.modPadrao);
    const cif = num(produto.cifPadrao);
    return {
      detalhes,
      materiaisBrutos,                       // antes de considerar o rendimento
      materiais,                             // já dividido pelo rendimento
      mod,
      cif,
      variavel: materiais === null ? null : materiais + mod,
      total: materiais === null ? null : materiais + mod + cif
    };
  }

  /** Qtd padrão permitida = qtd padrão por unidade × qtd produzida ÷ rendimento padrão. */
  function qtdPadraoPermitida(qtdPadraoUnit, qtdProduzida, rendimentoPadrao) {
    const { num, div } = B();
    return div(num(qtdPadraoUnit) * num(qtdProduzida), rendimentoPadrao);
  }

  /** Variação de preço = (preço real − preço padrão) × qtd real consumida. Responsável: Compras. */
  function variacaoPreco(precoReal, precoPadrao, qtdReal) {
    const { ehNumero } = B();
    if (!ehNumero(precoReal) || !ehNumero(precoPadrao) || !ehNumero(qtdReal)) return null;
    return (precoReal - precoPadrao) * qtdReal;
  }

  /** Variação de quantidade = (qtd real − qtd padrão permitida) × preço padrão. Responsável: Produção. */
  function variacaoQuantidade(qtdReal, qtdPermitida, precoPadrao) {
    const { ehNumero } = B();
    if (!ehNumero(qtdReal) || !ehNumero(qtdPermitida) || !ehNumero(precoPadrao)) return null;
    return (qtdReal - qtdPermitida) * precoPadrao;
  }

  /** Rendimento real = qtd produzida ÷ qtd que o insumo consumido deveria gerar. */
  function rendimentoReal(qtdProduzida, producaoTeorica) {
    return B().div(qtdProduzida, producaoTeorica);
  }

  /** Índice de perdas = valor perdido ÷ valor total consumido. */
  function indicePerdas(valorPerdido, valorConsumido) {
    return B().div(valorPerdido, valorConsumido);
  }

  /**
   * Rateio do CIF entre lotes pelo critério escolhido:
   * 'horas' (horas de produção do lote) ou 'kg' (qtd produzida × peso em kg).
   * Devolve Map loteId -> valor rateado. Se a base total for zero, rateia nada.
   */
  function rateioCIF(cifTotal, lotes, criterio, pesoKgPorProduto) {
    const { num, div } = B();
    const bases = lotes.map((l) => {
      const base = criterio === 'kg'
        ? num(l.qtdProduzida) * num(pesoKgPorProduto ? pesoKgPorProduto.get(l.produtoId) : 1)
        : num(l.horasProducao);
      return { id: l.id, base };
    });
    const total = bases.reduce((s, b) => s + b.base, 0);
    const mapa = new Map();
    for (const b of bases) {
      const fator = div(b.base, total);
      mapa.set(b.id, fator === null ? null : num(cifTotal) * fator);
    }
    return mapa;
  }

  /**
   * Análise completa de um lote: custo real × padrão, variações por insumo,
   * rendimento e perdas. "cifRateado" vem do rateio do mês; se for null,
   * usa o CIF padrão × qtd produzida (e indica a fonte).
   */
  function analisarLote(lote, produto, insumosPorId, cifRateado) {
    const { num, div, ehNumero, soma } = B();
    const padrao = custoPadraoUnitario(produto, insumosPorId);
    const qtdProd = num(lote.qtdProduzida);
    const ficha = new Map((produto.fichaTecnica || []).map((f) => [f.insumoId, num(f.qtdPadrao)]));

    // Consolida o consumo por insumo (pode haver mais de uma linha do mesmo insumo).
    const consumo = new Map();
    for (const c of lote.consumo || []) {
      const atual = consumo.get(c.insumoId) || { qtd: 0, valor: 0 };
      atual.qtd += num(c.qtd);
      atual.valor += num(c.qtd) * num(c.precoReal);
      consumo.set(c.insumoId, atual);
    }

    // Insumos da ficha não consumidos também entram (qtd real zero).
    const ids = new Set([...ficha.keys(), ...consumo.keys()]);
    const variacoes = [];
    for (const insumoId of ids) {
      const ins = insumosPorId.get(insumoId);
      const precoPadrao = ins ? num(ins.precoPadrao) : 0;
      const c = consumo.get(insumoId) || { qtd: 0, valor: 0 };
      const precoReal = c.qtd > 0 ? c.valor / c.qtd : precoPadrao;
      const qtdPermitida = num(qtdPadraoPermitida(ficha.get(insumoId) || 0, qtdProd, produto.rendimentoPadrao));
      const varPreco = c.qtd > 0 ? variacaoPreco(precoReal, precoPadrao, c.qtd) : 0;
      const varQtd = variacaoQuantidade(c.qtd, qtdPermitida, precoPadrao);
      variacoes.push({
        insumoId, foraDaFicha: !ficha.has(insumoId), qtdReal: c.qtd, qtdPermitida,
        precoReal, precoPadrao, valorReal: c.valor, valorPadrao: qtdPermitida * precoPadrao,
        varPreco, varQtd, varQtdPct: div(c.qtd - qtdPermitida, qtdPermitida)
      });
    }

    const materiaisReal = soma(variacoes, (v) => v.valorReal);
    const materiaisPadrao = soma(variacoes, (v) => v.valorPadrao);
    const varPrecoTotal = soma(variacoes, (v) => v.varPreco);
    const varQtdTotal = soma(variacoes, (v) => v.varQtd);
    const modReal = num(lote.modReal);
    const modPadraoTotal = padrao.mod * qtdProd;
    const varMOD = modReal - modPadraoTotal;
    const cifFonte = ehNumero(cifRateado) ? 'rateado' : 'padrao';
    const cif = ehNumero(cifRateado) ? cifRateado : padrao.cif * qtdProd;
    const cifPadraoTotal = padrao.cif * qtdProd;
    const custoTotal = materiaisReal + modReal + cif;
    const custoPadraoTotal = padrao.total === null ? null : padrao.total * qtdProd;

    // Rendimento: produção teórica = consumo valorizado a preço padrão ÷ materiais padrão por unidade
    // (ponderação pelo custo padrão, para somar insumos de unidades diferentes).
    const consumoValorizadoPadrao = soma(variacoes.filter((v) => !v.foraDaFicha), (v) => v.qtdReal * v.precoPadrao);
    const producaoTeorica = div(consumoValorizadoPadrao, padrao.materiaisBrutos);
    const rendimento = rendimentoReal(qtdProd, producaoTeorica);

    // Perdas por motivo
    const porMotivo = {};
    for (const mtv of MOTIVOS_PERDA) porMotivo[mtv] = 0;
    for (const p of lote.perdas || []) porMotivo[p.motivo] = num(porMotivo[p.motivo]) + num(p.valor);
    const perdasValor = soma(lote.perdas || [], (p) => p.valor);

    return {
      qtdProduzida: qtdProd,
      qtdPlanejada: num(lote.qtdPlanejada),
      horasProducao: num(lote.horasProducao),
      horasParadas: num(lote.horasParadas),
      padrao,
      variacoes,
      materiaisReal,
      materiaisPadrao,
      modReal,
      modPadraoTotal,
      cif,
      cifFonte,
      cifPadraoTotal,
      varCIF: cif - cifPadraoTotal,
      custoTotal,
      custoUnitario: div(custoTotal, qtdProd),
      custoVariavelTotal: materiaisReal + modReal,
      custoVariavelUnit: div(materiaisReal + modReal, qtdProd),
      custoPadraoUnit: padrao.total,
      custoPadraoTotal,
      variacaoTotal: custoPadraoTotal === null ? null : custoTotal - custoPadraoTotal,
      variacaoPct: div(custoPadraoTotal === null ? null : custoTotal - custoPadraoTotal, custoPadraoTotal),
      varPreco: varPrecoTotal,
      varQtd: varQtdTotal,
      varMOD,
      producaoTeorica,
      rendimento,
      rendimentoPadrao: produto.rendimentoPadrao,
      perdasValor,
      perdasPorMotivo: porMotivo,
      indicePerdas: indicePerdas(perdasValor, materiaisReal),
      indicePerdasPorMotivo: Object.fromEntries(MOTIVOS_PERDA.map((mtv) => [mtv, indicePerdas(porMotivo[mtv], materiaisReal)]))
    };
  }

  /**
   * Consolida várias análises de lote (de um produto, de um mês ou de tudo):
   * somas, variação %, rendimento ponderado e índice de perdas.
   */
  function resumirAnalises(analises) {
    const { soma, div } = B();
    const qtdProduzida = soma(analises, (a) => a.qtdProduzida);
    const custoTotal = soma(analises, (a) => a.custoTotal);
    const custoPadraoTotal = soma(analises, (a) => a.custoPadraoTotal);
    const materiaisReal = soma(analises, (a) => a.materiaisReal);
    const perdasValor = soma(analises, (a) => a.perdasValor);
    const porMotivo = {};
    for (const mtv of MOTIVOS_PERDA) porMotivo[mtv] = soma(analises, (a) => a.perdasPorMotivo[mtv]);
    return {
      lotes: analises.length,
      qtdProduzida,
      custoTotal,
      custoPadraoTotal,
      custoUnitario: div(custoTotal, qtdProduzida),
      custoPadraoUnit: div(custoPadraoTotal, qtdProduzida),
      custoVariavelTotal: soma(analises, (a) => a.custoVariavelTotal),
      custoVariavelUnit: div(soma(analises, (a) => a.custoVariavelTotal), qtdProduzida),
      variacaoTotal: custoTotal - custoPadraoTotal,
      variacaoPct: div(custoTotal - custoPadraoTotal, custoPadraoTotal),
      varPreco: soma(analises, (a) => a.varPreco),
      varQtd: soma(analises, (a) => a.varQtd),
      varMOD: soma(analises, (a) => a.varMOD),
      varCIF: soma(analises, (a) => a.varCIF),
      materiaisReal,
      rendimento: div(qtdProduzida, soma(analises, (a) => a.producaoTeorica)),
      perdasValor,
      perdasPorMotivo: porMotivo,
      indicePerdas: indicePerdas(perdasValor, materiaisReal),
      horasProducao: soma(analises, (a) => a.horasProducao),
      horasParadas: soma(analises, (a) => a.horasParadas)
    };
  }

  /** CPV = estoque inicial de acabados + custo da produção − estoque final de acabados. */
  function cpv(estoqueInicial, custoProducao, estoqueFinal) {
    const { ehNumero } = B();
    if (![estoqueInicial, custoProducao, estoqueFinal].every(ehNumero)) return null;
    return estoqueInicial + custoProducao - estoqueFinal;
  }

  /** Giro de estoque = CPV ÷ estoque médio. */
  function giroEstoque(custoVendido, estoqueMedio) {
    return B().div(custoVendido, estoqueMedio);
  }

  /** Cobertura em dias = estoque ÷ consumo médio diário. */
  function coberturaDias(estoque, consumoMedioDiario) {
    return B().div(estoque, consumoMedioDiario);
  }

  /** Lucro por absorção − lucro pelo variável = CIF fixos no estoque final − CIF fixos no estoque inicial. */
  function conciliacaoAbsorcao(cifFixosEstoqueFinal, cifFixosEstoqueInicial) {
    return B().sub(cifFixosEstoqueFinal, cifFixosEstoqueInicial);
  }

  /** Receita e margem bruta de uma venda simples (qtd × preço, qtd × custo). */
  function resultadoVendas(qtd, preco, custoUnit) {
    const { mult, sub } = B();
    const receita = mult(qtd, preco);
    const custo = mult(qtd, custoUnit);
    return { receita, custo, margem: sub(receita, custo) };
  }

  const custos = {
    MOTIVOS_PERDA, custoPadraoUnitario, qtdPadraoPermitida, variacaoPreco, variacaoQuantidade,
    rendimentoReal, indicePerdas, rateioCIF, analisarLote, resumirAnalises, cpv, giroEstoque,
    coberturaDias, conciliacaoAbsorcao, resultadoVendas
  };
  NS.calc.custos = custos;
  if (typeof module !== 'undefined' && module.exports) module.exports = custos;
})(typeof window !== 'undefined' ? window : globalThis);
