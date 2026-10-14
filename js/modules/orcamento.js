/* ==========================================================================
   modules/orcamento.js
   Orçamento:
   - lançamento do orçamento anual por competência, centro e conta (com a
     parte variável em %) e cópia de um mês para os seguintes;
   - orçado × realizado com variação em R$ e %, favorável/desfavorável
     conforme receita ou custo;
   - orçamento flexível: parte variável ajustada ao volume real produzido;
   - forecast anual: realizado acumulado + orçado restante, e alternativa
     pela tendência dos últimos 3 meses.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  /** Campos de uma linha de orçamento. */
  function camposLinha() {
    const C = NS.modules.comum;
    return [
      { nome: 'competencia', rotulo: 'Competência', tipo: 'competencia', obrigatorio: true, largura: 'terco' },
      { nome: 'centroId', rotulo: 'Centro de responsabilidade', tipo: 'select', obrigatorio: true, largura: 'terco', opcoes: () => C.opcoesColecao('centros'),
        ajuda: 'Não encontrou o centro? Cadastre em Cadastros › Centros.' },
      { nome: 'natureza', rotulo: 'Natureza', tipo: 'select', obrigatorio: true, largura: 'terco', opcoes: [{ valor: 'receita', rotulo: 'Receita' }, { valor: 'custo', rotulo: 'Custo ou despesa' }] },
      { nome: 'conta', rotulo: 'Conta', tipo: 'texto', obrigatorio: true, largura: 'meia', placeholder: 'Preencher',
        ajuda: `Use o mesmo nome da categoria dos lançamentos de caixa. A conta "${NS.calc.orcamento.CONTA_FATURAMENTO}" usa o faturamento das entregas.` },
      { nome: 'valor', rotulo: 'Valor orçado', tipo: 'moeda', obrigatorio: true, min: 0, largura: 'quarto' },
      { nome: 'parteVariavel', rotulo: 'Parte variável', tipo: 'pct', obrigatorio: true, min: 0, max: 1, largura: 'quarto',
        ajuda: '0 a 100: quanto do valor acompanha o volume produzido (orçamento flexível).' }
    ];
  }

  /** Abre o formulário de linha de orçamento. */
  function abrirLinha(reg, comp) {
    const store = NS.core.store;
    NS.ui.abrirFormulario({
      titulo: reg ? 'Editar linha do orçamento' : 'Lançar orçamento',
      campos: camposLinha(),
      valores: reg || { competencia: comp, natureza: 'custo' },
      rotuloSalvar: 'Salvar orçamento',
      mensagemSucesso: 'Orçamento salvo.',
      aoSalvar: (v) => {
        const repetida = store.listar('orcamento').find((o) => o.competencia === v.competencia && o.centroId === v.centroId && o.conta === v.conta && (!reg || o.id !== reg.id));
        if (repetida) return { erros: [{ campo: 'conta', mensagem: 'Já existe orçamento desta conta para este centro nesta competência. Edite a linha existente.' }] };
        if (reg) store.atualizar('orcamento', reg.id, v); else store.inserir('orcamento', v);
        return true;
      }
    });
  }

  /** Copia as linhas de uma competência para as seguintes (sem sobrescrever as existentes). */
  function abrirCopia(comp) {
    const store = NS.core.store;
    const B = NS.calc.base;
    const F = NS.core.format;
    NS.ui.abrirFormulario({
      titulo: 'Copiar orçamento para outros meses',
      introducao: NS.ui.html`<p class="caixa-info">Copia as linhas da competência de origem para cada mês seguinte até a competência final. Linhas que já existem no destino não são alteradas.</p>`,
      campos: [
        { nome: 'origem', rotulo: 'Competência de origem', tipo: 'competencia', obrigatorio: true, largura: 'meia' },
        { nome: 'ate', rotulo: 'Copiar até', tipo: 'competencia', obrigatorio: true, largura: 'meia',
          validar: (v, t) => (v && t.origem && v <= t.origem ? 'Escolha uma competência depois da origem.' : null) }
      ],
      valores: { origem: comp, ate: `${comp.slice(0, 4)}-12` },
      rotuloSalvar: 'Copiar orçamento',
      mensagemSucesso: null,
      aoSalvar: (v) => {
        const linhas = store.listar('orcamento').filter((o) => o.competencia === v.origem);
        if (!linhas.length) return { erros: [{ campo: 'origem', mensagem: `Não há orçamento lançado em ${F.competencia(v.origem)}.` }] };
        let copiadas = 0;
        store.emLote(() => {
          for (let c = B.somarCompetencia(v.origem, 1); c <= v.ate; c = B.somarCompetencia(c, 1)) {
            for (const l of linhas) {
              const existe = store.listar('orcamento').some((o) => o.competencia === c && o.centroId === l.centroId && o.conta === l.conta);
              if (existe) continue;
              store.inserir('orcamento', { competencia: c, centroId: l.centroId, conta: l.conta, natureza: l.natureza, valor: l.valor, parteVariavel: l.parteVariavel });
              copiadas += 1;
            }
          }
        });
        NS.ui.avisar(`Orçamento copiado: ${copiadas} linha(s).`);
        return true;
      }
    });
  }

  /** Abre o formulário do volume orçado (kg) da competência. */
  function abrirVolume(comp) {
    const store = NS.core.store;
    NS.ui.abrirFormulario({
      titulo: `Volume orçado de ${NS.core.format.competencia(comp)}`,
      campos: [{ nome: 'volume', rotulo: 'Volume orçado (kg)', tipo: 'numero', obrigatorio: true, min: 0, ajuda: 'Base do orçamento flexível: a parte variável é ajustada por volume real ÷ volume orçado.' }],
      valores: { volume: (store.config().volumeOrcado || {})[comp] ?? null },
      rotuloSalvar: 'Salvar volume',
      mensagemSucesso: 'Volume salvo.',
      aoSalvar: (v) => {
        const mapa = Object.assign({}, store.config().volumeOrcado || {}, { [comp]: v.volume });
        store.atualizarConfig({ volumeOrcado: mapa });
        return true;
      }
    });
  }

  /** Tela de orçamento. */
  function tela(el, rota, ctx) {
    const { html, raw, icone, graficos, variacao, status } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const C = NS.modules.comum;
    const O = NS.calc.orcamento;
    const comp = rota.query.comp && /^\d{4}-\d{2}$/.test(rota.query.comp) ? rota.query.comp : ctx.competencia;
    const flexivel = rota.query.modo === 'flexivel';
    const apur = O.apurar(ctx, comp, flexivel);
    const fc = O.forecast(ctx, comp);
    const limite = ctx.limites.variacaoOrcamentariaPct ?? 0.1;
    const comps = Array.from(new Set(ctx.competencias.concat(ctx.dados.orcamento.map((o) => o.competencia)))).sort();
    const linhas = apur.linhas.map((l, i) => Object.assign({ chave: l.id || `x${i}`, centro: C.nome('centros', l.centroId, 'sem centro') }, l));
    const orcadas = linhas.filter((l) => !l.naoOrcado);
    const receitas = orcadas.filter((l) => l.natureza === 'receita');
    const custos = orcadas.filter((l) => l.natureza === 'custo');
    const resultadoOrc = B.soma(receitas, (l) => l.base) - B.soma(custos, (l) => l.base);
    const resultadoReal = B.soma(receitas, (l) => l.realizado) - B.soma(custos, (l) => l.realizado);
    const fatorVolume = B.div(apur.volumeReal, apur.volumeOrcado);

    el.innerHTML = String(html`
      ${C.cabecalho({
        titulo: 'Orçamento',
        subtitulo: raw(String(html`Orçado × realizado de <strong>${F.competenciaExtenso(comp)}</strong>. Variação desfavorável acima de ${F.pct(limite, 0)} gera alerta.`)),
        acoes: html`${C.seletorCompetencia(comps, comp)}
          <div class="seletor">Comparar com
            <div class="alternador" role="group" aria-label="Tipo de orçamento">
              <button type="button" data-acao="modo" data-modo="" aria-pressed="${!flexivel}">Orçamento fixo</button>
              <button type="button" data-acao="modo" data-modo="flexivel" aria-pressed="${flexivel}">Orçamento flexível</button>
            </div>
          </div>
          <button type="button" class="botao botao-primario" data-acao="nova-linha">${icone('mais')}Lançar orçamento</button>
          <button type="button" class="botao botao-secundario" data-acao="copiar">Copiar para outros meses</button>`
      })}
      ${!ctx.dados.centros.length ? html`<p class="caixa-info">Antes de lançar o orçamento, preencha os centros de responsabilidade em <a href="#/cadastros/centros">Cadastros › Centros</a>.</p>` : ''}
      <section class="resumo" aria-label="Resumo do orçamento">
        <div class="resumo-item"><div class="resumo-rotulo">Resultado orçado${flexivel ? ' (flexível)' : ''}</div><div class="resumo-valor">${orcadas.length ? F.moeda(resultadoOrc) : 'sem dados'}</div><div class="resumo-detalhe">Receitas − custos orçados</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Resultado realizado</div><div class="resumo-valor">${orcadas.length ? F.moeda(resultadoReal) : 'sem dados'}</div><div class="resumo-detalhe">${orcadas.length ? variacao(resultadoReal >= resultadoOrc, F.moeda(resultadoReal - resultadoOrc)) : 'Lance o orçamento do mês'}</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Linhas desfavoráveis acima de ${F.pct(limite, 0)}</div><div class="resumo-valor">${orcadas.filter((l) => l.desfavoravelPct !== null && l.desfavoravelPct > limite).length}</div><div class="resumo-detalhe">de ${orcadas.length} linhas orçadas</div></div>
        <div class="resumo-item"><div class="resumo-rotulo">Volume real × orçado</div><div class="resumo-valor">${fatorVolume === null ? 'sem dados' : F.pct(fatorVolume)}</div>
          <div class="resumo-detalhe">${F.porUnidade(apur.volumeReal, 'kg')} de ${apur.volumeOrcado === null || apur.volumeOrcado === undefined ? 'volume orçado não informado' : F.porUnidade(apur.volumeOrcado, 'kg')}
          <button type="button" class="botao botao-texto botao-pequeno" data-acao="volume">${apur.volumeOrcado === null || apur.volumeOrcado === undefined ? 'Preencher volume' : 'Editar volume'}</button></div></div>
      </section>
      ${flexivel && fatorVolume === null ? html`<p class="caixa-alerta">Para o orçamento flexível, preencha o volume orçado da competência e registre os lotes do mês. Sem isso, o comparativo usa o orçamento fixo.</p>` : ''}
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Orçado × realizado</h2>
          <p>Realizado pelo regime de competência (lançamentos pagos e a pagar do mês). Favorável: receita acima ou custo abaixo do orçado.</p></div>
        <div data-slot="tabela"></div>
        ${orcadas.length ? graficos.barrasAgrupadas({
          grupos: orcadas.slice().sort((a, b) => b.base - a.base).slice(0, 10).map((l) => l.conta),
          series: [
            { nome: flexivel ? 'Orçado flexível' : 'Orçado', valores: orcadas.slice().sort((a, b) => b.base - a.base).slice(0, 10).map((l) => l.base) },
            { nome: 'Realizado', valores: orcadas.slice().sort((a, b) => b.base - a.base).slice(0, 10).map((l) => l.realizado) }
          ],
          formatar: F.moedaCompacta, titulo: 'Orçado × realizado por conta (10 maiores)', altura: 240
        }) : ''}
        ${C.fonteDado('orçamento, lançamentos de caixa e entregas dos empenhos', ['orcamento', 'lancamentos'])}
      </section>
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>Forecast de ${fc.ano}</h2>
          <p>Forecast = realizado acumulado até ${F.competencia(comp)} + orçado dos ${fc.mesesRestantes} meses restantes. Tendência = acumulado + média dos últimos 3 meses × meses restantes.</p></div>
        <div data-slot="forecast"></div>
      </section>`);

    const situacao = (l) => {
      if (l.naoOrcado) return status('atencao', 'Sem orçamento');
      if (l.favoravel === null) return html`<span class="suave">sem dados</span>`;
      if (!l.favoravel && l.desfavoravelPct !== null && l.desfavoravelPct > limite) return status(l.desfavoravelPct > limite * 2 ? 'fora' : 'atencao', 'Desfavorável');
      return l.favoravel ? status('dentro', 'Favorável') : status('dentro', 'Desfavorável dentro do limite');
    };
    NS.ui.encaixar(el, {
      tabela: NS.ui.tabela({
        legenda: 'Orçado × realizado', csv: `orcado_realizado_${comp}`, linhas, ordenarPor: 'centro',
        vazio: NS.ui.vazio(`Nenhum orçamento lançado para ${F.competencia(comp)}. Preencha o orçamento por centro e conta para comparar com o realizado.`, { rotulo: 'Lançar orçamento', dataAcao: 'nova-linha' }),
        classeLinha: (l) => (l.naoOrcado ? 'linha-atencao' : (!l.favoravel && l.desfavoravelPct > limite ? (l.desfavoravelPct > limite * 2 ? 'linha-fora' : 'linha-atencao') : '')),
        colunas: [
          { chave: 'centro', rotulo: 'Centro' },
          { chave: 'conta', rotulo: 'Conta' },
          { chave: 'natureza', rotulo: 'Natureza', exibir: (l) => (l.natureza === 'receita' ? 'Receita' : 'Custo'), csv: (l) => l.natureza },
          { chave: 'orcado', rotulo: 'Orçado', tipo: 'moeda' },
          flexivel ? { chave: 'orcadoFlexivel', rotulo: 'Orçado flexível', tipo: 'moeda' } : null,
          { chave: 'realizado', rotulo: 'Realizado', tipo: 'moeda' },
          { chave: 'variacao', rotulo: 'Variação', tipo: 'moeda' },
          { chave: 'pct', rotulo: 'Variação %', tipo: 'pct', exibir: (l) => (l.pct === null ? 'sem dados' : variacao(l.favoravel, F.pct(l.pct))) },
          { chave: 'situacao', rotulo: 'Situação', valor: (l) => l.desfavoravelPct, exibir: situacao, csv: (l) => (l.naoOrcado ? 'Sem orçamento' : (l.favoravel ? 'Favorável' : 'Desfavorável')) },
          { chave: 'fonte', rotulo: 'Fonte do realizado', ocultarEstreito: true },
          { rotulo: 'Ações', tipo: 'acoes', exibir: (l) => (l.id ? html`<button type="button" class="botao botao-texto botao-pequeno" data-acao="editar-linha" data-id="${l.id}" aria-label="Editar orçamento de ${l.conta}">${icone('editar')}Editar</button>
            <button type="button" class="botao botao-texto botao-pequeno" data-acao="excluir-linha" data-id="${l.id}" aria-label="Excluir orçamento de ${l.conta}">${icone('excluir')}Excluir</button>` : html`<span class="subtexto">não orçado</span>`) }
        ].filter(Boolean)
      }),
      forecast: NS.ui.tabela({
        legenda: `Forecast de ${fc.ano}`, csv: `forecast_${fc.ano}`, linhas: fc.linhas.map((l, i) => Object.assign({ id: String(i), centro: C.nome('centros', l.centroId, 'sem centro') }, l)), ordenarPor: 'centro',
        vazio: NS.ui.vazio(`Nenhum orçamento lançado em ${fc.ano}.`),
        colunas: [
          { chave: 'centro', rotulo: 'Centro' },
          { chave: 'conta', rotulo: 'Conta' },
          { chave: 'orcadoAnual', rotulo: 'Orçado no ano', tipo: 'moeda' },
          { chave: 'realizadoAcumulado', rotulo: 'Realizado acumulado', tipo: 'moeda' },
          { chave: 'orcadoRestante', rotulo: 'Orçado restante', tipo: 'moeda' },
          { chave: 'forecast', rotulo: 'Forecast', tipo: 'moeda' },
          { chave: 'pctForecast', rotulo: 'Forecast × orçado', tipo: 'pct', valor: (l) => l.variacaoForecast.pct, exibir: (l) => variacao(l.variacaoForecast.favoravel, F.pct(l.variacaoForecast.pct)) },
          { chave: 'forecastTendencia', rotulo: 'Pela tendência (3 meses)', tipo: 'moeda' },
          { chave: 'pctTendencia', rotulo: 'Tendência × orçado', tipo: 'pct', valor: (l) => l.variacaoTendencia.pct, exibir: (l) => variacao(l.variacaoTendencia.favoravel, F.pct(l.variacaoTendencia.pct)) }
        ]
      })
    });

    el.onclick = (ev) => {
      const alvo = ev.target.closest('[data-acao]');
      if (!alvo) return;
      const acao = alvo.dataset.acao;
      const store = NS.core.store;
      if (acao === 'nova-linha') abrirLinha(null, comp);
      else if (acao === 'editar-linha') abrirLinha(store.obter('orcamento', alvo.dataset.id), comp);
      else if (acao === 'excluir-linha') {
        const reg = store.obter('orcamento', alvo.dataset.id);
        C.excluir({ colecao: 'orcamento', id: reg.id, titulo: 'Excluir linha do orçamento', rotulo: 'Excluir linha', sucesso: 'Linha do orçamento excluída.',
          mensagem: `A linha "${reg.conta}" de ${F.competencia(reg.competencia)} será excluída.`, descricaoLog: `Orçamento excluído: ${reg.conta} (${F.competencia(reg.competencia)}).` });
      } else if (acao === 'copiar') abrirCopia(comp);
      else if (acao === 'volume') abrirVolume(comp);
      else if (acao === 'modo') NS.core.router.alterarQuery({ modo: alvo.dataset.modo });
    };
    el.onchange = (ev) => {
      if (ev.target.dataset.acao === 'trocar-competencia') NS.core.router.alterarQuery({ comp: ev.target.value });
    };
  }

  NS.modules.orcamento = { rotas: { orcamento: tela } };
})(window);
