/* ==========================================================================
   app.js
   Inicialização do sistema:
   - com o banco configurado, exige login (tela de login antes dos dados);
   - carrega os dados do navegador (no primeiro uso, o sistema começa vazio:
     nenhum dado é inventado, tudo é preenchido pelo usuário);
   - monta a navegação lateral e o menu recolhível das telas pequenas;
   - registra as rotas de cada módulo e renderiza a tela atual;
   - mantém em cache o contexto de cálculo (refeito só quando os dados mudam);
   - liga a sincronização com o banco (core/sincronizacao.js), se configurada.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  const { store, router, eventos, format: F } = NS.core;
  const { html, icone } = NS.ui;

  // Seções da navegação lateral (ordem do menu).
  const SECOES = [
    { id: 'painel', rotulo: 'Painel', icone: 'painel' },
    { id: 'cadastros', rotulo: 'Cadastros', icone: 'cadastros' },
    { id: 'custos', rotulo: 'Custos e produção', icone: 'custos' },
    { id: 'estoque', rotulo: 'Estoque e perdas', icone: 'estoque' },
    { id: 'contratos', rotulo: 'Contratos públicos', icone: 'contratos' },
    { id: 'orcamento', rotulo: 'Orçamento', icone: 'orcamento' },
    { id: 'caixa', rotulo: 'Caixa e capital de giro', icone: 'caixa' },
    { id: 'demonstracoes', rotulo: 'Demonstrações', icone: 'demonstracoes' },
    { id: 'controles', rotulo: 'Controles internos', icone: 'controles' },
    { id: 'planos', rotulo: 'Planos de ação', icone: 'planos' },
    { id: 'relatorios', rotulo: 'Relatórios', icone: 'relatorios' },
    { id: 'videoaula', rotulo: 'Videoaula', icone: 'videoaula' },
    { id: 'configuracoes', rotulo: 'Configurações', icone: 'configuracoes' }
  ];

  let cache = null; // { revisao, hoje, ctx }

  /** Contexto de cálculo atual (reaproveitado enquanto os dados não mudam). */
  function contexto() {
    const revisao = store.revisao();
    const hoje = NS.core.hoje();
    if (!cache || cache.revisao !== revisao || cache.hoje !== hoje) {
      cache = { revisao, hoje, ctx: NS.calc.contexto.criar(store.dados(), hoje) };
    }
    return cache.ctx;
  }

  /** Monta a navegação lateral. */
  function montarNavegacao() {
    const nav = document.getElementById('navegacao');
    const empresa = store.empresa();
    nav.innerHTML = String(html`
      <div class="navegacao-marca"><strong>Controladoria</strong><span>${empresa.nome || 'Empresa: preencha o cadastro'}</span></div>
      <ul class="navegacao-lista">
        ${SECOES.map((s) => html`<li><a class="navegacao-link" href="#/${s.id}" data-secao="${s.id}">${icone(s.icone)}<span>${s.rotulo}</span></a></li>`)}
      </ul>
      <div class="navegacao-rodape">Usuário: ${store.config().usuario || 'preencha em Configurações'}<br>Versão ${NS.versao}<div data-sincronia>${NS.modules.conexao.indicador()}</div></div>`);
  }

  /** Marca a seção atual e mostra o número de desvios críticos no Painel. */
  function atualizarNavegacao(secao) {
    const nav = document.getElementById('navegacao');
    for (const a of nav.querySelectorAll('.navegacao-link')) {
      if (a.dataset.secao === secao) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const linkPainel = nav.querySelector('[data-secao="painel"]');
    const antigo = linkPainel.querySelector('.navegacao-contador');
    if (antigo) antigo.remove();
    const criticos = contexto().alertas().filter((a) => a.gravidade === 'critico' && !a.dispensado).length;
    if (criticos) {
      linkPainel.insertAdjacentHTML('beforeend', String(html`<span class="navegacao-contador" aria-label="${criticos} desvios críticos">${criticos}</span>`));
    }
  }

  /** Renderiza a rota atual na área de conteúdo. */
  function renderizar(rota, info = {}) {
    const tela = document.getElementById('tela');
    const rolagem = raiz.scrollY;
    // Limpa os tratadores da tela anterior (cada tela define os seus).
    tela.onclick = null;
    tela.onchange = null;
    tela.oninput = null;
    tela.onsubmit = null;
    try {
      if (rota.tela) {
        rota.tela(tela, rota, contexto());
      } else {
        tela.innerHTML = String(html`${NS.modules.comum.cabecalho({ titulo: 'Página não encontrada' })}
          ${NS.ui.vazio('O endereço não corresponde a nenhuma tela do sistema.', { rotulo: 'Ir para o painel', rota: 'painel' })}`);
      }
    } catch (erro) {
      console.error(erro);
      tela.innerHTML = String(html`${NS.modules.comum.cabecalho({ titulo: 'Não foi possível mostrar esta tela' })}
        <p class="caixa-alerta">${erro.message}</p>
        <p>Tente voltar ao <a href="#/painel">painel</a>. Se o problema continuar, exporte um backup em Configurações.</p>`);
    }
    atualizarNavegacao(rota.secao);
    const h1 = tela.querySelector('h1');
    document.title = `${h1 ? h1.textContent.trim() : 'Controladoria'} · Controladoria`;
    if (info.navegou) {
      raiz.scrollTo(0, 0);
      if (info.evento && h1) h1.focus();
    } else {
      raiz.scrollTo(0, rolagem);
    }
    fecharMenu();
  }

  /* ------------------------- Menu em telas pequenas ------------------------- */

  function abrirMenu() {
    const nav = document.getElementById('navegacao');
    nav.classList.add('aberta');
    document.querySelector('.botao-menu').setAttribute('aria-expanded', 'true');
    let fundo = document.querySelector('.fundo-menu');
    if (!fundo) {
      fundo = document.createElement('div');
      fundo.className = 'fundo-menu';
      fundo.addEventListener('click', fecharMenu);
      document.body.appendChild(fundo);
    }
    const link = nav.querySelector('[aria-current="page"]') || nav.querySelector('a');
    if (link) link.focus();
  }

  function fecharMenu() {
    const nav = document.getElementById('navegacao');
    if (!nav.classList.contains('aberta')) return;
    nav.classList.remove('aberta');
    document.querySelector('.botao-menu').setAttribute('aria-expanded', 'false');
    const fundo = document.querySelector('.fundo-menu');
    if (fundo) fundo.remove();
  }

  /** Tela de recuperação quando os dados salvos não podem ser lidos. */
  function telaRecuperacao(erro) {
    const tela = document.getElementById('tela');
    tela.innerHTML = String(html`
      <div class="cabecalho-tela"><div><h1>Não foi possível ler os dados salvos</h1>
      <p class="subtitulo">O conteúdo guardado neste navegador está corrompido ou incompleto (${erro && erro.message ? erro.message : 'erro desconhecido'}).</p></div></div>
      <div class="bloco">
        <p>Você pode restaurar um backup JSON exportado anteriormente ou começar do zero (os dados ilegíveis serão descartados). Nenhuma das opções é feita sem a sua escolha.</p>
        <div class="grupo-botoes">
          <label class="botao botao-primario">${icone('upload')}Importar backup JSON<input type="file" accept="application/json,.json" data-importar hidden></label>
          <button type="button" class="botao botao-secundario" data-zerar>Começar do zero</button>
        </div>
      </div>`);
    tela.querySelector('[data-zerar]').addEventListener('click', async () => {
      const ok = await NS.ui.modal.confirmar({
        titulo: 'Começar do zero',
        mensagem: 'Os dados ilegíveis guardados neste navegador serão descartados e o sistema começará vazio.',
        rotuloConfirmar: 'Começar do zero', perigo: true
      });
      if (!ok) return;
      // Só neste navegador: o banco não é apagado; a próxima conexão baixa os dados de novo.
      store.apagarTudo([], { origem: 'sistema' });
      NS.core.sincronizacao.desvincular();
      location.reload();
    });
    tela.querySelector('[data-importar]').addEventListener('change', (ev) => {
      NS.modules.configuracoes.importarArquivo(ev.target.files[0], () => location.reload());
    });
  }

  /** Inicializa o sistema. */
  function iniciar() {
    // Link "pular para o conteúdo" sem alterar o hash (que é usado pelas rotas).
    document.querySelector('.pular').addEventListener('click', (ev) => {
      ev.preventDefault();
      const h1 = document.querySelector('#tela h1');
      (h1 || document.getElementById('conteudo')).focus();
    });
    document.querySelector('.botao-menu').addEventListener('click', () => {
      if (document.getElementById('navegacao').classList.contains('aberta')) fecharMenu(); else abrirMenu();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') fecharMenu();
    });

    if (!store.armazenamentoDisponivel()) {
      document.getElementById('tela').innerHTML = String(html`<div class="caixa-alerta"><strong>O armazenamento local do navegador está bloqueado.</strong> Libere o armazenamento de sites (localStorage) para este arquivo e recarregue a página. Sem ele, nada que você digitar será salvo.</div>`);
      return;
    }
    // Com o banco configurado, nada é mostrado antes do login. Quem já entrou
    // neste navegador continua com acesso offline (a sessão fica salva).
    const banco = NS.core.supabase;
    if (banco.configurado() && !banco.sessao()) {
      document.body.classList.add('modo-login');
      NS.modules.conexao.telaLogin(document.getElementById('tela'), { aoEntrar: () => location.reload() });
      return;
    }

    const carga = store.carregar();
    if (carga.erro) {
      document.getElementById('navegacao').innerHTML = '';
      telaRecuperacao(carga.erro);
      return;
    }
    if (carga.novo) {
      // Primeiro uso: estado vazio, com os indicadores estruturados e metas em branco.
      store.apagarTudo([], { origem: 'sistema' });
    }

    for (const modulo of Object.values(NS.modules)) {
      if (!modulo.rotas) continue;
      for (const [padrao, tela] of Object.entries(modulo.rotas)) router.registrar(padrao, tela);
    }
    montarNavegacao();
    router.configurar({ padrao: 'painel', renderizar });
    eventos.on('dados:alterados', () => {
      montarNavegacao();
      router.recarregar();
    });
    // Erros inesperados viram aviso legível (e ficam no console para diagnóstico).
    raiz.addEventListener('error', (ev) => {
      NS.ui.avisar(`Algo deu errado: ${ev.message}`, 'erro');
    });
    router.iniciar();
    NS.modules.conexao.iniciar();
    // Saiu ou a sessão expirou: volta para a tela de login (pendências ficam guardadas).
    eventos.on('sessao:alterada', (ev) => {
      if (banco.configurado() && !ev.sessao) location.reload();
    });
    NS.core.sincronizacao.iniciar({ novo: Boolean(carga.novo) });
  }

  NS.app = { SECOES, contexto, renderizar, formatar: F };
  iniciar();
})(window);
