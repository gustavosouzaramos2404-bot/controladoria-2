/* ==========================================================================
   tests/calc.test.js
   Testes das funções de cálculo (js/calc/), da formatação pt-BR, do
   esquema e das regras de alerta (com uma massa de teste que existe só
   aqui: o sistema em si começa vazio). Roda de dois jeitos, sem
   dependências:
     - Node:       node tests/calc.test.js
     - Navegador:  abrir tests/tests.html
   Inclui os casos obrigatórios: VisionSteel, ROI (margem × giro),
   variações de preço e quantidade calculadas à mão, ciclo de caixa de 65
   dias, divisão por zero e valores negativos.
   ========================================================================== */
(function () {
  'use strict';

  const emNode = typeof window === 'undefined' && typeof require === 'function';
  let NS;
  let assert;

  if (emNode) {
    // Carrega os módulos puros na mesma ordem do index.html.
    const path = require('path');
    const raizJs = path.join(__dirname, '..', 'js');
    [
      'core/namespace.js', 'core/events.js', 'core/format.js', 'core/validate.js', 'core/schema.js',
      'calc/base.js', 'calc/custos.js', 'calc/estoque.js', 'calc/contratos.js', 'calc/capitalGiro.js',
      'calc/financeiros.js', 'calc/orcamento.js', 'calc/contexto.js', 'calc/indicadores.js', 'calc/alertas.js',
      'core/store.js'
    ].forEach((f) => require(path.join(raizJs, f)));
    NS = globalThis.Controladoria;
    assert = require('assert');
  } else {
    NS = window.Controladoria;
    // Versão mínima de "assert" para o navegador.
    const falhar = (msg) => { throw new Error(msg); };
    assert = {
      ok: (v, msg) => { if (!v) falhar(msg || `Esperado verdadeiro, obtido ${v}`); },
      strictEqual: (a, b, msg) => { if (a !== b) falhar(msg || `Esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); },
      deepStrictEqual: (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) falhar(msg || `Esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); }
    };
  }

  const { base: B, custos: Cu, estoque: E, contratos: Co, capitalGiro: CG, financeiros: Fi, orcamento: Or, indicadores: In, alertas: Al } = NS.calc;
  const F = NS.core.format;

  const testes = [];
  const teste = (nome, fn) => testes.push({ nome, fn });
  /** Igualdade aproximada para números com casas decimais. */
  const perto = (obtido, esperado, tol = 1e-6, msg) => {
    assert.ok(typeof obtido === 'number' && Math.abs(obtido - esperado) <= tol, msg || `Esperado ≈ ${esperado}, obtido ${obtido}`);
  };
  /** Procura NaN/Infinity em qualquer valor aninhado. */
  const temInvalido = (obj, visto = new Set()) => {
    if (typeof obj === 'number') return !Number.isFinite(obj);
    if (!obj || typeof obj !== 'object' || visto.has(obj)) return false;
    visto.add(obj);
    if (obj instanceof Map) return Array.from(obj.values()).some((v) => temInvalido(v, visto));
    return Object.values(obj).some((v) => temInvalido(v, visto));
  };
  const semEspacoDuro = (t) => t.replace(/ | /g, ' ');

  /* ------------------------------- base ------------------------------- */
  teste('Divisão por zero devolve null (nunca NaN ou Infinity)', () => {
    assert.strictEqual(B.div(1, 0), null);
    assert.strictEqual(B.div(0, 0), null);
    assert.strictEqual(B.div(NaN, 2), null);
    assert.strictEqual(B.div(null, 2), null);
    assert.strictEqual(B.div(6, 3), 2);
    assert.strictEqual(B.div(-6, 3), -2);
  });
  teste('Subtração e multiplicação propagam ausência', () => {
    assert.strictEqual(B.sub(5, null), null);
    assert.strictEqual(B.mult(undefined, 2), null);
    assert.strictEqual(B.sub(-5, 3), -8);
  });
  teste('Aritmética de datas e competências', () => {
    assert.strictEqual(B.somarCompetencia('2026-01', -1), '2025-12');
    assert.strictEqual(B.somarCompetencia('2025-12', 13), '2027-01');
    assert.deepStrictEqual(B.listaCompetencias('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
    assert.strictEqual(B.diasEntre('2026-01-31', '2026-03-01'), 29);
    assert.strictEqual(B.somarMeses('2026-01-31', 1), '2026-02-28');
    assert.strictEqual(B.ultimoDia('2024-02'), '2024-02-29');
    assert.strictEqual(B.dataValida('2026-02-30'), false);
    assert.strictEqual(B.corteDaCompetencia('2026-10', '2026-10-02'), '2026-10-02');
    assert.strictEqual(B.corteDaCompetencia('2026-09', '2026-10-02'), '2026-09-30');
  });
  teste('Variação percentual com anterior negativo usa o módulo', () => {
    perto(B.variacaoPct(855000, 1000000), -0.145);
    perto(B.variacaoPct(-50, -100), 0.5);
    assert.strictEqual(B.variacaoPct(10, 0), null);
  });

  /* ------------------------------ formatação ------------------------------ */
  teste('Formatação pt-BR de moeda, percentual, datas e "sem dados"', () => {
    assert.strictEqual(semEspacoDuro(F.moeda(1234.5)), 'R$ 1.234,50');
    assert.strictEqual(semEspacoDuro(F.moeda(-10)), '-R$ 10,00');
    assert.strictEqual(F.pct(0.1234), '12,3%');
    assert.strictEqual(F.pct(null), 'sem dados');
    assert.strictEqual(F.pct(Infinity), 'sem dados');
    assert.strictEqual(F.numero(NaN), 'sem dados');
    assert.strictEqual(F.data('2026-09-30'), '30/09/2026');
    assert.strictEqual(F.competencia('2026-09'), '09/2026');
    assert.strictEqual(F.pp(0.021), '+2,1 p.p.');
    assert.strictEqual(F.dias(1), '1 dia');
  });
  teste('Leitura de números com vírgula decimal', () => {
    assert.strictEqual(F.parseNumero('1.234,56'), 1234.56);
    assert.strictEqual(F.parseNumero('12,5'), 12.5);
    assert.strictEqual(F.parseNumero('1.250'), 1250);
    assert.strictEqual(F.parseNumero('3.5'), 3.5);
    assert.strictEqual(F.parseNumero('-3,5'), -3.5);
    assert.strictEqual(F.parseNumero('R$ 10,00'), 10);
    assert.strictEqual(F.parseNumero('abc'), null);
    assert.strictEqual(F.parseNumero(''), null);
  });
  teste('Leitura de datas e competências', () => {
    assert.strictEqual(F.parseData('30/09/2026'), '2026-09-30');
    assert.strictEqual(F.parseData('31/02/2026'), null);
    assert.strictEqual(F.parseCompetencia('9/2026'), '2026-09');
    assert.strictEqual(F.parseCompetencia('13/2026'), null);
  });

  /* -------------------------------- custos -------------------------------- */
  teste('Caso VisionSteel: receita −14,5% e margem bruta −47,5%', () => {
    const antes = Cu.resultadoVendas(10000, 100, 62);
    const depois = Cu.resultadoVendas(9500, 90, 69);
    assert.strictEqual(antes.receita, 1000000);
    assert.strictEqual(antes.margem, 380000);
    assert.strictEqual(depois.receita, 855000);
    assert.strictEqual(depois.margem, 199500);
    perto(B.variacaoPct(depois.receita, antes.receita), -0.145);
    perto(B.variacaoPct(depois.margem, antes.margem), -0.475);
  });

  // Ficha técnica do exemplo calculado à mão: 0,5 kg de A (R$ 2,00) e 0,1 kg de B (R$ 10,00),
  // rendimento 80%, MOD R$ 0,30 e CIF R$ 0,20 por unidade.
  const insumosEx = new Map([['A', { id: 'A', precoPadrao: 2 }], ['B', { id: 'B', precoPadrao: 10 }]]);
  const produtoEx = { id: 'P', fichaTecnica: [{ insumoId: 'A', qtdPadrao: 0.5 }, { insumoId: 'B', qtdPadrao: 0.1 }], rendimentoPadrao: 0.8, modPadrao: 0.3, cifPadrao: 0.2 };
  const loteEx = {
    id: 'L1', produtoId: 'P', qtdProduzida: 1000, modReal: 320, horasProducao: 10,
    consumo: [{ insumoId: 'A', qtd: 700, precoReal: 2.2 }, { insumoId: 'B', qtd: 120, precoReal: 9.5 }],
    perdas: [{ motivo: 'processo', qtd: 10, valor: 26.8 }]
  };

  teste('Custo padrão unitário pela ficha técnica', () => {
    const c = Cu.custoPadraoUnitario(produtoEx, insumosEx);
    perto(c.materiais, 2.5);   // (0,5×2 + 0,1×10) ÷ 0,8
    perto(c.total, 3.0);       // 2,5 + 0,30 + 0,20
    perto(c.variavel, 2.8);
  });
  teste('Quantidade padrão permitida = qtd padrão × produzida ÷ rendimento', () => {
    perto(Cu.qtdPadraoPermitida(0.5, 1000, 0.8), 625);
    assert.strictEqual(Cu.qtdPadraoPermitida(0.5, 1000, 0), null);
  });
  teste('Variações de preço e de quantidade calculadas à mão', () => {
    // A: preço (2,20 − 2,00) × 700 = 140 ; quantidade (700 − 625) × 2,00 = 150
    perto(Cu.variacaoPreco(2.2, 2, 700), 140);
    perto(Cu.variacaoQuantidade(700, 625, 2), 150);
    // B (favorável, valores negativos): preço (9,50 − 10) × 120 = −60 ; quantidade (120 − 125) × 10 = −50
    perto(Cu.variacaoPreco(9.5, 10, 120), -60);
    perto(Cu.variacaoQuantidade(120, 125, 10), -50);
    const a = Cu.analisarLote(loteEx, produtoEx, insumosEx, 150);
    perto(a.varPreco, 80);
    perto(a.varQtd, 100);
    perto(a.materiaisReal, 2680);
    perto(a.materiaisPadrao, 2500);
    perto(a.materiaisReal - a.materiaisPadrao, a.varPreco + a.varQtd);  // a soma das variações fecha
    perto(a.varMOD, 20);         // 320 − 0,30 × 1000
    perto(a.custoTotal, 3150);   // 2680 + 320 + 150 (CIF rateado)
    perto(a.custoUnitario, 3.15);
    perto(a.variacaoPct, 0.05);  // (3150 − 3000) ÷ 3000
  });
  teste('Rendimento real e índice de perdas', () => {
    const a = Cu.analisarLote(loteEx, produtoEx, insumosEx, null);
    // produção teórica = (700×2 + 120×10) ÷ (0,5×2 + 0,1×10) = 1300
    perto(a.producaoTeorica, 1300);
    perto(a.rendimento, 1000 / 1300);
    perto(a.indicePerdas, 0.01);             // 26,8 ÷ 2.680
    assert.strictEqual(a.cifFonte, 'padrao'); // sem rateio, usa o CIF padrão
    perto(a.cif, 200);
  });
  teste('Lote sem produção não gera NaN', () => {
    const a = Cu.analisarLote(Object.assign({}, loteEx, { qtdProduzida: 0 }), produtoEx, insumosEx, null);
    assert.strictEqual(a.custoUnitario, null);
    assert.strictEqual(a.rendimento, 0);
    assert.ok(!temInvalido(a), 'Análise contém NaN ou Infinity');
  });
  teste('Rateio do CIF por horas e por kg', () => {
    const lotes = [{ id: 'x', produtoId: 'P', horasProducao: 10, qtdProduzida: 100 }, { id: 'y', produtoId: 'Q', horasProducao: 30, qtdProduzida: 100 }];
    const porHoras = Cu.rateioCIF(1000, lotes, 'horas');
    perto(porHoras.get('x'), 250);
    perto(porHoras.get('y'), 750);
    const porKg = Cu.rateioCIF(1000, lotes, 'kg', new Map([['P', 1], ['Q', 3]]));
    perto(porKg.get('x'), 250);
    const semBase = Cu.rateioCIF(1000, [{ id: 'z', horasProducao: 0 }], 'horas');
    assert.strictEqual(semBase.get('z'), null);
  });
  teste('CPV, giro, cobertura e conciliação absorção × variável', () => {
    assert.strictEqual(Cu.cpv(100, 500, 150), 450);
    assert.strictEqual(Cu.cpv(100, null, 150), null);
    perto(Cu.giroEstoque(450, 90), 5);
    assert.strictEqual(Cu.giroEstoque(450, 0), null);
    perto(Cu.coberturaDias(100, 10), 10);
    assert.strictEqual(Cu.conciliacaoAbsorcao(12000, 10000), 2000);
    assert.strictEqual(Cu.conciliacaoAbsorcao(8000, 10000), -2000);
  });

  /* -------------------------------- estoque -------------------------------- */
  const movsEx = [
    { data: '2026-01-01', itemTipo: 'insumo', itemId: 'A', tipo: 'entrada', qtd: 100, valor: 200, lote: 'L1', validade: '2026-03-01' },
    { data: '2026-01-02', itemTipo: 'insumo', itemId: 'A', tipo: 'entrada', qtd: 50, valor: 110, lote: 'L2', validade: '2026-02-01' },
    { data: '2026-01-10', itemTipo: 'insumo', itemId: 'A', tipo: 'saida', qtd: 30, valor: 60, lote: 'L1' },
    { data: '2026-01-11', itemTipo: 'insumo', itemId: 'A', tipo: 'perda', qtd: 5, valor: 10, lote: 'L1' },
    { data: '2026-01-12', itemTipo: 'insumo', itemId: 'A', tipo: 'ajuste', qtd: -10, valor: -20, lote: 'L1' }
  ];
  teste('Saldos por item: entrada soma, saída e perda subtraem, ajuste usa o sinal', () => {
    const s = E.saldos(movsEx).get('insumo:A');
    assert.strictEqual(s.qtd, 105);
    assert.strictEqual(s.valor, 220);
    assert.strictEqual(E.saldos(movsEx, '2026-01-05').get('insumo:A').qtd, 150);
  });
  teste('FEFO ordena pelo vencimento e calcula dias para vencer', () => {
    const lista = E.fefo(E.saldosPorLote(movsEx), '2026-01-20');
    assert.deepStrictEqual(lista.map((l) => l.lote), ['L2', 'L1']);
    assert.strictEqual(lista[0].diasParaVencer, 12);
    assert.strictEqual(E.proximosDoVencimento(lista, 15).length, 1);
  });
  teste('Consumo médio diário e estoque abaixo do mínimo', () => {
    perto(E.consumoMedioDiario(movsEx, 'insumo', 'A', '2026-01-31', 30), 1);
    const abaixo = E.abaixoMinimo(E.saldos(movsEx), [{ id: 'A', estoqueMinimo: 200 }, { id: 'B', estoqueMinimo: 0 }]);
    assert.strictEqual(abaixo.length, 1);
    assert.strictEqual(abaixo[0].falta, 95);
  });

  /* ------------------------------- contratos ------------------------------- */
  teste('Margem prevista, margem atual, defasagem e erosão', () => {
    perto(Co.margemItem(10, 7.5), 0.25);
    perto(Co.margemItem(10, 11), -0.1);          // margem negativa
    assert.strictEqual(Co.margemItem(0, 5), null); // preço zero
    perto(Co.defasagemCusto(8.8, 8), 0.1);
    assert.strictEqual(Co.defasagemCusto(5, 0), null);
    perto(Co.erosaoMargem(0.25, 0.12), 0.13);
  });
  teste('Custo atual: média dos últimos 3 lotes, ou padrão sem lotes', () => {
    const analises = [
      { produtoId: 'P', data: '2026-01-05', qtdProduzida: 100, custoTotal: 300, custoVariavelTotal: 250, lote: 'a' },
      { produtoId: 'P', data: '2026-02-05', qtdProduzida: 100, custoTotal: 320, custoVariavelTotal: 260, lote: 'b' },
      { produtoId: 'P', data: '2026-03-05', qtdProduzida: 200, custoTotal: 700, custoVariavelTotal: 600, lote: 'c' },
      { produtoId: 'P', data: '2026-04-05', qtdProduzida: 100, custoTotal: 400, custoVariavelTotal: 300, lote: 'd' }
    ];
    const c = Co.custoAtualProduto('P', analises, { total: 3, variavel: 2.5 }, '2026-04-30');
    perto(c.custo, (320 + 700 + 400) / 400);
    assert.strictEqual(c.fonte, 'lotes');
    const semLotes = Co.custoAtualProduto('X', analises, { total: 3, variavel: 2.5 }, '2026-04-30');
    assert.strictEqual(semLotes.fonte, 'padrao');
    assert.strictEqual(semLotes.custo, 3);
  });
  teste('Saldo da ata, ritmo de empenho e data de esgotamento', () => {
    const s = Co.saldo(1000, 800);
    assert.strictEqual(s.saldo, 200);
    perto(s.pctConsumido, 0.8);
    const emp = [{ data: '2026-03-01', itens: [{ produtoId: 'P', qtd: 450 }] }, { data: '2026-04-15', itens: [{ produtoId: 'P', qtd: 450 }] }, { data: '2025-10-01', itens: [{ produtoId: 'P', qtd: 999 }] }];
    perto(Co.ritmoConsumo(emp, 'P', '2026-04-30', 90), 10);
    assert.strictEqual(Co.dataEsgotamento(200, 10, '2026-04-30'), '2026-05-20');
    assert.strictEqual(Co.dataEsgotamento(200, 0, '2026-04-30'), null);
    assert.strictEqual(Co.dataEsgotamento(-5, 10, '2026-04-30'), '2026-04-30');
    perto(Co.valorAFaturar([{ saldo: 200, precoContratado: 5 }, { saldo: -10, precoContratado: 5 }]), 1000);
  });
  teste('Entregas no prazo (pendente vencida conta como atraso)', () => {
    const r = Co.entregasNoPrazo([
      { prevista: '2026-03-10', real: '2026-03-09' },
      { prevista: '2026-03-10', real: '2026-03-14' },
      { prevista: '2026-03-20', real: null },
      { prevista: '2026-04-20', real: null }
    ], '2026-03-31');
    assert.strictEqual(r.total, 3);
    assert.strictEqual(r.noPrazo, 1);
    perto(r.pct, 1 / 3);
    assert.strictEqual(Co.entregasNoPrazo([], '2026-03-31').pct, null);
  });
  teste('Glosas, resultado de contribuição e concentração', () => {
    perto(Co.glosasPct(500, 10000), 0.05);
    assert.strictEqual(Co.glosasPct(500, 0), null);
    assert.strictEqual(Co.resultadoContribuicao({ receita: 10000, custoVariavel: 6000, frete: 300, multas: 200, glosas: 100 }), 3400);
    assert.strictEqual(Co.resultadoContribuicao({ receita: 1000, custoVariavel: 1500, frete: 0, multas: 0, glosas: 0 }), -500);
    perto(Co.concentracao(300, 1000), 0.3);
  });
  teste('Prazo médio real de pagamento e recebível vencido', () => {
    const emp = [
      { liquidacao: { data: '2026-01-10', valor: 100 }, pagamento: { data: '2026-02-09' }, entregas: [{ real: '2026-01-01', valor: 100 }] },
      { liquidacao: { data: '2026-02-10', valor: 100 }, pagamento: { data: '2026-04-01' }, entregas: [{ real: '2026-02-01', valor: 100 }] },
      { liquidacao: { data: '2026-03-01', valor: 500 }, pagamento: {}, entregas: [{ real: '2026-02-20', valor: 500 }] },
      { liquidacao: {}, pagamento: {}, entregas: [{ real: '2026-03-25', valor: 70 }] }
    ];
    const p = Co.prazoMedioPagamento(emp);
    perto(p.desdeLiquidacao, 40);   // (30 + 50) ÷ 2
    perto(p.desdeEntrega, 49);      // (39 + 59) ÷ 2 — fevereiro de 2026 tem 28 dias
    const r = Co.recebiveis(emp, 30, '2026-04-30');
    assert.strictEqual(r.vencido, 500);
    assert.strictEqual(r.aguardandoLiquidacao, 70);
    assert.strictEqual(r.titulos.find((t) => t.situacao === 'vencido').diasAtraso, 30);
  });

  /* ----------------------------- capital de giro ----------------------------- */
  teste('Ciclo de caixa: PME 30 + PMR 60 − PMP 25 = 65 dias', () => {
    perto(CG.pme(50000, 50000, 30), 30);
    perto(CG.pmr(200000, 100000, 30), 60);
    perto(CG.pmp(25000, 30000, 30), 25);
    const operacional = CG.cicloOperacional(30, 60);
    assert.strictEqual(operacional, 90);
    assert.strictEqual(CG.cicloCaixa(operacional, 25), 65);
    assert.strictEqual(CG.pmr(1000, 0, 30), null);
  });
  teste('NCG = (contas a receber + estoques) − (fornecedores + obrigações operacionais)', () => {
    assert.strictEqual(CG.ncg({ contasReceber: 100, estoques: 50, fornecedores: 40, obrigacoesOperacionais: 10 }), 100);
    assert.strictEqual(CG.ncg({ contasReceber: 10, estoques: 0, fornecedores: 40, obrigacoesOperacionais: 10 }), -40);
  });
  teste('Projeção de 13 semanas acusa semana negativa', () => {
    const p = CG.projecao13Semanas({
      hoje: '2026-10-01', saldoInicial: 100,
      entradas: [{ data: '2026-10-20', valor: 80 }],
      saidas: [{ data: '2026-10-09', valor: 150 }, { data: '2026-09-01', valor: 10 }]
    });
    assert.strictEqual(p.semanas.length, 13);
    assert.strictEqual(p.semanas[0].saldoFinal, 90);    // saída atrasada entra na semana 1
    assert.strictEqual(p.semanas[1].saldoFinal, -60);
    assert.deepStrictEqual(p.semanasNegativas, [2]);
    assert.strictEqual(p.menorSaldo, -60);
  });
  teste('Recebimentos de contratos usam o prazo médio real do órgão', () => {
    const lista = CG.recebimentosPrevistos({
      empenhos: [{ id: 'e', contratoId: 'c', liquidacao: { data: '2026-10-01', valor: 1000 }, pagamento: {}, entregas: [] }],
      contratosPorId: new Map([['c', { id: 'c', orgaoId: 'o' }]]),
      orgaosPorId: new Map([['o', { id: 'o', prazoPagamentoContratual: 30 }]]),
      prazosReais: new Map([['o', { desdeLiquidacao: 70, desdeEntrega: 80 }]]),
      hoje: '2026-10-02'
    });
    assert.strictEqual(lista[0].data, '2026-12-10');  // liquidação + 70 dias (e não + 30)
  });

  /* ------------------------------- financeiros ------------------------------- */
  teste('ROI: receita 10.000, despesas 9.500, investimento 4.000 → 5% × 2,5 = 12,5%', () => {
    const r = Fi.roi({ receita: 10000, lucroOperacional: 10000 - 9500, investimento: 4000 });
    perto(r.margem, 0.05);
    perto(r.giro, 2.5);
    perto(r.roi, 0.125);
    assert.strictEqual(Fi.roi({ receita: 0, lucroOperacional: 0, investimento: 0 }).roi, null);
  });
  const demEx = {
    receitaBruta: 1000, deducoes: 100, cpv: 530, custosVariaveis: 400, despesasVariaveis: 50, custosFixos: 150,
    despesasFixas: 100, depreciacao: 50, despesasFinanceiras: 20, receitasFinanceiras: 10, irCsll: 30,
    cifFixosEstoqueInicial: 10, cifFixosEstoqueFinal: 30
  };
  teste('DRE gerencial (custeio variável)', () => {
    const d = Fi.dreGerencial(demEx);
    assert.strictEqual(d.receitaLiquida, 900);
    assert.strictEqual(d.mc, 450);
    perto(d.mcPct, 0.5);
    assert.strictEqual(d.ebit, 150);
    assert.strictEqual(d.ebitda, 200);
    assert.strictEqual(d.lucroLiquido, 110);   // 150 + 10 − 20 − 30
    perto(d.margemLiquida, 110 / 900);
  });
  teste('DRE por absorção e linha de conciliação', () => {
    const a = Fi.dreAbsorcao(demEx);
    assert.strictEqual(a.lucroBruto, 370);
    perto(a.margemBrutaPct, 370 / 900);
    assert.strictEqual(a.ebit, 170);
    const c = Fi.conciliacao(demEx);
    assert.strictEqual(c.apurada, 20);
    assert.strictEqual(c.esperada, 20);
    assert.strictEqual(c.naoExplicada, 0);
  });
  teste('Liquidez, endividamento, dívida líquida e cobertura de juros', () => {
    const l = Fi.liquidez({ ac: 200, pc: 100, estoques: 50, disponivel: 20, rlp: 30, pnc: 50 });
    perto(l.corrente, 2);
    perto(l.seca, 1.5);
    perto(l.imediata, 0.2);
    perto(l.geral, 230 / 150);
    assert.strictEqual(Fi.liquidez({ ac: 200, pc: 0, estoques: 0, disponivel: 0, rlp: 0, pnc: 0 }).corrente, null);
    const e = Fi.endividamento({ pc: 100, pnc: 50, ativoTotal: 300 });
    perto(e.geral, 0.5);
    perto(e.composicao, 2 / 3);
    assert.strictEqual(Fi.dividaLiquida(100, 200, 350), -50);
    perto(Fi.coberturaJuros(150, 20), 7.5);
    assert.strictEqual(Fi.coberturaJuros(150, 0), null);
  });
  teste('Ponto de equilíbrio, margem de segurança e alavancagem operacional', () => {
    perto(Fi.pontoEquilibrioReceita(250, 0.5), 500);
    assert.strictEqual(Fi.pontoEquilibrioReceita(250, 0), null);
    assert.strictEqual(Fi.pontoEquilibrioReceita(250, -0.1), null);
    perto(Fi.pontoEquilibrioUnidades(1000, 2.5), 400);
    perto(Fi.mcPctPonderada([{ receita: 100, mc: 40 }, { receita: 300, mc: 60 }]), 0.25);
    perto(Fi.margemSeguranca(900, 500), 400 / 900);
    perto(Fi.gao(450, 150), 3);
    assert.strictEqual(Fi.gao(450, 0), null);
  });
  teste('NOPAT, custo de capital do período e EVA', () => {
    perto(Fi.nopat(150, 0.34), 99);
    perto(Fi.custoCapitalPeriodo(0.12, 30), Math.pow(1.12, 1 / 12) - 1);
    perto(Fi.eva(99, 1000, 0.01), 89);
    perto(Fi.eva(-50, 1000, 0.01), -60);
  });
  teste('Decomposição do ROI em efeito margem e efeito giro', () => {
    const d = Fi.decomporRoi({ margem: 0.05, giro: 2.5 }, { margem: 0.04, giro: 3 });
    perto(d.efeitoMargem, -0.025);
    perto(d.efeitoGiro, 0.02);
    perto(d.variacao, d.roiAtual - d.roiAnterior);
    assert.strictEqual(d.explicadoPor, 'margem');
    assert.strictEqual(Fi.decomporRoi(null, { margem: 0.1, giro: 1 }), null);
  });
  teste('Ponte de margem no caso VisionSteel', () => {
    const p = Fi.ponteMargem([{ produtoId: 'x', q: 10000, p: 100, c: 62, ve: 0 }], [{ produtoId: 'x', q: 9500, p: 90, c: 69, ve: 0 }]);
    perto(p.mcAnterior, 380000);
    perto(p.efeitoPreco, -95000);
    perto(p.efeitoVolume, -19000);
    perto(p.efeitoInsumos, -66500);
    perto(p.efeitoEficiencia, 0);
    perto(p.mcAtual, 199500);
    perto(p.residuo, 0);
    // Parte do aumento de custo vinda de ineficiência (R$ 2 de R$ 7) vai para Produção.
    const q = Fi.ponteMargem([{ produtoId: 'x', q: 10000, p: 100, c: 62, ve: 0 }], [{ produtoId: 'x', q: 9500, p: 90, c: 69, ve: 2 }]);
    perto(q.efeitoEficiencia, -19000);
    perto(q.efeitoInsumos, -47500);
  });

  /* -------------------------------- orçamento -------------------------------- */
  teste('Variação orçamentária favorável ou desfavorável conforme natureza', () => {
    const r = Or.variacao(110, 100, 'receita');
    assert.strictEqual(r.favoravel, true);
    perto(r.pct, 0.1);
    const c = Or.variacao(110, 100, 'custo');
    assert.strictEqual(c.favoravel, false);
    perto(c.desfavoravelPct, 0.1);
    assert.strictEqual(Or.variacao(5, 0, 'custo').pct, null);
  });
  teste('Orçamento flexível e forecast', () => {
    perto(Or.orcadoFlexivel(1000, 0.6, 1200, 1000), 1120); // 400 fixo + 600 × 1,2
    assert.strictEqual(Or.orcadoFlexivel(1000, 0.6, 1200, 0), null);
    assert.strictEqual(Or.forecastAnual(5000, 3000), 8000);
    perto(Or.forecastTendencia(5000, [100, 200, 300], 3), 5600);
    assert.strictEqual(Or.forecastTendencia(5000, [], 3), null);
  });

  /* ------------------------------ indicadores ------------------------------ */
  teste('Motor de status: dentro, atenção, fora e sem dados', () => {
    const maior = { meta: 0.30, toleranciaAtencao: 0.01, toleranciaFora: 0.03, sentido: 'maior-melhor' };
    assert.strictEqual(In.calcularStatus(0.30, maior).status, 'dentro');
    assert.strictEqual(In.calcularStatus(0.295, maior).status, 'dentro');
    assert.strictEqual(In.calcularStatus(0.28, maior).status, 'atencao');
    assert.strictEqual(In.calcularStatus(0.26, maior).status, 'fora');
    assert.strictEqual(In.calcularStatus(null, maior).status, 'sem-dados');
    const menor = { meta: 60, toleranciaAtencao: 5, toleranciaFora: 15, sentido: 'menor-melhor' };
    assert.strictEqual(In.calcularStatus(64, menor).status, 'dentro');
    assert.strictEqual(In.calcularStatus(70, menor).status, 'atencao');
    assert.strictEqual(In.calcularStatus(80, menor).status, 'fora');
    assert.strictEqual(In.calcularStatus(-10, menor).status, 'dentro');
  });
  teste('Todo indicador tem fórmula, fonte, sentido e função de cálculo; meta e responsável ficam para o usuário', () => {
    for (const ind of In.PADRAO) {
      assert.strictEqual(ind.meta, null, `${ind.id} não deveria vir com meta inventada`);
      assert.strictEqual(ind.responsavel, '', `${ind.id} não deveria vir com responsável inventado`);
      assert.ok(ind.formula && ind.fonte && ind.sentido && ind.unidade, `${ind.id} sem fórmula, fonte, sentido ou unidade`);
      assert.ok(typeof In.funcoes[ind.funcaoCalculo] === 'function', `${ind.id} sem função de cálculo`);
      assert.ok(['sim', 'parcial', 'nao'].includes(ind.controlavel), `${ind.id} sem "controlável"`);
    }
    assert.strictEqual(In.PERSPECTIVAS.length, 4);
  });

  /* --------------------------- esquema e regras de alerta --------------------------- */
  const HOJE = '2026-10-02';

  /**
   * Massa de teste: registros mínimos montados só para verificar as regras.
   * Existe apenas dentro dos testes; o sistema em si começa vazio.
   * Cada registro foi escolhido para disparar uma regra de alerta específica.
   */
  function massaTeste() {
    const r = (id, o) => Object.assign({ id, criadoEm: '2026-10-01T00:00:00.000Z', atualizadoEm: '2026-10-01T00:00:00.000Z' }, o);
    const d = NS.core.store.estadoVazio();
    d.empresa = Object.assign(d.empresa, { competenciaAtual: '2026-09', diasPeriodo: 30, saldoInicialCaixa: 0, dataSaldoInicial: '2026-01-01' });
    // Metas definidas apenas para o teste (no sistema, ficam em branco até o usuário preencher).
    const metas = { mc_pct: [0.30, 0.01, 0.03], indice_perdas: [0.03, 0.003, 0.01] };
    for (const ind of d.indicadores) if (metas[ind.id]) [ind.meta, ind.toleranciaAtencao, ind.toleranciaFora] = metas[ind.id];
    d.centros = [r('X1', { nome: 'Centro de teste', tipo: 'custo', responsavel: 'Responsável de teste' })];
    d.insumos = [r('I1', { nome: 'Insumo de teste', unidade: 'kg', precoPadrao: 10, validadeDias: 30, estoqueMinimo: 100 })];
    d.produtos = [r('P1', { nome: 'Produto de teste', unidade: 'un', pesoKg: 1, validadeDias: 60, fichaTecnica: [{ insumoId: 'I1', qtdPadrao: 1 }], rendimentoPadrao: 0.9, modPadrao: 1, cifPadrao: 1 })];
    // Lote com consumo acima do padrão (rendimento 76,9%) e perdas de 6,4% do consumo.
    d.lotes = [r('L1', { produtoId: 'P1', lote: 'T-1', data: '2026-09-10', qtdPlanejada: 100, qtdProduzida: 100, horasProducao: 10,
      consumo: [{ insumoId: 'I1', qtd: 130, precoReal: 12 }], modReal: 100, perdas: [{ motivo: 'processo', qtd: 5, valor: 100 }], horasParadas: 0 })];
    d.movimentosEstoque = [
      r('M1', { data: '2026-09-01', itemTipo: 'insumo', itemId: 'I1', tipo: 'entrada', qtd: 50, valor: 500, lote: 'NF-A', validade: '2026-10-06', documento: 'NF-A', motivo: '' }),
      r('M2', { data: '2026-09-10', itemTipo: 'produto', itemId: 'P1', tipo: 'entrada', qtd: 30, valor: 528, lote: 'T-1', validade: '2026-10-12', documento: 'Produção', motivo: '' })
    ];
    d.orgaos = [r('O1', { nome: 'Órgão de teste', esfera: 'municipal', uf: 'MG', prazoPagamentoContratual: 30 })];
    d.contratos = [
      r('C1', { numero: 'T-001', tipo: 'contrato', orgaoId: 'O1', processo: '', modalidade: '', assinatura: '2025-10-10', vigenciaInicio: '2025-10-15', vigenciaFim: '2026-10-22',
        dataBaseProposta: '2025-10-07', indiceReajuste: 'IPCA', garantia: { valor: 1000, vencimento: '2026-10-12' },
        itens: [{ produtoId: 'P1', qtdRegistrada: 1000, precoContratado: 15, custoProposta: 13 }], penalidades: [] }),
      r('C2', { numero: 'T-ATA', tipo: 'ata', orgaoId: 'O1', processo: '', modalidade: '', assinatura: '2025-12-20', vigenciaInicio: '2026-01-01', vigenciaFim: '2027-06-30',
        dataBaseProposta: '2025-12-01', indiceReajuste: '', garantia: { valor: null, vencimento: null },
        itens: [{ produtoId: 'P1', qtdRegistrada: 100, precoContratado: 15, custoProposta: 14.5 }], penalidades: [] })
    ];
    d.empenhos = [
      r('E1', { contratoId: 'C1', numero: 'NE-1', data: '2026-07-01', itens: [{ produtoId: 'P1', qtd: 50 }],
        entregas: [{ produtoId: 'P1', prevista: '2026-07-10', real: '2026-07-09', nf: 'NF 1', qtd: 50, valor: 750, frete: 10 }],
        liquidacao: { data: '2026-07-20', valor: 750, glosa: 0 }, pagamento: {} }),
      r('E2', { contratoId: 'C1', numero: 'NE-2', data: '2026-09-20', itens: [{ produtoId: 'P1', qtd: 20 }],
        entregas: [{ produtoId: 'P1', prevista: '2026-09-27', real: null, nf: '', qtd: 20, valor: 300, frete: 0 }], liquidacao: {}, pagamento: {} }),
      r('E3', { contratoId: 'C2', numero: 'NE-3', data: '2026-09-05', itens: [{ produtoId: 'P1', qtd: 90 }],
        entregas: [{ produtoId: 'P1', prevista: '2026-09-15', real: '2026-09-14', nf: 'NF 2', qtd: 90, valor: 1350, frete: 20 }],
        liquidacao: { data: '2026-09-20', valor: 1350, glosa: 0 }, pagamento: { data: '2026-09-28', valor: 1350 } })
    ];
    d.documentos = [r('D1', { nome: 'Certidão de teste', vencimento: '2026-10-01', observacao: '' })];
    d.orcamento = [r('B1', { competencia: '2026-09', centroId: 'X1', conta: 'Manutenção', natureza: 'custo', valor: 1000, parteVariavel: 0 })];
    d.lancamentos = [
      r('N1', { data: '2026-09-15', competencia: '2026-09', tipo: 'saida', categoria: 'Manutenção', centroId: 'X1', contratoId: '', valor: 1500, situacao: 'realizado', descricao: '', origemId: '' }),
      r('N2', { data: '2026-10-12', competencia: '2026-10', tipo: 'saida', categoria: 'Fornecedores', centroId: 'X1', contratoId: '', valor: 5000, situacao: 'previsto', descricao: '', origemId: '' })
    ];
    d.demonstracoes = [r('DM1', {
      competencia: '2026-09', receitaBruta: 1000, deducoes: 0, cpv: 950, custosVariaveis: 850, despesasVariaveis: 50, custosFixos: 100,
      despesasFixas: 50, depreciacao: 10, despesasFinanceiras: 5, receitasFinanceiras: 0, irCsll: 0,
      disponivel: 100, contasReceber: 200, estoques: 300, outrosAC: 0, rlp: 0, imobilizado: 400, intangivel: 0,
      fornecedores: 100, emprestimosCP: 50, obrigacoesOperacionais: 50, outrosPC: 0, emprestimosLP: 100, outrosPNC: 0, pl: 700,
      compras: 500, cifFixosEstoqueInicial: 0, cifFixosEstoqueFinal: 0
    })];
    d.planosAcao = [
      r('PA1', { origem: 'manual', referenciaId: '', desvio: 'Desvio de teste', causa: '', acao: 'Ação vencida de teste', responsavel: 'Responsável de teste', prazo: '2026-09-29', status: 'aberto', efeito: '', dataConclusao: null }),
      r('PA2', { origem: 'alerta', referenciaId: 'recebivel:O1', desvio: 'Recebível de teste', causa: '', acao: 'Cobrar o órgão', responsavel: 'Responsável de teste', prazo: '2026-10-20', status: 'andamento', efeito: '', dataConclusao: null })
    ];
    d.excecoes = [r('EX1', { alertaChave: 'documento:D1', titulo: 'Documento', justificativa: 'Teste de exceção', autor: 'Teste', data: '2026-10-01', validoAte: '2026-12-31' })];
    return d;
  }

  const massa = massaTeste();
  const ctx = NS.calc.contexto.criar(massa, HOJE);
  const alertasTeste = ctx.alertas();
  const alertaDo = (tipo) => alertasTeste.find((a) => a.tipo === tipo);

  teste('Esquema rejeita registro inválido com mensagem por campo', () => {
    const erros = NS.core.schema.validarRegistro('insumos', { nome: '', unidade: 'kg', precoPadrao: -1 });
    assert.ok(erros.some((e) => e.campo === 'nome'));
    assert.ok(erros.some((e) => e.campo === 'precoPadrao'));
  });
  teste('Backup: estado válido passa; arquivo sem versão ou com referência quebrada é rejeitado', () => {
    const v = NS.core.schema.validarBackup(massa);
    assert.ok(v.ok, v.erros.join(' | '));
    assert.ok(NS.core.schema.validarBackup(NS.core.store.estadoVazio()).ok, 'O modelo em branco deve ser um backup válido');
    assert.strictEqual(NS.core.schema.validarBackup({}).ok, false);
    const quebrado = JSON.parse(JSON.stringify(massa));
    quebrado.contratos[0].orgaoId = 'nao-existe';
    assert.strictEqual(NS.core.schema.validarBackup(quebrado).ok, false);
  });
  teste('Exportar e reimportar (JSON) preserva exatamente os dados', () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(massa)), massa);
  });
  teste('Modelo em branco: indicadores "sem meta" e nenhum desvio inventado', () => {
    const vazio = NS.core.store.estadoVazio();
    assert.ok(vazio.indicadores.length === In.PADRAO.length && vazio.indicadores.every((i) => i.meta === null && i.responsavel === ''));
    assert.ok(!vazio.empresa.nome && vazio.empresa.aliquotaEfetiva === null && vazio.empresa.custoCapitalAA === null);
    const cv = NS.calc.contexto.criar(vazio, HOJE);
    assert.ok(cv.avaliacoes(vazio.empresa.competenciaAtual).every((a) => a.status === 'sem-meta' && (a.valor === null || Number.isFinite(a.valor))));
    assert.deepStrictEqual(cv.alertas(), []);
    assert.ok(!temInvalido(cv.projecaoCaixa()));
    assert.strictEqual(In.calcularStatus(0.5, { meta: null }).status, 'sem-meta');
  });
  teste('Sem alíquota informada, NOPAT e EVA ficam sem dados (nada é presumido)', () => {
    assert.strictEqual(Fi.nopat(100, null), null);
    assert.strictEqual(ctx.apuracao('2026-09').eva, null);
  });
  teste('Cada regra de alerta dispara com a massa de teste', () => {
    const tipos = new Set(alertasTeste.map((a) => a.tipo));
    const faltando = Object.keys(Al.TIPOS).filter((t) => !tipos.has(t));
    assert.deepStrictEqual(faltando, []);
  });
  teste('Gravidades das regras conforme os limites da seção 6', () => {
    assert.strictEqual(alertaDo('vigencia').gravidade, 'critico');          // 20 dias ≤ 30
    assert.strictEqual(alertaDo('documento').gravidade, 'critico');         // vencido
    assert.strictEqual(alertaDo('recebivel-vencido').gravidade, 'critico'); // 44 dias de atraso
    assert.strictEqual(alertaDo('orcamento').gravidade, 'critico');         // +50% > 2 × 10%
    assert.strictEqual(alertaDo('rendimento').gravidade, 'critico');        // 13 p.p. abaixo
    assert.strictEqual(alertaDo('garantia').gravidade, 'atencao');          // vence em 10 dias
    assert.ok(alertaDo('aniversario').mensagem.includes('em 5 dias'));      // data-base + 12 meses
  });
  teste('Cada alerta tem gravidade, mensagem, evidência, responsável e chave única', () => {
    const chaves = new Set();
    for (const a of alertasTeste) {
      assert.ok(['critico', 'atencao'].includes(a.gravidade), a.chave);
      assert.ok(a.mensagem && a.titulo && a.responsavel, a.chave);
      assert.ok(!chaves.has(a.chave), `Chave repetida: ${a.chave}`);
      chaves.add(a.chave);
    }
  });
  teste('Alerta de reequilíbrio traz o aviso jurídico e separa a ineficiência interna', () => {
    const def = alertasTeste.filter((a) => a.tipo === 'defasagem');
    assert.ok(def.length > 0 && def.every((a) => a.aviso && a.aviso.includes('14.133/2021')));
    const item = ctx.contratoAnalisado('C1', HOJE).itens[0];
    perto(item.custoAtual, 17.6);                                    // (1.560 + 100 + 100) ÷ 100
    perto(item.defasagem, (17.6 - 13) / 13);
    perto(item.ineficienciaUnit, ((130 - 100 / 0.9) * 10) / 100);   // excesso de consumo × preço padrão ÷ unidades
    perto(item.defasagemSemIneficiencia, (17.6 - item.ineficienciaUnit - 13) / 13);
  });
  teste('Exceção com justificativa e plano vinculado aparecem no alerta', () => {
    assert.strictEqual(alertaDo('documento').dispensado, true);
    assert.strictEqual(alertaDo('recebivel-vencido').plano.id, 'PA2');
    assert.strictEqual(alertasTeste[alertasTeste.length - 1].dispensado, true); // dispensados vão para o fim
  });
  teste('Aniversário da data-base: 12 meses, com aviso de 30 dias', () => {
    const r = Al.aniversarioRelevante('2025-08-07', HOJE, 30, 60);
    assert.strictEqual(r.data, '2026-08-07');
    assert.strictEqual(r.dias, -56);
    assert.strictEqual(Al.aniversarioRelevante('2025-12-31', HOJE, 30, 60), null);
  });
  teste('Nenhum indicador ou análise produz NaN ou Infinity', () => {
    for (const comp of ctx.competencias) {
      for (const av of ctx.avaliacoes(comp)) {
        assert.ok(av.valor === null || Number.isFinite(av.valor), `${av.indicador.id} em ${comp}: ${av.valor}`);
        assert.ok(!av.erro, `${av.indicador.id}: ${av.erro}`);
      }
      assert.ok(!temInvalido(ctx.apuracao(comp)), `Apuração de ${comp} com valor inválido`);
    }
    assert.ok(!temInvalido(ctx.contratosAnalisados(HOJE).map((a) => Object.assign({}, a, { contrato: null, empenhos: null }))), 'Análise de contratos com valor inválido');
    assert.ok(!temInvalido(ctx.projecaoCaixa()), 'Projeção de caixa com valor inválido');
    assert.ok(!temInvalido(ctx.ponteMargem(ctx.competencia)), 'Ponte de margem com valor inválido');
  });
  teste('Conciliação absorção × variável e balanço fecham na demonstração de teste', () => {
    for (const dm of massa.demonstracoes) {
      perto(Fi.conciliacao(dm).naoExplicada, 0, 0.01, dm.competencia);
      perto(Fi.balanco(dm).diferenca, 0, 0.01, dm.competencia);
    }
  });
  teste('Orçamento: realizado pelo regime de competência', () => {
    const o = Or.apurar(ctx, '2026-09');
    const l = o.linhas.find((x) => x.conta === 'Manutenção');
    assert.strictEqual(l.realizado, 1500);
    perto(l.pct, 0.5);
    assert.strictEqual(l.favoravel, false);
  });

  /* --------------------------------- execução --------------------------------- */
  function executar() {
    return testes.map((t) => {
      try {
        t.fn();
        return { nome: t.nome, ok: true };
      } catch (erro) {
        return { nome: t.nome, ok: false, erro: erro.message };
      }
    });
  }

  const resultados = executar();
  const falhas = resultados.filter((r) => !r.ok);
  if (emNode) {
    for (const r of resultados) console.log(`${r.ok ? '✓' : '✗'} ${r.nome}${r.ok ? '' : `\n    ${r.erro}`}`);
    console.log(`\n${resultados.length - falhas.length} de ${resultados.length} testes passaram.`);
    process.exitCode = falhas.length ? 1 : 0;
  } else {
    window.resultadosTestes = resultados;
  }
})();
