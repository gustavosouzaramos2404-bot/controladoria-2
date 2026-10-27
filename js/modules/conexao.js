/* ==========================================================================
   modules/conexao.js
   Conexão com o banco de dados (Supabase), na interface:
   - indicador de sincronização no rodapé da navegação (sincronizado, sem
     conexão, alterações aguardando envio, erro) com atalho para entrar;
   - tela de login ANTES de acessar os dados (quando o banco está
     configurado) e janela de login; na tela de login é possível criar
     uma conta (confirmada por código enviado ao e-mail), mas só membros
     da equipe, liberados pelo administrador, acessam os dados;
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
    // Não apaga o que está sendo digitado (ex.: e-mail a liberar) a cada rodada de sincronização.
    const digitando = bloco && bloco.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName);
    if (bloco && !digitando) bloco.innerHTML = String(painelHtml());
  }

  /* ------------------------------ Login ------------------------------ */

  /** Campos do formulário de login (usado na tela inicial e na janela). */
  function camposLoginHtml(cancelar) {
    const { html } = NS.ui;
    return html`
      <div class="campo"><label for="login-email">E-mail</label>
        <input type="email" id="login-email" name="email" autocomplete="username" required></div>
      <div class="campo"><label for="login-senha">Senha</label>
        <input type="password" id="login-senha" name="senha" autocomplete="current-password" required></div>
      <p class="caixa-alerta" data-login-erro role="alert" hidden></p>
      <div class="formulario-acoes">
        ${cancelar ? html`<button type="button" class="botao botao-secundario" data-fechar>Cancelar</button>` : ''}
        <button type="submit" class="botao botao-primario">Entrar</button>
      </div>`;
  }

  /**
   * Liga o envio do formulário: entra, confere se o usuário é membro da
   * equipe (se não for, sai de novo e explica) e chama aoEntrar(sessao).
   * Se o e-mail ainda não foi confirmado, chama naoConfirmado(email).
   */
  function ligarLogin(form, aoEntrar, naoConfirmado) {
    const caixaErro = form.querySelector('[data-login-erro]');
    const mostrarErro = (msg) => { caixaErro.textContent = msg; caixaErro.hidden = false; };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = form.email.value.trim();
      const senha = form.senha.value;
      if (!email || !senha) { mostrarErro('Preencha o e-mail e a senha.'); return; }
      const botao = form.querySelector('[type="submit"]');
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      try {
        const s = await cliente().entrar(email, senha);
        try {
          await sinc().conferirMembro();
        } catch (e) {
          await cliente().sair();
          throw e;
        }
        aoEntrar(s);
      } catch (e) {
        if (e.naoConfirmado && naoConfirmado) { naoConfirmado(email); return; }
        mostrarErro(e.message);
        form.senha.value = '';
        botao.disabled = false;
        botao.textContent = 'Entrar';
      }
    });
  }

  /**
   * Tela de login mostrada antes de qualquer dado (app.js chama quando o
   * banco está configurado e não há sessão neste navegador).
   */
  function telaLogin(el, { aoEntrar }) {
    const { html } = NS.ui;
    const semConexao = raiz.navigator && raiz.navigator.onLine === false;
    el.innerHTML = String(html`
      <div class="login">
        <section class="bloco login-cartao" aria-labelledby="login-titulo">
          <h1 id="login-titulo" tabindex="-1">Controladoria</h1>
          ${semConexao ? html`<p class="caixa-alerta">Sem conexão com a internet. O primeiro acesso neste navegador precisa de conexão; depois disso o sistema também funciona offline.</p>` : ''}
          <div data-login-etapa></div>
        </section>
      </div>`);
    const etapa = el.querySelector('[data-login-etapa]');

    /** Troca o conteúdo do cartão e liga os botões "data-ir" (entrar / criar). */
    function mostrar(titulo, conteudo) {
      document.title = `${titulo} · Controladoria`;
      etapa.innerHTML = String(conteudo);
      etapa.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => {
        const email = (etapa.querySelector('input[type="email"]') || {}).value;
        if (b.dataset.ir === 'criar') mostrarCriar();
        else if (b.dataset.ir === 'esqueci') mostrarEsqueci(email);
        else mostrarEntrar();
      }));
      const primeiro = etapa.querySelector('input');
      if (primeiro) primeiro.focus();
    }

    function mostrarEntrar(email) {
      mostrar('Entrar', html`
        <p class="subtitulo">Entre com seu usuário para acessar os dados da empresa.</p>
        <form class="formulario" novalidate data-login>${camposLoginHtml(false)}</form>
        <p class="nota">Ainda não tem conta? <button type="button" class="botao-link" data-ir="criar">Criar uma conta</button></p>
        <p class="nota">Esqueceu a senha? <button type="button" class="botao-link" data-ir="esqueci">Recuperar pelo e-mail</button></p>`);
      const form = etapa.querySelector('[data-login]');
      if (email) { form.email.value = email; form.senha.focus(); }
      ligarLogin(form, aoEntrar, (e) => mostrarCodigo(e, 'Sua conta ainda não foi confirmada. Digite o código enviado ao seu e-mail ou peça um novo.'));
    }

    function mostrarCriar() {
      mostrar('Criar conta', html`
        <p class="subtitulo">Crie sua conta. Enviaremos um código de confirmação para o seu e-mail.</p>
        <form class="formulario" novalidate data-criar>
          <div class="campo"><label for="criar-nome">Nome</label>
            <input type="text" id="criar-nome" name="nome" autocomplete="name" required></div>
          <div class="campo"><label for="criar-email">E-mail</label>
            <input type="email" id="criar-email" name="email" autocomplete="email" required></div>
          <div class="campo"><label for="criar-senha">Senha</label>
            <input type="password" id="criar-senha" name="senha" autocomplete="new-password" minlength="6" required>
            <p class="ajuda">Pelo menos 6 caracteres.</p></div>
          <div class="campo"><label for="criar-senha2">Repita a senha</label>
            <input type="password" id="criar-senha2" name="senha2" autocomplete="new-password" required></div>
          <p class="caixa-alerta" data-login-erro role="alert" hidden></p>
          <div class="formulario-acoes">
            <button type="button" class="botao botao-secundario" data-ir="entrar">Voltar</button>
            <button type="submit" class="botao botao-primario">Criar conta</button>
          </div>
        </form>`);
      const form = etapa.querySelector('[data-criar]');
      const caixaErro = form.querySelector('[data-login-erro]');
      const mostrarErro = (msg) => { caixaErro.textContent = msg; caixaErro.hidden = false; };
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nome = form.nome.value.trim();
        const email = form.email.value.trim();
        const senha = form.senha.value;
        if (!nome || !email || !senha) { mostrarErro('Preencha o nome, o e-mail e a senha.'); return; }
        if (!form.email.checkValidity()) { mostrarErro('E-mail inválido.'); return; }
        if (senha.length < 6) { mostrarErro('A senha precisa ter pelo menos 6 caracteres.'); return; }
        if (senha !== form.senha2.value) { mostrarErro('As senhas não conferem.'); return; }
        const botao = form.querySelector('[type="submit"]');
        botao.disabled = true;
        botao.textContent = 'Criando…';
        try {
          const r = await cliente().criarConta(email, senha, nome);
          if (r.sessao) await concluir();
          else mostrarCodigo(email);
        } catch (e) {
          mostrarErro(e.message);
          botao.disabled = false;
          botao.textContent = 'Criar conta';
        }
      });
    }

    function mostrarCodigo(email, aviso) {
      mostrar('Confirmar e-mail', html`
        <p class="subtitulo">Enviamos um código de confirmação para <strong>${email}</strong>. Digite-o abaixo para ativar sua conta.</p>
        ${aviso ? html`<p class="caixa-info">${aviso}</p>` : ''}
        <form class="formulario" novalidate data-codigo>
          <div class="campo"><label for="codigo">Código</label>
            <input type="text" id="codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></div>
          <p class="caixa-alerta" data-login-erro role="alert" hidden></p>
          <div class="formulario-acoes">
            <button type="button" class="botao botao-secundario" data-ir="entrar">Voltar</button>
            <button type="submit" class="botao botao-primario">Confirmar</button>
          </div>
        </form>
        <p class="nota">Não recebeu? Confira a caixa de spam ou <button type="button" class="botao-link" data-reenviar>envie o código de novo</button>.</p>
        <p class="nota" data-reenvio role="status"></p>`);
      const form = etapa.querySelector('[data-codigo]');
      const caixaErro = form.querySelector('[data-login-erro]');
      const mostrarErro = (msg) => { caixaErro.textContent = msg; caixaErro.hidden = false; };
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const codigo = form.codigo.value.replace(/\s+/g, '');
        if (!/^\d{6,10}$/.test(codigo)) { mostrarErro('Digite o código numérico recebido no e-mail.'); return; }
        const botao = form.querySelector('[type="submit"]');
        botao.disabled = true;
        botao.textContent = 'Confirmando…';
        try {
          await cliente().confirmarCodigo(email, codigo);
          await concluir();
        } catch (e) {
          mostrarErro(e.message);
          botao.disabled = false;
          botao.textContent = 'Confirmar';
        }
      });
      const reenviar = etapa.querySelector('[data-reenviar]');
      const situacao = etapa.querySelector('[data-reenvio]');
      reenviar.addEventListener('click', async () => {
        reenviar.disabled = true;
        situacao.textContent = 'Enviando…';
        try {
          await cliente().reenviarCodigo(email);
          situacao.textContent = 'Código enviado. Use o código mais recente.';
        } catch (e) {
          situacao.textContent = e.message;
        }
        reenviar.disabled = false;
      });
    }

    /** Esqueci a senha: pede o e-mail e envia o código de recuperação. */
    function mostrarEsqueci(email) {
      mostrar('Recuperar senha', html`
        <p class="subtitulo">Digite o e-mail da sua conta. Enviaremos um código para você criar uma nova senha.</p>
        <form class="formulario" novalidate data-esqueci>
          <div class="campo"><label for="esqueci-email">E-mail</label>
            <input type="email" id="esqueci-email" name="email" autocomplete="username" required></div>
          <p class="caixa-alerta" data-login-erro role="alert" hidden></p>
          <div class="formulario-acoes">
            <button type="button" class="botao botao-secundario" data-ir="entrar">Voltar</button>
            <button type="submit" class="botao botao-primario">Enviar código</button>
          </div>
        </form>`);
      const form = etapa.querySelector('[data-esqueci]');
      if (email) form.email.value = email;
      const caixaErro = form.querySelector('[data-login-erro]');
      const mostrarErro = (msg) => { caixaErro.textContent = msg; caixaErro.hidden = false; };
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const e = form.email.value.trim();
        if (!e || !form.email.checkValidity()) { mostrarErro('Digite um e-mail válido.'); return; }
        const botao = form.querySelector('[type="submit"]');
        botao.disabled = true;
        botao.textContent = 'Enviando…';
        try {
          await cliente().recuperarSenha(e);
          mostrarNovaSenha(e);
        } catch (erro) {
          mostrarErro(erro.message);
          botao.disabled = false;
          botao.textContent = 'Enviar código';
        }
      });
    }

    /** Código de recuperação + nova senha. */
    function mostrarNovaSenha(email) {
      mostrar('Nova senha', html`
        <p class="subtitulo">Se existir uma conta com <strong>${email}</strong>, enviamos um código para esse e-mail. Digite o código e a nova senha.</p>
        <form class="formulario" novalidate data-nova-senha>
          <div class="campo"><label for="rec-codigo">Código</label>
            <input type="text" id="rec-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></div>
          <div class="campo"><label for="rec-senha">Nova senha</label>
            <input type="password" id="rec-senha" name="senha" autocomplete="new-password" minlength="6" required>
            <p class="ajuda">Pelo menos 6 caracteres.</p></div>
          <div class="campo"><label for="rec-senha2">Repita a nova senha</label>
            <input type="password" id="rec-senha2" name="senha2" autocomplete="new-password" required></div>
          <p class="caixa-alerta" data-login-erro role="alert" hidden></p>
          <div class="formulario-acoes">
            <button type="button" class="botao botao-secundario" data-ir="entrar">Voltar</button>
            <button type="submit" class="botao botao-primario">Salvar nova senha</button>
          </div>
        </form>
        <p class="nota">Não recebeu? Confira a caixa de spam ou <button type="button" class="botao-link" data-ir="esqueci">peça outro código</button>.</p>`);
      const form = etapa.querySelector('[data-nova-senha]');
      const caixaErro = form.querySelector('[data-login-erro]');
      const mostrarErro = (msg) => { caixaErro.textContent = msg; caixaErro.hidden = false; };
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const codigo = form.codigo.value.replace(/\s+/g, '');
        const senha = form.senha.value;
        if (!/^\d{6,10}$/.test(codigo)) { mostrarErro('Digite o código numérico recebido no e-mail.'); return; }
        if (senha.length < 6) { mostrarErro('A senha precisa ter pelo menos 6 caracteres.'); return; }
        if (senha !== form.senha2.value) { mostrarErro('As senhas não conferem.'); return; }
        const botao = form.querySelector('[type="submit"]');
        botao.disabled = true;
        botao.textContent = 'Salvando…';
        try {
          await cliente().confirmarRecuperacao(email, codigo);
          await cliente().trocarSenha(senha);
          await concluir();
        } catch (e) {
          mostrarErro(e.message);
          botao.disabled = false;
          botao.textContent = 'Salvar nova senha';
        }
      });
    }

    /**
     * Conta confirmada (já com sessão): entra se o usuário for membro da
     * equipe; se ainda não for, sai e explica que falta a liberação.
     */
    async function concluir() {
      try {
        await sinc().conferirMembro();
      } catch (e) {
        const u = cliente().usuario();
        await cliente().sair();
        if (!e.naoMembro) { mostrarEntrar(u && u.email); return; }
        mostrar('Conta criada', html`
          <p class="caixa-info"><strong>Conta criada e e-mail confirmado.</strong></p>
          <p class="subtitulo">Para acessar os dados da empresa, um administrador precisa incluir ${u ? html`<strong>${u.email}</strong>` : 'seu usuário'} na equipe. Depois disso, é só entrar com seu e-mail e senha.</p>
          <div class="formulario-acoes"><button type="button" class="botao botao-primario" data-ir="entrar">Ir para o login</button></div>`);
        return;
      }
      aoEntrar(cliente().sessao());
    }

    mostrarEntrar();
  }

  /** Janela de login (para entrar sem sair da tela atual). */
  function abrirLogin() {
    const { html } = NS.ui;
    if (!cliente().configurado()) {
      NS.ui.avisar('O banco de dados não está configurado (js/core/config.js).', 'erro');
      return;
    }
    const conteudo = html`
      <form class="formulario" novalidate data-login>
        <p class="formulario-texto">Entre com o usuário criado pelo administrador.</p>
        ${camposLoginHtml(true)}
      </form>`;
    const janela = NS.ui.modal.abrir({ titulo: 'Entrar', conteudo });
    ligarLogin(janela.corpo.querySelector('[data-login]'), (s) => {
      janela.fechar();
      NS.ui.avisar(`Conectado como ${s.user.email}.`);
    });
  }

  async function sair() {
    const pend = sinc().fila().length;
    const ok = await NS.ui.modal.confirmar({
      titulo: 'Sair do banco de dados',
      mensagem: pend
        ? `Há ${plural(pend, 'alteração ainda não enviada', 'alterações ainda não enviadas')} ao banco. Elas ficam guardadas neste navegador e serão enviadas no próximo login. Você voltará para a tela de login.`
        : 'Você voltará para a tela de login.',
      rotuloConfirmar: 'Sair'
    });
    if (!ok) return;
    await cliente().sair(); // app.js volta para a tela de login (evento 'sessao:alterada')
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
      <p class="nota">"Enviar dados deste navegador" grava no banco tudo o que está aqui (útil na migração inicial ou para recuperar algo que ficou só neste computador). Em cada registro vale a versão editada por último.</p>
      ${papel === 'admin' ? equipeHtml() : ''}`;
  }

  /* ------------------------------ Equipe (só administrador) ------------------------------ */

  // Lista carregada do banco: null (ainda não carregou), array, ou { erro }.
  let equipe = null;
  let carregandoEquipe = false;

  async function carregarEquipe() {
    if (carregandoEquipe) return;
    carregandoEquipe = true;
    try {
      equipe = await cliente().rpc('listar_equipe');
    } catch (e) {
      const semFuncao = e.status === 404 || e.codigo === 'PGRST202';
      equipe = { erro: semFuncao
        ? 'A gestão da equipe ainda não foi instalada no banco. Aplique a migração supabase/migrations/20261027120000_equipe.sql no Supabase.'
        : e.message };
    }
    carregandoEquipe = false;
    atualizar();
  }

  function equipeHtml() {
    const { html } = NS.ui;
    if (equipe === null) {
      setTimeout(carregarEquipe, 0);
      return html`<h3>Equipe</h3><p class="nota">Carregando a equipe…</p>`;
    }
    const eu = (cliente().usuario() || {}).id;
    const situacao = (m) => {
      if (m.papel === 'admin') return 'Administrador';
      if (m.papel === 'membro') return 'Membro';
      return m.confirmado ? 'Aguardando liberação' : 'E-mail ainda não confirmado';
    };
    return html`
      <h3>Equipe</h3>
      <p class="nota">Cada pessoa entra com o próprio e-mail e senha. Quem cria a conta na tela de login só acessa os dados depois de liberado aqui.</p>
      ${equipe.erro ? html`<p class="caixa-alerta">${equipe.erro}</p>` : html`
        <div class="tabela-rolagem"><table class="tabela">
          <thead><tr><th scope="col">E-mail</th><th scope="col">Nome</th><th scope="col">Situação</th><th scope="col"><span class="visualmente-oculto">Ações</span></th></tr></thead>
          <tbody>${equipe.map((m) => html`<tr>
            <td>${m.email}</td><td>${m.nome || ''}</td><td>${situacao(m)}</td>
            <td>${m.user_id === eu ? html`<span class="suave">Você</span>` : m.papel
              ? html`<button type="button" class="botao botao-texto botao-pequeno" data-equipe-remover="${m.user_id}" data-email="${m.email}">Remover acesso</button>`
              : html`<button type="button" class="botao botao-secundario botao-pequeno" data-equipe-liberar="${m.email}">Liberar acesso</button>`}</td>
          </tr>`)}</tbody>
        </table></div>`}
      <form class="formulario" novalidate data-equipe-form>
        <div class="campo"><label for="equipe-email">Liberar pelo e-mail</label>
          <input type="email" id="equipe-email" name="email" autocomplete="off" required>
          <p class="ajuda">A pessoa precisa ter criado a conta na tela de login.</p></div>
        <div class="campo"><label for="equipe-papel">Papel</label>
          <select id="equipe-papel" name="papel"><option value="membro">Membro</option><option value="admin">Administrador</option></select></div>
        <div class="formulario-acoes">
          <button type="button" class="botao botao-texto" data-equipe-atualizar>Atualizar lista</button>
          <button type="submit" class="botao botao-primario">Liberar acesso</button>
        </div>
      </form>`;
  }

  async function liberar(email, papel = 'membro') {
    try {
      await cliente().rpc('liberar_membro', { p_email: email, p_papel: papel });
      NS.ui.avisar(`${email} liberado como ${papel === 'admin' ? 'administrador' : 'membro'}.`);
      equipe = null;
      atualizar();
    } catch (e) {
      NS.ui.avisar(e.message, 'erro');
    }
  }

  async function remover(id, email) {
    const ok = await NS.ui.modal.confirmar({
      titulo: 'Remover acesso',
      mensagem: `${email} deixará de acessar os dados da empresa. A conta continua existindo e pode ser liberada de novo.`,
      rotuloConfirmar: 'Remover acesso', perigo: true
    });
    if (!ok) return;
    try {
      await cliente().rpc('remover_membro', { p_user_id: id });
      NS.ui.avisar(`Acesso de ${email} removido.`);
      equipe = null;
      atualizar();
    } catch (e) {
      NS.ui.avisar(e.message, 'erro');
    }
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
      const lib = ev.target.closest('[data-equipe-liberar]');
      if (lib) liberar(lib.dataset.equipeLiberar);
      const rem = ev.target.closest('[data-equipe-remover]');
      if (rem) remover(rem.dataset.equipeRemover, rem.dataset.email);
      if (ev.target.closest('[data-equipe-atualizar]')) { equipe = null; atualizar(); }
    });
    document.addEventListener('submit', (ev) => {
      const form = ev.target.closest('[data-equipe-form]');
      if (!form) return;
      ev.preventDefault();
      const email = form.email.value.trim();
      if (!email || !form.email.checkValidity()) { NS.ui.avisar('Digite um e-mail válido.', 'erro'); return; }
      liberar(email, form.papel.value);
    });
    let anterior = null;
    NS.core.eventos.on('sincronia:status', (st) => {
      atualizar();
      if (st.estado === 'escolha' && anterior !== 'escolha') abrirEscolha();
      if (st.estado === 'erro' && anterior !== 'erro' && st.mensagem) NS.ui.avisar(st.mensagem, 'erro');
      anterior = st.estado;
    });
  }

  NS.modules.conexao = { iniciar, indicador, painelHtml, abrirLogin, telaLogin };
})(window);
