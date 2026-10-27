/* ==========================================================================
   core/log.js
   Registro de auditoria: quem fez, quando, em qual registro e por quê.
   Usado para exceções a regras automáticas (alerta dispensado com
   justificativa), aprovações acima de alçada, exclusões, mudanças de meta,
   importação e restauração de dados.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  NS.core.log = {
    /** Quem está usando o sistema: o e-mail do login ou o nome preenchido em Configurações. */
    autor() {
      const logado = NS.core.supabase && NS.core.supabase.usuario();
      if (logado && logado.email) return logado.email;
      const nome = (NS.core.store.config().usuario || '').trim();
      return nome || 'Usuário não identificado';
    },

    /**
     * Grava uma entrada no log.
     * tipo: 'alteracao' | 'excecao' | 'aprovacao' | 'sistema' | 'exclusao'
     */
    registrar({ entidade = '', entidadeId = '', descricao, tipo = 'alteracao', justificativa = '' }) {
      const store = NS.core.store;
      const autor = this.autor();
      return store.inserir('log', {
        data: NS.core.agora(),
        autor,
        entidade,
        entidadeId: entidadeId || '',
        tipo,
        descricao,
        justificativa: justificativa || ''
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
