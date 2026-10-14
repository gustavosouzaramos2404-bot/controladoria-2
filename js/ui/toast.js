/* ==========================================================================
   ui/toast.js
   Avisos rápidos (toast) em região aria-live, para confirmar ações
   ("Contrato salvo.") e informar erros. Somem sozinhos depois de alguns
   segundos; erros ficam mais tempo e podem ser fechados.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.ui = NS.ui || {};

  /** Mostra um aviso. tipo: 'sucesso' | 'erro' | 'info'. */
  function avisar(mensagem, tipo = 'sucesso') {
    const { html, icone } = NS.ui;
    const area = document.getElementById('avisos');
    if (!area) return;
    const nomeIcone = tipo === 'erro' ? 'fora' : (tipo === 'info' ? 'info' : 'dentro');
    const el = document.createElement('div');
    el.className = `aviso aviso-${tipo}`;
    el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    el.innerHTML = String(html`${icone(nomeIcone)}<span>${mensagem}</span><button type="button" aria-label="Fechar aviso">×</button>`);
    el.querySelector('button').addEventListener('click', () => el.remove());
    area.appendChild(el);
    // Mantém no máximo 4 avisos na tela.
    while (area.children.length > 4) area.firstElementChild.remove();
    setTimeout(() => el.remove(), tipo === 'erro' ? 9000 : 4500);
  }

  NS.ui.avisar = avisar;
})(typeof window !== 'undefined' ? window : globalThis);
