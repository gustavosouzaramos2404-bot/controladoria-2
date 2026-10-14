/* ==========================================================================
   core/router.js
   Roteamento por hash (#/painel, #/contratos/123?aba=empenhos). Mantém o
   botão voltar do navegador funcionando, porque cada tela e cada filtro
   relevante (competência, aba) fica registrado no endereço.
   Hashes que não começam com "#/" são ignorados (âncoras internas).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  const rotas = [];           // [{ partes: ['contratos', ':id'], tela }]
  let rotaPadrao = 'painel';  // tela aberta quando o endereço está vazio
  let atual = null;           // rota resolvida mais recente
  let aoResolver = null;      // função chamada pelo app para renderizar

  /** Separa caminho e parâmetros de consulta de um hash "#/a/b?x=1". */
  function analisar(hash) {
    const semPrefixo = hash.replace(/^#\/?/, '');
    const [caminho, consulta = ''] = semPrefixo.split('?');
    const query = {};
    for (const par of consulta.split('&')) {
      if (!par) continue;
      const [k, v = ''] = par.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
    const partes = caminho.split('/').filter(Boolean).map(decodeURIComponent);
    return { caminho: partes.join('/'), partes, query };
  }

  /** Procura a rota registrada que corresponde às partes do caminho. */
  function casar(partes) {
    for (const rota of rotas) {
      if (rota.partes.length !== partes.length) continue;
      const params = {};
      let ok = true;
      rota.partes.forEach((p, i) => {
        if (p.startsWith(':')) params[p.slice(1)] = partes[i];
        else if (p !== partes[i]) ok = false;
      });
      if (ok) return { rota, params };
    }
    return null;
  }

  /** Monta o hash a partir do caminho e de um objeto de consulta. */
  function montar(caminho, query = {}) {
    const q = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `#/${caminho}${q ? '?' + q : ''}`;
  }

  /** Resolve o hash atual e chama a tela correspondente. */
  function resolver(evento) {
    const hash = location.hash;
    if (!hash || hash === '#' || hash === '#/') {
      location.replace(montar(rotaPadrao));
      return;
    }
    if (!hash.startsWith('#/')) return; // âncora comum, não é rota
    const { caminho, partes, query } = analisar(hash);
    const achado = casar(partes);
    const anterior = atual;
    atual = {
      caminho, partes, query,
      params: achado ? achado.params : {},
      tela: achado ? achado.rota.tela : null,
      secao: partes[0] || rotaPadrao
    };
    // "navegou" é falso quando só mudaram parâmetros da mesma tela.
    const navegou = !anterior || anterior.caminho !== caminho;
    if (aoResolver) aoResolver(atual, { navegou, evento: !!evento });
    NS.core.eventos.emit('rota:mudou', atual);
  }

  NS.core.router = {
    montar,

    /** Registra uma rota. Ex.: registrar('contratos/:id', telaDetalhe). */
    registrar(padrao, tela) {
      rotas.push({ partes: padrao.split('/').filter(Boolean), tela });
    },

    /** Define a tela padrão e a função que renderiza cada rota. */
    configurar({ padrao, renderizar }) {
      if (padrao) rotaPadrao = padrao;
      aoResolver = renderizar;
    },

    /** Começa a escutar mudanças de endereço e resolve a rota atual. */
    iniciar() {
      raiz.addEventListener('hashchange', resolver);
      resolver();
    },

    /** Navega para um caminho (cria entrada no histórico). */
    ir(caminho, query) {
      const destino = montar(caminho, query);
      if (location.hash === destino) resolver();
      else location.hash = destino;
    },

    /** Altera parâmetros da rota atual mantendo o caminho. */
    alterarQuery(novos, substituir = false) {
      const q = Object.assign({}, atual ? atual.query : {}, novos);
      const destino = montar(atual ? atual.caminho : rotaPadrao, q);
      if (substituir) { history.replaceState(null, '', destino); resolver(); } else location.hash = destino;
    },

    /** Troca parâmetros no endereço sem renderizar de novo (ex.: limpar um atalho já usado). */
    substituirQuery(novos) {
      if (!atual) return;
      atual.query = Object.assign({}, atual.query, novos);
      history.replaceState(null, '', montar(atual.caminho, atual.query));
    },

    /** Rota atual resolvida. */
    atual() { return atual; },

    /** Renderiza de novo a rota atual (após alteração de dados). */
    recarregar() {
      if (atual && aoResolver) aoResolver(atual, { navegou: false, recarga: true });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
