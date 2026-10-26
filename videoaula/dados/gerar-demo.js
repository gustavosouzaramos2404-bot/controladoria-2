/* ==========================================================================
   videoaula/dados/gerar-demo.js
   Gera dados/demo.json: um backup no formato do Controladoria com dados
   100% FICTÍCIOS (empresa, órgãos, pessoas e números inventados), usado só
   para gravar a videoaula. O sistema em si continua começando vazio.
   - determinístico (gerador pseudoaleatório com semente fixa);
   - validado com o próprio esquema do sistema (schema.validarBackup);
   - "hoje" fixo em 26/10/2026 (o mesmo relógio usado na gravação).
   Uso: node dados/gerar-demo.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const HOJE = '2026-10-26';
const AGORA = '2026-10-26T09:00:00.000Z';

// Carrega os módulos puros do sistema na ordem do index.html (como nos testes).
const raizJs = path.join(__dirname, '..', '..', 'js');
[
  'core/namespace.js', 'core/events.js', 'core/format.js', 'core/validate.js', 'core/schema.js',
  'calc/base.js', 'calc/custos.js', 'calc/estoque.js', 'calc/contratos.js', 'calc/capitalGiro.js',
  'calc/financeiros.js', 'calc/orcamento.js', 'calc/contexto.js', 'calc/indicadores.js', 'calc/alertas.js',
  'core/store.js'
].forEach((f) => require(path.join(raizJs, f)));
const NS = globalThis.Controladoria;
NS.core.hoje = () => HOJE;
NS.core.agora = () => AGORA;

/* ------------------------------ utilitários ------------------------------ */
let semente = 20261026;
function aleatorio() { // mulberry32
  semente = (semente + 0x6D2B79F5) | 0;
  let t = semente;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const variar = (v, pct) => v * (1 + (aleatorio() * 2 - 1) * pct);
const r2 = (v) => Math.round(v * 100) / 100;
const r0 = (v) => Math.round(v);
const pad = (n) => String(n).padStart(2, '0');
const dia = (comp, d) => `${comp}-${pad(d)}`;
function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function somarMes(comp, n) {
  const [a, m] = comp.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
const competencias = (de, ate) => { const l = []; for (let c = de; c <= ate; c = somarMes(c, 1)) l.push(c); return l; };
let seq = 0;
const reg = (prefixo, o) => Object.assign({ id: `${prefixo}-${pad(++seq)}`, criadoEm: AGORA, atualizadoEm: AGORA }, o);
const fixo = (id, o) => Object.assign({ id, criadoEm: AGORA, atualizadoEm: AGORA }, o);

/* ------------------------------ estado base ------------------------------ */
const d = NS.core.store.estadoVazio();
d.meta.criadoEm = AGORA;
d.meta.atualizadoEm = AGORA;
d.empresa = Object.assign(d.empresa, {
  nome: 'Serra Verde Alimentos (empresa fictícia)',
  competenciaAtual: '2026-09',
  aliquotaEfetiva: 0.24,
  custoCapitalAA: 0.14,
  diasPeriodo: 30,
  numeroFuncionarios: 62,
  saldoInicialCaixa: 2400000,
  dataSaldoInicial: '2025-09-30'
});
d.configuracoes.usuario = 'Instrutor (demonstração)';
d.configuracoes.criterioRateioCIF = 'horas';

// Metas e tolerâncias (valores de exemplo para a aula).
const METAS = {
  mc_pct: [0.30, 0.02, 0.05, 'Rafael Duarte'],
  margem_ebitda: [0.09, 0.015, 0.03, 'Lúcia Prado'],
  roi: [0.12, 0.02, 0.05, 'Lúcia Prado'],
  ciclo_caixa: [45, 5, 15, 'Lúcia Prado'],
  dl_ebitda: [2.5, 0.5, 1.5, 'Lúcia Prado'],
  eva: [0, 10000, 30000, 'Lúcia Prado'],
  entregas_prazo: [0.95, 0.03, 0.08, 'Tiago Moura'],
  glosas_pct: [0.01, 0.005, 0.015, 'Rafael Duarte'],
  prazo_recebimento: [30, 5, 15, 'Rafael Duarte'],
  margem_contratos: [0.22, 0.03, 0.07, 'Rafael Duarte'],
  concentracao: [0.40, 0.05, 0.15, 'Rafael Duarte'],
  variacao_custo: [0.03, 0.02, 0.05, 'Marina Alves'],
  rendimento: [0.95, 0.01, 0.03, 'Marina Alves'],
  indice_perdas: [0.02, 0.005, 0.015, 'Marina Alves'],
  giro_estoque: [10, 2, 4, 'Marina Alves'],
  contratos_defasagem: [0, 1, 2, 'Rafael Duarte'],
  planos_prazo: [0.90, 0.1, 0.25, 'Lúcia Prado'],
  controles_testados: [1, 0.1, 0.3, 'Lúcia Prado'],
  documentos_dia: [1, 0.01, 0.1, 'Rafael Duarte'],
  producao_funcionario: [900, 100, 250, 'Marina Alves']
};
for (const ind of d.indicadores) {
  const m = METAS[ind.id];
  if (m) [ind.meta, ind.toleranciaAtencao, ind.toleranciaFora, ind.responsavel] = m;
  ind.periodicidade = 'mensal';
}

/* ------------------------------- cadastros ------------------------------- */
d.centros = [
  fixo('cen-prod', { nome: 'Produção', tipo: 'custo', responsavel: 'Marina Alves' }),
  fixo('cen-com', { nome: 'Comercial B2G', tipo: 'receita', responsavel: 'Rafael Duarte' }),
  fixo('cen-adm', { nome: 'Administrativo e financeiro', tipo: 'custo', responsavel: 'Lúcia Prado' }),
  fixo('cen-log', { nome: 'Logística', tipo: 'custo', responsavel: 'Tiago Moura' })
];
const INS = {
  far: { nome: 'Farinha de trigo', unidade: 'kg', precoPadrao: 3.2, validadeDias: 120, estoqueMinimo: 9000 },
  acu: { nome: 'Açúcar cristal', unidade: 'kg', precoPadrao: 3.8, validadeDias: 180, estoqueMinimo: 8000 },
  lei: { nome: 'Leite em pó integral', unidade: 'kg', precoPadrao: 24, validadeDias: 365, estoqueMinimo: 2500 },
  cac: { nome: 'Cacau em pó', unidade: 'kg', precoPadrao: 36, validadeDias: 365, estoqueMinimo: 900 },
  ave: { nome: 'Aveia em flocos', unidade: 'kg', precoPadrao: 9.5, validadeDias: 180, estoqueMinimo: 3000 },
  gor: { nome: 'Gordura vegetal', unidade: 'kg', precoPadrao: 11, validadeDias: 180, estoqueMinimo: 2000 },
  emb: { nome: 'Embalagem primária', unidade: 'un', precoPadrao: 0.35, validadeDias: 730, estoqueMinimo: 60000 }
};
d.insumos = Object.entries(INS).map(([k, v]) => fixo(`ins-${k}`, v));

const PROD = {
  bis: { nome: 'Biscoito integral 400 g', unidade: 'pct', pesoKg: 0.4, validadeDias: 180, rendimentoPadrao: 0.95, modPadrao: 0.45, cifPadrao: 0.75,
    ficha: { far: 0.22, acu: 0.06, gor: 0.05, ave: 0.04, emb: 1 }, lotes: 2, qtdLote: 38000, horasLote: 60, preco: 4.6 },
  ach: { nome: 'Achocolatado em pó 1 kg', unidade: 'un', pesoKg: 1, validadeDias: 365, rendimentoPadrao: 0.97, modPadrao: 0.6, cifPadrao: 1.2,
    ficha: { acu: 0.55, cac: 0.12, lei: 0.3, emb: 1 }, lotes: 2, qtdLote: 5600, horasLote: 40, preco: 23.5 },
  min: { nome: 'Mistura para mingau 500 g', unidade: 'pct', pesoKg: 0.5, validadeDias: 240, rendimentoPadrao: 0.96, modPadrao: 0.35, cifPadrao: 0.7,
    ficha: { ave: 0.2, lei: 0.15, acu: 0.12, emb: 1 }, lotes: 2, qtdLote: 10500, horasLote: 30, preco: 10.9 }
};
d.produtos = Object.entries(PROD).map(([k, p]) => fixo(`prd-${k}`, {
  nome: p.nome, unidade: p.unidade, pesoKg: p.pesoKg, validadeDias: p.validadeDias,
  fichaTecnica: Object.entries(p.ficha).map(([i, q]) => ({ insumoId: `ins-${i}`, qtdPadrao: q })),
  rendimentoPadrao: p.rendimentoPadrao, modPadrao: p.modPadrao, cifPadrao: p.cifPadrao
}));
// Custo padrão unitário (mesma regra do sistema: materiais ÷ rendimento + MOD + CIF).
function custoPadrao(k) {
  const p = PROD[k];
  const mat = Object.entries(p.ficha).reduce((s, [i, q]) => s + q * INS[i].precoPadrao, 0);
  return mat / p.rendimentoPadrao + p.modPadrao + p.cifPadrao;
}

d.orgaos = [
  fixo('org-va', { nome: 'Prefeitura de Vila Aurora', esfera: 'municipal', uf: 'MG', prazoPagamentoContratual: 30 }),
  fixo('org-se', { nome: 'Secretaria Estadual de Educação', esfera: 'estadual', uf: 'GO', prazoPagamentoContratual: 30 }),
  fixo('org-if', { nome: 'Instituto Federal Campus Serra Alta', esfera: 'federal', uf: 'GO', prazoPagamentoContratual: 30 }),
  fixo('org-br', { nome: 'Prefeitura de Bom Retiro do Norte', esfera: 'municipal', uf: 'GO', prazoPagamentoContratual: 30 })
];

d.documentos = [
  fixo('doc-1', { nome: 'Certidão negativa de débitos federais', vencimento: '2027-02-14', observacao: '' }),
  fixo('doc-2', { nome: 'Certidão negativa de débitos estaduais', vencimento: '2026-11-04', observacao: 'Renovação solicitada.' }),
  fixo('doc-3', { nome: 'Certificado de regularidade do FGTS', vencimento: '2026-12-08', observacao: '' }),
  fixo('doc-4', { nome: 'Certidão negativa de débitos trabalhistas', vencimento: '2027-03-30', observacao: '' }),
  fixo('doc-5', { nome: 'Alvará sanitário', vencimento: '2027-06-30', observacao: '' })
];
d.alcadas = [
  fixo('alc-1', { operacao: 'Ajuste de estoque', limite: 5000, aprovador: 'Lúcia Prado' }),
  fixo('alc-2', { operacao: 'Compra de insumos', limite: 150000, aprovador: 'Diretoria' }),
  fixo('alc-3', { operacao: 'Desconto ou concessão em contrato', limite: 10000, aprovador: 'Diretoria' })
];

/* ------------------------------- contratos ------------------------------- */
const CONTRATOS = {
  'con-se': { numero: '012/2025', tipo: 'ata', orgaoId: 'org-se', processo: 'PE 77/2025', modalidade: 'Pregão eletrônico (SRP)',
    assinatura: '2025-09-25', vigenciaInicio: '2025-10-01', vigenciaFim: '2026-12-15', dataBaseProposta: '2025-09-20', indiceReajuste: 'IPCA',
    garantia: { valor: null, vencimento: null },
    itens: { ach: [82000, 24.5, 16.2], min: [130000, 12.2, 7.65] }, mensal: { ach: 6000, min: 9000 }, desde: '2025-10', prazoReal: 41 },
  'con-va': { numero: '045/2025', tipo: 'contrato', orgaoId: 'org-va', processo: 'PE 12/2025', modalidade: 'Pregão eletrônico',
    assinatura: '2025-07-25', vigenciaInicio: '2025-08-01', vigenciaFim: '2027-07-31', dataBaseProposta: '2025-07-01', indiceReajuste: 'IPCA',
    garantia: { valor: 45000, vencimento: '2026-11-12' },
    itens: { bis: [1000000, 5.2, 3.55] }, mensal: { bis: 60000 }, desde: '2025-10', prazoReal: 25 },
  'con-if': { numero: '019/2025', tipo: 'contrato', orgaoId: 'org-if', processo: 'PE 41/2025', modalidade: 'Pregão eletrônico',
    assinatura: '2025-09-22', vigenciaInicio: '2025-10-01', vigenciaFim: '2027-04-30', dataBaseProposta: '2025-08-01', indiceReajuste: 'IPCA',
    garantia: { valor: 30000, vencimento: '2027-03-31' },
    itens: { min: [180000, 12.6, 7.85], bis: [400000, 5.3, 3.55] }, mensal: { min: 10000, bis: 24000 }, desde: '2025-10', prazoReal: 24 },
  'con-br': { numero: '003/2025', tipo: 'ata', orgaoId: 'org-br', processo: 'PE 58/2025', modalidade: 'Pregão eletrônico (SRP)',
    assinatura: '2025-09-20', vigenciaInicio: '2025-10-01', vigenciaFim: '2027-01-31', dataBaseProposta: '2025-08-10', indiceReajuste: 'IPCA',
    garantia: { valor: null, vencimento: null },
    itens: { bis: [160000, 5.25, 3.55], ach: [45000, 27.9, 17.0] }, mensal: { bis: 5000, ach: 2800 }, desde: '2025-10', prazoReal: 58 }
};
d.contratos = Object.entries(CONTRATOS).map(([id, c]) => fixo(id, {
  numero: c.numero, tipo: c.tipo, orgaoId: c.orgaoId, processo: c.processo, modalidade: c.modalidade, assinatura: c.assinatura,
  vigenciaInicio: c.vigenciaInicio, vigenciaFim: c.vigenciaFim, dataBaseProposta: c.dataBaseProposta, indiceReajuste: c.indiceReajuste,
  garantia: c.garantia,
  itens: Object.entries(c.itens).map(([p, [q, preco, custo]]) => ({ produtoId: `prd-${p}`, qtdRegistrada: q, precoContratado: preco, custoProposta: custo })),
  penalidades: id === 'con-br' ? [{ data: '2026-07-18', motivo: 'Multa por atraso na entrega de junho', valor: 2400 }] : []
}));

const MESES = competencias('2025-10', '2026-10');
d.empenhos = [];
d.lancamentos = [];
let nNota = 4100;
for (const [cid, c] of Object.entries(CONTRATOS)) {
  let nEmp = 1;
  for (const comp of MESES) {
    if (comp < c.desde) continue;
    if (c.bimestral && (MESES.indexOf(comp) % 2 === 0)) continue;
    const dataEmp = dia(comp, 4);
    const itens = [];
    const entregas = [];
    let total = 0;
    for (const [p, qMes] of Object.entries(c.mensal)) {
      const qtd = r0(qMes * (c.bimestral ? 2 : 1) * variar(1, 0.06) / 100) * 100;
      const preco = c.itens[p][1];
      itens.push({ produtoId: `prd-${p}`, qtd });
      const prevista = dia(comp, 14);
      let real = somarDias(prevista, Math.floor(aleatorio() * 4) - 3);
      // Algumas entregas atrasadas (indicador "Entregas no prazo") e uma pendente agora.
      if (aleatorio() < 0.1) real = somarDias(prevista, 3 + Math.floor(aleatorio() * 4));
      if (cid === 'con-if' && comp === '2026-10' && p === 'min') real = null;
      const valor = r2(qtd * preco);
      entregas.push({ produtoId: `prd-${p}`, prevista: cid === 'con-if' && comp === '2026-10' ? dia(comp, 20) : prevista,
        real, nf: real ? `NF ${++nNota}` : '', qtd, valor, frete: r2(valor * 0.012) });
      total += valor;
    }
    const emp = { contratoId: cid, numero: `${comp.slice(0, 4)}NE${pad(nEmp++)}${cid.slice(-2).toUpperCase()}`, data: dataEmp, itens, entregas, liquidacao: {}, pagamento: {} };
    const todasEntregues = entregas.every((e) => e.real);
    if (todasEntregues && comp <= '2026-09') {
      let glosa = 0;
      if (cid === 'con-if' && comp === '2026-07') glosa = r2(total * 0.018);
      if (cid === 'con-se' && comp === '2026-03') glosa = 1850;
      const liq = dia(comp, 24);
      emp.liquidacao = { data: liq, valor: r2(total - glosa), glosa };
      const dataPag = somarDias(liq, r0(variar(c.prazoReal, 0.12)));
      const naoPago = cid === 'con-br' && comp >= '2026-08';
      if (dataPag <= HOJE && !naoPago) {
        emp.pagamento = { data: dataPag, valor: emp.liquidacao.valor };
      }
    }
    const e = reg('emp', emp);
    d.empenhos.push(e);
    if (e.pagamento.data) {
      d.lancamentos.push(reg('lan', { data: e.pagamento.data, competencia: e.pagamento.data.slice(0, 7), tipo: 'entrada', categoria: 'Recebimento de contratos',
        centroId: 'cen-com', contratoId: cid, valor: e.pagamento.valor, situacao: 'realizado',
        descricao: `Pagamento do empenho ${e.numero}`, origemId: e.id }));
    }
  }
}

/* --------------------------- produção e estoque --------------------------- */
// Preço real dos insumos: leite em pó sobe ao longo do ano (gera a defasagem do achocolatado).
function precoReal(i, comp) {
  const k = MESES.indexOf(comp);
  if (i === 'lei') return r2(24 * (1 + 0.022 * k));
  if (i === 'cac') return r2(36 * (1 + 0.01 * k));
  return r2(variar(INS[i].precoPadrao * 1.02, 0.02));
}
d.lotes = [];
d.movimentosEstoque = [];
const mov = (o) => d.movimentosEstoque.push(reg('mov', Object.assign({ valor: null, lote: '', validade: null, documento: '', motivo: '' }, o)));
const consumoMes = {};
// Estoque inicial de insumos (saldo de abertura em 30/09/2025).
for (const [i, v] of Object.entries(INS)) {
  mov({ data: '2025-09-30', itemTipo: 'insumo', itemId: `ins-${i}`, tipo: 'entrada', qtd: v.estoqueMinimo * 1.6, valor: r2(v.estoqueMinimo * 1.6 * v.precoPadrao),
    lote: `SI-${i.toUpperCase()}`, validade: somarDias('2025-09-30', v.validadeDias), documento: 'Saldo inicial' });
}
// Produção do mês acompanha a demanda dos empenhos (mais 2% de folga).
const demanda = {};
for (const e of d.empenhos) for (const en of e.entregas) {
  const c = en.prevista.slice(0, 7);
  demanda[c] = demanda[c] || {};
  demanda[c][en.produtoId.slice(4)] = (demanda[c][en.produtoId.slice(4)] || 0) + en.qtd;
}
// Estoque inicial de produtos acabados.
for (const [k, p] of Object.entries(PROD)) {
  mov({ data: '2025-09-30', itemTipo: 'produto', itemId: `prd-${k}`, tipo: 'entrada', qtd: 3000, valor: r2(3000 * custoPadrao(k)),
    lote: `SI-${k.toUpperCase()}`, validade: somarDias('2025-09-30', p.validadeDias), documento: 'Saldo inicial' });
}
let nLote = 0;
for (const comp of MESES) {
  consumoMes[comp] = {};
  for (const [k, p] of Object.entries(PROD)) {
    for (let j = 0; j < p.lotes; j++) {
      const dataLote = dia(comp, j === 0 ? 2 : 8);
      if (dataLote > HOJE) continue;
      const planejada = r0(((demanda[comp] || {})[k] || 0) * 1.01 / p.lotes / 100) * 100;
      if (!planejada) continue;
      const produzida = r0(variar(planejada, 0.03));
      // Rendimento real: em setembro, um lote de mingau rendeu bem abaixo do padrão.
      let rend = variar(p.rendimentoPadrao - 0.005, 0.008);
      if (k === 'min' && comp === '2026-09' && j === 1) rend = 0.885;
      const consumo = Object.entries(p.ficha).map(([i, q]) => {
        const qtd = i === 'emb' ? r0(produzida * 1.01) : r2(q * produzida / rend);
        consumoMes[comp][i] = (consumoMes[comp][i] || 0) + qtd;
        return { insumoId: `ins-${i}`, qtd, precoReal: precoReal(i, comp) };
      });
      const custoMat = consumo.reduce((s, c) => s + c.qtd * c.precoReal, 0);
      const perdaProc = r2(custoMat * (1 - rend) * 0.6);
      const perdas = [{ motivo: 'processo', qtd: r2((1 - rend) * produzida * 0.6), valor: perdaProc }];
      if (aleatorio() < 0.2) perdas.push({ motivo: 'qualidade', qtd: 80, valor: r2(80 * custoPadrao(k)) });
      const codigo = `${k.toUpperCase()}-${comp.slice(2, 4)}${comp.slice(5)}-${j + 1}`;
      d.lotes.push(reg('lot', {
        produtoId: `prd-${k}`, lote: codigo, data: dataLote, qtdPlanejada: planejada, qtdProduzida: produzida,
        horasProducao: r2(variar(p.horasLote, 0.05)), consumo, modReal: r2(produzida * p.modPadrao * variar(1.02, 0.04)),
        perdas, horasParadas: r2(aleatorio() < 0.3 ? variar(4, 0.5) : 0)
      }));
      nLote++;
      // Baixa dos insumos (FEFO simplificado) e entrada do produto acabado.
      for (const c of consumo) {
        mov({ data: dataLote, itemTipo: 'insumo', itemId: c.insumoId, tipo: 'saida', qtd: c.qtd, valor: r2(c.qtd * c.precoReal), documento: `Lote ${codigo}` });
      }
      mov({ data: dataLote, itemTipo: 'produto', itemId: `prd-${k}`, tipo: 'entrada', qtd: produzida, valor: r2(produzida * custoPadrao(k)),
        lote: codigo, validade: somarDias(dataLote, p.validadeDias), documento: 'Produção' });
    }
  }
  // Compras do mês: repõem o consumo (cacau fica abaixo do mínimo no fim de outubro).
  for (const i of Object.keys(INS)) {
    const q = consumoMes[comp][i] || 0;
    if (!q) continue;
    let compra = r2(q * variar(1.0, 0.04));
    if (i === 'cac' && comp >= '2026-09') compra = r2(q * 0.55);
    const dataCompra = dia(comp, 1);
    if (dataCompra > HOJE) continue;
    const validade = i === 'lei' && comp === '2026-10' ? '2026-10-30' : somarDias(dataCompra, INS[i].validadeDias);
    mov({ data: dataCompra, itemTipo: 'insumo', itemId: `ins-${i}`, tipo: 'entrada', qtd: compra, valor: r2(compra * precoReal(i, comp)),
      lote: `NF-${i.toUpperCase()}-${comp.slice(5)}${comp.slice(2, 4)}`, validade, documento: `NF de compra ${comp}` });
  }
}
// Saídas de produto acabado pelas entregas realizadas.
for (const e of d.empenhos) {
  for (const en of e.entregas) {
    if (!en.real) continue;
    const k = en.produtoId.slice(4);
    mov({ data: en.real, itemTipo: 'produto', itemId: en.produtoId, tipo: 'saida', qtd: en.qtd, valor: r2(en.qtd * custoPadrao(k)), documento: en.nf });
  }
}
// Perdas e ajustes de estoque pontuais.
mov({ data: '2026-08-19', itemTipo: 'produto', itemId: 'prd-bis', tipo: 'perda', qtd: 600, valor: r2(600 * custoPadrao('bis')), motivo: 'Avaria no transporte interno' });
mov({ data: '2026-09-22', itemTipo: 'insumo', itemId: 'ins-far', tipo: 'perda', qtd: 350, valor: r2(350 * 3.2), motivo: 'Umidade no armazém' });
mov({ data: '2026-10-08', itemTipo: 'produto', itemId: 'prd-min', tipo: 'perda', qtd: 240, valor: r2(240 * custoPadrao('min')), motivo: 'Validade' });
mov({ data: '2026-09-30', itemTipo: 'insumo', itemId: 'ins-acu', tipo: 'ajuste', qtd: -120, valor: -r2(120 * 3.8), motivo: 'Inventário de setembro' });
// Baixa FEFO: cada saída sem lote é distribuída entre os lotes com saldo, do que vence primeiro.
(function baixarFEFO() {
  const ordem = (m) => (m.tipo === 'entrada' ? 0 : 1);
  const lista = d.movimentosEstoque.slice().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : ordem(a) - ordem(b)));
  const filas = new Map();
  const saida = [];
  let faltas = 0;
  for (const m of lista) {
    const k = `${m.itemTipo}:${m.itemId}`;
    if (!filas.has(k)) filas.set(k, []);
    const fila = filas.get(k);
    const negativo = m.tipo !== 'entrada' && !(m.tipo === 'ajuste' && m.qtd > 0);
    if (!negativo) {
      if (m.lote) fila.push({ lote: m.lote, validade: m.validade, qtd: m.qtd });
      saida.push(m);
      continue;
    }
    let resta = Math.abs(m.qtd);
    const unit = m.valor ? Math.abs(m.valor) / Math.abs(m.qtd) : 0;
    fila.sort((a, b) => (a.validade < b.validade ? -1 : 1));
    for (const l of fila) {
      if (resta <= 0.0001) break;
      if (l.qtd <= 0.0001) continue;
      const q = r2(Math.min(l.qtd, resta));
      l.qtd -= q;
      resta = r2(resta - q);
      const parte = Object.assign({}, m, { id: `${m.id}-${l.lote}`, lote: l.lote, validade: l.validade,
        qtd: m.tipo === 'ajuste' ? -q : q, valor: m.valor === null ? null : (m.tipo === 'ajuste' ? -1 : 1) * r2(q * unit) });
      saida.push(parte);
    }
    if (resta > 0.01) { faltas++; if (process.env.DEBUG_DEMO) console.warn('  falta', m.data, m.itemId, m.tipo, resta); }
  }
  if (faltas) console.warn(`Aviso: ${faltas} saídas sem saldo suficiente.`);
  d.movimentosEstoque = saida;
})();

/* ------------------------- caixa, orçamento, DRE ------------------------- */
const CUSTOS_MES = [
  // [categoria, centro, valor-base, variação, dia]
  ['Folha de pagamento', 'cen-prod', 98000, 0.02, 5],
  ['Folha de pagamento', 'cen-adm', 42000, 0.01, 5],
  ['Folha de pagamento', 'cen-com', 24000, 0.01, 5],
  ['Frete', 'cen-log', 0, 0, 20],
  ['Energia elétrica', 'cen-prod', 31000, 0.08, 15],
  ['Manutenção', 'cen-prod', 14000, 0.15, 18],
  ['Despesas administrativas', 'cen-adm', 29000, 0.06, 10],
  ['Impostos sobre vendas', 'cen-adm', 0, 0, 20],
  ['Juros de empréstimos', 'cen-adm', 9800, 0, 25],
  ['Amortização de empréstimo', 'cen-adm', 25000, 0, 25]
];
const faturamento = (comp) => d.empenhos.flatMap((e) => e.entregas).filter((en) => en.real && en.real.slice(0, 7) === comp)
  .reduce((s, en) => s + en.valor, 0);
const freteMes = (comp) => d.empenhos.flatMap((e) => e.entregas).filter((en) => en.real && en.real.slice(0, 7) === comp)
  .reduce((s, en) => s + en.frete, 0);
const comprasMes = (comp) => d.movimentosEstoque.filter((m) => m.itemTipo === 'insumo' && m.tipo === 'entrada' && m.data.slice(0, 7) === comp && m.documento !== 'Saldo inicial')
  .reduce((s, m) => s + m.valor, 0);
for (const comp of MESES) {
  const fechado = comp <= '2026-09';
  // Fornecedores de insumos: pagos no mês seguinte.
  const forn = r2(comprasMes(comp));
  const dataForn = dia(somarMes(comp, 1), 10);
  d.lancamentos.push(reg('lan', { data: dataForn, competencia: comp, tipo: 'saida', categoria: 'Fornecedores de insumos', centroId: 'cen-prod', contratoId: '',
    valor: forn, situacao: dataForn <= HOJE ? 'realizado' : 'previsto', descricao: `Compras de insumos de ${comp}`, origemId: '' }));
  for (const [cat, centro, base, v, dd] of CUSTOS_MES) {
    let valor = base ? r2(variar(base, v)) : 0;
    if (cat === 'Frete') valor = r2(freteMes(comp));
    if (cat === 'Impostos sobre vendas') valor = r2(faturamento(comp) * 0.0925);
    if (cat === 'Manutenção' && comp === '2026-09') valor = 23800; // estouro do orçamento em setembro
    if (!valor) continue;
    const data = dia(comp, dd);
    d.lancamentos.push(reg('lan', { data, competencia: comp, tipo: 'saida', categoria: cat, centroId: centro, contratoId: '', valor,
      situacao: data <= HOJE || fechado ? 'realizado' : 'previsto', descricao: '', origemId: '' }));
  }
}
// Previstos das próximas 13 semanas.
for (const comp of ['2026-11', '2026-12', '2027-01']) {
  for (const [cat, centro, base, , dd] of CUSTOS_MES) {
    if (!base) continue;
    d.lancamentos.push(reg('lan', { data: dia(comp, dd), competencia: comp, tipo: 'saida', categoria: cat, centroId: centro, contratoId: '', valor: base,
      situacao: 'previsto', descricao: 'Previsão', origemId: '' }));
  }
  d.lancamentos.push(reg('lan', { data: dia(comp, 10), competencia: comp, tipo: 'saida', categoria: 'Fornecedores de insumos', centroId: 'cen-prod', contratoId: '',
    valor: 560000, situacao: 'previsto', descricao: 'Previsão de compras', origemId: '' }));
}
for (const dt of ['2026-11-20', '2026-12-20', '2027-01-20']) {
  d.lancamentos.push(reg('lan', { data: dt, competencia: dt.slice(0, 7), tipo: 'entrada', categoria: 'Recebimento estimado de contratos', centroId: 'cen-com', contratoId: '',
    valor: 640000, situacao: 'previsto', descricao: 'Empenhos ainda não emitidos (estimativa)', origemId: '' }));
}
d.lancamentos.push(reg('lan', { data: '2026-12-18', competencia: '2026-12', tipo: 'saida', categoria: 'Décimo terceiro salário', centroId: 'cen-adm', contratoId: '',
  valor: 164000, situacao: 'previsto', descricao: '13º salário', origemId: '' }));

// Orçamento 2026 (por centro e conta).
const ORC = [
  ['cen-com', 'Receita de contratos', 'receita', 960000, 1],
  ['cen-prod', 'Fornecedores de insumos', 'custo', 500000, 0.95],
  ['cen-prod', 'Folha de pagamento', 'custo', 98000, 0.2],
  ['cen-adm', 'Folha de pagamento', 'custo', 42000, 0],
  ['cen-com', 'Folha de pagamento', 'custo', 24000, 0],
  ['cen-log', 'Frete', 'custo', 11500, 0.9],
  ['cen-adm', 'Juros de empréstimos', 'custo', 9800, 0],
  ['cen-prod', 'Energia elétrica', 'custo', 30000, 0.5],
  ['cen-prod', 'Manutenção', 'custo', 15000, 0],
  ['cen-adm', 'Despesas administrativas', 'custo', 28000, 0],
  ['cen-adm', 'Impostos sobre vendas', 'custo', 89000, 1]
];
d.orcamento = [];
for (const comp of competencias('2026-01', '2026-12')) {
  for (const [centro, conta, natureza, valor, pv] of ORC) {
    d.orcamento.push(reg('orc', { competencia: comp, centroId: centro, conta, natureza, valor, parteVariavel: pv }));
  }
  d.configuracoes.volumeOrcado[comp] = 2 * (38000 * 0.4 + 5600 * 1 + 10500 * 0.5);
}

// Demonstrações mensais (DRE + balanço), coerentes com os dados acima.
d.demonstracoes = [];
let caixa = 2400000;
let imobilizado = 3200000;
let emprestimoLP = 520000;
for (const comp of MESES.filter((c) => c <= '2026-09')) {
  const lancMes = d.lancamentos.filter((l) => l.situacao === 'realizado' && l.data.slice(0, 7) === comp);
  caixa += lancMes.reduce((s, l) => s + (l.tipo === 'entrada' ? l.valor : -l.valor), 0);
  if (process.env.DEBUG_DEMO) { const g = {}; for (const l of lancMes) g[l.tipo + ':' + l.categoria] = r0((g[l.tipo + ':' + l.categoria] || 0) + l.valor); console.log(comp, r0(caixa), JSON.stringify(g)); }
  const rb = r2(faturamento(comp));
  const ded = r2(rb * 0.0925);
  const lotesMes = d.lotes.filter((l) => l.data.slice(0, 7) === comp);
  const mat = lotesMes.reduce((s, l) => s + l.consumo.reduce((t, c) => t + c.qtd * c.precoReal, 0), 0);
  const mod = lotesMes.reduce((s, l) => s + l.modReal, 0);
  const cv = r2(mat + mod);
  const dv = r2(freteMes(comp));
  const soma = (cat, centro) => d.lancamentos.filter((l) => l.competencia === comp && l.categoria === cat && (!centro || l.centroId === centro)).reduce((s, l) => s + l.valor, 0);
  const cf = r2(soma('Energia elétrica') + soma('Manutenção') + soma('Folha de pagamento', 'cen-prod') - mod);
  const df = r2(soma('Folha de pagamento', 'cen-adm') + soma('Folha de pagamento', 'cen-com') + soma('Despesas administrativas'));
  const dep = 26000;
  const despFin = r2(soma('Juros de empréstimos'));
  const recFin = r2(caixa * 0.008);
  const lair = rb - ded - cv - dv - cf - df - dep + recFin - despFin;
  const ir = r2(Math.max(0, lair) * 0.24);
  imobilizado -= dep;
  emprestimoLP -= 25000;
  const recebiveis = d.empenhos.filter((e) => e.liquidacao.data && e.liquidacao.data.slice(0, 7) <= comp && !(e.pagamento.data && e.pagamento.data.slice(0, 7) <= comp))
    .reduce((s, e) => s + e.liquidacao.valor, 0);
  const fimMes = dia(comp, 28);
  const est = NS.calc.estoque.saldos(d.movimentosEstoque, fimMes);
  const estoques = r2([...est.values()].reduce((s, x) => s + Math.max(0, x.valor), 0));
  const forn = r2(comprasMes(comp));
  const ac = caixa + recebiveis + estoques + 40000;
  const pc = forn + 150000 + 95000 + 20000;
  const pnc = emprestimoLP;
  d.demonstracoes.push(reg('dem', {
    competencia: comp, receitaBruta: rb, deducoes: ded, cpv: r2(cv + cf), custosVariaveis: cv, despesasVariaveis: dv, custosFixos: cf,
    despesasFixas: df, depreciacao: dep, despesasFinanceiras: despFin, receitasFinanceiras: recFin, irCsll: ir,
    disponivel: r2(caixa), contasReceber: r2(recebiveis), estoques, outrosAC: 40000, rlp: 0, imobilizado: r2(imobilizado), intangivel: 0,
    fornecedores: forn, emprestimosCP: 150000, obrigacoesOperacionais: 95000, outrosPC: 20000, emprestimosLP: r2(emprestimoLP), outrosPNC: 0,
    pl: r2(ac + imobilizado - pc - pnc),
    compras: forn, cifFixosEstoqueInicial: 0, cifFixosEstoqueFinal: 0
  }));
}

/* ------------------------ governança: planos, controles ------------------------ */
d.planosAcao = [
  reg('pla', { origem: 'manual', referenciaId: '', desvio: 'Rendimento do mingau abaixo do padrão em agosto', causa: 'Regulagem da misturadora',
    acao: 'Recalibrar a misturadora e treinar o turno B', responsavel: 'Marina Alves', prazo: '2026-09-15', status: 'concluido', efeito: 'Rendimento voltou a 95%', dataConclusao: '2026-09-11' }),
  reg('pla', { origem: 'manual', referenciaId: '', desvio: 'Prazo de pagamento da Secretaria Estadual acima do contratual',
    acao: 'Agendar reunião com o setor financeiro do órgão', responsavel: 'Rafael Duarte', prazo: '2026-11-10', status: 'andamento', efeito: '', dataConclusao: null }),
  reg('pla', { origem: 'manual', referenciaId: '', desvio: 'Estoque de cacau abaixo do mínimo',
    acao: 'Homologar segundo fornecedor de cacau', responsavel: 'Marina Alves', prazo: '2026-10-20', status: 'aberto', efeito: '', dataConclusao: null })
];
d.controles = [
  reg('ctl', { area: 'compras', controle: 'Três cotações para compras acima de R$ 20 mil', frequencia: 'mensal', ultimoTeste: '2026-09-30', resultado: 'efetivo', responsavel: 'Lúcia Prado',
    testes: [{ data: '2026-09-30', resultado: 'efetivo', observacao: '' }] }),
  reg('ctl', { area: 'estoque', controle: 'Inventário rotativo de insumos', frequencia: 'mensal', ultimoTeste: '2026-09-30', resultado: 'ressalva', responsavel: 'Marina Alves',
    testes: [{ data: '2026-09-30', resultado: 'ressalva', observacao: 'Diferença no açúcar' }] }),
  reg('ctl', { area: 'faturamento', controle: 'Conferência da nota fiscal com o empenho', frequencia: 'mensal', ultimoTeste: '2026-09-29', resultado: 'efetivo', responsavel: 'Rafael Duarte',
    testes: [{ data: '2026-09-29', resultado: 'efetivo', observacao: '' }] }),
  reg('ctl', { area: 'tesouraria', controle: 'Conciliação bancária diária', frequencia: 'semanal', ultimoTeste: '2026-10-23', resultado: 'efetivo', responsavel: 'Lúcia Prado',
    testes: [{ data: '2026-10-23', resultado: 'efetivo', observacao: '' }] }),
  reg('ctl', { area: 'contratos', controle: 'Revisão de vigências e garantias', frequencia: 'mensal', ultimoTeste: null, resultado: null, responsavel: 'Rafael Duarte', testes: [] })
];

/* ------------------------------ validação ------------------------------ */
const v = NS.core.schema.validarBackup(d);
if (!v.ok) {
  console.error('Backup inválido:\n- ' + v.erros.join('\n- '));
  process.exit(1);
}
const ctx = NS.calc.contexto.criar(d, HOJE);
const alertas = ctx.alertas();
console.log(`OK: ${d.empenhos.length} empenhos, ${d.lotes.length} lotes, ${d.movimentosEstoque.length} movimentos, ${d.lancamentos.length} lançamentos.`);
console.log(`Alertas (${alertas.length}):`);
for (const a of alertas) console.log(`  [${a.gravidade}] ${a.titulo}`);
const F = NS.core.format;
for (const av of ctx.avaliacoes('2026-09')) console.log(`  ${av.indicador.nome}: ${av.valor === null ? '—' : av.valor.toFixed(4)} (${av.status})`);
console.log('Caixa hoje:', F.moeda(ctx.saldoCaixa()));
fs.writeFileSync(path.join(__dirname, 'demo.json'), JSON.stringify(d, null, 2), 'utf8');
console.log('Gravado: dados/demo.json');
