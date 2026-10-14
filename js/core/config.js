/* ==========================================================================
   core/config.js
   Endereço do projeto Supabase e chave PUBLICÁVEL (sb_publishable_...).
   Esta chave foi feita para ficar no navegador: sozinha ela não lê nem
   grava nada, porque todas as tabelas exigem login de um membro da equipe
   (RLS). NUNCA coloque aqui a service_role/secret key nem a chave da
   Anthropic: essas ficam só no servidor (secrets do Supabase).
   Para trabalhar só neste navegador, sem banco, deixe "url" em branco.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};

  NS.config = {
    supabase: {
      url: 'https://hfbvkzoyvqfbzpghnzte.supabase.co',
      chavePublica: 'sb_publishable_PnTJ6RDPChsTSBoC2NiZbg_pofO3IUG'
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
