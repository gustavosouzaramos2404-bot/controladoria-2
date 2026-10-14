/* ==========================================================================
   modules/configuracoes.js
   Configurações do sistema:
   - usuário (nome que aparece no log) e critério de rateio do CIF;
   - metas e tolerâncias de cada indicador (toda mudança vai para o log
     com justificativa);
   - limites dos alertas (seção 6);
   - banco de dados: login, status da sincronização e envio dos dados deste
     navegador (bloco montado por modules/conexao.js);
   - backup: exportar JSON, importar JSON (com validação de esquema antes de
     substituir) e apagar todos os dados (com confirmação digitada).
   Metas em branco aparecem como "a definir": nada é preenchido pelo sistema.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  // Limites de alerta editáveis: [chave, rótulo, tipo, ajuda]
  const LIMITES = [
    ['defasagemAtencao', 'Defasagem de custo: atenção a partir de', 'pct', 'Padrão: 5%.'],
    ['defasagemCritico', 'Defasagem de custo: crítico a partir de', 'pct', 'Padrão: 10%.'],
    ['margemMinimaContrato', 'Margem mínima do contrato', 'pct', 'Padrão: 15%.'],
    ['aniversarioAvisoDias', 'Aviso antes do aniversário da data-base (dias)', 'inteiro', 'Padrão: 30 dias.'],
    ['aniversarioJanelaDepois', 'Manter o aviso depois do aniversário (dias)', 'inteiro', 'Padrão: 60 dias.'],
    ['vigenciaAtencaoDias', 'Vigência terminando: atenção (dias)', 'inteiro', 'Padrão: 60 dias.'],
    ['vigenciaCriticoDias', 'Vigência terminando: crítico (dias)', 'inteiro', 'Padrão: 30 dias.'],
    ['saldoAtaPct', 'Saldo da ata baixo (até)', 'pct', 'Padrão: 20% do valor registrado.'],
    ['garantiaDias', 'Garantia contratual vencendo (dias)', 'inteiro', 'Padrão: 30 dias.'],
    ['documentoDias', 'Documento de habilitação vencendo (dias)', 'inteiro', 'Padrão: 15 dias.'],
    ['insumoVencimentoDias', 'Insumo próximo do vencimento (dias)', 'inteiro', 'Padrão: 7 dias.'],
    ['produtoVencimentoDias', 'Produto acabado próximo do vencimento (dias)', 'inteiro', 'Padrão: 15 dias.'],
    ['rendimentoToleranciaCritico', 'Rendimento: crítico quando abaixo da meta em', 'pct', 'Em pontos percentuais. Padrão: 3.'],
    ['variacaoOrcamentariaPct', 'Variação orçamentária desfavorável acima de', 'pct', 'Padrão: 10% (acima do dobro é crítico).'],
    ['caixaSemanas', 'Semanas da projeção de caixa', 'inteiro', 'Padrão: 13 semanas.']
  ];

  /** Converte a tolerância/meta para exibição e edição na unidade do indicador. */
  function tipoCampo(ind) {
    return ind.unidade === 'pct' ? 'pct' : (ind.unidade === 'moeda' ? 'moeda' : 'numero');
  }

  /** Abre a edição de meta e tolerâncias de um indicador (com justificativa no log). */
  function editarIndicador(id) {
    const store = NS.core.store;
    const F = NS.core.format;
    const C = NS.modules.comum;
    const { html } = NS.ui;
    const ind = store.obter('indicadores', id);
    if (!ind) return;
    const tipo = tipoCampo(ind);
    const sufixo = ind.unidade === 'pct' ? ' (em pontos percentuais)' : '';
    NS.ui.abrirFormulario({
      titulo: `Meta e tolerâncias: ${ind.nome}`,
      introducao: html`<p class="formula">${ind.formula}</p><p class="nota">${C.textoFaixas(ind)}</p>`,
      campos: [
        { nome: 'meta', rotulo: 'Meta', tipo, obrigatorio: true, largura: 'terco' },
        { nome: 'toleranciaAtencao', rotulo: `Tolerância até atenção${sufixo}`, tipo, obrigatorio: true, min: 0, largura: 'terco', ajuda: 'Desvio desfavorável aceito como "dentro".' },
        { nome: 'toleranciaFora', rotulo: `Tolerância até fora${sufixo}`, tipo, obrigatorio: true, min: 0, largura: 'terco',
          validar: (v, t) => (v !== null && t.toleranciaAtencao !== null && v < t.toleranciaAtencao ? 'A tolerância de fora deve ser maior ou igual à de atenção.' : null) },
        { nome: 'sentido', rotulo: 'Sentido', tipo: 'select', obrigatorio: true, largura: 'meia', opcoes: [{ valor: 'maior-melhor', rotulo: 'Quanto maior, melhor' }, { valor: 'menor-melhor', rotulo: 'Quanto menor, melhor' }] },
        { nome: 'controlavel', rotulo: 'Controlável pelo responsável?', tipo: 'select', obrigatorio: true, largura: 'meia', opcoes: C.opcoes({ sim: 'Sim', parcial: 'Parcialmente', nao: 'Não' }) },
        { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto', obrigatorio: true, largura: 'meia' },
        { nome: 'periodicidade', rotulo: 'Periodicidade', tipo: 'texto', largura: 'meia' },
        { nome: 'acaoSugerida', rotulo: 'Ação sugerida', tipo: 'textarea' },
        { nome: 'justificativa', rotulo: 'Justificativa da alteração', tipo: 'textarea', obrigatorio: true, ajuda: 'Fica registrada no log, com autor e data.' }
      ],
      valores: ind,
      rotuloSalvar: 'Salvar meta',
      mensagemSucesso: 'Meta salva.',
      aoSalvar: (v) => {
        const { justificativa, ...campos } = v;
        const fmt = (x) => F.porUnidade(x, ind.unidade);
        const mudancas = [];
        if (campos.meta !== ind.meta) mudancas.push(`meta de ${ind.meta === null ? 'a definir' : fmt(ind.meta)} para ${fmt(campos.meta)}`);
        if (campos.toleranciaAtencao !== ind.toleranciaAtencao) mudancas.push(`tolerância de atenção de ${C.textoTolerancia(ind, 'toleranciaAtencao')} para ${F.diferenca(campos.toleranciaAtencao, ind.unidade)}`);
        if (campos.toleranciaFora !== ind.toleranciaFora) mudancas.push(`tolerância de fora de ${C.textoTolerancia(ind, 'toleranciaFora')} para ${F.diferenca(campos.toleranciaFora, ind.unidade)}`);
        store.emLote(() => {
          store.atualizar('indicadores', id, campos);
          NS.core.log.registrar({
            entidade: 'indicadores', entidadeId: id, tipo: 'alteracao',
            descricao: `${ind.nome}: ${mudancas.length ? mudancas.join('; ') : 'dados do indicador atualizados'}.`, justificativa
          });
        });
        return true;
      }
    });
  }

  /**
   * Com o banco conectado, substituir todos os dados vale para a equipe
   * inteira: só administrador. Devolve true se pode seguir.
   */
  function podeSubstituirTudo() {
    const st = NS.core.sincronizacao.estado();
    if (!st.vinculado || st.papel === 'admin') return true;
    NS.ui.avisar('Com o banco conectado, só um administrador pode importar backup ou apagar todos os dados.', 'erro');
    return false;
  }

  /**
   * Lê um arquivo de backup, valida o esquema e só então pergunta se pode
   * substituir os dados atuais. Nada é alterado se houver erro.
   */
  function importarArquivo(arquivo, aoConcluir) {
    const store = NS.core.store;
    const { html } = NS.ui;
    if (!arquivo || !podeSubstituirTudo()) return;
    const leitor = new FileReader();
    leitor.onerror = () => NS.ui.avisar('Não foi possível ler o arquivo escolhido.', 'erro');
    leitor.onload = async () => {
      let dados;
      try {
        dados = JSON.parse(String(leitor.result).replace(/^﻿/, ''));
      } catch (e) {
        NS.ui.avisar('O arquivo não é um JSON válido. Escolha um backup exportado pelo Controladoria.', 'erro');
        return;
      }
      let validacao;
      try {
        if (!dados || typeof dados !== 'object' || !dados.meta) throw new Error('O arquivo não tem a identificação de versão (meta).');
        const copia = store.normalizar(store.migrar(store.clonar(dados)));
        validacao = NS.core.schema.validarBackup(copia);
      } catch (e) {
        validacao = { ok: false, erros: [e.message] };
      }
      if (!validacao.ok) {
        NS.ui.modal.abrir({
          titulo: 'Backup não importado',
          conteudo: html`<p class="caixa-alerta">O arquivo "${arquivo.name}" tem problemas e nenhum dado foi alterado.</p>
            <ul>${validacao.erros.map((e) => html`<li>${e}</li>`)}</ul>
            <div class="formulario-acoes"><button type="button" class="botao botao-primario" data-fechar>Entendi</button></div>`
        });
        return;
      }
      const total = (d) => NS.core.schema.COLECOES.reduce((s, c) => s + ((d && d[c]) || []).length, 0);
      const ok = await NS.ui.modal.confirmar({
        titulo: 'Importar backup',
        mensagem: `O arquivo "${arquivo.name}" é válido (${total(dados)} registros). Importar backup substitui todos os dados atuais (${total(store.dados())} registros). Se quiser guardar os atuais, exporte um backup antes.`,
        rotuloConfirmar: 'Importar backup',
        perigo: true
      });
      if (!ok) return;
      store.substituirTudo(dados);
      NS.ui.avisar('Backup importado.');
      if (aoConcluir) aoConcluir();
    };
    leitor.readAsText(arquivo, 'utf-8');
  }

  /** Exporta todos os dados em JSON (nome com data e hora). */
  function exportarJSON() {
    const conteudo = JSON.stringify(NS.core.store.exportar(), null, 2);
    NS.ui.baixarArquivo(`controladoria_backup_${NS.ui.carimboArquivo()}.json`, conteudo, 'application/json;charset=utf-8');
    NS.ui.avisar('Backup JSON exportado.');
  }

  /** Renderiza a tela de configurações. */
  function tela(el, rota, ctx) {
    const { html, icone, status } = NS.ui;
    const F = NS.core.format;
    const C = NS.modules.comum;
    const store = NS.core.store;
    const config = store.config();
    const tamanhoKB = Math.round(JSON.stringify(store.dados()).length / 1024);
    const conectado = Boolean(NS.core.sincronizacao.estado().vinculado);
    const avaliacoes = new Map(ctx.avaliacoes(ctx.competencia).map((a) => [a.indicador.id, a]));

    el.innerHTML = String(html`
      ${C.cabecalho({ titulo: 'Configurações', subtitulo: 'Metas, tolerâncias, limites dos alertas, backup e manutenção dos dados.' })}
      <section class="bloco" id="banco"><div class="bloco-cabecalho"><h2>Banco de dados</h2>
        <p>Os dados ficam neste navegador e, com login, são sincronizados com o banco da empresa (Supabase).</p></div>
        <div data-slot="banco">${NS.modules.conexao.painelHtml()}</div></section>
      <section class="bloco"><div class="bloco-cabecalho"><h2>Preferências</h2></div><div data-slot="pref"></div></section>
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Metas e tolerâncias dos indicadores</h2>
          <p>Preencha a meta, as tolerâncias e o responsável de cada indicador. Sem meta, o painel mostra "Sem meta". Alterações exigem justificativa e ficam no log.</p></div>
        <div data-slot="metas"></div>
      </section>
      <section class="bloco"><div class="bloco-cabecalho"><h2>Limites dos alertas</h2>
        <p>Usados pela Central de desvios. A meta de perdas é a do indicador "Índice de perdas".</p></div><div data-slot="limites"></div></section>
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Backup e dados</h2>
          <p>Cópia local neste navegador: ${F.numero(tamanhoKB)} KB usados de cerca de 5 MB. Faça backup com frequência.</p>
          ${conectado ? html`<p class="nota">Com o banco conectado, importar um backup ou apagar todos os dados também substitui os dados do banco para toda a equipe (somente administrador).</p>` : ''}</div>
        <div class="grade-2">
          <div>
            <h3>Backup</h3>
            <p class="texto-leitura">O JSON exportado contém todos os dados e pode ser reimportado neste ou em outro computador.</p>
            <div class="grupo-botoes">
              <button type="button" class="botao botao-primario" data-acao="exportar">${icone('download')}Exportar backup JSON</button>
              <label class="botao botao-secundario">${icone('upload')}Importar backup JSON<input type="file" accept="application/json,.json" data-acao="importar" class="visualmente-oculto"></label>
            </div>
            <p class="nota">A importação valida o arquivo antes de substituir qualquer dado.</p>
          </div>
          <div>
            <h3>Manutenção</h3>
            <p class="texto-leitura">Apaga todos os registros deste navegador e volta ao modelo em branco. Exporte um backup antes se quiser guardar os dados.</p>
            <div class="grupo-botoes">
              <button type="button" class="botao botao-perigo" data-acao="apagar-tudo">${icone('excluir')}Apagar todos os dados</button>
            </div>
          </div>
        </div>
      </section>`);

    // Preferências
    const pref = NS.ui.formulario({
      campos: [
        { nome: 'usuario', rotulo: 'Seu nome ou cargo', tipo: 'texto', obrigatorio: true, largura: 'meia', ajuda: 'Aparece como autor no log de exceções e alterações.' },
        { nome: 'criterioRateioCIF', rotulo: 'Critério de rateio do CIF', tipo: 'select', obrigatorio: true, largura: 'meia',
          opcoes: [{ valor: 'horas', rotulo: 'Horas de produção do lote' }, { valor: 'kg', rotulo: 'Quilos produzidos' }],
          ajuda: 'Distribui os custos fixos de produção do mês entre os lotes.' }
      ],
      valores: config, rotuloSalvar: 'Salvar preferências', aoCancelar: null,
      aoSalvar: (v) => {
        store.emLote(() => {
          if (v.criterioRateioCIF !== config.criterioRateioCIF) {
            NS.core.log.registrar({ entidade: 'configuracoes', tipo: 'alteracao', descricao: `Critério de rateio do CIF alterado para ${v.criterioRateioCIF === 'kg' ? 'quilos produzidos' : 'horas de produção'}.` });
          }
          store.atualizarConfig(v);
        });
        NS.ui.avisar('Preferências salvas.');
        return true;
      }
    });

    // Metas dos indicadores
    const metas = NS.ui.tabela({
      legenda: 'Metas e tolerâncias dos indicadores', csv: 'metas_indicadores', porPagina: 30,
      linhas: ctx.dados.indicadores,
      colunas: [
        { chave: 'nome', rotulo: 'Indicador' },
        { chave: 'perspectiva', rotulo: 'Perspectiva', exibir: (l) => C.ROTULOS.perspectiva[l.perspectiva], csv: (l) => C.ROTULOS.perspectiva[l.perspectiva] },
        { chave: 'meta', rotulo: 'Meta', exibir: (l) => C.textoMeta(l), csv: (l) => C.textoMeta(l) },
        { chave: 'toleranciaAtencao', rotulo: 'Atenção a partir de', exibir: (l) => C.textoTolerancia(l, 'toleranciaAtencao'), csv: (l) => C.textoTolerancia(l, 'toleranciaAtencao') },
        { chave: 'toleranciaFora', rotulo: 'Fora a partir de', exibir: (l) => C.textoTolerancia(l, 'toleranciaFora'), csv: (l) => C.textoTolerancia(l, 'toleranciaFora') },
        { chave: 'sentido', rotulo: 'Sentido', exibir: (l) => (l.sentido === 'maior-melhor' ? 'Maior é melhor' : 'Menor é melhor'), csv: (l) => l.sentido },
        { chave: 'responsavel', rotulo: 'Responsável', exibir: (l) => l.responsavel || 'a definir', csv: (l) => l.responsavel || '' },
        { rotulo: 'Status atual', ordenavel: false, exibir: (l) => status((avaliacoes.get(l.id) || {}).status), csv: (l) => (avaliacoes.get(l.id) || {}).status || '' },
        { rotulo: 'Ações', tipo: 'acoes', exibir: (l) => html`<button type="button" class="botao botao-texto botao-pequeno" data-acao="editar-meta" data-id="${l.id}" aria-label="Editar meta de ${l.nome}">${icone('editar')}Editar meta</button>` }
      ]
    });

    // Limites dos alertas
    const limites = NS.ui.formulario({
      campos: LIMITES.map(([nome, rotulo, tipo, ajuda]) => ({ nome, rotulo, tipo, obrigatorio: true, min: 0, max: tipo === 'pct' ? 1 : 3650, largura: 'terco', ajuda })),
      valores: config.alertas, rotuloSalvar: 'Salvar limites dos alertas', aoCancelar: null,
      aoSalvar: (v) => {
        store.emLote(() => {
          store.atualizarConfig({ alertas: v });
          NS.core.log.registrar({ entidade: 'configuracoes', tipo: 'alteracao', descricao: 'Limites dos alertas atualizados.' });
        });
        NS.ui.avisar('Limites dos alertas salvos.');
        return true;
      }
    });
    NS.ui.encaixar(el, { pref, metas, limites });

    el.onclick = async (ev) => {
      const alvo = ev.target.closest('[data-acao]');
      if (!alvo) return;
      const acao = alvo.dataset.acao;
      if (acao === 'editar-meta') editarIndicador(alvo.dataset.id);
      else if (acao === 'exportar') exportarJSON();
      else if (acao === 'apagar-tudo') {
        if (!podeSubstituirTudo()) return;
        const ok = await NS.ui.modal.confirmar({
          titulo: 'Apagar todos os dados',
          mensagem: 'Todos os dados deste navegador serão apagados definitivamente, inclusive metas, limites e log. Esta ação não pode ser desfeita.',
          rotuloConfirmar: 'Apagar todos os dados', perigo: true, textoExigido: 'apagar tudo'
        });
        if (!ok) return;
        store.emLote(() => {
          store.apagarTudo([]);
          NS.core.log.registrar({ entidade: 'dados', tipo: 'sistema', descricao: 'Todos os dados foram apagados.' });
        });
        NS.ui.avisar('Todos os dados foram apagados.');
        NS.core.router.ir('cadastros/empresa');
      }
    };
    el.onchange = (ev) => {
      if (ev.target.dataset.acao === 'importar') {
        importarArquivo(ev.target.files[0]);
        ev.target.value = '';
      }
    };

    // Atalho vindo do "Como é calculado": abre a edição da meta.
    if (rota.query.ind && ctx.indicadoresPorId.has(rota.query.ind)) {
      const id = rota.query.ind;
      NS.core.router.substituirQuery({ ind: '' });
      editarIndicador(id);
    }
  }

  NS.modules.configuracoes = { rotas: { configuracoes: tela }, importarArquivo, exportarJSON };
})(window);
