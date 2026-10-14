/* ==========================================================================
   calc/base.js
   Funções auxiliares puras usadas por todos os cálculos: divisão segura
   (nunca devolve NaN ou Infinity), somas, médias e aritmética de datas e
   competências. Datas são strings ISO "AAAA-MM-DD"; competências "AAAA-MM".
   Nada aqui acessa DOM ou armazenamento.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};

  const MS_DIA = 86400000;

  /** Verdadeiro se v é número finito (exclui NaN, Infinity, null e texto). */
  function ehNumero(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  /** Divisão segura: null quando o divisor é zero ou algum termo é inválido. */
  function div(a, b) {
    if (!ehNumero(a) || !ehNumero(b) || b === 0) return null;
    const r = a / b;
    return Number.isFinite(r) ? r : null;
  }

  /** Número ou zero (para somatórios em que ausência equivale a zero). */
  function num(v) {
    return ehNumero(v) ? v : 0;
  }

  /** Subtração que propaga ausência: null se algum termo for inválido. */
  function sub(a, b) {
    return ehNumero(a) && ehNumero(b) ? a - b : null;
  }

  /** Multiplicação que propaga ausência. */
  function mult(a, b) {
    return ehNumero(a) && ehNumero(b) ? a * b : null;
  }

  /** Soma os valores (ou fn(item)) ignorando os inválidos. */
  function soma(lista, fn) {
    let s = 0;
    for (const x of lista || []) {
      const v = fn ? fn(x) : x;
      if (ehNumero(v)) s += v;
    }
    return s;
  }

  /** Média simples dos valores válidos; null se não houver nenhum. */
  function media(lista, fn) {
    const vals = (lista || []).map(fn || ((x) => x)).filter(ehNumero);
    return vals.length ? soma(vals) / vals.length : null;
  }

  /** Média ponderada: Σ(valor × peso) ÷ Σ peso. */
  function mediaPonderada(lista, fnValor, fnPeso) {
    let sv = 0;
    let sp = 0;
    for (const x of lista || []) {
      const v = fnValor(x);
      const p = fnPeso(x);
      if (ehNumero(v) && ehNumero(p)) { sv += v * p; sp += p; }
    }
    return div(sv, sp);
  }

  /** Variação percentual entre atual e anterior: (atual − anterior) ÷ |anterior|. */
  function variacaoPct(atual, anterior) {
    if (!ehNumero(anterior)) return null;
    return div(sub(atual, anterior), Math.abs(anterior));
  }

  /** Arredonda para n casas (mantém null). */
  function arred(v, casas = 2) {
    if (!ehNumero(v)) return v;
    const f = 10 ** casas;
    return Math.round(v * f) / f;
  }

  /** Maior valor válido de uma lista; null se vazia. */
  function maximo(lista, fn) {
    const vals = (lista || []).map(fn || ((x) => x)).filter(ehNumero);
    return vals.length ? Math.max(...vals) : null;
  }

  /* ---------------------------- Datas ---------------------------- */

  /** Converte data ISO em número de dias desde 01/01/1970 (UTC, sem fuso). */
  function diaNum(iso) {
    if (typeof iso !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_DIA);
  }

  /** Converte número de dias desde 1970 de volta para data ISO. */
  function isoDeDia(n) {
    return new Date(n * MS_DIA).toISOString().slice(0, 10);
  }

  /** Dias corridos de a até b (b − a). */
  function diasEntre(a, b) {
    const x = diaNum(a);
    const y = diaNum(b);
    return x === null || y === null ? null : y - x;
  }

  /** Soma n dias a uma data ISO. */
  function somarDias(iso, n) {
    const d = diaNum(iso);
    return d === null ? null : isoDeDia(d + Math.round(n));
  }

  /** Quantidade de dias do mês de uma competência AAAA-MM. */
  function diasNoMes(comp) {
    const [a, m] = comp.split('-').map(Number);
    return new Date(Date.UTC(a, m, 0)).getUTCDate();
  }

  /** Soma n meses a uma competência AAAA-MM. */
  function somarCompetencia(comp, n) {
    const [a, m] = comp.split('-').map(Number);
    const total = a * 12 + (m - 1) + n;
    const na = Math.floor(total / 12);
    const nm = total - na * 12 + 1;
    return `${String(na).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
  }

  /** Soma n meses a uma data ISO, ajustando o dia ao fim do mês se preciso. */
  function somarMeses(iso, n) {
    const comp = somarCompetencia(iso.slice(0, 7), n);
    const dia = Math.min(Number(iso.slice(8, 10)), diasNoMes(comp));
    return `${comp}-${String(dia).padStart(2, '0')}`;
  }

  /** Competência (AAAA-MM) de uma data ISO. */
  function competenciaDe(iso) {
    return typeof iso === 'string' && iso.length >= 7 ? iso.slice(0, 7) : null;
  }

  /** Primeiro dia de uma competência. */
  function primeiroDia(comp) {
    return `${comp}-01`;
  }

  /** Último dia de uma competência. */
  function ultimoDia(comp) {
    return `${comp}-${String(diasNoMes(comp)).padStart(2, '0')}`;
  }

  /** Lista de n competências terminando em "fim", em ordem crescente. */
  function listaCompetencias(fim, n) {
    const r = [];
    for (let i = n - 1; i >= 0; i--) r.push(somarCompetencia(fim, -i));
    return r;
  }

  /** Verdadeiro se a string é uma data ISO existente. */
  function dataValida(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    return isoDeDia(diaNum(iso)) === iso;
  }

  /** Verdadeiro se a data pertence à competência. */
  function naCompetencia(iso, comp) {
    return typeof iso === 'string' && iso.slice(0, 7) === comp;
  }

  /** Verdadeiro se ini <= iso <= fim (comparação de strings ISO). */
  function entre(iso, ini, fim) {
    return typeof iso === 'string' && iso >= ini && iso <= fim;
  }

  /** Data de corte de uma competência: último dia, ou hoje se ainda não acabou. */
  function corteDaCompetencia(comp, hoje) {
    const fim = ultimoDia(comp);
    return hoje && hoje < fim ? hoje : fim;
  }

  /* ------------------------- Coleções ------------------------- */

  /** Mapa id -> registro. */
  function mapaPorId(lista) {
    return new Map((lista || []).map((x) => [x.id, x]));
  }

  /** Agrupa registros por uma chave: Map chave -> [registros]. */
  function agruparPor(lista, fn) {
    const m = new Map();
    for (const x of lista || []) {
      const k = fn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  }

  const base = {
    ehNumero, div, num, sub, mult, soma, media, mediaPonderada, variacaoPct, arred, maximo,
    diaNum, isoDeDia, diasEntre, somarDias, diasNoMes, somarCompetencia, somarMeses,
    competenciaDe, primeiroDia, ultimoDia, listaCompetencias, dataValida, naCompetencia,
    entre, corteDaCompetencia, mapaPorId, agruparPor
  };

  NS.calc.base = base;
  if (typeof module !== 'undefined' && module.exports) module.exports = base;
})(typeof window !== 'undefined' ? window : globalThis);
