/* ==========================================================================
   ui/modal.js
   Janelas modais acessíveis usando o elemento nativo <dialog>: foco preso
   dentro da janela, Esc fecha, o foco volta para quem abriu. Inclui a
   confirmação de ações irreversíveis (com opção de confirmação digitada).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.ui = NS.ui || {};

  let contador = 0;

  /**
   * Abre uma janela modal.
   * opcoes: { titulo, conteudo (HTML seguro ou Element), larga, aoFechar }
   * Devolve { dialog, corpo, fechar }.
   */
  function abrir({ titulo, conteudo, larga = false, aoFechar } = {}) {
    const { html, icone } = NS.ui;
    const anterior = document.activeElement;
    const id = `modal-titulo-${++contador}`;
    const dialog = document.createElement('dialog');
    dialog.className = `modal${larga ? ' modal-larga' : ''}`;
    dialog.setAttribute('aria-labelledby', id);
    dialog.innerHTML = String(html`
      <div class="modal-cabecalho">
        <h2 id="${id}">${titulo}</h2>
        <button type="button" class="modal-fechar" data-fechar aria-label="Fechar janela">${icone('fechar')}</button>
      </div>
      <div class="modal-corpo"></div>`);
    const corpo = dialog.querySelector('.modal-corpo');
    if (conteudo instanceof Element) corpo.appendChild(conteudo);
    else if (conteudo !== undefined) corpo.innerHTML = String(conteudo);
    document.body.appendChild(dialog);

    let fechado = false;
    const fechar = () => {
      if (fechado) return;
      fechado = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (aoFechar) aoFechar();
      if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus();
    };
    dialog.addEventListener('close', fechar);
    dialog.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-fechar]')) fechar();
    });
    dialog.showModal();
    // Foco no primeiro campo do corpo (ou no botão fechar).
    const primeiro = corpo.querySelector('input:not([type=hidden]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])');
    (primeiro || dialog.querySelector('.modal-fechar')).focus();
    return { dialog, corpo, fechar };
  }

  /**
   * Pede confirmação. O botão de confirmar usa o mesmo verbo da ação
   * (ex.: "Excluir contrato"). Com "textoExigido", o usuário precisa digitar
   * a frase para liberar o botão. Devolve Promise<boolean>.
   */
  function confirmar({ titulo, mensagem, rotuloConfirmar = 'Confirmar', perigo = false, textoExigido = '' }) {
    const { html } = NS.ui;
    return new Promise((resolver) => {
      let resposta = false;
      const conteudo = html`
        <p>${mensagem}</p>
        ${textoExigido ? html`
          <div class="campo">
            <label for="confirmacao-digitada">Para confirmar, digite <strong>${textoExigido}</strong></label>
            <input type="text" id="confirmacao-digitada" autocomplete="off" spellcheck="false">
          </div>` : ''}
        <div class="formulario-acoes">
          <button type="button" class="botao botao-secundario" data-fechar>Cancelar</button>
          <button type="button" class="botao ${perigo ? 'botao-perigo' : 'botao-primario'}" data-confirmar ${textoExigido ? 'disabled' : ''}>${rotuloConfirmar}</button>
        </div>`;
      const m = abrir({ titulo, conteudo, aoFechar: () => resolver(resposta) });
      const botao = m.corpo.querySelector('[data-confirmar]');
      const campo = m.corpo.querySelector('#confirmacao-digitada');
      if (campo) {
        campo.addEventListener('input', () => {
          botao.disabled = campo.value.trim().toLowerCase() !== textoExigido.toLowerCase();
        });
      }
      botao.addEventListener('click', () => {
        resposta = true;
        m.fechar();
      });
      if (!campo) botao.focus();
    });
  }

  NS.ui.modal = { abrir, confirmar };
})(typeof window !== 'undefined' ? window : globalThis);
