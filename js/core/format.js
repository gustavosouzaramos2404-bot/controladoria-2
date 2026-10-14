/* ==========================================================================
   core/format.js
   Formatação e leitura de números, moeda, percentuais e datas no padrão
   pt-BR. Funções puras (sem DOM), exportadas também para o Node.
   Regra do sistema: valor inválido (null, NaN, Infinity) aparece como
   "sem dados", nunca como NaN/undefined/Infinity.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  const SEM_DADOS = 'sem dados';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // Formatadores Intl criados uma vez e reaproveitados (criar é caro).
  const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const cacheNumero = new Map();
  const cachePct = new Map();

  /** Verdadeiro se v é número finito. */
  function valido(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  /** Obtém (ou cria) um formatador de número com quantidade fixa de casas. */
  function formatadorNumero(casas) {
    if (!cacheNumero.has(casas)) {
      cacheNumero.set(casas, new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas, maximumFractionDigits: casas
      }));
    }
    return cacheNumero.get(casas);
  }

  /** Número com separador de milhar e casas decimais fixas: 1.234,5 */
  function numero(v, casas = 0) {
    if (!valido(v)) return SEM_DADOS;
    // Evita exibir "-0" quando o valor arredondado é zero.
    const arred = Number(v.toFixed(casas));
    return formatadorNumero(casas).format(arred === 0 ? 0 : arred);
  }

  /** Moeda em reais: R$ 1.234,56 */
  function moeda(v) {
    if (!valido(v)) return SEM_DADOS;
    const arred = Math.round(v * 100) / 100;
    return fmtMoeda.format(arred === 0 ? 0 : arred);
  }

  /** Moeda compacta para eixos de gráfico: R$ 1,2 mi / R$ 350 mil. */
  function moedaCompacta(v) {
    if (!valido(v)) return SEM_DADOS;
    const abs = Math.abs(v);
    const sinal = v < 0 ? '-' : '';
    if (abs >= 1e6) return `${sinal}R$ ${numero(abs / 1e6, 1)} mi`;
    if (abs >= 1e3) return `${sinal}R$ ${numero(abs / 1e3, 0)} mil`;
    return `${sinal}R$ ${numero(abs, 0)}`;
  }

  /** Percentual a partir de fração: 0.123 -> "12,3%" (1 casa por padrão). */
  function pct(v, casas = 1) {
    if (!valido(v)) return SEM_DADOS;
    if (!cachePct.has(casas)) {
      cachePct.set(casas, new Intl.NumberFormat('pt-BR', {
        style: 'percent', minimumFractionDigits: casas, maximumFractionDigits: casas
      }));
    }
    const arred = Number(v.toFixed(casas + 2));
    return cachePct.get(casas).format(arred === 0 ? 0 : arred);
  }

  /** Diferença em pontos percentuais a partir de fração: 0.021 -> "+2,1 p.p." */
  function pp(v, casas = 1) {
    if (!valido(v)) return SEM_DADOS;
    const x = v * 100;
    const texto = numero(Math.abs(x), casas);
    const zero = Number(Math.abs(x).toFixed(casas)) === 0;
    return `${zero ? '' : (x > 0 ? '+' : '−')}${texto} p.p.`;
  }

  /** Data ISO (AAAA-MM-DD) para dd/mm/aaaa, sem passar por fuso horário. */
  function data(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return SEM_DADOS;
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }

  /** Competência AAAA-MM para mm/aaaa. */
  function competencia(comp) {
    if (typeof comp !== 'string' || !/^\d{4}-\d{2}$/.test(comp)) return SEM_DADOS;
    const [a, m] = comp.split('-');
    return `${m}/${a}`;
  }

  /** Competência por extenso: "setembro de 2026". */
  function competenciaExtenso(comp) {
    if (typeof comp !== 'string' || !/^\d{4}-\d{2}$/.test(comp)) return SEM_DADOS;
    const [a, m] = comp.split('-');
    return `${MESES[Number(m) - 1]} de ${a}`;
  }

  /** Data e hora ISO completas para dd/mm/aaaa hh:mm no horário local. */
  function dataHora(isoCompleto) {
    if (!isoCompleto) return SEM_DADOS;
    const d = new Date(isoCompleto);
    if (Number.isNaN(d.getTime())) return SEM_DADOS;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** Quantidade de dias: "1 dia", "65 dias". */
  function dias(v, casas = 0) {
    if (!valido(v)) return SEM_DADOS;
    const n = numero(v, casas);
    return Math.abs(Number(v.toFixed(casas))) === 1 ? `${n} dia` : `${n} dias`;
  }

  /** Multiplicador: 2,5x */
  function vezes(v, casas = 1) {
    if (!valido(v)) return SEM_DADOS;
    return `${numero(v, casas)}x`;
  }

  /**
   * Formata um valor conforme a unidade de um indicador.
   * Unidades: 'pct', 'moeda', 'dias', 'vezes', 'numero', 'quantidade', 'kg'.
   */
  function porUnidade(v, unidade, casas) {
    switch (unidade) {
      case 'pct': return pct(v, casas ?? 1);
      case 'moeda': return moeda(v);
      case 'dias': return dias(v, casas ?? 0);
      case 'vezes': return vezes(v, casas ?? 1);
      case 'kg': return valido(v) ? `${numero(v, casas ?? 0)} kg` : SEM_DADOS;
      case 'quantidade': return numero(v, casas ?? 0);
      default: return numero(v, casas ?? 1);
    }
  }

  /**
   * Formata o desvio entre dois valores na unidade do indicador:
   * percentuais viram p.p., demais viram diferença com sinal.
   */
  function diferenca(v, unidade, casas) {
    if (!valido(v)) return SEM_DADOS;
    if (unidade === 'pct') return pp(v, casas ?? 1);
    const sinal = v > 0 ? '+' : (v < 0 ? '−' : '');
    return sinal + porUnidade(Math.abs(v), unidade, casas);
  }

  /**
   * Lê um número digitado no padrão brasileiro. Aceita "1.234,56",
   * "1234,56", "1234.56", "R$ 10", "15%". Devolve null se não for número.
   */
  function parseNumero(texto) {
    if (typeof texto === 'number') return valido(texto) ? texto : null;
    if (typeof texto !== 'string') return null;
    let t = texto.trim().replace(/R\$|%|\s/g, '').replace('−', '-');
    if (t === '') return null;
    if (t.includes(',')) {
      // Vírgula é decimal: pontos são separadores de milhar.
      t = t.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
      // Só pontos em grupos de 3: separador de milhar (ex.: 1.250).
      t = t.replace(/\./g, '');
    }
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return valido(n) ? n : null;
  }

  /** Lê data em dd/mm/aaaa ou AAAA-MM-DD e devolve ISO válida ou null. */
  function parseData(texto) {
    if (typeof texto !== 'string') return null;
    const t = texto.trim();
    let a, m, d;
    let r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
    if (r) { d = r[1]; m = r[2]; a = r[3]; } else {
      r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
      if (!r) return null;
      a = r[1]; m = r[2]; d = r[3];
    }
    const iso = `${a}-${m}-${d}`;
    // Confere se a data existe (ex.: rejeita 31/02).
    const dt = new Date(Date.UTC(+a, +m - 1, +d));
    return dt.toISOString().slice(0, 10) === iso ? iso : null;
  }

  /** Lê competência em mm/aaaa ou AAAA-MM e devolve AAAA-MM ou null. */
  function parseCompetencia(texto) {
    if (typeof texto !== 'string') return null;
    const t = texto.trim();
    let r = /^(\d{1,2})\/(\d{4})$/.exec(t);
    if (r) {
      const m = Number(r[1]);
      return m >= 1 && m <= 12 ? `${r[2]}-${String(m).padStart(2, '0')}` : null;
    }
    r = /^(\d{4})-(\d{2})$/.exec(t);
    if (r) {
      const m = Number(r[2]);
      return m >= 1 && m <= 12 ? t : null;
    }
    return null;
  }

  /** Número para CSV no padrão do Excel brasileiro: sem milhar, vírgula decimal. */
  function numeroCSV(v, casas = 2) {
    if (!valido(v)) return '';
    return v.toFixed(casas).replace('.', ',');
  }

  const format = {
    SEM_DADOS, MESES, valido, numero, moeda, moedaCompacta, pct, pp, data, competencia,
    competenciaExtenso, dataHora, dias, vezes, porUnidade, diferenca, parseNumero,
    parseData, parseCompetencia, numeroCSV
  };

  NS.core.format = format;
  if (typeof module !== 'undefined' && module.exports) module.exports = format;
})(typeof window !== 'undefined' ? window : globalThis);
