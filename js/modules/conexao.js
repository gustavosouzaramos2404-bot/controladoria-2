/* ==========================================================================
   modules/conexao.js
   Conexão com o banco de dados (Supabase), na interface:
   - indicador de sincronização no rodapé da navegação (sincronizado, sem
     conexão, alterações aguardando envio, erro) com atalho para entrar;
   - janela de login (e-mail e senha; usuários são criados pelo
     administrador no painel do Supabase);
   - escolha na primeira conexão: enviar os dados deste navegador para o
     banco (migração) ou usar os dados do banco;
   - bloco "Banco de dados" em Configurações: status, pendências recusadas,
     sincronizar agora, enviar todos os dados e sair.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  const sinc = () => NS.core.sincronizacao;
  const cliente = () => NS.core.supabase;

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

  /** Texto curto e ação do indicador, conforme o estado. */
  function resumo(st) {
    const aguardando = st.pendentes ? ` · ${plural(st.pendentes, 'alteração aguardando envio', 'alterações aguardando envio')}` : '';
    switch (st.estado) {
      case 'sincronizado': return { cor: 'dentro', texto: `Sincronizado às ${hora(st.ultima)}${aguardando}` };
      case 'sincronizando': return { cor: 'acento', texto: st.mensagem || 'Sincronizando…' };
      case 'offline': return { cor: 'atencao', texto: `Sem conexão: trabalhando offline${aguardando}` };
      case 'desconectado': return { cor: 'atencao', texto: `Desconectado do banco${aguardando}`, acao: 'entrar', rotulo: 'Entrar' };
      case 'escolha': return { cor: 'atencao', texto: 'Aguardando sua escolha sobre os dados', acao: 'escolher', rotulo: 'Escolher' };
      case 'erro': return { cor: 'fora', texto: 'Erro na sincronização', acao: 'detalhes', rotulo: 'Ver detalhes' };
      default: return cliente().configurado()
        ? { cor: 'neutro', texto: 'Dados só neste navegador', acao: 'entrar', rotulo: 'Conectar ao banco' }
        : { cor: 'neutro', texto: 'Dados só neste navegador' };
    }
  }

  /** HTML do indicador do rodapé da navegação. */
  function indicador() {
    const { html } = NS.ui;
    const r = resumo(sinc().status());
    return html`<span class="sincronia sincronia-${r.cor}" role="status">
      <span class="sincronia-ponto" aria-hidden="true"></span><span>${r.texto}</span>
      ${r.acao ? html`<button type="button" class="botao-link" data-sinc-acao="${r.acao}">${r.rotulo}</button>` : ''}
    </span>`;
  }

  /** Atualiza o indicador e o bloco de Configurações (se estiverem na tela). */
  function atualizar() {
    const alvo = document.querySelector('[data-sincronia]');
    if (alvo) alvo.innerHTML = String(indicador());
    const bloco = document.querySelector('[data-slot="banco"]');
    if (bloco) bloco.innerHTML = String(painelHtml());
  }

  /* ------------------------------ Login ------------------------------ */

  function abrirLogin() {
    const { html } = NS.ui;
    if (!cliente().configurado()) {
      NS.ui.avisar('O banco de dados não está configurado (js/core/config.js).', 'erro');
      return;
    }
    const conteudo = html`
      <form class="formulario" novalidate data-login>
        <p class="formulario-texto">Entre com o usuário criado pelo administrador. Seus dados continuam neste navegador e passam a ser salvos também no banco da empresa.</p>
        <div class="campo"><label for="login-email">E-mail</label>
          <input type="email" id="login-email" name="email" autocomplete="username" required></div>
        <div class="campo"><label for="login-senha">Senha</label>
          <input type="password" id="login-senha" name="senha" autocomplete="current-password" required></div>
        <p class="caixa-alerta" data-login-erro hidden></p>
        <div class="formulario-acoes">
          <button type="button" class="botao botao-secundario" data-fechar>Cancelar</button>
          <button type="submit" class="botao botao-primario">Entrar</button>
        </div>
      </form>`;
    const janela = NS.ui.modal.abrir({ titulo: 'Conectar ao banco de dados', conteudo });
    const form = janela.corpo.querySelector('[data-login]');
    const caixaErro = form.querySelector('[data-login-erro]');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = form.email.value.trim();
      const senha = form.senha.value;
      if (!email || !senha) {
        caixaErro.textContent = 'Preencha o e-mail e a senha.';
        caixaErro.hidden = false;
        return;
      }
      const botao = form.querySelector('[type="submit"]');
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      try {
        const s = await cliente().entrar(email, senha);
        janela.fechar();
        NS.ui.avisar(`Conectado como ${s.user.email}.`);
      } catch (e) {
        caixaErro.textContent = e.message;
        caixaErro.hidden = false;
        botao.disabled = false;
        botao.textContent = 'Entrar';
      }
    });
  }

  async function sair() {
    const pend = sinc().fila().length;
    const ok = await NS.ui.modal.confirmar({
      titulo: 'Sair do banco de dados',
      mensagem: pend
        ? `Há ${plural(pend, 'alteração ainda não enviada', 'alterações ainda não enviadas')} ao banco. Elas ficam guardadas neste navegador e serão enviadas no próximo login.`
        : 'Os dados continuam neste navegador. Para sincronizar de novo, basta entrar outra vez.',
      rotuloConfirmar: 'Sair'
    });
    if (!ok) return;
    await cliente().sair();
    NS.ui.avisar('Você saiu do banco de dados. Os dados continuam neste navegador.', 'info');
  }

  /* ------------------------------ Escolha na primeira conexão ------------------------------ */

  let escolhaAberta = false;

  function abrirEscolha() {
    const { html } = NS.ui;
    if (escolhaAberta) return;
    const st = sinc().status();
    escolhaAberta = true;
    const conteudo = html`
      <p>${st.mensagem}</p>
      <ul class="lista-opcoes">
        <li><strong>Enviar os dados deste navegador para o banco</strong>: tudo o que está aqui é gravado no banco${st.bancoVazio ? '' : ' e mesclado com o que já existe (em cada registro, vale a versão editada por último)'}. Recomendado na migração inicial.</li>
        ${st.bancoVazio ? '' : html`<li><strong>Usar os dados do banco</strong>: os dados deste navegador são substituídos pelos do banco. Exporte um backup antes se quiser guardá-los.</li>`}
      </ul>
      <div class="formulario-acoes">
        <button type="button" class="botao botao-secundario" data-fechar>Decidir depois</button>
        ${st.bancoVazio ? '' : html`<button type="button" class="botao botao-secundario" data-escolha="banco">Usar os dados do banco</button>`}
        <button type="button" class="botao botao-primario" data-escolha="enviar">Enviar dados para o banco</button>
      </div>`;
    const janela = NS.ui.modal.abrir({ titulo: 'Dados deste navegador', conteudo, aoFechar: () => { escolhaAberta = false; } });
    janela.corpo.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-escolha]');
      if (!b) return;
      if (b.dataset.escolha === 'banco') {
        const ok = await NS.ui.modal.confirmar({
          titulo: 'Usar os dados do banco',
          mensagem: 'Os dados deste navegador serão substituídos pelos dados do banco. Esta ação não pode ser desfeita.',
          rotuloConfirmar: 'Usar os dados do banco', perigo: true, textoExigido: 'usar dados do banco'
        });
        if (!ok) return;
      }
      janela.fechar();
      if (b.dataset.escolha === 'enviar') await enviarTudo();
      else {
        try {
          await sinc().usarDadosDoBanco();
          NS.ui.avisar('Dados do banco carregados neste navegador.');
        } catch (e) {
          NS.ui.avisar(e.message, 'erro');
        }
      }
    });
  }

  /** Migração: envia tudo o que está neste navegador para o banco. */
  async function enviarTudo() {
    try {
      const resumoColecoes = await sinc().enviarTudo();
      const total = Object.values(resumoColecoes || {}).reduce((s, r) => s + (r.salvos || 0), 0);
      NS.ui.avisar(`${plural(total, 'registro enviado', 'registros enviados')} para o banco.`);
    } catch (e) {
      NS.ui.avisar(e.message, 'erro');
    }
  }

  /* ------------------------------ Bloco em Configurações ------------------------------ */

  function painelHtml() {
    const { html, icone } = NS.ui;
    if (!cliente().configurado()) {
      return html`<p class="texto-leitura">O banco de dados não está configurado. Os dados ficam só neste navegador.</p>`;
    }
    const st = sinc().status();
    const u = cliente().usuario();
    if (!u) {
      return html`
        <p class="texto-leitura">Conecte-se para salvar os dados no banco da empresa e trabalhar em equipe. Sem conexão, o sistema continua funcionando neste navegador e envia as alterações quando a conexão voltar.</p>
        ${st.pendentes ? html`<p class="nota">${plural(st.pendentes, 'alteração aguarda', 'alterações aguardam')} o próximo login para ser enviada(s).</p>` : ''}
        <div class="grupo-botoes"><button type="button" class="botao botao-primario" data-sinc-acao="entrar">Conectar ao banco</button></div>`;
    }
    const papel = sinc().estado().papel;
    const recusados = sinc().fila().filter((i) => i.erro);
    const r = resumo(st);
    return html`
      <dl class="lista-definicao">
        <dt>Usuário</dt><dd>${u.email}${papel ? ` (${papel === 'admin' ? 'administrador' : 'membro'})` : ''}</dd>
        <dt>Situação</dt><dd><span class="sincronia sincronia-${r.cor}"><span class="sincronia-ponto" aria-hidden="true"></span>${r.texto}</span></dd>
        <dt>Última sincronização</dt><dd>${dataHora(st.ultima)}</dd>
        <dt>Aguardando envio</dt><dd>${plural(st.pendentes, 'alteração', 'alterações')}</dd>
      </dl>
      ${st.estado === 'erro' && st.mensagem ? html`<p class="caixa-alerta">${st.mensagem}</p>` : ''}
      ${recusados.length ? html`
        <h3>Registros recusados pelo banco</h3>
        <p class="nota">Continuam salvos neste navegador. Corrija o cadastro e tente de novo, ou tire da fila para mantê-los só aqui.</p>
        <ul>${recusados.map((i) => html`<li><strong>${i.colecao}</strong> ${i.id}: ${i.erro}</li>`)}</ul>
        <div class="grupo-botoes">
          <button type="button" class="botao botao-secundario botao-pequeno" data-sinc-acao="tentar">Tentar de novo</button>
          <button type="button" class="botao botao-texto botao-pequeno" data-sinc-acao="descartar">Tirar da fila</button>
        </div>` : ''}
      <div class="grupo-botoes">
        ${st.estado === 'escolha' ? html`<button type="button" class="botao botao-primario" data-sinc-acao="escolher">Escolher o que fazer com os dados</button>` : ''}
        <button type="button" class="botao botao-secundario" data-sinc-acao="sincronizar">Sincronizar agora</button>
        <button type="button" class="botao botao-secundario" data-sinc-acao="enviar-tudo">${icone('upload')}Enviar dados deste navegador para o banco</button>
        <button type="button" class="botao botao-texto" data-sinc-acao="sair">Sair</button>
      </div>
      <p class="nota">"Enviar dados deste navegador" grava no banco tudo o que está aqui (útil na migração inicial ou para recuperar algo que ficou só neste computador). Em cada registro vale a versão editada por último.</p>`;
  }

  /* ------------------------------ Ações (cliques em qualquer tela) ------------------------------ */

  async function executar(acao) {
    if (acao === 'entrar') abrirLogin();
    else if (acao === 'escolher') abrirEscolha();
    else if (acao === 'detalhes') NS.core.router.ir('configuracoes');
    else if (acao === 'sair') await sair();
    else if (acao === 'sincronizar') await sinc().sincronizar();
    else if (acao === 'enviar-tudo') {
      const ok = await NS.ui.modal.confirmar({
        titulo: 'Enviar dados deste navegador',
        mensagem: 'Todos os registros deste navegador serão gravados no banco. Onde o banco tiver uma versão mais recente de um registro, ela é mantida.',
        rotuloConfirmar: 'Enviar dados para o banco'
      });
      if (ok) await enviarTudo();
    } else if (acao === 'tentar') await sinc().tentarErrosDeNovo();
    else if (acao === 'descartar') sinc().descartarErros();
  }

  /** Liga os eventos (chamado uma vez pelo app). */
  function iniciar() {
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-sinc-acao]');
      if (b) executar(b.dataset.sincAcao);
    });
    let anterior = null;
    NS.core.eventos.on('sincronia:status', (st) => {
      atualizar();
      if (st.estado === 'escolha' && anterior !== 'escolha') abrirEscolha();
      if (st.estado === 'erro' && anterior !== 'erro' && st.mensagem) NS.ui.avisar(st.mensagem, 'erro');
      anterior = st.estado;
    });
  }

  NS.modules.conexao = { iniciar, indicador, painelHtml, abrirLogin };
})(window);
