/* ==========================================================================
   core/namespace.js
   Cria o namespace global único do sistema (window.Controladoria) e as
   subdivisões usadas pelos demais arquivos. Também expõe utilitários de
   data/hora do relógio local, que não são "puros" e por isso ficam no core.
   ========================================================================== */
(function (raiz) {
  'use strict';

  // Namespace único: todos os arquivos penduram suas funções aqui.
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};      // infraestrutura: store, roteador, formatação, validação
  NS.calc = NS.calc || {};      // funções de cálculo puras (testáveis no Node)
  NS.ui = NS.ui || {};          // componentes de interface reutilizáveis
  NS.modules = NS.modules || {};// telas (uma por arquivo)
  NS.versao = '1.0.0';

  /** Data de hoje no fuso local, no formato ISO AAAA-MM-DD. */
  NS.core.hoje = function () {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  /** Data e hora atuais em ISO completo (usado em criadoEm/atualizadoEm e no log). */
  NS.core.agora = function () {
    return new Date().toISOString();
  };
})(typeof window !== 'undefined' ? window : globalThis);
