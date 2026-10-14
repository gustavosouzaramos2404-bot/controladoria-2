/* ==========================================================================
   modules/contratos.js
   Contratos públicos (B2G), o diferencial do sistema:
   - cadastro de contratos e atas de registro de preços (itens com preço
     contratado e custo considerado na proposta, garantia, penalidades);
   - empenhos com entregas, liquidação (com glosa) e pagamento; o pagamento
     gera automaticamente o lançamento de caixa realizado;
   - por contrato: margem prevista × atual por item, defasagem de custo,
     erosão de margem, saldo da ata, ritmo de consumo e data estimada de
     esgotamento, resultado de contribuição, multas, glosas e entregas no prazo;
   - evidência para avaliar reequilíbrio ou reajuste (sempre com o aviso de
     validação jurídica — o sistema não decide nada jurídico);
   - por órgão: prazo médio real de pagamento, recebíveis e concentração.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  const ABAS = [
    { id: 'lista', rotulo: 'Contratos e atas', rota: 'contratos' },
    { id: 'orgaos', rotulo: 'Órgãos e recebíveis', rota: 'contratos/orgaos' }
  ];

  /** Nome do contrato para exibição ("Ata 008/2025" ou "Contrato 045/2025"). */
  function nomeContrato(c) {
    return `${c.tipo === 'ata' ? 'Ata' : 'Contrato'} ${c.numero}`;
  }

  /* ------------------------------ Formulários ------------------------------ */

  /** Campos do contrato/ata. */
  function camposContrato() {
    const C = NS.modules.comum;
    return [
      { tipo: 'secao', rotulo: 'Identificação' },
      { nome: 'numero', rotulo: 'Número', tipo: 'texto', obrigatorio: true, largura: 'terco', placeholder: 'Preencher' },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, largura: 'terco', opcoes: C.opcoes(C.ROTULOS.tipoContrato) },
      { nome: 'orgaoId', rotulo: 'Órgão', tipo: 'select', obrigatorio: true, largura: 'terco', opcoes: () => C.opcoesColecao('orgaos'),
        ajuda: 'Não encontrou o órgão? Cadastre em Cadastros › Órgãos públicos.' },
      { nome: 'processo', rotulo: 'Número do processo', tipo: 'texto', largura: 'meia' },
      { nome: 'modalidade', rotulo: 'Modalidade', tipo: 'texto', largura: 'meia', placeholder: 'Ex.: pregão eletrônico' },
      { tipo: 'secao', rotulo: 'Datas' },
      { nome: 'assinatura', rotulo: 'Assinatura', tipo: 'data', largura: 'quarto' },
      { nome: 'vigenciaInicio', rotulo: 'Início da vigência', tipo: 'data', obrigatorio: true, largura: 'quarto' },
      { nome: 'vigenciaFim', rotulo: 'Fim da vigência', tipo: 'data', obrigatorio: true, largura: 'quarto',
        validar: (v, t) => (v && t.vigenciaInicio && v < t.vigenciaInicio ? 'O fim da vigência deve ser depois do início.' : null) },
      { nome: 'dataBaseProposta', rotulo: 'Data-base da proposta', tipo: 'data', obrigatorio: true, largura: 'quarto',
        ajuda: 'Data da proposta. 12 meses depois, o sistema avisa para avaliar reajuste.' },
      { nome: 'indiceReajuste', rotulo: 'Índice de reajuste previsto', tipo: 'texto', largura: 'meia', placeholder: 'Ex.: IPCA' },
      { tipo: 'secao', rotulo: 'Garantia contratual' },
      { nome: 'garantia.valor', rotulo: 'Valor da garantia', tipo: 'moeda', min: 0, largura: 'meia' },
      { nome: 'garantia.vencimento', rotulo: 'Vencimento da garantia', tipo: 'data', largura: 'meia' },
      {
        nome: 'itens', rotulo: 'Itens', tipo: 'lista', obrigatorio: true, minimo: 1, rotuloItem: 'item', rotuloAdicionar: 'Adicionar item',
        ajuda: 'Custo da proposta = custo unitário considerado ao formar o preço. É a base da defasagem e da erosão de margem.',
        campos: [
          { nome: 'produtoId', rotulo: 'Produto', tipo: 'select', obrigatorio: true, opcoes: () => C.opcoesColecao('produtos') },
          { nome: 'qtdRegistrada', rotulo: 'Qtd registrada', tipo: 'numero', obrigatorio: true, min: 0 },
          { nome: 'precoContratado', rotulo: 'Preço contratado', tipo: 'moeda', obrigatorio: true, min: 0 },
          { nome: 'custoProposta', rotulo: 'Custo da proposta', tipo: 'moeda', obrigatorio: true, min: 0 }
        ]
      },
      {
        nome: 'penalidades', rotulo: 'Penalidades (multas)', tipo: 'lista', rotuloItem: 'penalidade', rotuloAdicionar: 'Adicionar penalidade',
        campos: [
          { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
          { nome: 'motivo', rotulo: 'Motivo', tipo: 'texto', obrigatorio: true },
          { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true, min: 0 }
        ]
      }
    ];
  }

  /** Abre o formulário de contrato (novo ou edição). */
  function abrirContrato(reg) {
    const store = NS.core.store;
    NS.ui.abrirFormulario({
      titulo: reg ? `Editar ${nomeContrato(reg)}` : 'Cadastrar contrato',
      campos: camposContrato(),
      valores: reg || { tipo: 'contrato', itens: [], penalidades: [] },
      rotuloSalvar: 'Salvar contrato',
      mensagemSucesso: 'Contrato salvo.',
      larga: true,
      aoSalvar: (v) => {
        const dados = Object.assign({}, v, { garantia: { valor: v.garantia.valor, vencimento: v.garantia.vencimento } });
        if (reg) store.atualizar('contratos', reg.id, dados);
        else {
          const novo = store.inserir('contratos', dados);
          setTimeout(() => NS.core.router.ir(`contratos/${novo.id}`), 0);
        }
        return true;
      }
    });
  }

  /** Campos do empenho (produtos limitados aos itens do contrato). */
  function camposEmpenho(contrato) {
    const produtos = () => (contrato.itens || []).map((i) => ({ valor: i.produtoId, rotulo: NS.modules.comum.nome('produtos', i.produtoId) }));
    const hoje = NS.core.hoje();
    return [
      { nome: 'numero', rotulo: 'Número do empenho ou pedido', tipo: 'texto', obrigatorio: true, largura: 'meia', placeholder: 'Preencher' },
      { nome: 'data', rotulo: 'Data do empenho', tipo: 'data', obrigatorio: true, largura: 'meia' },
      {
        nome: 'itens', rotulo: 'Itens empenhados', tipo: 'lista', obrigatorio: true, minimo: 1, rotuloItem: 'item', rotuloAdicionar: 'Adicionar item',
        campos: [
          { nome: 'produtoId', rotulo: 'Produto', tipo: 'select', obrigatorio: true, opcoes: produtos },
          { nome: 'qtd', rotulo: 'Quantidade', tipo: 'numero', obrigatorio: true, min: 0 }
        ]
      },
      {
        nome: 'entregas', rotulo: 'Entregas', tipo: 'lista', rotuloItem: 'entrega', rotuloAdicionar: 'Adicionar entrega',
        ajuda: 'Deixe o valor em branco para calcular pela quantidade × preço contratado. A data real fica em branco até a entrega acontecer.',
        campos: [
          { nome: 'produtoId', rotulo: 'Produto', tipo: 'select', obrigatorio: true, opcoes: produtos },
          { nome: 'prevista', rotulo: 'Data prevista', tipo: 'data', obrigatorio: true },
          { nome: 'real', rotulo: 'Data real', tipo: 'data', validar: (v) => (v && v > hoje ? 'A data real não pode ser futura. Deixe em branco até entregar.' : null) },
          { nome: 'nf', rotulo: 'Nota fiscal', tipo: 'texto' },
          { nome: 'qtd', rotulo: 'Quantidade', tipo: 'numero', obrigatorio: true, min: 0 },
          { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', min: 0 },
          { nome: 'frete', rotulo: 'Frete alocado', tipo: 'moeda', min: 0 }
        ]
      },
      { tipo: 'secao', rotulo: 'Liquidação' },
      { nome: 'liquidacao.data', rotulo: 'Data da liquidação', tipo: 'data', largura: 'terco' },
      { nome: 'liquidacao.glosa', rotulo: 'Valor glosado', tipo: 'moeda', min: 0, largura: 'terco' },
      { nome: 'liquidacao.valor', rotulo: 'Valor liquidado', tipo: 'moeda', min: 0, largura: 'terco', ajuda: 'Em branco: faturado − glosa.' },
      { tipo: 'secao', rotulo: 'Pagamento' },
      { nome: 'pagamento.data', rotulo: 'Data do pagamento', tipo: 'data', largura: 'meia', ajuda: 'Ao informar, o sistema registra o recebimento no caixa.',
        validar: (v, t) => (v && !t.liquidacao.data ? 'Informe a liquidação antes do pagamento.' : null) },
      { nome: 'pagamento.valor', rotulo: 'Valor pago', tipo: 'moeda', min: 0, largura: 'meia', ajuda: 'Em branco: valor liquidado.' }
    ];
  }

  /**
   * Cria, atualiza ou remove o lançamento de caixa ligado ao pagamento do
   * empenho (origemId = id do empenho), para o caixa refletir o recebimento.
   */
  function sincronizarLancamento(empenho, contrato) {
    const store = NS.core.store;
    const existente = store.listar('lancamentos').find((l) => l.origemId === empenho.id);
    const pag = empenho.pagamento || {};
    if (!pag.data) {
      if (existente) store.remover('lancamentos', existente.id);
      return;
    }
    const centroReceita = store.listar('centros').find((c) => c.tipo === 'receita');
    const dados = {
      data: pag.data, competencia: pag.data.slice(0, 7), tipo: 'entrada', categoria: 'Recebimento de contratos',
      centroId: existente ? existente.centroId : (centroReceita ? centroReceita.id : ''), contratoId: contrato.id,
      valor: pag.valor, situacao: 'realizado', descricao: `Pagamento do empenho ${empenho.numero} (${nomeContrato(contrato)})`, origemId: empenho.id
    };
    if (existente) store.atualizar('lancamentos', existente.id, dados);
    else store.inserir('lancamentos', dados);
  }

  /** Abre o formulário de empenho, conferindo o saldo da ata/contrato. */
  function abrirEmpenho(contrato, reg) {
    const store = NS.core.store;
    const F = NS.core.format;
    const B = NS.calc.base;
    NS.ui.abrirFormulario({
      titulo: reg ? `Editar empenho ${reg.numero}` : `Registrar empenho · ${nomeContrato(contrato)}`,
      campos: camposEmpenho(contrato),
      valores: reg || { data: NS.core.hoje(), itens: [], entregas: [], liquidacao: {}, pagamento: {} },
      rotuloSalvar: 'Salvar empenho',
      mensagemSucesso: 'Empenho salvo.',
      larga: true,
      aoSalvar: (v) => {
        const preco = new Map((contrato.itens || []).map((i) => [i.produtoId, i.precoContratado]));
        // Saldo: nenhum produto pode ser empenhado acima da quantidade registrada.
        const outros = store.listar('empenhos').filter((e) => e.contratoId === contrato.id && (!reg || e.id !== reg.id));
        const jaEmpenhado = NS.calc.contratos.qtdEmpenhada(outros);
        const erros = [];
        for (const item of contrato.itens || []) {
          const pedido = B.soma(v.itens.filter((i) => i.produtoId === item.produtoId), (i) => i.qtd);
          const saldo = item.qtdRegistrada - (jaEmpenhado.get(item.produtoId) || 0);
          if (pedido > saldo + 1e-9) {
            erros.push({ campo: 'itens', mensagem: `${NS.modules.comum.nome('produtos', item.produtoId)}: o empenho de ${F.numero(pedido)} passa o saldo disponível de ${F.numero(Math.max(saldo, 0))}. Reduza a quantidade ou registre um aditivo no contrato.` });
          }
        }
        if (erros.length) return { erros };
        const entregas = v.entregas.map((e) => Object.assign({}, e, {
          valor: e.valor === null ? Math.round(B.num(e.qtd) * B.num(preco.get(e.produtoId)) * 100) / 100 : e.valor,
          frete: e.frete === null ? 0 : e.frete
        }));
        const faturado = B.soma(entregas, (e) => e.valor);
        const liquidacao = v.liquidacao.data
          ? { data: v.liquidacao.data, glosa: v.liquidacao.glosa || 0, valor: v.liquidacao.valor === null ? Math.round((faturado - (v.liquidacao.glosa || 0)) * 100) / 100 : v.liquidacao.valor }
          : {};
        const pagamento = v.pagamento.data
          ? { data: v.pagamento.data, valor: v.pagamento.valor === null ? (liquidacao.valor ?? faturado) : v.pagamento.valor }
          : {};
        const dados = { contratoId: contrato.id, numero: v.numero, data: v.data, itens: v.itens, entregas, liquidacao, pagamento };
        store.emLote(() => {
          const salvo = reg ? store.atualizar('empenhos', reg.id, dados) : store.inserir('empenhos', dados);
          sincronizarLancamento(salvo, contrato);
        });
        return true;
      }
    });
  }

  /* ------------------------------ Lista de contratos ------------------------------ */

  /** Situação de um empenho para a tabela. */
  function situacaoEmpenho(emp, orgao, hoje) {
    const B = NS.calc.base;
    const F = NS.core.format;
    const { status } = NS.ui;
    if (emp.pagamento && emp.pagamento.data) return { texto: 'Pago', html: status('dentro', `Pago em ${F.data(emp.pagamento.data)}`) };
    if (emp.liquidacao && emp.liquidacao.data) {
      const venc = B.somarDias(emp.liquidacao.data, B.num(orgao ? orgao.prazoPagamentoContratual : 0));
      const atraso = B.diasEntre(venc, hoje);
      return atraso > 0
        ? { texto: 'Vencido', html: status('fora', `Vencido há ${F.dias(atraso)}`) }
        : { texto: 'A receber', html: status('atencao', `A receber até ${F.data(venc)}`) };
    }
    const entregas = emp.entregas || [];
    if (entregas.length && entregas.every((e) => e.real)) return { texto: 'Aguardando liquidação', html: status('atencao', 'Aguardando liquidação') };
    const atrasadas = entregas.filter((e) => !e.real && e.prevista < hoje).length;
    return atrasadas
      ? { texto: 'Entrega atrasada', html: status('fora', `${atrasadas} entrega(s) atrasada(s)`) }
      : { texto: 'Em entrega', html: status('sem-dados', 'Em entrega') };
  }

  /** Tela com a lista de contratos e atas. */
  function telaLista(el, rota, ctx) {
    const { html, icone, status, graficos, raw } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const analises = ctx.contratosAnalisados(ctx.hoje);
    const limite = ctx.limites.defasagemAtencao ?? 0.05;
    const alertas = ctx.alertas();
    const linhas = analises.map((a) => {
      const c = a.contrato;
      return {
        id: c.id, numero: c.numero, nome: nomeContrato(c), tipo: c.tipo, orgao: C.nome('orgaos', c.orgaoId),
        vigenciaFim: c.vigenciaFim, dias: a.diasParaFimVigencia, vigente: a.vigente,
        valorRegistrado: a.valorRegistrado, pctConsumido: a.pctConsumido, margemPrevista: a.margemPrevista, margemAtual: a.margemAtual,
        erosao: a.erosao, defasagem: a.defasagemMaxima, valorAFaturar: a.valorAFaturar, entregasPrazo: a.entregasNoPrazo.pct,
        resultado: a.resultadoContribuicao, alertas: alertas.filter((x) => x.rota === `contratos/${c.id}` && !x.dispensado).length
      };
    });
    const vigentes = analises.filter((a) => a.vigente);
    const orgaos = ctx.orgaosAnalisados(ctx.hoje);
    const totalPrazo = B.soma(analises, (a) => a.entregasNoPrazo.total);
    const situacaoVigencia = (l) => {
      if (l.dias < 0) return status('sem-dados', 'Encerrado');
      if (l.dias <= (ctx.limites.vigenciaCriticoDias ?? 30)) return status('fora', `Termina em ${F.dias(l.dias)}`);
      if (l.dias <= (ctx.limites.vigenciaAtencaoDias ?? 60)) return status('atencao', `Termina em ${F.dias(l.dias)}`);
      return html`${F.data(l.vigenciaFim)}`;
    };

    el.innerHTML = String(html`
      ${C.cabecalho({
        titulo: 'Contratos públicos',
        subtitulo: 'Margem prevista × atual, defasagem de custo, saldo das atas, entregas, liquidação e recebimento por órgão.',
        acoes: html`<button type="button" class="botao botao-primario" data-acao="novo-contrato">${icone('mais')}Cadastrar contrato</button>`
      })}
      ${C.abas(ABAS, 'lista')}
      ${!ctx.dados.orgaos.length ? html`<p class="caixa-info">Antes de cadastrar contratos, preencha os órgãos públicos em <a href="#/cadastros/orgaos">Cadastros › Órgãos públicos</a> e os produtos em <a href="#/cadastros/produtos">Cadastros › Produtos</a>.</p>` : ''}
      ${analises.length ? html`
      <section class="resumo" aria-label="Resumo dos contratos">
        <div class="resumo-item"><div class="resumo-rotulo">Contratos e atas vigentes</div><div class="resumo-valor">${vigentes.length}</div><div class="resumo-detalhe">${analises.length} cadastrados</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Valor ainda a faturar</div><div class="resumo-valor">${F.moeda(B.soma(vigentes, (a) => a.valorAFaturar))}</div><div class="resumo-detalhe">Saldo × preço contratado</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Margem prevista → atual</div><div class="resumo-valor">${F.pct(B.mediaPonderada(vigentes, (a) => a.margemAtual, (a) => a.valorRegistrado))}</div>
          <div class="resumo-detalhe">Prevista ${F.pct(B.mediaPonderada(vigentes, (a) => a.margemPrevista, (a) => a.valorRegistrado))} (ponderada pelo valor)</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Defasagem ≥ ${F.pct(limite, 0)}</div><div class="resumo-valor">${vigentes.filter((a) => a.defasagemMaxima !== null && a.defasagemMaxima >= limite).length}</div><div class="resumo-detalhe">contratos vigentes</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Recebíveis vencidos</div><div class="resumo-valor">${F.moeda(B.soma(orgaos, (o) => o.recebiveis.vencido))}</div><div class="resumo-detalhe">Em aberto: ${F.moeda(B.soma(orgaos, (o) => o.recebiveis.emAberto))}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Entregas no prazo</div><div class="resumo-valor">${F.pct(B.div(B.soma(analises, (a) => a.entregasNoPrazo.noPrazo), totalPrazo))}</div><div class="resumo-detalhe">${F.numero(totalPrazo)} entregas devidas</div></div>
      </section>` : ''}
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Contratos e atas</h2><p>Margem atual = (preço − custo real médio dos últimos 3 lotes) ÷ preço. Sem lotes, usa o custo padrão.</p></div>
        <div data-slot="tabela"></div>
        ${analises.length ? graficos.barrasAgrupadas({
          grupos: linhas.map((l) => l.numero),
          series: [{ nome: 'Margem prevista', valores: linhas.map((l) => l.margemPrevista) }, { nome: 'Margem atual', valores: linhas.map((l) => l.margemAtual) }],
          formatar: (v) => F.pct(v), titulo: 'Margem prevista × atual por contrato', altura: 220
        }) : ''}
        ${analises.length ? C.fonteDado('contratos, empenhos e lotes de produção', ['contratos', 'empenhos', 'lotes']) : ''}
      </section>`);

    NS.ui.encaixar(el, {
      tabela: NS.ui.tabela({
        legenda: 'Contratos e atas', csv: 'contratos', linhas, ordenarPor: 'dias',
        vazio: NS.ui.vazio('Nenhum contrato cadastrado. Cadastre o primeiro contrato para acompanhar margem e saldo.', { rotulo: 'Cadastrar contrato', dataAcao: 'novo-contrato' }),
        classeLinha: (l) => (l.defasagem !== null && l.defasagem >= (ctx.limites.defasagemCritico ?? 0.1) ? 'linha-fora' : (l.defasagem !== null && l.defasagem >= limite ? 'linha-atencao' : '')),
        colunas: [
          { chave: 'nome', rotulo: 'Contrato', exibir: (l) => html`<a href="#/contratos/${l.id}">${l.nome}</a>` },
          { chave: 'orgao', rotulo: 'Órgão' },
          { chave: 'dias', rotulo: 'Vigência', exibir: situacaoVigencia, csv: (l) => F.data(l.vigenciaFim) },
          { chave: 'valorRegistrado', rotulo: 'Valor registrado', tipo: 'moeda' },
          { chave: 'pctConsumido', rotulo: 'Consumido', tipo: 'pct' },
          { chave: 'margemPrevista', rotulo: 'Margem prevista', tipo: 'pct' },
          { chave: 'margemAtual', rotulo: 'Margem atual', tipo: 'pct' },
          { chave: 'erosao', rotulo: 'Erosão', tipo: 'pp' },
          { chave: 'defasagem', rotulo: 'Defasagem máx.', tipo: 'pct', exibir: (l) => (l.defasagem === null ? 'sem dados'
            : (l.defasagem >= limite ? status(l.defasagem >= (ctx.limites.defasagemCritico ?? 0.1) ? 'fora' : 'atencao', F.pct(l.defasagem)) : raw(F.pct(l.defasagem)))) },
          { chave: 'valorAFaturar', rotulo: 'A faturar', tipo: 'moeda' },
          { chave: 'entregasPrazo', rotulo: 'Entregas no prazo', tipo: 'pct' },
          { chave: 'resultado', rotulo: 'Resultado de contribuição', tipo: 'moeda' },
          { chave: 'alertas', rotulo: 'Alertas', tipo: 'quantidade' }
        ]
      })
    });
    el.onclick = (ev) => {
      if (ev.target.closest('[data-acao="novo-contrato"]')) abrirContrato(null);
    };
  }

  /* ------------------------------ Detalhe do contrato ------------------------------ */

  /** Evidência para avaliar reequilíbrio: custos, decomposição e notas de compra. */
  function evidenciaReequilibrio(a, ctx) {
    const { html } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const limite = ctx.limites.defasagemAtencao ?? 0.05;
    const itens = a.itens.filter((i) => i.defasagem !== null && i.defasagem >= limite);
    if (!itens.length) return '';
    const inicio = a.contrato.dataBaseProposta < B.somarDias(ctx.hoje, -180) ? B.somarDias(ctx.hoje, -180) : a.contrato.dataBaseProposta;
    const blocos = itens.map((it) => {
      const produto = ctx.produtosPorId.get(it.produtoId);
      const insumosFicha = new Set(((produto && produto.fichaTecnica) || []).map((f) => f.insumoId));
      const compras = ctx.dados.movimentosEstoque
        .filter((m) => m.itemTipo === 'insumo' && m.tipo === 'entrada' && insumosFicha.has(m.itemId) && m.data >= inicio && m.qtd > 0)
        .map((m) => {
          const ins = ctx.insumosPorId.get(m.itemId);
          const preco = B.div(m.valor, m.qtd);
          return { data: m.data, insumo: ins ? ins.nome : '—', documento: m.documento || m.lote || '—', qtd: m.qtd, preco, padrao: ins ? ins.precoPadrao : null, variacao: B.variacaoPct(preco, ins ? ins.precoPadrao : null) };
        })
        .sort((x, y) => (x.data < y.data ? 1 : -1));
      return html`<div class="bloco-plano">
        <h3>${produto ? produto.nome : 'Produto removido'}</h3>
        <dl class="lista-definicao">
          <dt>Custo considerado na proposta (data-base ${F.data(a.contrato.dataBaseProposta)})</dt><dd class="num">${F.moeda(it.custoProposta)}</dd>
          <dt>Custo atual (${it.fonteCusto === 'lotes' ? `média dos lotes ${it.lotesUsados.join(', ')}` : 'custo padrão: não há lotes'})</dt><dd class="num">${F.moeda(it.custoAtual)}</dd>
          <dt>Variação do custo (defasagem)</dt><dd class="num">${F.pct(it.defasagem)}</dd>
          <dt>Parte por ineficiência interna (consumo e MOD acima do padrão)</dt><dd class="num">${F.moeda(it.ineficienciaUnit)} por unidade</dd>
          <dt>Defasagem sem a ineficiência interna</dt><dd class="num">${F.pct(it.defasagemSemIneficiencia)}</dd>
          <dt>Margem prevista → atual</dt><dd class="num">${F.pct(it.margemPrevista)} → ${F.pct(it.margemAtual)}</dd>
        </dl>
        <p class="nota">Ineficiência interna é responsabilidade da Produção e, em regra, não é base para pedido ao órgão.</p>
        <h4 class="espaco-acima">Notas de compra dos insumos desde ${F.data(inicio)}</h4>
        ${compras.length ? html`<div class="tabela-rolagem"><table class="tabela tabela-compacta">
          <caption class="visualmente-oculto">Notas de compra dos insumos de ${produto ? produto.nome : ''}</caption>
          <thead><tr><th scope="col">Data</th><th scope="col">Insumo</th><th scope="col">Documento</th><th scope="col" class="num">Quantidade</th><th scope="col" class="num">Preço unitário</th><th scope="col" class="num">Preço padrão</th><th scope="col" class="num">Variação</th></tr></thead>
          <tbody>${compras.slice(0, 30).map((c) => html`<tr><td>${F.data(c.data)}</td><td>${c.insumo}</td><td>${c.documento}</td><td class="num">${F.numero(c.qtd, 1)}</td><td class="num">${F.moeda(c.preco)}</td><td class="num">${F.moeda(c.padrao)}</td><td class="num">${F.pct(c.variacao)}</td></tr>`)}</tbody>
        </table></div>` : html`<p class="suave">Nenhuma entrada de insumo registrada no estoque desde ${F.data(inicio)}. Registre as notas de compra em Estoque › Movimentos para compor a evidência.</p>`}
      </div>`;
    });
    return html`<section class="bloco" aria-labelledby="titulo-reequilibrio">
      <div class="bloco-cabecalho"><h2 id="titulo-reequilibrio">Avaliar pedido de reequilíbrio ou reajuste</h2>
        <p>Evidência reunida pelo sistema para os itens com defasagem ≥ ${F.pct(limite, 0)}.</p></div>
      <p class="aviso-juridico">${NS.calc.alertas.AVISO_JURIDICO}</p>
      ${blocos}
    </section>`;
  }

  /** Alertas ligados a este contrato, em lista clara com "Registrar ação". */
  function alertasDoContrato(lista) {
    const { html, gravidade, icone } = NS.ui;
    if (!lista.length) return '';
    return html`<section class="bloco" aria-labelledby="titulo-alertas-contrato">
      <div class="bloco-cabecalho"><h2 id="titulo-alertas-contrato">Desvios deste contrato</h2></div>
      <div class="tabela-rolagem"><table class="tabela">
        <caption class="visualmente-oculto">Desvios do contrato</caption>
        <thead><tr><th scope="col">Gravidade</th><th scope="col">Desvio</th><th scope="col">Responsável sugerido</th><th scope="col"><span class="visualmente-oculto">Ação</span></th></tr></thead>
        <tbody>${lista.map((a) => html`<tr>
          <td>${gravidade(a.gravidade)}</td>
          <td><strong>${a.titulo}</strong><span class="subtexto">${a.mensagem}</span></td>
          <td>${a.responsavel}</td>
          <td class="celula-acoes">${a.plano ? html`<span class="subtexto">Ação ${a.plano.status === 'andamento' ? 'em andamento' : 'aberta'} · prazo ${NS.core.format.data(a.plano.prazo)}</span>` : ''}
            <button type="button" class="botao botao-secundario botao-pequeno" data-acao="registrar-acao" data-chave="${a.chave}">${icone('acao')}Registrar ação</button></td>
        </tr>`)}</tbody>
      </table></div>
    </section>`;
  }

  /** Detalhe de um contrato. */
  function telaDetalhe(el, rota, ctx) {
    const { html, icone, status } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const a = ctx.contratoAnalisado(rota.params.id, ctx.hoje);
    if (!a) {
      el.innerHTML = String(html`${C.cabecalho({ titulo: 'Contrato não encontrado' })}${NS.ui.vazio('Este contrato não existe ou foi excluído.', { rotulo: 'Voltar para contratos', rota: 'contratos' })}`);
      return;
    }
    const c = a.contrato;
    const orgao = ctx.orgaosPorId.get(c.orgaoId);
    const alertas = ctx.alertas().filter((x) => x.rota === `contratos/${c.id}` && !x.dispensado);
    const aniv = NS.calc.alertas.aniversarioRelevante(c.dataBaseProposta, ctx.hoje, 400, 0);
    const limite = ctx.limites.defasagemAtencao ?? 0.05;

    el.innerHTML = String(html`
      ${C.cabecalho({
        titulo: nomeContrato(c),
        migalha: html`<a href="#/contratos">${icone('voltar')}Contratos públicos</a>`,
        subtitulo: `${orgao ? orgao.nome : 'Órgão removido'}${c.processo ? ` · processo ${c.processo}` : ''}${c.modalidade ? ` · ${c.modalidade}` : ''}`,
        acoes: html`<button type="button" class="botao botao-primario" data-acao="novo-empenho">${icone('mais')}Registrar empenho</button>
          <button type="button" class="botao botao-secundario" data-acao="editar-contrato">${icone('editar')}Editar contrato</button>
          <button type="button" class="botao botao-texto" data-acao="excluir-contrato">${icone('excluir')}Excluir contrato</button>`
      })}
      <section class="resumo" aria-label="Resumo do contrato">
        <div class="resumo-item"><div class="resumo-rotulo">Vigência</div><div class="resumo-valor">${a.diasParaFimVigencia < 0 ? 'Encerrado' : F.dias(a.diasParaFimVigencia)}</div><div class="resumo-detalhe">${F.data(c.vigenciaInicio)} a ${F.data(c.vigenciaFim)}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Margem prevista → atual</div><div class="resumo-valor">${F.pct(a.margemAtual)}</div><div class="resumo-detalhe">Prevista ${F.pct(a.margemPrevista)} · erosão ${F.pp(a.erosao)}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Saldo ${c.tipo === 'ata' ? 'da ata' : 'do contrato'}</div><div class="resumo-valor">${F.pct(a.pctSaldo)}</div><div class="resumo-detalhe">${F.moeda(a.valorAFaturar)} a faturar</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Resultado de contribuição</div><div class="resumo-valor">${F.moeda(a.resultadoContribuicao)}</div><div class="resumo-detalhe">${F.pct(a.margemContribuicaoPct)} da receita entregue</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Entregas no prazo</div><div class="resumo-valor">${F.pct(a.entregasNoPrazo.pct)}</div><div class="resumo-detalhe">${a.entregasNoPrazo.noPrazo} de ${a.entregasNoPrazo.total} devidas</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Glosas e multas</div><div class="resumo-valor">${F.moeda(a.glosas + a.multas)}</div><div class="resumo-detalhe">Glosas ${F.pct(a.glosasPct)} · multas ${F.moeda(a.multas)}</div></div>
      </section>
      ${alertasDoContrato(alertas)}
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Dados do contrato</h2></div>
        <dl class="lista-definicao">
          <dt>Tipo</dt><dd>${C.ROTULOS.tipoContrato[c.tipo]}</dd>
          <dt>Assinatura</dt><dd>${c.assinatura ? F.data(c.assinatura) : 'não informada'}</dd>
          <dt>Data-base da proposta</dt><dd>${F.data(c.dataBaseProposta)}${aniv ? ` · próximo aniversário de 12 meses em ${F.data(aniv.data)} (${aniv.dias >= 0 ? `em ${F.dias(aniv.dias)}` : `há ${F.dias(-aniv.dias)}`})` : ''}</dd>
          <dt>Índice de reajuste previsto</dt><dd>${c.indiceReajuste || 'não informado'}</dd>
          <dt>Garantia contratual</dt><dd>${c.garantia && c.garantia.valor ? `${F.moeda(c.garantia.valor)}${c.garantia.vencimento ? `, vence em ${F.data(c.garantia.vencimento)}` : ''}` : 'não informada'}</dd>
        </dl>
      </section>
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Itens: margem, defasagem e saldo</h2>
          <p>Esgotamento estimado pelo ritmo médio de empenho dos últimos 90 dias.</p></div>
        <div data-slot="itens"></div>
      </section>
      ${evidenciaReequilibrio(a, ctx)}
      <div class="grade-2">
        <section class="bloco">
          <div class="bloco-cabecalho"><h2>Resultado de contribuição do contrato</h2><p>Receita entregue − custo variável − frete − multas − glosas</p></div>
          <dl class="lista-definicao">
            <dt>Receita entregue</dt><dd class="num">${F.moeda(a.receitaEntregue)}</dd>
            <dt>(−) Custo variável dos itens entregues</dt><dd class="num">${F.moeda(a.custoVariavel)}</dd>
            <dt>(−) Frete alocado</dt><dd class="num">${F.moeda(a.frete)}</dd>
            <dt>(−) Multas</dt><dd class="num">${F.moeda(a.multas)}</dd>
            <dt>(−) Glosas</dt><dd class="num">${F.moeda(a.glosas)}</dd>
            <dt><strong>Resultado de contribuição</strong></dt><dd class="num"><strong>${F.moeda(a.resultadoContribuicao)}</strong></dd>
          </dl>
          <p class="nota">Custo variável = materiais + MOD reais médios dos últimos 3 lotes de cada produto.</p>
        </section>
        <section class="bloco">
          <div class="bloco-cabecalho"><h2>Penalidades</h2></div>
          ${(c.penalidades || []).length ? html`<dl class="lista-definicao">${c.penalidades.map((p) => html`<dt>${F.data(p.data)} · ${p.motivo}</dt><dd class="num">${F.moeda(p.valor)}</dd>`)}</dl>`
            : html`<p class="suave">Nenhuma penalidade registrada. Registre multas em "Editar contrato".</p>`}
        </section>
      </div>
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Empenhos, entregas, liquidação e pagamento</h2>
          <p>Prazo contratual de pagamento do órgão: ${orgao ? F.dias(orgao.prazoPagamentoContratual) : 'não informado'}.</p></div>
        <div data-slot="empenhos"></div>
      </section>`);

    const tabItens = NS.ui.tabela({
      legenda: 'Itens do contrato', csv: `contrato_${c.numero}_itens`, linhas: a.itens.map((i, k) => Object.assign({ id: String(k), nome: i.produto ? i.produto.nome : 'Produto removido' }, i)),
      classeLinha: (l) => (l.defasagem !== null && l.defasagem >= (ctx.limites.defasagemCritico ?? 0.1) ? 'linha-fora' : (l.defasagem !== null && l.defasagem >= limite ? 'linha-atencao' : '')),
      colunas: [
        { chave: 'nome', rotulo: 'Produto' },
        { chave: 'qtdRegistrada', rotulo: 'Registrado', tipo: 'quantidade' },
        { chave: 'qtdEmpenhada', rotulo: 'Empenhado', tipo: 'quantidade' },
        { chave: 'saldo', rotulo: 'Saldo', tipo: 'quantidade' },
        { chave: 'pctConsumido', rotulo: 'Consumido', tipo: 'pct' },
        { chave: 'precoContratado', rotulo: 'Preço', tipo: 'moeda' },
        { chave: 'custoProposta', rotulo: 'Custo proposta', tipo: 'moeda' },
        { chave: 'custoAtual', rotulo: 'Custo atual', tipo: 'moeda', exibir: (l) => html`${F.moeda(l.custoAtual)}<span class="subtexto">${l.fonteCusto === 'lotes' ? 'últimos lotes' : 'padrão (sem lotes)'}</span>` },
        { chave: 'margemPrevista', rotulo: 'Margem prevista', tipo: 'pct' },
        { chave: 'margemAtual', rotulo: 'Margem atual', tipo: 'pct' },
        { chave: 'erosao', rotulo: 'Erosão', tipo: 'pp' },
        { chave: 'defasagem', rotulo: 'Defasagem', tipo: 'pct', exibir: (l) => (l.defasagem !== null && l.defasagem >= limite ? status(l.defasagem >= (ctx.limites.defasagemCritico ?? 0.1) ? 'fora' : 'atencao', F.pct(l.defasagem)) : F.pct(l.defasagem)) },
        { chave: 'ritmoDiario', rotulo: 'Ritmo/dia', tipo: 'numero', casas: 1 },
        { chave: 'dataEsgotamento', rotulo: 'Esgota em', tipo: 'data', exibir: (l) => (l.dataEsgotamento ? html`${F.data(l.dataEsgotamento)}${l.dataEsgotamento < c.vigenciaFim ? html`<span class="subtexto negativo">antes do fim da vigência</span>` : ''}` : 'sem ritmo') },
        { chave: 'valorAFaturar', rotulo: 'A faturar', tipo: 'moeda' }
      ],
      totais: (ls) => ({ nome: 'Total', valorAFaturar: B.soma(ls, (l) => l.valorAFaturar), margemPrevista: a.margemPrevista, margemAtual: a.margemAtual, erosao: a.erosao })
    });

    const linhasEmp = a.empenhos.map((e) => {
      const sit = situacaoEmpenho(e, orgao, ctx.hoje);
      const ent = e.entregas || [];
      return {
        id: e.id, numero: e.numero, data: e.data, qtd: B.soma(e.itens || [], (i) => i.qtd),
        entregues: `${ent.filter((x) => x.real).length} de ${ent.length}`, faturado: B.soma(ent.filter((x) => x.real), (x) => x.valor),
        liquidacao: e.liquidacao && e.liquidacao.data, glosa: e.liquidacao ? e.liquidacao.glosa : null,
        pagamento: e.pagamento && e.pagamento.data, situacao: sit
      };
    });
    const tabEmp = NS.ui.tabela({
      legenda: 'Empenhos do contrato', csv: `contrato_${c.numero}_empenhos`, linhas: linhasEmp, ordenarPor: 'data', ordem: 'desc',
      vazio: NS.ui.vazio('Nenhum empenho registrado. Registre os empenhos com entregas, liquidação e pagamento para acompanhar saldo e recebimento.', { rotulo: 'Registrar empenho', dataAcao: 'novo-empenho' }),
      colunas: [
        { chave: 'numero', rotulo: 'Empenho' },
        { chave: 'data', rotulo: 'Data', tipo: 'data' },
        { chave: 'qtd', rotulo: 'Qtd empenhada', tipo: 'quantidade' },
        { chave: 'entregues', rotulo: 'Entregas' },
        { chave: 'faturado', rotulo: 'Faturado', tipo: 'moeda' },
        { chave: 'liquidacao', rotulo: 'Liquidação', tipo: 'data' },
        { chave: 'glosa', rotulo: 'Glosa', tipo: 'moeda' },
        { chave: 'pagamento', rotulo: 'Pagamento', tipo: 'data' },
        { chave: 'situacao', rotulo: 'Situação', valor: (l) => l.situacao.texto, exibir: (l) => l.situacao.html, csv: (l) => l.situacao.texto },
        { rotulo: 'Ações', tipo: 'acoes', exibir: (l) => html`<button type="button" class="botao botao-texto botao-pequeno" data-acao="editar-empenho" data-id="${l.id}" aria-label="Editar empenho ${l.numero}">${icone('editar')}Editar</button>
          <button type="button" class="botao botao-texto botao-pequeno" data-acao="excluir-empenho" data-id="${l.id}" aria-label="Excluir empenho ${l.numero}">${icone('excluir')}Excluir</button>` }
      ]
    });
    NS.ui.encaixar(el, { itens: tabItens, empenhos: tabEmp });

    el.onclick = async (ev) => {
      const alvo = ev.target.closest('[data-acao]');
      if (!alvo) return;
      const store = NS.core.store;
      const acao = alvo.dataset.acao;
      if (acao === 'novo-empenho') abrirEmpenho(c, null);
      else if (acao === 'editar-contrato') abrirContrato(store.obter('contratos', c.id));
      else if (acao === 'editar-empenho') abrirEmpenho(c, store.obter('empenhos', alvo.dataset.id));
      else if (acao === 'excluir-empenho') {
        const emp = store.obter('empenhos', alvo.dataset.id);
        C.excluir({
          colecao: 'empenhos', id: emp.id, titulo: 'Excluir empenho', rotulo: 'Excluir empenho', sucesso: 'Empenho excluído.',
          mensagem: `O empenho ${emp.numero} será excluído, com suas entregas e o lançamento de recebimento ligado a ele.`,
          descricaoLog: `Empenho ${emp.numero} excluído (${nomeContrato(c)}).`,
          depois: () => {
            const lanc = store.listar('lancamentos').find((l) => l.origemId === emp.id);
            if (lanc) store.remover('lancamentos', lanc.id);
          }
        });
      } else if (acao === 'excluir-contrato') {
        const usos = C.referencias('contratos', c.id);
        if (usos.length) {
          NS.ui.modal.abrir({
            titulo: 'Não é possível excluir o contrato',
            conteudo: html`<p>${nomeContrato(c)} tem ${usos.join(', ')}.</p><p>Exclua os empenhos antes, se o contrato foi cadastrado por engano.</p>
              <div class="formulario-acoes"><button type="button" class="botao botao-primario" data-fechar>Entendi</button></div>`
          });
          return;
        }
        const ok = await C.excluir({ colecao: 'contratos', id: c.id, titulo: 'Excluir contrato', rotulo: 'Excluir contrato', sucesso: 'Contrato excluído.',
          mensagem: `${nomeContrato(c)} será excluído definitivamente.`, descricaoLog: `${nomeContrato(c)} excluído.` });
        if (ok) NS.core.router.ir('contratos');
      } else if (acao === 'registrar-acao') {
        const al = alertas.find((x) => x.chave === alvo.dataset.chave);
        if (al) {
          C.abrirRegistrarAcao({ origem: 'alerta', referenciaId: al.chave, titulo: al.titulo, desvio: `${al.titulo}. ${al.mensagem}`,
            responsavel: al.responsavel, acao: al.acaoSugerida, prazo: B.somarDias(ctx.hoje, al.gravidade === 'critico' ? 7 : 15) });
        }
      }
    };
  }

  /* ------------------------------ Órgãos e recebíveis ------------------------------ */

  /** Tela de órgãos: prazo médio real, recebíveis e concentração. */
  function telaOrgaos(el, rota, ctx) {
    const { html, status, graficos } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const analises = ctx.orgaosAnalisados(ctx.hoje);
    const total12 = B.soma(analises, (o) => o.receita12m);
    const linhas = analises.map((o) => ({
      id: o.orgao.id, nome: o.orgao.nome, esfera: C.ROTULOS.esfera[o.orgao.esfera], contratual: o.orgao.prazoPagamentoContratual,
      desdeLiquidacao: o.prazoMedioLiquidacao, desdeEntrega: o.prazoMedioEntrega, atraso: o.atrasoMedio, pagamentos: o.pagamentosConsiderados,
      aguardando: o.recebiveis.aguardandoLiquidacao, aReceber: o.recebiveis.liquidadoAReceber, vencido: o.recebiveis.vencido,
      receita12m: o.receita12m, concentracao: NS.calc.contratos.concentracao(o.receita12m, total12)
    }));
    const titulos = [];
    for (const o of analises) {
      for (const t of o.recebiveis.titulos) {
        const contrato = ctx.contratosPorId.get(t.empenho.contratoId);
        titulos.push({ id: t.empenho.id, empenho: t.empenho.numero, contrato: contrato ? nomeContrato(contrato) : '—', contratoId: t.empenho.contratoId,
          orgao: o.orgao.nome, situacao: t.situacao, valor: t.valor, liquidacao: t.liquidacao, vencimento: t.vencimento, diasAtraso: t.diasAtraso });
      }
    }
    const rotSit = { vencido: 'Vencido', 'a-vencer': 'A vencer', aguardando: 'Aguardando liquidação' };
    el.innerHTML = String(html`
      ${C.cabecalho({ titulo: 'Contratos públicos', subtitulo: 'Prazo médio real de pagamento de cada órgão (usado na projeção de caixa), recebíveis e concentração de receita.' })}
      ${C.abas(ABAS, 'orgaos')}
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Órgãos: prazo real × contratual</h2>
          <p>Prazo médio real = média de (pagamento − liquidação) e de (pagamento − última entrega). Recebível vencido = liquidado e não pago após o prazo contratual.</p></div>
        <div data-slot="orgaos"></div>
        ${analises.length && total12 > 0 ? graficos.barras({ horizontal: true, itens: linhas.map((l) => ({ rotulo: l.nome, valor: l.concentracao })), formatar: (v) => F.pct(v), titulo: 'Concentração de receita por órgão (12 meses)' }) : ''}
      </section>
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Recebíveis em aberto</h2><p>Faturado e não pago até hoje, ${F.data(ctx.hoje)}.</p></div>
        <div data-slot="titulos"></div>
      </section>`);
    NS.ui.encaixar(el, {
      orgaos: NS.ui.tabela({
        legenda: 'Órgãos e prazos de pagamento', csv: 'orgaos_recebiveis', linhas, ordenarPor: 'vencido', ordem: 'desc',
        vazio: NS.ui.vazio('Nenhum órgão cadastrado. Preencha os órgãos públicos para vincular contratos e acompanhar recebimentos.', { rotulo: 'Cadastrar órgão', rota: 'cadastros/orgaos' }),
        classeLinha: (l) => (l.vencido > 0 ? 'linha-fora' : ''),
        colunas: [
          { chave: 'nome', rotulo: 'Órgão' },
          { chave: 'esfera', rotulo: 'Esfera' },
          { chave: 'contratual', rotulo: 'Prazo contratual', tipo: 'dias' },
          { chave: 'desdeLiquidacao', rotulo: 'Real desde a liquidação', tipo: 'dias' },
          { chave: 'desdeEntrega', rotulo: 'Real desde a entrega', tipo: 'dias' },
          { chave: 'atraso', rotulo: 'Atraso médio', tipo: 'dias', exibir: (l) => (l.atraso === null ? 'sem pagamentos' : (l.atraso > 0 ? status('fora', `+${F.dias(l.atraso)}`) : status('dentro', 'no prazo'))) },
          { chave: 'aguardando', rotulo: 'Aguardando liquidação', tipo: 'moeda' },
          { chave: 'aReceber', rotulo: 'Liquidado a receber', tipo: 'moeda' },
          { chave: 'vencido', rotulo: 'Vencido', tipo: 'moeda' },
          { chave: 'receita12m', rotulo: 'Receita 12 meses', tipo: 'moeda' },
          { chave: 'concentracao', rotulo: 'Concentração', tipo: 'pct' }
        ],
        totais: (ls) => ({ nome: 'Total', aguardando: B.soma(ls, (l) => l.aguardando), aReceber: B.soma(ls, (l) => l.aReceber), vencido: B.soma(ls, (l) => l.vencido), receita12m: total12 })
      }),
      titulos: NS.ui.tabela({
        legenda: 'Recebíveis em aberto', csv: 'recebiveis_em_aberto', linhas: titulos, ordenarPor: 'diasAtraso', ordem: 'desc',
        vazio: NS.ui.vazio('Nenhum recebível em aberto.'),
        classeLinha: (l) => (l.situacao === 'vencido' ? 'linha-fora' : ''),
        colunas: [
          { chave: 'empenho', rotulo: 'Empenho' },
          { chave: 'contrato', rotulo: 'Contrato', exibir: (l) => html`<a href="#/contratos/${l.contratoId}">${l.contrato}</a>` },
          { chave: 'orgao', rotulo: 'Órgão' },
          { chave: 'situacao', rotulo: 'Situação', exibir: (l) => status(l.situacao === 'vencido' ? 'fora' : 'atencao', rotSit[l.situacao]), csv: (l) => rotSit[l.situacao] },
          { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
          { chave: 'liquidacao', rotulo: 'Liquidação', tipo: 'data' },
          { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' },
          { chave: 'diasAtraso', rotulo: 'Dias de atraso', tipo: 'quantidade' }
        ],
        totais: (ls) => ({ empenho: 'Total', valor: B.soma(ls, (l) => l.valor) })
      })
    });
  }

  NS.modules.contratos = {
    rotas: { contratos: telaLista, 'contratos/orgaos': telaOrgaos, 'contratos/:id': telaDetalhe },
    abrirContrato, abrirEmpenho, nomeContrato
  };
})(window);
