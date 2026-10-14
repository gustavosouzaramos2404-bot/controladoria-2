/* ==========================================================================
   calc/estoque.js
   Estoque e perdas: saldos por item e por lote a partir dos movimentos,
   lista FEFO (primeiro que vence, primeiro que sai), consumo médio diário,
   cobertura em dias, giro e itens abaixo do mínimo. Funções puras.
   Convenção de sinal: entrada soma; saída e perda subtraem; ajuste usa o
   sinal digitado (positivo aumenta, negativo reduz).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};
  const B = () => NS.calc.base;

  const EPSILON = 1e-6; // tolerância para considerar saldo zerado

  /** Quantidade com sinal conforme o tipo do movimento. */
  function qtdComSinal(mov) {
    const q = B().num(mov.qtd);
    if (mov.tipo === 'entrada') return Math.abs(q);
    if (mov.tipo === 'saida' || mov.tipo === 'perda') return -Math.abs(q);
    return q; // ajuste
  }

  /** Valor com sinal conforme o tipo do movimento. */
  function valorComSinal(mov) {
    const v = B().num(mov.valor);
    if (mov.tipo === 'entrada') return Math.abs(v);
    if (mov.tipo === 'saida' || mov.tipo === 'perda') return -Math.abs(v);
    return v;
  }

  /** Chave única do item: "insumo:ID" ou "produto:ID". */
  function chaveItem(itemTipo, itemId) {
    return `${itemTipo}:${itemId}`;
  }

  /** Saldos (qtd e valor) por item até a data "ate" (inclusive). */
  function saldos(movimentos, ate) {
    const mapa = new Map();
    for (const m of movimentos || []) {
      if (ate && m.data > ate) continue;
      const k = chaveItem(m.itemTipo, m.itemId);
      const s = mapa.get(k) || { itemTipo: m.itemTipo, itemId: m.itemId, qtd: 0, valor: 0 };
      s.qtd += qtdComSinal(m);
      s.valor += valorComSinal(m);
      mapa.set(k, s);
    }
    for (const s of mapa.values()) {
      if (Math.abs(s.qtd) < EPSILON) s.qtd = 0;
      if (Math.abs(s.valor) < 0.005) s.valor = 0;
    }
    return mapa;
  }

  /** Saldos por item e lote (somente lotes com quantidade positiva). */
  function saldosPorLote(movimentos, ate) {
    const mapa = new Map();
    for (const m of movimentos || []) {
      if (ate && m.data > ate) continue;
      const lote = m.lote || '(sem lote)';
      const k = `${chaveItem(m.itemTipo, m.itemId)}|${lote}`;
      const s = mapa.get(k) || { itemTipo: m.itemTipo, itemId: m.itemId, lote, validade: null, qtd: 0, valor: 0 };
      s.qtd += qtdComSinal(m);
      s.valor += valorComSinal(m);
      // A validade do lote vem do movimento de entrada (ou do primeiro que informar).
      if (m.validade && (!s.validade || m.tipo === 'entrada')) s.validade = m.validade;
      mapa.set(k, s);
    }
    return Array.from(mapa.values()).filter((s) => s.qtd > EPSILON);
  }

  /**
   * Lista FEFO: lotes com saldo ordenados pela validade (primeiro que vence
   * sai primeiro), com dias para vencer em relação a "hoje".
   */
  function fefo(lotesComSaldo, hoje) {
    const { diasEntre } = B();
    return lotesComSaldo
      .filter((s) => s.validade)
      .map((s) => Object.assign({}, s, { diasParaVencer: diasEntre(hoje, s.validade) }))
      .sort((a, b) => (a.validade < b.validade ? -1 : a.validade > b.validade ? 1 : 0));
  }

  /** Lotes que vencem em até "limiteDias" (inclui vencidos, com dias negativos). */
  function proximosDoVencimento(listaFefo, limiteDias) {
    return listaFefo.filter((s) => s.diasParaVencer !== null && s.diasParaVencer <= limiteDias);
  }

  /** Consumo médio diário (saídas) do item na janela de dias até "ate". */
  function consumoMedioDiario(movimentos, itemTipo, itemId, ate, janelaDias = 90) {
    const { somarDias, div } = B();
    const inicio = somarDias(ate, -janelaDias);
    let total = 0;
    for (const m of movimentos || []) {
      if (m.itemTipo !== itemTipo || m.itemId !== itemId || m.tipo !== 'saida') continue;
      if (m.data > inicio && m.data <= ate) total += Math.abs(B().num(m.qtd));
    }
    return div(total, janelaDias);
  }

  /** Giro = saídas valorizadas no período ÷ estoque médio valorizado. */
  function giro(saidasValor, estoqueMedioValor) {
    return B().div(saidasValor, estoqueMedioValor);
  }

  /** Itens cujo saldo está abaixo do estoque mínimo cadastrado. */
  function abaixoMinimo(mapaSaldos, itens, itemTipo = 'insumo') {
    const r = [];
    for (const item of itens || []) {
      const minimo = B().num(item.estoqueMinimo);
      if (minimo <= 0) continue;
      const s = mapaSaldos.get(chaveItem(itemTipo, item.id));
      const qtd = s ? s.qtd : 0;
      if (qtd < minimo) r.push({ item, saldo: qtd, minimo, falta: minimo - qtd });
    }
    return r;
  }

  const estoque = {
    qtdComSinal, valorComSinal, chaveItem, saldos, saldosPorLote, fefo, proximosDoVencimento,
    consumoMedioDiario, giro, abaixoMinimo
  };
  NS.calc.estoque = estoque;
  if (typeof module !== 'undefined' && module.exports) module.exports = estoque;
})(typeof window !== 'undefined' ? window : globalThis);
