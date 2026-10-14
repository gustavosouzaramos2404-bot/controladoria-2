/* ==========================================================================
   modules/comum.js
   Peças compartilhadas pelas telas:
   - cabeçalho de tela, abas e seletor de competência;
   - janela "Como é calculado" de cada indicador (fórmula, fonte, data de
     atualização, responsável, se é controlável, tendência de 12 meses);
   - "Registrar ação": plano de ação já preenchido com o desvio;
   - exceção com justificativa (dispensar um alerta, registrada no log);
   - conferência de alçada (aprovação registrada acima do limite);
   - listas de opções para selects e exclusão com confirmação.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.modules = NS.modules || {};

  const C = () => NS; // acesso tardio ao namespace completo

  const ROTULOS = {
    perspectiva: { financeira: 'Financeira', clientes: 'Clientes (órgãos públicos)', processos: 'Processos internos', aprendizado: 'Aprendizado e crescimento' },
    controlavel: { sim: 'Sim, controlável pelo responsável', parcial: 'Parcialmente (depende também de fatores externos)', nao: 'Não controlável pelo responsável' },
    statusPlano: { aberto: 'Aberto', andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' },
    origemPlano: { alerta: 'Alerta', indicador: 'Indicador', manual: 'Manual' },
    tipoCentro: { custo: 'Custo', receita: 'Receita', resultado: 'Resultado', investimento: 'Investimento' },
    esfera: { municipal: 'Municipal', estadual: 'Estadual', federal: 'Federal' },
    tipoContrato: { ata: 'Ata de registro de preços', contrato: 'Contrato' },
    motivoPerda: { processo: 'Processo', validade: 'Validade', avaria: 'Avaria', qualidade: 'Qualidade' },
    tipoMovimento: { entrada: 'Entrada', saida: 'Saída', perda: 'Perda', ajuste: 'Ajuste' },
    area: { compras: 'Compras', estoque: 'Estoque', faturamento: 'Faturamento', tesouraria: 'Tesouraria', contratos: 'Contratos' },
    frequencia: { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' },
    resultadoControle: { efetivo: 'Efetivo', ressalva: 'Com ressalva', falha: 'Falha' },
    tipoLog: { alteracao: 'Alteração', excecao: 'Exceção', aprovacao: 'Aprovação', sistema: 'Sistema', exclusao: 'Exclusão' }
  };

  /** Converte um mapa de rótulos em opções de select. */
  function opcoes(mapa) {
    return Object.entries(mapa).map(([valor, rotulo]) => ({ valor, rotulo }));
  }

  /** Opções a partir de uma coleção do store (ordenadas pelo nome). */
  function opcoesColecao(colecao, campoRotulo = 'nome', filtro) {
    return C().core.store.listar(colecao)
      .filter(filtro || (() => true))
      .map((r) => ({ valor: r.id, rotulo: typeof campoRotulo === 'function' ? campoRotulo(r) : r[campoRotulo] }))
      .sort((a, b) => String(a.rotulo).localeCompare(String(b.rotulo), 'pt-BR'));
  }

  /** Nome de um registro pelo id (ou texto padrão). */
  function nome(colecao, id, padrao = '—') {
    const r = C().core.store.obter(colecao, id);
    if (!r) return padrao;
    return r.nome || r.numero || r.controle || r.operacao || padrao;
  }

  /** Cabeçalho padrão de tela. */
  function cabecalho({ titulo, subtitulo = '', acoes = '', migalha = '' }) {
    const { html } = C().ui;
    return html`
      ${migalha ? html`<div class="migalha">${migalha}</div>` : ''}
      <div class="cabecalho-tela">
        <div>
          <h1 tabindex="-1">${titulo}</h1>
          ${subtitulo ? html`<p class="subtitulo">${subtitulo}</p>` : ''}
        </div>
        ${acoes ? html`<div class="acoes-tela">${acoes}</div>` : ''}
      </div>`;
  }

  /** Abas de navegação dentro de uma tela (links no hash, o voltar funciona). */
  function abas(itens, ativa) {
    const { html, raw } = C().ui;
    return html`<nav class="abas" aria-label="Seções desta tela">${itens.map((i) => html`<a class="aba" href="#/${i.rota}" ${i.id === ativa ? raw('aria-current="page"') : ''}>${i.rotulo}</a>`)}</nav>`;
  }

  /** Seletor de competência (mm/aaaa). Dispara data-acao="trocar-competencia". */
  function seletorCompetencia(competencias, atual, rotulo = 'Competência') {
    const { html, raw } = C().ui;
    const F = C().core.format;
    const lista = Array.from(new Set(competencias.concat(atual ? [atual] : []))).sort().reverse();
    return html`<label class="seletor">${rotulo}
      <select data-acao="trocar-competencia">${lista.map((c) => html`<option value="${c}" ${c === atual ? raw('selected') : ''}>${F.competencia(c)}</option>`)}</select>
    </label>`;
  }

  /** Data/hora da última atualização dos registros de algumas coleções. */
  function ultimaAtualizacao(colecoes) {
    let maior = null;
    for (const col of colecoes || []) {
      for (const r of C().core.store.listar(col)) {
        if (r.atualizadoEm && (!maior || r.atualizadoEm > maior)) maior = r.atualizadoEm;
      }
    }
    return maior;
  }

  /** Texto com a fonte do dado e a data de atualização (qualidade da informação). */
  function fonteDado(fonte, colecoes) {
    const { html } = C().ui;
    const ult = ultimaAtualizacao(colecoes);
    return html`<p class="fonte-dado">Fonte: ${fonte}${ult ? ` · Atualizado em ${C().core.format.dataHora(ult)}` : ''}</p>`;
  }

  /* --------------------------- Como é calculado --------------------------- */

  /** Meta de um indicador em texto ("a definir" quando em branco). */
  function textoMeta(ind) {
    const ehNum = typeof ind.meta === 'number' && Number.isFinite(ind.meta);
    return ehNum ? C().core.format.porUnidade(ind.meta, ind.unidade) : 'a definir';
  }

  /** Tolerância de um indicador em texto ("a definir" quando em branco). */
  function textoTolerancia(ind, campo) {
    const v = ind[campo];
    return typeof v === 'number' && Number.isFinite(v) ? C().core.format.diferenca(v, ind.unidade) : 'a definir';
  }

  /** Explica as faixas de status de um indicador em texto. */
  function textoFaixas(ind) {
    const F = C().core.format;
    if (typeof ind.meta !== 'number' || typeof ind.toleranciaAtencao !== 'number' || typeof ind.toleranciaFora !== 'number') {
      return 'Meta e tolerâncias ainda não definidas. Preencha em Configurações para o sistema classificar o resultado.';
    }
    const d = (v) => F.diferenca(v, ind.unidade).replace(/^[+−]/, '');
    const pior = ind.sentido === 'menor-melhor' ? 'acima' : 'abaixo';
    return `Dentro: até ${d(ind.toleranciaAtencao)} ${pior} da meta. Atenção: até ${d(ind.toleranciaFora)} ${pior}. Fora: mais de ${d(ind.toleranciaFora)} ${pior} da meta.`;
  }

  /** Abre a janela "Como é calculado" de um indicador. */
  function abrirComoCalculado(indId, ctx, comp) {
    const { html, status, valor, graficos, icone } = C().ui;
    const F = C().core.format;
    const B = C().calc.base;
    const ind = ctx.indicadoresPorId.get(indId);
    if (!ind) return;
    const av = C().calc.indicadores.avaliar(ctx, ind, comp);
    const serie = C().calc.indicadores.serie(ctx, ind, comp, 12);
    const par = ind.pareadoCom ? ctx.indicadoresPorId.get(ind.pareadoCom) : null;
    const avPar = par ? C().calc.indicadores.avaliar(ctx, par, comp) : null;
    const ult = ultimaAtualizacao(ind.colecoesFonte);
    const conteudo = html`
      <dl class="lista-definicao">
        <dt>Competência</dt><dd>${F.competencia(comp)}</dd>
        <dt>Realizado</dt><dd>${F.porUnidade(av.valor, ind.unidade)} ${status(av.status)}</dd>
        <dt>Meta</dt><dd>${textoMeta(ind)} <span class="suave">(${ind.sentido === 'maior-melhor' ? 'quanto maior, melhor' : 'quanto menor, melhor'})</span></dd>
        <dt>Faixas</dt><dd>${textoFaixas(ind)}</dd>
      </dl>
      <h3 class="espaco-acima">Como é calculado</h3>
      <p class="formula">${ind.formula}</p>
      ${av.detalhe && av.detalhe.length ? html`<dl class="lista-definicao">${av.detalhe.map((d) => html`<dt>${d.rotulo}</dt><dd class="num">${valor(d.valor, d.unidade)}</dd>`)}</dl>` : ''}
      ${av.erro ? html`<p class="caixa-alerta">Não foi possível calcular: ${av.erro}</p>` : ''}
      <h3 class="espaco-acima">De onde vem o número</h3>
      <dl class="lista-definicao">
        <dt>Fonte do dado</dt><dd>${ind.fonte}</dd>
        <dt>Última atualização</dt><dd>${ult ? F.dataHora(ult) : 'sem registros'}</dd>
        <dt>Responsável</dt><dd>${ind.responsavel || 'a definir'}</dd>
        <dt>Controlável?</dt><dd>${ROTULOS.controlavel[ind.controlavel] || ind.controlavel}</dd>
        <dt>Periodicidade</dt><dd>${ind.periodicidade || 'mensal'}</dd>
        ${par ? html`<dt>Pareado com</dt><dd>${par.nome}: ${F.porUnidade(avPar.valor, par.unidade)} ${status(avPar.status)}<br><span class="nota">Alinhamento de metas: um resultado bom aqui não deve piorar o indicador pareado.</span></dd>` : ''}
        <dt>Ação sugerida</dt><dd>${ind.acaoSugerida || '—'}</dd>
      </dl>
      <h3 class="espaco-acima">Tendência de 12 meses</h3>
      ${serie.length ? graficos.linha({
        series: [{ nome: ind.nome, valores: serie.map((s) => s.valor) }],
        rotulos: serie.map((s) => F.competencia(s.competencia)),
        meta: ind.meta, formatar: (v) => F.porUnidade(v, ind.unidade), altura: 200,
        titulo: `Tendência de ${ind.nome}`, descricao: `Valores dos últimos 12 meses até ${F.competencia(comp)}, com a meta tracejada.`
      }) : html`<p class="nota">Este indicador não tem histórico mensal: ele mostra apenas a situação atual.</p>`}
      <div class="formulario-acoes">
        <a class="botao ${typeof ind.meta === 'number' ? 'botao-secundario' : 'botao-primario'}" href="#/configuracoes?ind=${ind.id}" data-fechar>${typeof ind.meta === 'number' ? 'Editar meta e tolerâncias' : 'Definir meta e tolerâncias'}</a>
        ${av.status === 'atencao' || av.status === 'fora' ? html`<button type="button" class="botao botao-primario" data-registrar-indicador>${icone('acao')}Registrar ação</button>` : ''}
      </div>`;
    const m = C().ui.modal.abrir({ titulo: ind.nome, conteudo, larga: true });
    const botao = m.corpo.querySelector('[data-registrar-indicador]');
    if (botao) {
      botao.addEventListener('click', () => {
        m.fechar();
        abrirRegistrarAcao({
          origem: 'indicador', referenciaId: ind.id, titulo: ind.nome,
          desvio: `${ind.nome} em ${F.competencia(comp)}: ${F.porUnidade(av.valor, ind.unidade)} contra meta de ${textoMeta(ind)}.`,
          responsavel: ind.responsavel, acao: ind.acaoSugerida, prazo: B.somarDias(ctx.hoje, av.status === 'fora' ? 7 : 15)
        });
      });
    }
  }

  /* ----------------------------- Plano de ação ----------------------------- */

  /** Campos do formulário de plano de ação. */
  function camposPlano(edicao) {
    return [
      { nome: 'origem', rotulo: 'Origem', tipo: 'select', obrigatorio: true, opcoes: opcoes(ROTULOS.origemPlano), largura: 'terco' },
      { nome: 'status', rotulo: 'Status', tipo: 'select', obrigatorio: true, opcoes: opcoes(ROTULOS.statusPlano), largura: 'terco' },
      { nome: 'prazo', rotulo: 'Prazo', tipo: 'data', obrigatorio: true, largura: 'terco' },
      { nome: 'desvio', rotulo: 'Desvio', tipo: 'textarea', obrigatorio: true, ajuda: 'O que está fora do padrão, com o número.' },
      { nome: 'causa', rotulo: 'Causa provável', tipo: 'textarea', ajuda: 'Hipótese de causa. O sistema recomenda; quem decide é o gestor.' },
      { nome: 'acao', rotulo: 'Ação', tipo: 'textarea', obrigatorio: true, ajuda: 'O que será feito, de forma verificável.' },
      { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto', obrigatorio: true, largura: 'meia', ajuda: 'Nome ou cargo.' },
      { nome: 'dataConclusao', rotulo: 'Data de conclusão', tipo: 'data', largura: 'meia', ajuda: 'Preencha ao concluir.',
        validar: (v, todos) => (todos.status === 'concluido' && !v ? 'Informe a data de conclusão para marcar o plano como concluído.' : null) },
      edicao ? { nome: 'efeito', rotulo: 'Efeito observado', tipo: 'textarea', ajuda: 'O que mudou no indicador depois da ação.' } : null
    ].filter(Boolean);
  }

  /**
   * Abre o formulário "Registrar ação" já preenchido com o desvio.
   * dados: { origem, referenciaId, titulo, desvio, responsavel, acao, prazo }
   */
  function abrirRegistrarAcao(dados) {
    const { html } = C().ui;
    const store = C().core.store;
    const hoje = C().core.hoje();
    const valores = {
      origem: dados.origem || 'manual', status: 'aberto', prazo: dados.prazo || C().calc.base.somarDias(hoje, 15),
      desvio: dados.desvio || '', causa: '', acao: dados.acao || '', responsavel: dados.responsavel || ''
    };
    C().ui.abrirFormulario({
      titulo: 'Registrar ação',
      introducao: dados.titulo ? html`<p class="caixa-info">Vinculado a: <strong>${dados.titulo}</strong>. O plano fica ligado a este desvio e aparece na Central de desvios.</p>` : '',
      campos: camposPlano(false),
      valores,
      rotuloSalvar: 'Registrar ação',
      mensagemSucesso: 'Ação registrada.',
      aoSalvar: (v) => {
        const reg = store.inserir('planosAcao', Object.assign({ referenciaId: dados.referenciaId || '', efeito: '' }, v));
        C().core.log.registrar({ entidade: 'planosAcao', entidadeId: reg.id, tipo: 'alteracao', descricao: `Plano de ação registrado (${ROTULOS.origemPlano[v.origem]}): ${v.acao}` });
        return true;
      }
    });
  }

  /** Abre a edição de um plano existente. */
  function abrirEditarPlano(id) {
    const store = C().core.store;
    const plano = store.obter('planosAcao', id);
    if (!plano) return;
    C().ui.abrirFormulario({
      titulo: 'Editar plano de ação',
      campos: camposPlano(true),
      valores: plano,
      rotuloSalvar: 'Salvar plano',
      mensagemSucesso: 'Plano salvo.',
      aoSalvar: (v) => {
        const antes = plano.status;
        store.atualizar('planosAcao', id, v);
        if (antes !== v.status) {
          C().core.log.registrar({ entidade: 'planosAcao', entidadeId: id, tipo: 'alteracao', descricao: `Status do plano "${v.acao}" alterado de ${ROTULOS.statusPlano[antes]} para ${ROTULOS.statusPlano[v.status]}.` });
        }
        return true;
      }
    });
  }

  /* ------------------------ Exceção com justificativa ------------------------ */

  /** Dispensa um alerta com justificativa e validade (registrado no log). */
  function abrirDispensarAlerta(alerta) {
    const { html } = C().ui;
    const store = C().core.store;
    const hoje = C().core.hoje();
    C().ui.abrirFormulario({
      titulo: 'Dispensar alerta com justificativa',
      introducao: html`<p class="caixa-info">Toda regra automática admite exceção, desde que justificada. A justificativa fica registrada no log com autor e data, e o alerta volta a aparecer depois da validade.</p><p><strong>${alerta.titulo}</strong><br><span class="suave">${alerta.mensagem}</span></p>`,
      campos: [
        { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true, ajuda: 'Por que este alerta não exige ação agora.' },
        { nome: 'validoAte', rotulo: 'Dispensado até', tipo: 'data', obrigatorio: true, largura: 'meia',
          validar: (v) => (v && v < hoje ? 'Escolha uma data a partir de hoje.' : null) }
      ],
      valores: { validoAte: C().calc.base.somarDias(hoje, 30) },
      rotuloSalvar: 'Dispensar alerta',
      mensagemSucesso: 'Alerta dispensado. Justificativa registrada no log.',
      aoSalvar: (v) => {
        const autor = NS.core.log.autor();
        store.emLote(() => {
          store.inserir('excecoes', { alertaChave: alerta.chave, titulo: alerta.titulo, justificativa: v.justificativa, autor, data: hoje, validoAte: v.validoAte });
          C().core.log.registrar({ entidade: 'alerta', entidadeId: alerta.chave, tipo: 'excecao', descricao: `Alerta dispensado: ${alerta.titulo}`, justificativa: v.justificativa });
        });
        return true;
      }
    });
  }

  /** Reativa um alerta dispensado (remove a exceção e registra no log). */
  async function reativarAlerta(alerta) {
    const ok = await C().ui.modal.confirmar({
      titulo: 'Reativar alerta',
      mensagem: `O alerta "${alerta.titulo}" voltará para a lista de desvios ativos.`,
      rotuloConfirmar: 'Reativar alerta'
    });
    if (!ok) return;
    const store = C().core.store;
    store.emLote(() => {
      store.remover('excecoes', alerta.excecao.id);
      C().core.log.registrar({ entidade: 'alerta', entidadeId: alerta.chave, tipo: 'excecao', descricao: `Alerta reativado: ${alerta.titulo}` });
    });
    C().ui.avisar('Alerta reativado.');
  }

  /* ------------------------------ Alçadas ------------------------------ */

  /**
   * Confere a alçada de uma operação. Se o valor passar do limite, pede o
   * registro da aprovação (aprovador e justificativa). Promise<boolean>.
   */
  function conferirAlcada(operacao, valor, referencia) {
    const store = C().core.store;
    const F = C().core.format;
    const { html } = C().ui;
    const alcada = store.listar('alcadas').find((a) => a.operacao === operacao);
    if (!alcada || !(Math.abs(valor) > alcada.limite)) return Promise.resolve(true);
    return new Promise((resolver) => {
      let aprovado = false;
      C().ui.abrirFormulario({
        titulo: 'Aprovação acima da alçada',
        introducao: html`<p class="caixa-alerta">O valor de <strong>${F.moeda(Math.abs(valor))}</strong> passa da alçada de ${F.moeda(alcada.limite)} para "${operacao}". Registre a aprovação para continuar.</p>`,
        campos: [
          { nome: 'aprovador', rotulo: 'Aprovador', tipo: 'texto', obrigatorio: true, largura: 'meia' },
          { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true }
        ],
        valores: { aprovador: alcada.aprovador },
        rotuloSalvar: 'Registrar aprovação',
        mensagemSucesso: 'Aprovação registrada.',
        aoFechar: () => resolver(aprovado),
        aoSalvar: (v) => {
          store.emLote(() => {
            const reg = store.inserir('aprovacoes', { data: C().core.hoje(), operacao, valor: Math.abs(valor), aprovador: v.aprovador, referencia: referencia || '', justificativa: v.justificativa });
            C().core.log.registrar({ entidade: 'aprovacoes', entidadeId: reg.id, tipo: 'aprovacao', descricao: `${operacao} de ${F.moeda(Math.abs(valor))} aprovada por ${v.aprovador} (acima da alçada de ${F.moeda(alcada.limite)}).`, justificativa: v.justificativa });
          });
          aprovado = true;
          return true;
        }
      });
    });
  }

  /* ------------------------------ Exclusão ------------------------------ */

  /** Exclui um registro após confirmação (mesmo verbo no botão e no aviso). */
  async function excluir({ colecao, id, titulo, mensagem, rotulo, sucesso, descricaoLog, depois }) {
    const ok = await C().ui.modal.confirmar({ titulo, mensagem, rotuloConfirmar: rotulo, perigo: true });
    if (!ok) return false;
    const store = C().core.store;
    store.emLote(() => {
      store.remover(colecao, id);
      C().core.log.registrar({ entidade: colecao, entidadeId: id, tipo: 'exclusao', descricao: descricaoLog || `${titulo}.` });
      if (depois) depois();
    });
    C().ui.avisar(sucesso);
    return true;
  }

  /* ---------------------- Referências entre cadastros ---------------------- */

  /**
   * Lista onde um registro é usado, para impedir exclusões que deixariam
   * dados órfãos. Devolve textos como "3 produtos (ficha técnica)".
   */
  function referencias(colecao, id) {
    const s = C().core.store;
    const contar = (col, fn) => s.listar(col).filter(fn).length;
    const r = [];
    const add = (n, texto) => { if (n) r.push(`${n} ${texto}`); };
    if (colecao === 'insumos') {
      add(contar('produtos', (p) => (p.fichaTecnica || []).some((f) => f.insumoId === id)), 'produto(s) na ficha técnica');
      add(contar('lotes', (l) => (l.consumo || []).some((c) => c.insumoId === id)), 'lote(s) de produção');
      add(contar('movimentosEstoque', (m) => m.itemTipo === 'insumo' && m.itemId === id), 'movimento(s) de estoque');
    } else if (colecao === 'produtos') {
      add(contar('contratos', (c) => (c.itens || []).some((i) => i.produtoId === id)), 'contrato(s)');
      add(contar('lotes', (l) => l.produtoId === id), 'lote(s) de produção');
      add(contar('empenhos', (e) => (e.itens || []).concat(e.entregas || []).some((i) => i.produtoId === id)), 'empenho(s)');
      add(contar('movimentosEstoque', (m) => m.itemTipo === 'produto' && m.itemId === id), 'movimento(s) de estoque');
    } else if (colecao === 'orgaos') {
      add(contar('contratos', (c) => c.orgaoId === id), 'contrato(s)');
    } else if (colecao === 'centros') {
      add(contar('lancamentos', (l) => l.centroId === id), 'lançamento(s) de caixa');
      add(contar('orcamento', (o) => o.centroId === id), 'linha(s) de orçamento');
    } else if (colecao === 'contratos') {
      add(contar('empenhos', (e) => e.contratoId === id), 'empenho(s)');
      add(contar('lancamentos', (l) => l.contratoId === id), 'lançamento(s) de caixa');
    }
    return r;
  }

  /** Primeira letra maiúscula. */
  function capitalizar(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  /**
   * Bloco de cadastro genérico: botão "Cadastrar X", tabela com Editar e
   * Excluir, formulário em janela modal e exclusão com confirmação.
   * opcoes: { colecao, singular, genero ('o'|'a'), colunas, campos (array ou
   * função(registro)), linhas, preparar(valores, existente), aposSalvar(reg, novo),
   * vazio, csv, ordenarPor, ordem, larga, rotuloNovo, introducao, classeLinha, porPagina }
   */
  function blocoCrud(opcoes) {
    const { html, icone, elemento } = C().ui;
    const store = C().core.store;
    const { colecao, singular, genero = 'o', colunas, preparar, aposSalvar, larga = false } = opcoes;
    const Singular = capitalizar(singular);
    const linhas = opcoes.linhas || store.listar(colecao);
    const rotuloNovo = opcoes.rotuloNovo || `Cadastrar ${singular}`;
    const camposDe = (reg) => (typeof opcoes.campos === 'function' ? opcoes.campos(reg) : opcoes.campos);
    const nomeDe = (reg) => reg.nome || reg.numero || reg.controle || reg.operacao || reg.lote || reg.conta || singular;

    const colunasAcoes = colunas.concat([{
      rotulo: 'Ações', tipo: 'acoes',
      exibir: (l) => html`<button type="button" class="botao botao-texto botao-pequeno" data-crud="editar" data-id="${l.id}" aria-label="Editar ${singular} ${nomeDe(l)}">${icone('editar')}Editar</button>
        <button type="button" class="botao botao-texto botao-pequeno" data-crud="excluir" data-id="${l.id}" aria-label="Excluir ${singular} ${nomeDe(l)}">${icone('excluir')}Excluir</button>`
    }]);

    const raizEl = elemento(String(html`<div class="bloco-crud">
      <div class="tabela-barra"><span>${opcoes.introducao || ''}</span>
        <button type="button" class="botao botao-primario" data-crud="novo">${icone('mais')}${rotuloNovo}</button></div>
      <div data-slot="tabela"></div>
    </div>`));
    const tabelaEl = C().ui.tabela({
      colunas: colunasAcoes, linhas, legenda: opcoes.legenda || `Lista de ${singular}`, csv: opcoes.csv || false,
      ordenarPor: opcoes.ordenarPor, ordem: opcoes.ordem, classeLinha: opcoes.classeLinha, porPagina: opcoes.porPagina || 25,
      vazio: C().ui.vazio(opcoes.vazio || `Nenhum registro de ${singular}.`, { rotulo: rotuloNovo, dataAcao: 'crud-novo' })
    });
    C().ui.encaixar(raizEl, { tabela: tabelaEl });

    /** Abre o formulário de criação ou edição. */
    function abrirForm(reg) {
      C().ui.abrirFormulario({
        titulo: reg ? `Editar ${singular}` : rotuloNovo,
        campos: camposDe(reg),
        valores: reg || (typeof opcoes.padrao === 'function' ? opcoes.padrao() : (opcoes.padrao || {})),
        rotuloSalvar: `Salvar ${singular}`,
        mensagemSucesso: `${Singular} salv${genero}.`,
        larga,
        aoSalvar: (v) => {
          const dados = preparar ? preparar(v, reg) : v;
          if (dados && dados.erros) return dados;
          let salvo;
          store.emLote(() => {
            salvo = reg ? store.atualizar(colecao, reg.id, dados) : store.inserir(colecao, dados);
            if (aposSalvar) aposSalvar(salvo, !reg);
          });
          return true;
        }
      });
    }

    raizEl.addEventListener('click', async (ev) => {
      const alvo = ev.target.closest('[data-crud], [data-acao="crud-novo"]');
      if (!alvo) return;
      ev.stopPropagation();
      const acao = alvo.dataset.crud || 'novo';
      if (acao === 'novo') { abrirForm(null); return; }
      const reg = store.obter(colecao, alvo.dataset.id);
      if (!reg) return;
      if (acao === 'editar') { abrirForm(reg); return; }
      if (acao === 'excluir') {
        const usos = referencias(colecao, reg.id);
        if (usos.length) {
          C().ui.modal.abrir({
            titulo: `Não é possível excluir ${genero} ${singular}`,
            conteudo: html`<p>${Singular} <strong>${nomeDe(reg)}</strong> é usad${genero} em: ${usos.join(', ')}.</p>
              <p>Para manter os números verificáveis, remova ou altere essas referências antes de excluir.</p>
              <div class="formulario-acoes"><button type="button" class="botao botao-primario" data-fechar>Entendi</button></div>`
          });
          return;
        }
        await excluir({
          colecao, id: reg.id, titulo: `Excluir ${singular}`,
          mensagem: `${Singular} "${nomeDe(reg)}" será excluíd${genero} definitivamente.`,
          rotulo: `Excluir ${singular}`, sucesso: `${Singular} excluíd${genero}.`,
          descricaoLog: `${Singular} excluíd${genero}: ${nomeDe(reg)}.`
        });
      }
    });
    return raizEl;
  }

  NS.modules.comum = {
    ROTULOS, opcoes, opcoesColecao, nome, cabecalho, abas, seletorCompetencia, ultimaAtualizacao, fonteDado,
    textoMeta, textoTolerancia, textoFaixas, abrirComoCalculado, camposPlano, abrirRegistrarAcao, abrirEditarPlano, abrirDispensarAlerta,
    reativarAlerta, conferirAlcada, excluir, referencias, capitalizar, blocoCrud
  };
})(typeof window !== 'undefined' ? window : globalThis);
