/* ==========================================================================
   modules/painel.js
   Tela "Estamos indo bem?":
   - seletor de competência e comparação com o mês anterior ou com o mesmo
     mês do ano anterior;
   - resumo do mês (a receita nunca aparece sozinha: vem ao lado de margem,
     custo unitário, prazo de entrega e glosas);
   - CENTRAL DE DESVIOS: alertas ordenados por gravidade, cada um com
     evidência, responsável sugerido e botão "Registrar ação";
   - indicadores nas 4 perspectivas do BSC (valor, meta, status, comparação,
     tendência de 12 meses e "Como é calculado");
   - ponte de margem (cascata) do mês anterior para o atual;
   - "Primeiros passos": o que ainda falta preencher (o sistema começa vazio).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  const LIMITE_INICIAL = 8; // desvios mostrados antes de "Mostrar todos"

  /**
   * Primeiros passos: lista do que falta preencher para o painel funcionar.
   * O sistema não inventa dados; este bloco orienta o preenchimento.
   */
  function primeirosPassos(ctx) {
    const { html, status } = NS.ui;
    const d = ctx.dados;
    const e = ctx.empresa;
    const tem = (col) => (d[col] || []).length > 0;
    const passos = [
      { rotulo: 'Dados da empresa (nome, alíquota efetiva, custo de capital)', rota: 'cadastros/empresa', feito: !!(e.nome && typeof e.aliquotaEfetiva === 'number' && typeof e.custoCapitalAA === 'number') },
      { rotulo: 'Centros de responsabilidade', rota: 'cadastros/centros', feito: tem('centros') },
      { rotulo: 'Insumos e produtos com ficha técnica', rota: 'cadastros/produtos', feito: tem('insumos') && tem('produtos') },
      { rotulo: 'Órgãos públicos, contratos e empenhos', rota: 'contratos', feito: tem('orgaos') && tem('contratos') },
      { rotulo: 'Metas e tolerâncias dos indicadores', rota: 'configuracoes', feito: (d.indicadores || []).every((i) => typeof i.meta === 'number') },
      { rotulo: 'Lotes de produção', rota: 'custos', feito: tem('lotes') },
      { rotulo: 'Demonstrações mensais (DRE e balanço)', rota: 'demonstracoes', feito: tem('demonstracoes') },
      { rotulo: 'Orçamento e lançamentos de caixa', rota: 'orcamento', feito: tem('orcamento') && tem('lancamentos') }
    ];
    const feitos = passos.filter((p) => p.feito).length;
    if (feitos === passos.length) return '';
    return html`<section class="bloco" aria-labelledby="titulo-passos">
      <div class="bloco-cabecalho"><h2 id="titulo-passos">Primeiros passos: preencha os dados</h2>
        <p>${feitos} de ${passos.length} etapas preenchidas. Os indicadores e alertas aparecem conforme os dados forem cadastrados.</p></div>
      <div class="tabela-rolagem"><table class="tabela">
        <caption class="visualmente-oculto">Etapas de preenchimento</caption>
        <thead><tr><th scope="col">Etapa</th><th scope="col">Situação</th><th scope="col"><span class="visualmente-oculto">Ação</span></th></tr></thead>
        <tbody>${passos.map((p) => html`<tr><td>${p.rotulo}</td><td>${p.feito ? status('dentro', 'Preenchido') : status('sem-dados', 'Para preencher')}</td>
          <td class="celula-acoes"><a class="botao ${p.feito ? 'botao-texto' : 'botao-secundario'} botao-pequeno" href="#/${p.rota}">${p.feito ? 'Revisar' : 'Preencher dados'}</a></td></tr>`)}</tbody>
      </table></div>
    </section>`;
  }

  /** Item do resumo do mês. */
  function itemResumo(rotulo, valor, detalhe) {
    const { html } = NS.ui;
    return html`<div class="resumo-item"><div class="resumo-rotulo">${rotulo}</div><div class="resumo-valor">${valor}</div><div class="resumo-detalhe">${detalhe}</div></div>`;
  }

  /** Resumo do mês: receita sempre acompanhada de margem, custo, prazo e glosas. */
  function resumoMes(ctx, comp, compRef, avaliacoes) {
    const { html, status, variacao } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const av = (id) => avaliacoes.find((a) => a.indicador.id === id);
    const dem = ctx.demPorComp.get(comp);
    const demRef = ctx.demPorComp.get(compRef);
    const fat = dem ? dem.receitaBruta : NS.calc.contratos.faturamento(ctx.dados.empenhos, B.primeiroDia(comp), B.ultimoDia(comp));
    const fatRef = demRef ? demRef.receitaBruta : NS.calc.contratos.faturamento(ctx.dados.empenhos, B.primeiroDia(compRef), B.ultimoDia(compRef));
    const varFat = B.variacaoPct(fat, fatRef);
    const temVendas = !!dem || (ctx.dados.empenhos || []).length > 0;
    const temCaixa = (ctx.dados.lancamentos || []).length > 0 || (ctx.dados.empenhos || []).length > 0;
    const prod = ctx.resumoProducao(comp);
    const mc = av('mc_pct');
    const ent = av('entregas_prazo');
    const glo = av('glosas_pct');
    const proj = ctx.projecaoCaixa();
    return html`<section class="resumo" aria-label="Resumo do mês">
      ${itemResumo('Faturamento', temVendas ? F.moeda(fat) : 'sem dados', !temVendas ? 'Preencha contratos e entregas' : (varFat === null ? `sem comparação com ${F.competencia(compRef)}` : variacao(varFat >= 0, `${F.pct(varFat)} vs ${F.competencia(compRef)}`)))}
      ${itemResumo('Margem de contribuição', mc ? F.pct(mc.valor) : 'sem dados', mc ? status(mc.status) : '')}
      ${itemResumo('Custo real × padrão', prod.lotes ? F.pct(prod.variacaoPct) : 'sem lotes', prod.lotes ? `Custo unitário médio ${F.moeda(prod.custoUnitario)} (padrão ${F.moeda(prod.custoPadraoUnit)})` : 'Registre os lotes do mês')}
      ${itemResumo('Entregas no prazo', ent ? F.pct(ent.valor) : 'sem dados', ent ? status(ent.status) : '')}
      ${itemResumo('Glosas', glo ? F.pct(glo.valor) : 'sem dados', glo ? status(glo.status) : '')}
      ${itemResumo('Menor caixa em 13 semanas', temCaixa ? F.moeda(proj.menorSaldo) : 'sem dados', !temCaixa ? 'Preencha os lançamentos de caixa' : (proj.semanasNegativas.length ? html`<span class="negativo">Negativo em ${proj.semanasNegativas.length} semana(s)</span>` : 'Sem semanas negativas'))}
    </section>`;
  }

  /** Um desvio da Central (item da lista). */
  function itemDesvio(a) {
    const { html, icone, evidencia } = NS.ui;
    const F = NS.core.format;
    const classe = `desvio desvio-${a.gravidade}${a.dispensado ? ' desvio-dispensado' : ''}`;
    return html`<li class="${classe}">
      <span class="desvio-regua" aria-hidden="true"></span>
      <div>
        <div class="desvio-topo">
          <span class="desvio-gravidade">${icone(a.gravidade === 'critico' ? 'critico' : 'atencao')}${a.gravidade === 'critico' ? 'Crítico' : 'Atenção'}</span>
          <span class="desvio-tipo">${a.rotuloTipo} · Responsável sugerido: ${a.responsavel}</span>
        </div>
        <p class="desvio-titulo">${a.rota ? html`<a href="#/${a.rota}">${a.titulo}</a>` : a.titulo}</p>
        <p class="desvio-mensagem">${a.mensagem}</p>
        ${a.evidencias.length ? html`<ul class="desvio-evidencias" aria-label="Evidências">${a.evidencias.map((ev) => html`<li>${ev.rotulo}: <strong>${evidencia(ev)}</strong></li>`)}</ul>` : ''}
        ${a.aviso ? html`<p class="desvio-aviso">${a.aviso}</p>` : ''}
        ${a.dispensado ? html`<p class="desvio-rodape">Dispensado até ${F.data(a.excecao.validoAte)} por ${a.excecao.autor}: “${a.excecao.justificativa}”</p>` : ''}
      </div>
      <div class="desvio-acoes">
        ${a.plano ? html`<span class="desvio-plano">${icone('acao')}Ação ${a.plano.status === 'andamento' ? 'em andamento' : 'aberta'} · ${a.plano.responsavel} · prazo ${F.data(a.plano.prazo)}</span>
          <a class="botao-central-texto" href="#/planos?id=${a.plano.id}">Ver plano</a>` : ''}
        ${a.planoId ? html`<a class="botao botao-central" href="#/planos?id=${a.planoId}">Atualizar plano</a>`
          : html`<button type="button" class="botao ${a.plano ? 'botao-central-sec botao-pequeno' : 'botao-central'}" data-acao="registrar-acao" data-chave="${a.chave}">${icone('acao')}Registrar ação</button>`}
        ${a.dispensado
          ? html`<button type="button" class="botao-central-texto" data-acao="reativar" data-chave="${a.chave}">Reativar alerta</button>`
          : html`<button type="button" class="botao-central-texto" data-acao="dispensar" data-chave="${a.chave}">Dispensar com justificativa</button>`}
      </div>
    </li>`;
  }

  /** Central de desvios: o elemento mais importante da tela. */
  function centralDesvios(alertas, filtro, todos, semDados) {
    const { html, raw } = NS.ui;
    const ativos = alertas.filter((a) => !a.dispensado);
    const dispensados = alertas.filter((a) => a.dispensado);
    const criticos = ativos.filter((a) => a.gravidade === 'critico');
    const atencao = ativos.filter((a) => a.gravidade === 'atencao');
    const semAcao = ativos.filter((a) => !a.plano && !a.planoId);
    const listas = { todos: ativos, critico: criticos, atencao, 'sem-acao': semAcao, dispensados };
    const lista = listas[filtro] || ativos;
    const visiveis = todos ? lista : lista.slice(0, LIMITE_INICIAL);
    const filtros = [
      ['todos', `Todos (${ativos.length})`], ['critico', `Críticos (${criticos.length})`], ['atencao', `Atenção (${atencao.length})`],
      ['sem-acao', `Sem ação registrada (${semAcao.length})`], ['dispensados', `Dispensados (${dispensados.length})`]
    ];
    return html`<section class="central" aria-labelledby="titulo-central">
      <div class="central-cabecalho">
        <div>
          <h2 id="titulo-central">Central de desvios</h2>
          <p>Cada desvio mostra a evidência e quem pode agir. Registre a ação: o sistema recomenda, quem decide é o gestor.</p>
        </div>
        <div class="central-contagem">
          <div class="critico"><strong>${criticos.length}</strong>críticos</div>
          <div class="atencao"><strong>${atencao.length}</strong>em atenção</div>
          <div><strong>${semAcao.length}</strong>sem ação registrada</div>
        </div>
      </div>
      <div class="central-filtros" role="group" aria-label="Filtrar desvios">
        ${filtros.map(([id, rotulo]) => html`<button type="button" class="central-filtro" data-acao="filtro" data-filtro="${id}" aria-pressed="${(filtro || 'todos') === id ? 'true' : 'false'}">${rotulo}</button>`)}
      </div>
      ${visiveis.length
        ? html`<ul class="central-lista">${visiveis.map(itemDesvio)}</ul>`
        : html`<p class="central-vazia">${filtro === 'dispensados' ? 'Nenhum alerta dispensado.'
          : (semDados ? 'Ainda não há dados para avaliar. Preencha cadastros, contratos, lotes e lançamentos: os desvios aparecem aqui automaticamente.'
            : 'Nenhum desvio neste filtro. As regras de alerta estão dentro dos limites.')}</p>`}
      <div class="central-rodape">
        <span>${raw(lista.length > visiveis.length ? `Mostrando ${visiveis.length} de ${lista.length} desvios.` : `${lista.length} desvio(s) neste filtro.`)}</span>
        ${lista.length > LIMITE_INICIAL ? html`<button type="button" class="botao botao-central-sec botao-pequeno" data-acao="mostrar-todos" data-valor="${todos ? '' : '1'}">${todos ? 'Mostrar só os primeiros' : `Mostrar todos os ${lista.length} desvios`}</button>` : ''}
      </div>
    </section>`;
  }

  /** Tabela de indicadores de uma perspectiva do BSC. */
  function perspectiva(ctx, persp, avaliacoes, comp, compRef, rotuloRef) {
    const { html, status, graficos, variacao } = NS.ui;
    const F = NS.core.format;
    const lista = avaliacoes.filter((a) => a.indicador.perspectiva === persp.id);
    const porId = new Map(avaliacoes.map((a) => [a.indicador.id, a]));
    const linhas = lista.map((av) => {
      const ind = av.indicador;
      const ref = NS.calc.indicadores.avaliar(ctx, ind, compRef);
      const delta = NS.calc.base.sub(av.valor, ref.valor);
      const melhorou = delta === null || delta === 0 ? null : (ind.sentido === 'maior-melhor' ? delta > 0 : delta < 0);
      const serie = NS.calc.indicadores.serie(ctx, ind, comp, 12);
      const par = ind.pareadoCom ? porId.get(ind.pareadoCom) : null;
      return html`<tr class="${av.status === 'fora' ? 'linha-fora' : (av.status === 'atencao' ? 'linha-atencao' : '')}">
        <td>
          <button type="button" class="link-indicador" data-acao="como-calculado" data-ind="${ind.id}" aria-haspopup="dialog">${ind.nome}</button>
          ${par ? html`<span class="pareado">Pareado com ${par.indicador.nome}: ${F.porUnidade(par.valor, par.indicador.unidade)} (${NS.ui.ROTULO_STATUS[par.status].toLowerCase()})</span>` : ''}
        </td>
        <td class="num"><span class="valor-indicador">${F.porUnidade(av.valor, ind.unidade)}</span><br>${graficos.bulletIndicador(av.valor, ind)}</td>
        <td class="num">${NS.modules.comum.textoMeta(ind)}</td>
        <td>${status(av.status)}</td>
        <td class="num ocultar-estreito"><span class="comparacao">${delta === null ? 'sem comparação' : (Math.abs(delta) < 1e-9 ? 'sem variação' : variacao(melhorou, F.diferenca(delta, ind.unidade)))}</span></td>
        <td class="ocultar-estreito">${serie.length ? graficos.sparkline(serie.map((s) => s.valor), { meta: ind.meta, rotulo: `Tendência de 12 meses de ${ind.nome}` }) : html`<span class="sem-serie">só situação atual</span>`}</td>
      </tr>`;
    });
    return html`<section class="bloco" aria-labelledby="persp-${persp.id}">
      <div class="bloco-cabecalho"><h2 id="persp-${persp.id}">${persp.nome}</h2></div>
      <div class="tabela-rolagem">
        <table class="tabela tabela-bsc">
          <caption class="visualmente-oculto">Indicadores da perspectiva ${persp.nome} em ${F.competencia(comp)}</caption>
          <thead><tr>
            <th scope="col">Indicador</th><th scope="col" class="num">Realizado</th><th scope="col" class="num">Meta</th>
            <th scope="col">Status</th><th scope="col" class="num ocultar-estreito">vs ${rotuloRef}</th><th scope="col" class="ocultar-estreito">12 meses</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </section>`;
  }

  /** Ponte de margem (cascata) com leitura em texto. */
  function ponteMargem(ctx, comp) {
    const { html, graficos } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const p = ctx.ponteMargem(comp);
    const compAnt = B.somarCompetencia(comp, -1);
    const efeitos = [
      ['preço de venda', p.efeitoPreco], ['volume', p.efeitoVolume], ['custo de insumos', p.efeitoInsumos], ['eficiência', p.efeitoEficiencia]
    ];
    if (!p.detalhes.length) {
      return html`<section class="bloco" aria-labelledby="titulo-ponte">
        <div class="bloco-cabecalho"><h2 id="titulo-ponte">Ponte de margem: ${F.competencia(compAnt)} → ${F.competencia(comp)}</h2></div>
        ${NS.ui.vazio('Sem entregas registradas nestes dois meses. Preencha os empenhos com as entregas e os lotes de produção para ver a ponte de margem.', { rotulo: 'Preencher contratos', rota: 'contratos' })}
      </section>`;
    }
    const maior = efeitos.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    const variacaoTotal = p.mcAtual - p.mcAnterior;
    return html`<section class="bloco" aria-labelledby="titulo-ponte">
      <div class="bloco-cabecalho">
        <h2 id="titulo-ponte">Ponte de margem: ${F.competencia(compAnt)} → ${F.competencia(comp)}</h2>
        <p>Margem de contribuição dos produtos entregues (receita das entregas − custo variável real dos lotes)</p>
      </div>
      ${graficos.cascata({
        itens: [
          { rotulo: `Margem ${F.competencia(compAnt)}`, valor: p.mcAnterior, tipo: 'total' },
          { rotulo: 'Efeito preço de venda', valor: p.efeitoPreco, tipo: 'delta' },
          { rotulo: 'Efeito volume', valor: p.efeitoVolume, tipo: 'delta' },
          { rotulo: 'Efeito custo de insumos', valor: p.efeitoInsumos, tipo: 'delta' },
          { rotulo: 'Efeito eficiência', valor: p.efeitoEficiencia, tipo: 'delta' },
          { rotulo: `Margem ${F.competencia(comp)}`, valor: p.mcAtual, tipo: 'total' }
        ],
        formatar: F.moedaCompacta,
        titulo: 'Ponte de margem de contribuição',
        descricao: `A margem passou de ${F.moeda(p.mcAnterior)} para ${F.moeda(p.mcAtual)}.`
      })}
      <p class="texto-leitura">A margem ${variacaoTotal >= 0 ? 'subiu' : 'caiu'} ${F.moeda(Math.abs(variacaoTotal))}. O maior efeito foi <strong>${maior[0]}</strong> (${F.moeda(maior[1])}).
        Preço e volume são da área comercial; custo de insumos é de Compras (parcialmente controlável); eficiência é da Produção (controlável).</p>
      <p class="fonte-dado">Fonte: entregas dos empenhos e lotes de produção. Volume inclui o efeito de mix entre produtos.</p>
    </section>`;
  }

  /** Renderiza o painel. */
  function tela(el, rota, ctx) {
    const { html, raw, icone } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const q = rota.query;
    const comp = q.comp && /^\d{4}-\d{2}$/.test(q.comp) ? q.comp : ctx.competencia;
    const vs = q.vs === 'ano' ? 'ano' : 'mes';
    const compRef = B.somarCompetencia(comp, vs === 'ano' ? -12 : -1);
    const rotuloRef = F.competencia(compRef);
    const avaliacoes = ctx.avaliacoes(comp);
    const alertas = ctx.alertas();
    const semDados = ['contratos', 'lotes', 'lancamentos', 'demonstracoes', 'documentos', 'movimentosEstoque'].every((c) => !(ctx.dados[c] || []).length);

    el.innerHTML = String(html`
      ${C.cabecalho({
        titulo: 'Estamos indo bem?',
        subtitulo: raw(String(html`Competência <strong>${F.competenciaExtenso(comp)}</strong>, comparada com ${vs === 'ano' ? 'o mesmo mês do ano anterior' : 'o mês anterior'} (${rotuloRef}). Os alertas consideram a situação de hoje, ${F.data(ctx.hoje)}.`)),
        acoes: html`
          ${C.seletorCompetencia(ctx.competencias, comp)}
          <div class="seletor">Comparar com
            <div class="alternador" role="group" aria-label="Comparar com">
              <button type="button" data-acao="comparar" data-vs="mes" aria-pressed="${vs === 'mes'}">Mês anterior</button>
              <button type="button" data-acao="comparar" data-vs="ano" aria-pressed="${vs === 'ano'}">Ano anterior</button>
            </div>
          </div>
          <a class="botao botao-secundario" href="#/relatorios?comp=${comp}">${icone('relatorios')}Relatório do mês</a>`
      })}
      ${primeirosPassos(ctx)}
      ${resumoMes(ctx, comp, compRef, avaliacoes)}
      ${centralDesvios(alertas, q.filtro || 'todos', q.todos === '1', semDados)}
      <h2 class="visualmente-oculto">Indicadores do Balanced Scorecard</h2>
      <div class="bsc">
        ${NS.calc.indicadores.PERSPECTIVAS.map((p) => perspectiva(ctx, p, avaliacoes, comp, compRef, rotuloRef))}
      </div>
      ${ponteMargem(ctx, comp)}
    `);

    const acharAlerta = (chave) => alertas.find((a) => a.chave === chave);
    el.onclick = (ev) => {
      const alvo = ev.target.closest('[data-acao]');
      if (!alvo) return;
      const acao = alvo.dataset.acao;
      if (acao === 'como-calculado') C.abrirComoCalculado(alvo.dataset.ind, ctx, comp);
      else if (acao === 'registrar-acao') {
        const a = acharAlerta(alvo.dataset.chave);
        if (!a) return;
        C.abrirRegistrarAcao({
          origem: a.origem === 'indicador' ? 'indicador' : 'alerta', referenciaId: a.chave, titulo: a.titulo,
          desvio: `${a.titulo}. ${a.mensagem}`, responsavel: a.responsavel, acao: a.acaoSugerida,
          prazo: B.somarDias(ctx.hoje, a.gravidade === 'critico' ? 7 : 15)
        });
      } else if (acao === 'dispensar') {
        const a = acharAlerta(alvo.dataset.chave);
        if (a) C.abrirDispensarAlerta(a);
      } else if (acao === 'reativar') {
        const a = acharAlerta(alvo.dataset.chave);
        if (a) C.reativarAlerta(a);
      } else if (acao === 'filtro') {
        NS.core.router.alterarQuery({ filtro: alvo.dataset.filtro === 'todos' ? '' : alvo.dataset.filtro }, true);
        const novo = el.querySelector(`[data-filtro="${alvo.dataset.filtro}"]`);
        if (novo) novo.focus();
      } else if (acao === 'mostrar-todos') {
        NS.core.router.alterarQuery({ todos: alvo.dataset.valor }, true);
        const novo = el.querySelector('[data-acao="mostrar-todos"]');
        if (novo) novo.focus();
      } else if (acao === 'comparar') {
        NS.core.router.alterarQuery({ vs: alvo.dataset.vs === 'ano' ? 'ano' : '' });
      }
    };
    el.onchange = (ev) => {
      if (ev.target.dataset.acao === 'trocar-competencia') NS.core.router.alterarQuery({ comp: ev.target.value });
    };

    // Link vindo de um alerta de indicador: abre direto o "Como é calculado".
    if (q.ind && ctx.indicadoresPorId.has(q.ind)) {
      const ind = q.ind;
      NS.core.router.substituirQuery({ ind: '' });
      C.abrirComoCalculado(ind, ctx, comp);
    }
  }

  NS.modules.painel = { rotas: { painel: tela } };
})(window);
