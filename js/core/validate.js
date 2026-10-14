/* ==========================================================================
   core/validate.js
   Regras de validação de campos com mensagens em português simples, que
   dizem o que está errado e como corrigir. Usado pelos formulários e pelo
   esquema de dados (schema.js). Funções puras.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  /** Verdadeiro se o valor está "vazio" para fins de campo obrigatório. */
  function vazio(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
      (Array.isArray(v) && v.length === 0);
  }

  /** Formata um limite numérico para a mensagem de erro. */
  function limiteTexto(v, percentual) {
    const f = NS.core.format;
    if (percentual) return f ? f.pct(v, 0) : `${v * 100}%`;
    return f ? f.numero(v, Number.isInteger(v) ? 0 : 2) : String(v);
  }

  /**
   * Valida um valor já convertido para o tipo do campo.
   * regras: { tipo, obrigatorio, min, max, opcoes, maxTamanho, percentual }
   * rotulo: nome do campo em minúsculas, usado na mensagem.
   * Devolve a mensagem de erro ou null se estiver tudo certo.
   */
  function campo(valor, regras = {}, rotulo = 'este campo') {
    if (vazio(valor)) {
      return regras.obrigatorio ? `Informe ${rotulo}.` : null;
    }
    switch (regras.tipo) {
      case 'numero':
      case 'moeda':
      case 'pct':
      case 'inteiro': {
        if (typeof valor !== 'number' || !Number.isFinite(valor)) {
          return regras.tipo === 'pct'
            ? 'Digite um percentual válido, por exemplo 12,5.'
            : 'Digite um número válido, por exemplo 1.250,50.';
        }
        if (regras.tipo === 'inteiro' && !Number.isInteger(valor)) {
          return 'Digite um número inteiro, sem casas decimais.';
        }
        const pctRegra = regras.tipo === 'pct' || regras.percentual;
        if (typeof regras.min === 'number' && valor < regras.min) {
          return `O valor deve ser maior ou igual a ${limiteTexto(regras.min, pctRegra)}.`;
        }
        if (typeof regras.max === 'number' && valor > regras.max) {
          return `O valor deve ser menor ou igual a ${limiteTexto(regras.max, pctRegra)}.`;
        }
        return null;
      }
      case 'data':
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
          new Date(valor + 'T00:00:00Z').toISOString().slice(0, 10) !== valor) {
          return 'Informe uma data válida no formato dd/mm/aaaa.';
        }
        return null;
      case 'competencia':
        if (typeof valor !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) {
          return 'Informe a competência no formato mm/aaaa, por exemplo 09/2026.';
        }
        return null;
      case 'enum':
      case 'select':
        if (regras.opcoes && !regras.opcoes.includes(valor)) {
          return 'Escolha uma das opções da lista.';
        }
        return null;
      case 'booleano':
        return typeof valor === 'boolean' ? null : 'Marque ou desmarque a opção.';
      default:
        if (typeof valor !== 'string') return 'Digite um texto.';
        if (regras.maxTamanho && valor.length > regras.maxTamanho) {
          return `Use no máximo ${regras.maxTamanho} caracteres.`;
        }
        return null;
    }
  }

  const validar = { vazio, campo };
  NS.core.validar = validar;
  if (typeof module !== 'undefined' && module.exports) module.exports = validar;
})(typeof window !== 'undefined' ? window : globalThis);
