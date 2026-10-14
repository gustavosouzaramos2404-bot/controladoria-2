/* ==========================================================================
   core/supabase.js
   Cliente mínimo do Supabase (sem bibliotecas externas, para o sistema
   continuar abrindo offline):
   - login por e-mail e senha (Supabase Auth), com a sessão guardada neste
     navegador e renovada sozinha antes de expirar;
   - chamada das funções do banco (RPC) e consultas simples, sempre com o
     token do usuário (a RLS do banco decide o que cada um pode ver);
   - erros com mensagem em português e marcação de "sem conexão" (offline)
     ou "sessão encerrada", para a sincronização decidir o que fazer.
   Mudanças de sessão disparam o evento 'sessao:alterada'.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  const CHAVE_SESSAO = 'controladoria:sessao';
  const MARGEM_RENOVACAO_S = 90; // renova o token quando faltar menos que isso

  let renovando = null; // promessa da renovação em andamento (evita renovar duas vezes)

  const cfg = () => (NS.config && NS.config.supabase) || {};

  /** O banco está configurado (url e chave preenchidas em core/config.js)? */
  function configurado() {
    return Boolean(cfg().url && cfg().chavePublica);
  }

  /** Erro com a classificação usada pela sincronização. */
  function erro(mensagem, extra = {}) {
    return Object.assign(new Error(mensagem), extra);
  }

  /** Sessão salva (ou null). */
  function sessao() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null');
      return s && s.access_token ? s : null;
    } catch (e) {
      return null;
    }
  }

  function gravarSessao(s) {
    if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else localStorage.removeItem(CHAVE_SESSAO);
    NS.core.eventos.emit('sessao:alterada', { sessao: s });
  }

  /** Usuário logado: { id, email } ou null. */
  function usuario() {
    const s = sessao();
    return s && s.user ? { id: s.user.id, email: s.user.email } : null;
  }

  /** fetch com tratamento de falta de conexão. */
  async function requisitar(caminho, opcoes = {}) {
    if (!configurado()) throw erro('O banco de dados não está configurado (js/core/config.js).', { naoConfigurado: true });
    const cabecalhos = Object.assign({ apikey: cfg().chavePublica, 'Content-Type': 'application/json' }, opcoes.cabecalhos);
    let resposta;
    try {
      resposta = await fetch(cfg().url.replace(/\/$/, '') + caminho, {
        method: opcoes.metodo || 'GET',
        headers: cabecalhos,
        body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo)
      });
    } catch (e) {
      throw erro('Sem conexão com o banco de dados.', { offline: true });
    }
    const texto = await resposta.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch (e) { json = null; }
    if (!resposta.ok) {
      const msg = (json && (json.message || json.msg || json.error_description || json.error)) || `Erro ${resposta.status} no banco de dados.`;
      throw erro(msg, { status: resposta.status, codigo: json && (json.code || json.error_code), detalhe: json && (json.details || json.hint) });
    }
    return json;
  }

  /** Traduz as mensagens mais comuns do Supabase Auth. */
  function mensagemLogin(e) {
    if (e.offline) return 'Sem conexão. Verifique a internet e tente de novo.';
    const m = String(e.message || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'O e-mail ainda não foi confirmado. Abra o link enviado ao seu e-mail ou peça ao administrador para confirmar o usuário.';
    if (/too many|rate limit/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    return m || 'Não foi possível entrar.';
  }

  /** Guarda a sessão devolvida pelo Auth, calculando a expiração. */
  function aceitarSessao(dados) {
    const agoraS = Math.floor(Date.now() / 1000);
    const s = {
      access_token: dados.access_token,
      refresh_token: dados.refresh_token,
      expires_at: dados.expires_at || (agoraS + (dados.expires_in || 3600)),
      user: dados.user ? { id: dados.user.id, email: dados.user.email } : (sessao() || {}).user
    };
    gravarSessao(s);
    return s;
  }

  /** Entra com e-mail e senha. */
  async function entrar(email, senha) {
    try {
      const dados = await requisitar('/auth/v1/token?grant_type=password', { metodo: 'POST', corpo: { email, password: senha } });
      return aceitarSessao(dados);
    } catch (e) {
      throw erro(mensagemLogin(e), { offline: e.offline });
    }
  }

  /** Renova o token de acesso. Se o banco recusar, a sessão é encerrada. */
  function renovar() {
    if (renovando) return renovando;
    const atual = sessao();
    if (!atual) return Promise.reject(erro('Entre novamente para sincronizar.', { semSessao: true }));
    renovando = requisitar('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', corpo: { refresh_token: atual.refresh_token } })
      .then(aceitarSessao)
      .catch((e) => {
        if (!e.offline) {
          gravarSessao(null);
          throw erro('Sua sessão expirou. Entre novamente para sincronizar.', { semSessao: true });
        }
        throw e;
      })
      .finally(() => { renovando = null; });
    return renovando;
  }

  /** Token válido (renova se estiver perto de expirar). */
  async function token() {
    const s = sessao();
    if (!s) throw erro('Entre com seu usuário para sincronizar.', { semSessao: true });
    if (s.expires_at - MARGEM_RENOVACAO_S <= Date.now() / 1000) return (await renovar()).access_token;
    return s.access_token;
  }

  /** Requisição autenticada; renova o token e repete uma vez se ele tiver expirado. */
  async function autenticado(caminho, opcoes = {}) {
    const comToken = async () => requisitar(caminho, Object.assign({}, opcoes, {
      cabecalhos: Object.assign({ Authorization: `Bearer ${await token()}` }, opcoes.cabecalhos)
    }));
    try {
      return await comToken();
    } catch (e) {
      if (e.status === 401 && !opcoes.repetido) {
        await renovar();
        return autenticado(caminho, Object.assign({}, opcoes, { repetido: true }));
      }
      throw e;
    }
  }

  /** Chama uma função do banco (RPC). */
  function rpc(nome, parametros = {}) {
    return autenticado(`/rest/v1/rpc/${encodeURIComponent(nome)}`, { metodo: 'POST', corpo: parametros });
  }

  /** Consulta simples (GET na API REST), ex.: consultar('membros?select=papel'). */
  function consultar(caminho) {
    return autenticado(`/rest/v1/${caminho}`);
  }

  /** Sai: avisa o Auth (se houver conexão) e apaga a sessão deste navegador. */
  async function sair() {
    const s = sessao();
    gravarSessao(null);
    if (!s) return;
    try {
      await requisitar('/auth/v1/logout', { metodo: 'POST', cabecalhos: { Authorization: `Bearer ${s.access_token}` } });
    } catch (e) {
      // Sem conexão: a sessão local já foi apagada; o token expira sozinho.
    }
  }

  NS.core.supabase = { configurado, sessao, usuario, entrar, sair, renovar, rpc, consultar };
})(typeof window !== 'undefined' ? window : globalThis);
