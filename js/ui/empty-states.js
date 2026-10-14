/* ==========================================================================
   ui/empty-states.js
   Estados vazios que orientam a próxima ação, por exemplo:
   "Nenhum contrato cadastrado. Cadastre o primeiro contrato para
   acompanhar margem e saldo." + botão com o verbo da ação.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.ui = NS.ui || {};

  /**
   * HTML de um estado vazio. "acao" (opcional): { rotulo, dataAcao } gera um
   * botão com data-acao para o módulo tratar; { rotulo, rota } gera um link.
   */
  function vazio(mensagem, acao) {
    const { html, icone } = NS.ui;
    let botao = '';
    if (acao && acao.rota) {
      botao = html`<p><a class="botao botao-primario" href="#/${acao.rota}">${acao.rotulo}</a></p>`;
    } else if (acao && acao.dataAcao) {
      botao = html`<p><button type="button" class="botao botao-primario" data-acao="${acao.dataAcao}">${icone('mais')}${acao.rotulo}</button></p>`;
    }
    return html`<div class="vazio"><p>${mensagem}</p>${botao}</div>`;
  }

  NS.ui.vazio = vazio;
})(typeof window !== 'undefined' ? window : globalThis);
