/* ==========================================================================
   core/events.js
   Barramento de eventos simples (publicar/assinar). Permite que a camada de
   dados avise as telas que algo mudou sem que uma conheça a outra.
   Eventos usados: 'dados:alterados', 'rota:mudou'.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  // Mapa evento -> conjunto de funções assinantes.
  const assinantes = new Map();

  NS.core.eventos = {
    /** Assina um evento. Devolve uma função que cancela a assinatura. */
    on(evento, fn) {
      if (!assinantes.has(evento)) assinantes.set(evento, new Set());
      assinantes.get(evento).add(fn);
      return () => this.off(evento, fn);
    },

    /** Cancela a assinatura de um evento. */
    off(evento, fn) {
      const lista = assinantes.get(evento);
      if (lista) lista.delete(fn);
    },

    /** Publica um evento para todos os assinantes, isolando erros de cada um. */
    emit(evento, dados) {
      const lista = assinantes.get(evento);
      if (!lista) return;
      for (const fn of Array.from(lista)) {
        try {
          fn(dados);
        } catch (erro) {
          console.error(`Erro ao tratar o evento "${evento}":`, erro);
        }
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
