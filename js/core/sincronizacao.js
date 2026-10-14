/* ==========================================================================
   core/sincronizacao.js
   Sincronização entre este navegador (localStorage, que continua sendo o
   cache usado pelas telas) e o banco Supabase:
   - toda alteração feita pelo usuário entra numa FILA guardada no
     navegador; sem conexão, o app segue funcionando e a fila espera;
   - com conexão e login, a fila é enviada (salvar_registro /
     remover_registro) e depois as alterações da equipe são recebidas
     (exportar_dados desde a última vez);
   - em conflito, vence a versão editada por último (atualizadoEm); um
     registro com alteração local pendente não é sobrescrito pelo servidor;
   - VÍNCULO: na primeira conexão deste navegador, se houver dados locais,
     o usuário escolhe entre enviá-los para o banco (migração) ou usar os
     dados do banco. Sem dados locais, os dados do banco são baixados.
   O estado da sincronização é publicado no evento 'sincronia:status'.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  const CHAVE_ESTADO = 'controladoria:sincronia';
  const CHAVE_FILA = 'controladoria:fila';
  const ESPERA_ENVIO_MS = 1500;          // agrupa alterações seguidas num envio só
  const INTERVALO_MS = 60 * 1000;        // busca alterações da equipe a cada minuto
  const SOBREPOSICAO_MS = 2 * 60 * 1000; // margem ao pedir "o que mudou desde"

  const cliente = () => NS.core.supabase;
  const store = () => NS.core.store;

  let status = { estado: 'local', mensagem: '', ultima: null, pendentes: 0, comErro: 0 };
  let emAndamento = null;
  let repetir = false;
  let temporizador = null;

  /* ------------------------------ Estado salvo ------------------------------ */

  function lerJSON(chave, padrao) {
    try { return JSON.parse(localStorage.getItem(chave) || 'null') || padrao; } catch (e) { return padrao; }
  }
  function gravarJSON(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* armazenamento cheio: a fila fica só em memória até liberar espaço */ }
  }
  /** { vinculado, usuarioId, ultimoRecebimento, ultimaSincronizacao, papel } */
  const lerEstado = () => lerJSON(CHAVE_ESTADO, {});
  const gravarEstado = (mudancas) => gravarJSON(CHAVE_ESTADO, Object.assign(lerEstado(), mudancas));
  /** [{ colecao, id, acao: 'salvar'|'remover'|'substituir', versao, erro? }] */
  const lerFila = () => lerJSON(CHAVE_FILA, []);
  const gravarFila = (fila) => gravarJSON(CHAVE_FILA, fila);

  /* ------------------------------ Status ------------------------------ */

  function publicar(mudancas) {
    const fila = lerFila();
    status = Object.assign({}, status, mudancas, {
      pendentes: fila.filter((i) => !i.erro).length,
      comErro: fila.filter((i) => i.erro).length,
      ultima: lerEstado().ultimaSincronizacao || null,
      usuario: cliente().usuario()
    });
    NS.core.eventos.emit('sincronia:status', status);
  }

  /* ------------------------------ Fila ------------------------------ */

  /** Coloca uma alteração na fila (uma entrada por registro; a mais recente vale). */
  function enfileirar({ colecao, id = '', acao }) {
    let fila = lerFila();
    const versao = Date.now() + Math.random();
    if (acao === 'substituir') {
      fila = [{ colecao: '*', id: '', acao, versao }];
    } else {
      const idx = fila.findIndex((i) => i.colecao === colecao && i.id === id && i.acao !== 'substituir');
      // Mesma ação: mantém a posição (respeita a ordem das chaves estrangeiras).
      if (idx >= 0 && fila[idx].acao === acao) fila[idx] = { colecao, id, acao, versao };
      else {
        if (idx >= 0) fila.splice(idx, 1);
        fila.push({ colecao, id, acao, versao });
      }
    }
    gravarFila(fila);
    publicar({});
    agendar(ESPERA_ENVIO_MS);
  }

  /** Tira um item da fila, desde que ele não tenha sido alterado durante o envio. */
  function concluirItem(item) {
    gravarFila(lerFila().filter((i) => !(i.colecao === item.colecao && i.id === item.id && i.versao === item.versao)));
  }

  function marcarErro(item, mensagem) {
    gravarFila(lerFila().map((i) => (i.colecao === item.colecao && i.id === item.id && i.versao === item.versao ? Object.assign({}, i, { erro: mensagem }) : i)));
  }

  /** Registros com alteração local ainda não enviada ("colecao|id"). */
  function pendentesLocais() {
    return new Set(lerFila().map((i) => `${i.colecao}|${i.id}`));
  }

  /** Versão atual do registro para enviar (null se não existe mais). */
  function registroAtual(item) {
    if (item.colecao === 'empresa') return store().empresa();
    if (item.colecao === 'configuracoes') return store().config();
    return store().obter(item.colecao, item.id);
  }

  /* ------------------------------ Envio e recebimento ------------------------------ */

  /**
   * Erros que interrompem a rodada (sem conexão, sem sessão). Recusas do
   * banco (regra, permissão) marcam só o item e a fila continua.
   */
  function erroGeral(e) {
    return e.offline || e.semSessao || e.naoConfigurado || e.status === 401;
  }

  async function enviarFila() {
    for (;;) {
      const item = lerFila().find((i) => !i.erro);
      if (!item) return;
      try {
        if (item.acao === 'substituir') {
          await cliente().rpc('importar_dados', { p_dados: store().exportar(), p_substituir: true });
        } else if (item.acao === 'remover') {
          await cliente().rpc('remover_registro', { p_colecao: item.colecao, p_id: item.id });
        } else {
          const reg = registroAtual(item);
          if (reg) await cliente().rpc('salvar_registro', { p_colecao: item.colecao, p_registro: reg });
        }
        concluirItem(item);
      } catch (e) {
        if (erroGeral(e)) throw e;
        // Erro só deste registro (ex.: regra do banco): marca e segue com os demais.
        marcarErro(item, e.message);
      }
    }
  }

  async function receber({ completo = false } = {}) {
    const estado = lerEstado();
    const desde = !completo && estado.ultimoRecebimento
      ? new Date(Date.parse(estado.ultimoRecebimento) - SOBREPOSICAO_MS).toISOString()
      : null;
    const remoto = await cliente().rpc('exportar_dados', { p_desde: desde });
    store().aplicarDoServidor(remoto, { completo: completo || !desde, preservar: pendentesLocais() });
    gravarEstado({ ultimoRecebimento: remoto.meta.servidorEm });
    return remoto;
  }

  /** Confere se o usuário logado foi liberado como membro da equipe. */
  async function conferirMembro() {
    const u = cliente().usuario();
    const linhas = await cliente().consultar(`membros?select=papel&user_id=eq.${encodeURIComponent(u.id)}`);
    if (!linhas || !linhas.length) {
      throw Object.assign(new Error(`O usuário ${u.email} ainda não foi liberado para acessar os dados da empresa. Peça a um administrador para incluí-lo na equipe.`), { naoMembro: true });
    }
    gravarEstado({ papel: linhas[0].papel, usuarioId: u.id });
    return linhas[0].papel;
  }

  /** Há dados digitados neste navegador (além do modelo em branco)? */
  function temDadosLocais() {
    const d = store().dados();
    if (!d) return false;
    if ((d.empresa && d.empresa.nome) || (d.indicadores || []).some((i) => i.meta !== null && i.meta !== undefined)) return true;
    return NS.core.schema.COLECOES.some((c) => c !== 'indicadores' && c !== 'log' && (d[c] || []).length > 0);
  }

  /** Primeira conexão deste navegador: decide entre baixar, enviar ou perguntar. */
  async function vincular() {
    await conferirMembro();
    const remoto = await cliente().rpc('exportar_dados', { p_desde: null });
    const bancoVazio = !remoto.empresa;
    if (temDadosLocais()) {
      publicar({ estado: 'escolha', mensagem: bancoVazio
        ? 'O banco ainda está vazio. Envie os dados deste navegador para começar a usar o banco.'
        : 'Este navegador tem dados que ainda não estão no banco. Escolha o que fazer.', bancoVazio });
      return;
    }
    if (bancoVazio) {
      // Banco novo e navegador sem dados: grava o modelo inicial (empresa, limites, indicadores).
      await cliente().rpc('importar_dados', { p_dados: store().exportar(), p_substituir: false });
      return finalizarVinculo();
    }
    store().aplicarDoServidor(remoto, { completo: true });
    gravarEstado({ ultimoRecebimento: remoto.meta.servidorEm });
    return finalizarVinculo(false);
  }

  async function finalizarVinculo(baixar = true) {
    gravarFila([]);
    if (baixar) await receber({ completo: true });
    gravarEstado({ vinculado: true, ultimaSincronizacao: new Date().toISOString() });
    publicar({ estado: 'sincronizado', mensagem: '' });
  }

  /* ------------------------------ Rodada de sincronização ------------------------------ */

  async function rodada() {
    if (!cliente().configurado()) return publicar({ estado: 'local', mensagem: '' });
    if (!cliente().sessao()) return publicar({ estado: lerEstado().vinculado ? 'desconectado' : 'local', mensagem: '' });
    if (raiz.navigator && raiz.navigator.onLine === false) return publicar({ estado: 'offline', mensagem: '' });
    if (status.estado === 'escolha') return publicar({});
    publicar({ estado: 'sincronizando', mensagem: '' });
    try {
      if (!lerEstado().vinculado) return await vincular();
      await enviarFila();
      await receber();
      gravarEstado({ ultimaSincronizacao: new Date().toISOString() });
      publicar({ estado: lerFila().some((i) => i.erro) ? 'erro' : 'sincronizado',
        mensagem: lerFila().some((i) => i.erro) ? 'Alguns registros não foram aceitos pelo banco.' : '' });
    } catch (e) {
      if (e.offline) publicar({ estado: 'offline', mensagem: '' });
      else if (e.semSessao) publicar({ estado: 'desconectado', mensagem: e.message });
      else publicar({ estado: 'erro', mensagem: e.message });
    }
  }

  /** Sincroniza agora (se já houver uma rodada em andamento, faz outra ao final). */
  function sincronizar() {
    if (emAndamento) { repetir = true; return emAndamento; }
    emAndamento = rodada().finally(() => {
      emAndamento = null;
      if (repetir) { repetir = false; agendar(0); }
    });
    return emAndamento;
  }

  function agendar(ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizar, ms);
  }

  /* ------------------------------ Ações do usuário ------------------------------ */

  /**
   * Migração: envia TODOS os dados deste navegador para o banco (mescla:
   * em cada registro vence a versão editada por último) e depois baixa
   * os dados completos do banco. Devolve o resumo por coleção.
   */
  async function enviarTudo() {
    await conferirMembro();
    publicar({ estado: 'sincronizando', mensagem: 'Enviando os dados deste navegador…' });
    try {
      const resumo = await cliente().rpc('importar_dados', { p_dados: store().exportar(), p_substituir: false });
      await finalizarVinculo();
      return resumo;
    } catch (e) {
      publicar({ estado: e.offline ? 'offline' : 'erro', mensagem: e.message });
      throw e;
    }
  }

  /** Descarta os dados deste navegador e usa os do banco. */
  async function usarDadosDoBanco() {
    await conferirMembro();
    publicar({ estado: 'sincronizando', mensagem: 'Baixando os dados do banco…' });
    try {
      gravarFila([]);
      await receber({ completo: true });
      await finalizarVinculo(false);
    } catch (e) {
      publicar({ estado: e.offline ? 'offline' : 'erro', mensagem: e.message });
      throw e;
    }
  }

  /** Esquece o vínculo deste navegador (a próxima conexão baixa tudo de novo). */
  function desvincular() {
    gravarFila([]);
    gravarJSON(CHAVE_ESTADO, {});
    publicar({ estado: cliente().sessao() ? 'sincronizando' : 'local', mensagem: '' });
  }

  /** Tira da fila os registros recusados pelo banco (ficam só neste navegador). */
  function descartarErros() {
    gravarFila(lerFila().filter((i) => !i.erro));
    publicar({ estado: 'sincronizado', mensagem: '' });
  }

  /** Volta a tentar os registros recusados (ex.: depois de corrigir o cadastro). */
  function tentarErrosDeNovo() {
    gravarFila(lerFila().map((i) => { const c = Object.assign({}, i); delete c.erro; return c; }));
    return sincronizar();
  }

  /* ------------------------------ Início ------------------------------ */

  /** Liga a sincronização. "novo": os dados locais acabaram de ser criados. */
  function iniciar({ novo = false } = {}) {
    // Sem dados locais (cache apagado), o vínculo antigo não vale mais.
    if (novo && lerEstado().vinculado) desvincular();

    NS.core.eventos.on('registro:alterado', (ev) => {
      if (lerEstado().vinculado) enfileirar(ev);
    });
    NS.core.eventos.on('dados:substituidos', (ev) => {
      if (ev.origem === 'usuario' && lerEstado().vinculado) enfileirar({ colecao: '*', acao: 'substituir' });
    });
    NS.core.eventos.on('sessao:alterada', () => {
      if (status.estado === 'escolha' && !cliente().sessao()) status.estado = 'local';
      agendar(0);
    });
    raiz.addEventListener('online', () => agendar(0));
    raiz.addEventListener('offline', () => publicar({ estado: 'offline', mensagem: '' }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') agendar(0);
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') sincronizar();
    }, INTERVALO_MS);
    publicar({});
    agendar(0);
  }

  NS.core.sincronizacao = {
    iniciar, sincronizar, enviarTudo, conferirMembro, usarDadosDoBanco, desvincular, descartarErros, tentarErrosDeNovo,
    status: () => status,
    fila: lerFila,
    estado: lerEstado,
    temDadosLocais
  };
})(typeof window !== 'undefined' ? window : globalThis);
