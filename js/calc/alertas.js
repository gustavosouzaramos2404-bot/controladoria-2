/* ==========================================================================
   calc/alertas.js
   Motor de alertas da Central de desvios (seção 6). Percorre contratos,
   órgãos, documentos, estoque, produção, orçamento, caixa, planos de ação
   e indicadores, e devolve os desvios com: gravidade (crítico ou atenção),
   mensagem em linguagem simples, evidência numérica, responsável sugerido
   e chave estável (para ligar ao plano de ação e às exceções).
   Puro: só lê o contexto de cálculo. Usa core/format para os textos.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.calc = NS.calc || {};

  const AVISO_JURIDICO = 'Indicação gerencial. A viabilidade e o fundamento do pedido devem ser validados pelo jurídico, conforme o contrato e a Lei 14.133/2021.';

  // Tipos de alerta, com rótulo e prioridade de ordenação (menor aparece antes).
  const TIPOS = {
    'caixa-negativo': { rotulo: 'Caixa projetado negativo', prioridade: 1 },
    'recebivel-vencido': { rotulo: 'Recebível vencido', prioridade: 2 },
    defasagem: { rotulo: 'Defasagem de custo do item contratado', prioridade: 3 },
    'margem-contrato': { rotulo: 'Margem do contrato abaixo da mínima', prioridade: 4 },
    documento: { rotulo: 'Documento de habilitação', prioridade: 5 },
    'entrega-atrasada': { rotulo: 'Entrega atrasada', prioridade: 6 },
    vigencia: { rotulo: 'Vigência terminando', prioridade: 7 },
    'saldo-ata': { rotulo: 'Saldo da ata baixo', prioridade: 8 },
    garantia: { rotulo: 'Garantia contratual vencendo', prioridade: 9 },
    aniversario: { rotulo: 'Aniversário da data-base', prioridade: 10 },
    'vencimento-insumo': { rotulo: 'Insumo próximo do vencimento', prioridade: 11 },
    'vencimento-produto': { rotulo: 'Produto acabado próximo do vencimento', prioridade: 12 },
    'estoque-minimo': { rotulo: 'Estoque abaixo do mínimo', prioridade: 13 },
    rendimento: { rotulo: 'Rendimento abaixo da meta', prioridade: 14 },
    perdas: { rotulo: 'Perdas acima da meta', prioridade: 15 },
    orcamento: { rotulo: 'Variação orçamentária', prioridade: 16 },
    'plano-vencido': { rotulo: 'Plano de ação vencido', prioridade: 17 },
    indicador: { rotulo: 'Indicador fora da meta', prioridade: 18 }
  };

  // Indicadores que já têm regra de alerta própria (evita alerta duplicado).
  const INDICADORES_COM_REGRA = ['indice_perdas', 'rendimento', 'contratos_defasagem', 'documentos_dia', 'planos_prazo'];

  /**
   * Próximo aniversário da data-base dentro da janela de interesse:
   * de "avisoDias" antes até "janelaDepois" dias depois. Null se fora da janela.
   */
  function aniversarioRelevante(dataBase, hoje, avisoDias, janelaDepois) {
    const B = NS.calc.base;
    if (!dataBase) return null;
    for (let k = 1; k <= 50; k++) {
      const aniv = B.somarMeses(dataBase, 12 * k);
      const dias = B.diasEntre(hoje, aniv);
      if (dias < -janelaDepois) continue;
      if (dias <= avisoDias) return { data: aniv, dias, anos: k };
      return null;
    }
    return null;
  }

  /** Gera a lista de alertas ativos, ordenada por gravidade e prioridade. */
  function gerar(ctx) {
    const F = NS.core.format;
    const B = NS.calc.base;
    const L = ctx.limites;
    const hoje = ctx.hoje;
    const comp = ctx.competencia;
    const lista = [];
    const nomeProduto = (id) => (ctx.produtosPorId.get(id) || { nome: 'produto removido' }).nome;
    const add = (a) => lista.push(Object.assign({ origem: 'alerta', evidencias: [], peso: 0 }, a));

    /* ------------------------------ Contratos ------------------------------ */
    for (const a of ctx.contratosAnalisados(hoje)) {
      const c = a.contrato;
      if (c.vigenciaFim < hoje) continue; // encerrados: só os recebíveis (por órgão) continuam relevantes
      const orgao = ctx.orgaosPorId.get(c.orgaoId);
      const nomeC = `${c.tipo === 'ata' ? 'Ata' : 'Contrato'} ${c.numero}`;
      const sufixo = orgao ? ` (${orgao.nome})` : '';
      const rota = `contratos/${c.id}`;

      // Defasagem de custo por item
      for (const it of a.itens) {
        if (it.defasagem === null || it.defasagem < L.defasagemAtencao) continue;
        add({
          chave: `defasagem:${c.id}:${it.produtoId}`, tipo: 'defasagem',
          gravidade: it.defasagem >= L.defasagemCritico ? 'critico' : 'atencao',
          titulo: `Avaliar pedido de reequilíbrio ou reajuste: ${nomeC}`,
          mensagem: `O custo atual de ${nomeProduto(it.produtoId)} está ${F.pct(it.defasagem)} acima do custo considerado na proposta${sufixo}.`,
          evidencias: [
            { rotulo: 'Custo da proposta', valor: it.custoProposta, unidade: 'moeda' },
            { rotulo: it.fonteCusto === 'lotes' ? 'Custo atual (últimos 3 lotes)' : 'Custo atual (padrão, sem lotes)', valor: it.custoAtual, unidade: 'moeda' },
            { rotulo: 'Defasagem', valor: it.defasagem, unidade: 'pct' },
            { rotulo: 'Sem a ineficiência interna', valor: it.defasagemSemIneficiencia, unidade: 'pct' },
            { rotulo: 'Margem prevista → atual', texto: `${F.pct(it.margemPrevista)} → ${F.pct(it.margemAtual)}` }
          ],
          responsavel: 'Área comercial', rota, aviso: AVISO_JURIDICO, peso: it.defasagem,
          acaoSugerida: 'Reunir notas de compra e composição de custo do item e encaminhar ao jurídico para avaliar reequilíbrio ou reajuste.'
        });
      }

      // Margem atual do contrato abaixo da mínima
      if (a.margemAtual !== null && a.margemAtual < L.margemMinimaContrato) {
        add({
          chave: `margem:${c.id}`, tipo: 'margem-contrato', gravidade: a.margemAtual < 0 ? 'critico' : 'atencao',
          titulo: `Margem abaixo da mínima: ${nomeC}`,
          mensagem: `A margem atual do contrato é ${F.pct(a.margemAtual)}, abaixo da mínima de ${F.pct(L.margemMinimaContrato)}${sufixo}.`,
          evidencias: [
            { rotulo: 'Margem prevista', valor: a.margemPrevista, unidade: 'pct' },
            { rotulo: 'Margem atual', valor: a.margemAtual, unidade: 'pct' },
            { rotulo: 'Erosão', valor: a.erosao, unidade: 'pp' },
            { rotulo: 'Valor ainda a faturar', valor: a.valorAFaturar, unidade: 'moeda' }
          ],
          responsavel: 'Área comercial', rota, peso: L.margemMinimaContrato - a.margemAtual,
          acaoSugerida: 'Rever custos dos itens, avaliar reequilíbrio e priorizar entregas de itens com melhor margem.'
        });
      }

      // Aniversário da data-base da proposta
      const aniv = aniversarioRelevante(c.dataBaseProposta, hoje, L.aniversarioAvisoDias, L.aniversarioJanelaDepois);
      if (aniv) {
        add({
          chave: `aniversario:${c.id}:${aniv.data}`, tipo: 'aniversario', gravidade: 'atencao',
          titulo: `Avaliar reajuste: data-base de ${nomeC}`,
          mensagem: aniv.dias >= 0
            ? `A data-base da proposta completa ${aniv.anos * 12} meses em ${F.dias(aniv.dias)} (${F.data(aniv.data)}).`
            : `A data-base da proposta completou ${aniv.anos * 12} meses há ${F.dias(-aniv.dias)} (${F.data(aniv.data)}).`,
          evidencias: [
            { rotulo: 'Data-base da proposta', texto: F.data(c.dataBaseProposta) },
            { rotulo: 'Índice de reajuste previsto', texto: c.indiceReajuste || 'não informado' },
            { rotulo: 'Defasagem máxima dos itens', valor: a.defasagemMaxima, unidade: 'pct' }
          ],
          responsavel: 'Área comercial', rota, aviso: AVISO_JURIDICO, peso: -Math.abs(aniv.dias),
          acaoSugerida: 'Calcular o reajuste pelo índice previsto e preparar o pedido para análise do jurídico.'
        });
      }

      // Vigência terminando
      const dias = a.diasParaFimVigencia;
      if (dias !== null && dias >= 0 && dias <= L.vigenciaAtencaoDias) {
        add({
          chave: `vigencia:${c.id}`, tipo: 'vigencia', gravidade: dias <= L.vigenciaCriticoDias ? 'critico' : 'atencao',
          titulo: `Vigência terminando: ${nomeC}`,
          mensagem: `A vigência termina em ${F.dias(dias)} (${F.data(c.vigenciaFim)})${sufixo}.`,
          evidencias: [
            { rotulo: 'Saldo ainda a faturar', valor: a.valorAFaturar, unidade: 'moeda' },
            { rotulo: 'Consumido', valor: a.pctConsumido, unidade: 'pct' }
          ],
          responsavel: 'Área comercial', rota, peso: -dias,
          acaoSugerida: 'Avaliar prorrogação ou nova licitação e programar as entregas do saldo restante.'
        });
      }

      // Saldo da ata baixo (somente atas de registro de preços)
      if (c.tipo === 'ata' && a.pctSaldo !== null && a.pctSaldo <= L.saldoAtaPct) {
        const itemMin = a.itens.slice().sort((x, y) => (x.pctSaldo ?? 1) - (y.pctSaldo ?? 1))[0];
        add({
          chave: `saldo:${c.id}`, tipo: 'saldo-ata', gravidade: a.pctSaldo <= L.saldoAtaPct / 2 ? 'critico' : 'atencao',
          titulo: `Saldo da ata baixo: ${nomeC}`,
          mensagem: `Restam ${F.pct(a.pctSaldo)} do valor registrado${sufixo}.` +
            (itemMin && itemMin.dataEsgotamento ? ` No ritmo atual, ${nomeProduto(itemMin.produtoId)} se esgota por volta de ${F.data(itemMin.dataEsgotamento)}.` : ''),
          evidencias: [
            { rotulo: 'Saldo (valor)', valor: a.valorAFaturar, unidade: 'moeda' },
            { rotulo: 'Consumido', valor: a.pctConsumido, unidade: 'pct' },
            { rotulo: 'Fim da vigência', texto: F.data(c.vigenciaFim) }
          ],
          responsavel: 'Área comercial', rota, peso: -a.pctSaldo,
          acaoSugerida: 'Avisar o órgão sobre o saldo e acompanhar nova ata ou adesão para não interromper o fornecimento.'
        });
      }

      // Garantia contratual vencendo
      if (c.garantia && c.garantia.vencimento) {
        const dg = B.diasEntre(hoje, c.garantia.vencimento);
        if (dg <= L.garantiaDias) {
          add({
            chave: `garantia:${c.id}`, tipo: 'garantia', gravidade: dg < 0 ? 'critico' : 'atencao',
            titulo: `Garantia contratual ${dg < 0 ? 'vencida' : 'vencendo'}: ${nomeC}`,
            mensagem: dg < 0
              ? `A garantia de ${F.moeda(c.garantia.valor)} venceu há ${F.dias(-dg)}, com o contrato ainda vigente.`
              : `A garantia de ${F.moeda(c.garantia.valor)} vence em ${F.dias(dg)} (${F.data(c.garantia.vencimento)}).`,
            evidencias: [
              { rotulo: 'Valor da garantia', valor: c.garantia.valor, unidade: 'moeda' },
              { rotulo: 'Fim da vigência do contrato', texto: F.data(c.vigenciaFim) }
            ],
            responsavel: 'Área financeira', rota, peso: -dg,
            acaoSugerida: 'Renovar a garantia (seguro-garantia, fiança ou caução) e protocolar no órgão.'
          });
        }
      }

      // Entregas atrasadas (data prevista passou sem entrega)
      const atrasadas = a.entregas.filter((e) => !e.real && e.prevista < hoje);
      if (atrasadas.length) {
        const maisAntiga = atrasadas.map((e) => e.prevista).sort()[0];
        add({
          chave: `entrega:${c.id}`, tipo: 'entrega-atrasada', gravidade: 'critico',
          titulo: `Entrega atrasada: ${nomeC}`,
          mensagem: `${atrasadas.length === 1 ? 'Há 1 entrega' : `Há ${atrasadas.length} entregas`} com data prevista vencida e sem registro de entrega${sufixo}. A mais antiga era para ${F.data(maisAntiga)}.`,
          evidencias: [
            { rotulo: 'Dias de atraso (mais antiga)', valor: B.diasEntre(maisAntiga, hoje), unidade: 'dias' },
            { rotulo: 'Valor pendente', valor: B.soma(atrasadas, (e) => e.valor), unidade: 'moeda' }
          ],
          responsavel: 'Logística', rota, peso: B.diasEntre(maisAntiga, hoje),
          acaoSugerida: 'Confirmar a data de entrega com a expedição e comunicar o órgão antes que gere multa.'
        });
      }
    }

    /* ------------------------- Órgãos: recebíveis ------------------------- */
    for (const o of ctx.orgaosAnalisados(hoje)) {
      const vencidos = o.recebiveis.titulos.filter((t) => t.situacao === 'vencido');
      if (!vencidos.length) continue;
      const maiorAtraso = Math.max(...vencidos.map((t) => t.diasAtraso));
      add({
        chave: `recebivel:${o.orgao.id}`, tipo: 'recebivel-vencido', gravidade: maiorAtraso > 30 ? 'critico' : 'atencao',
        titulo: `Recebível vencido: ${o.orgao.nome}`,
        mensagem: `${vencidos.length === 1 ? '1 empenho liquidado está' : `${vencidos.length} empenhos liquidados estão`} sem pagamento após o prazo contratual de ${F.dias(o.orgao.prazoPagamentoContratual)}, somando ${F.moeda(o.recebiveis.vencido)}.`,
        evidencias: [
          { rotulo: 'Valor vencido', valor: o.recebiveis.vencido, unidade: 'moeda' },
          { rotulo: 'Maior atraso', valor: maiorAtraso, unidade: 'dias' },
          { rotulo: 'Prazo médio real desde a liquidação', valor: o.prazoMedioLiquidacao, unidade: 'dias' }
        ],
        responsavel: 'Área comercial', rota: 'contratos/orgaos', peso: o.recebiveis.vencido,
        acaoSugerida: 'Cobrar formalmente o órgão (ofício ao gestor do contrato) e ajustar a projeção de caixa.'
      });
    }

    /* ----------------------------- Documentos ----------------------------- */
    for (const d of ctx.dados.documentos || []) {
      const dias = B.diasEntre(hoje, d.vencimento);
      if (dias === null || dias > L.documentoDias) continue;
      add({
        chave: `documento:${d.id}`, tipo: 'documento', gravidade: dias < 0 ? 'critico' : 'atencao',
        titulo: `Documento de habilitação ${dias < 0 ? 'vencido' : 'vencendo'}: ${d.nome}`,
        mensagem: dias < 0
          ? `Venceu há ${F.dias(-dias)} (${F.data(d.vencimento)}). Sem ele a empresa pode ser inabilitada ou ter pagamentos retidos.`
          : `Vence em ${F.dias(dias)} (${F.data(d.vencimento)}).`,
        evidencias: [{ rotulo: 'Vencimento', texto: F.data(d.vencimento) }],
        responsavel: 'Licitações', rota: 'cadastros/documentos', peso: -dias,
        acaoSugerida: 'Emitir a nova certidão e atualizar o vencimento no cadastro.'
      });
    }

    /* ------------------------------- Estoque ------------------------------- */
    const est = ctx.estoque(hoje);
    for (const s of est.fefo) {
      const ehInsumo = s.itemTipo === 'insumo';
      const limite = ehInsumo ? L.insumoVencimentoDias : L.produtoVencimentoDias;
      if (s.diasParaVencer > limite) continue;
      const item = ehInsumo ? ctx.insumosPorId.get(s.itemId) : ctx.produtosPorId.get(s.itemId);
      const nome = item ? item.nome : 'item removido';
      add({
        chave: `vencimento-${s.itemTipo}:${s.itemId}:${s.lote}`, tipo: ehInsumo ? 'vencimento-insumo' : 'vencimento-produto',
        gravidade: s.diasParaVencer < 0 ? 'critico' : 'atencao',
        titulo: `${ehInsumo ? 'Insumo' : 'Produto'} ${s.diasParaVencer < 0 ? 'vencido' : 'próximo do vencimento'}: ${nome}`,
        mensagem: s.diasParaVencer < 0
          ? `O lote ${s.lote} venceu há ${F.dias(-s.diasParaVencer)} e ainda tem ${F.numero(s.qtd, 1)} ${item ? item.unidade : ''} em estoque.`
          : `O lote ${s.lote} vence em ${F.dias(s.diasParaVencer)} (${F.data(s.validade)}) e tem ${F.numero(s.qtd, 1)} ${item ? item.unidade : ''} em estoque.`,
        evidencias: [
          { rotulo: 'Quantidade', valor: s.qtd, unidade: 'numero' },
          { rotulo: 'Valor em risco', valor: s.valor, unidade: 'moeda' }
        ],
        responsavel: ehInsumo ? 'Produção' : 'Logística', rota: 'estoque', peso: s.valor,
        acaoSugerida: ehInsumo ? 'Priorizar o consumo deste lote na próxima produção (FEFO).' : 'Priorizar a expedição deste lote na próxima entrega (FEFO).'
      });
    }
    for (const m of NS.calc.estoque.abaixoMinimo(est.saldos, ctx.dados.insumos, 'insumo')) {
      const cons = NS.calc.estoque.consumoMedioDiario(ctx.dados.movimentosEstoque, 'insumo', m.item.id, hoje);
      add({
        chave: `estoque-minimo:${m.item.id}`, tipo: 'estoque-minimo', gravidade: m.saldo <= 0 ? 'critico' : 'atencao',
        titulo: `Estoque abaixo do mínimo: ${m.item.nome}`,
        mensagem: `Saldo de ${F.numero(m.saldo, 1)} ${m.item.unidade}, abaixo do mínimo de ${F.numero(m.minimo, 1)} ${m.item.unidade}.` +
          (cons ? ` Cobertura de ${F.dias(B.div(m.saldo, cons))} no consumo atual.` : ''),
        evidencias: [
          { rotulo: 'Saldo', valor: m.saldo, unidade: 'numero' },
          { rotulo: 'Mínimo', valor: m.minimo, unidade: 'numero' },
          { rotulo: 'Consumo médio diário', valor: cons, unidade: 'numero' }
        ],
        responsavel: 'Compras', rota: 'estoque', peso: m.falta,
        acaoSugerida: 'Emitir pedido de compra considerando o prazo de entrega do fornecedor.'
      });
    }

    /* ------------------------ Produção (competência) ------------------------ */
    for (const p of ctx.dados.produtos || []) {
      const r = ctx.resumoProduto(comp, p.id);
      if (!r.lotes || r.rendimento === null || r.rendimento >= p.rendimentoPadrao) continue;
      const gap = p.rendimentoPadrao - r.rendimento;
      add({
        chave: `rendimento:${p.id}`, tipo: 'rendimento', gravidade: gap >= L.rendimentoToleranciaCritico ? 'critico' : 'atencao',
        titulo: `Rendimento abaixo da meta: ${p.nome}`,
        mensagem: `Em ${F.competencia(comp)} o rendimento foi ${F.pct(r.rendimento)}, abaixo da meta de ${F.pct(p.rendimentoPadrao)}.`,
        evidencias: [
          { rotulo: 'Rendimento real', valor: r.rendimento, unidade: 'pct' },
          { rotulo: 'Meta (rendimento padrão)', valor: p.rendimentoPadrao, unidade: 'pct' },
          { rotulo: 'Variação de quantidade (Produção)', valor: r.varQtd, unidade: 'moeda' },
          { rotulo: 'Lotes no mês', valor: r.lotes, unidade: 'quantidade' }
        ],
        responsavel: 'Produção', rota: `custos?comp=${comp}`, peso: gap,
        acaoSugerida: 'Verificar regulagem do equipamento, dosagem e perdas de processo dos lotes do produto.'
      });
    }
    const resumo = ctx.resumoProducao(comp);
    // A meta de perdas é a do indicador "Índice de perdas"; sem meta definida, não há alerta.
    const indPerdas = ctx.indicadoresPorId.get('indice_perdas');
    const metaPerdas = indPerdas && B.ehNumero(indPerdas.meta) ? indPerdas.meta : null;
    if (metaPerdas !== null && resumo.lotes && resumo.indicePerdas !== null && resumo.indicePerdas > metaPerdas) {
      const principal = Object.entries(resumo.perdasPorMotivo).sort((x, y) => y[1] - x[1])[0];
      add({
        chave: `perdas:${comp}`, tipo: 'perdas', gravidade: resumo.indicePerdas > metaPerdas * 1.5 ? 'critico' : 'atencao',
        titulo: `Perdas acima da meta em ${F.competencia(comp)}`,
        mensagem: `O índice de perdas foi ${F.pct(resumo.indicePerdas)}, acima da meta de ${F.pct(metaPerdas)}. Principal motivo: ${principal[0]}.`,
        evidencias: Object.entries(resumo.perdasPorMotivo).filter(([, v]) => v > 0)
          .map(([motivo, v]) => ({ rotulo: `Perdas por ${motivo}`, valor: v, unidade: 'moeda' })),
        responsavel: 'Produção', rota: `custos?comp=${comp}`, peso: resumo.indicePerdas,
        acaoSugerida: `Investigar as perdas por ${principal[0]} e definir ação de contenção.`
      });
    }

    /* ------------------------------ Orçamento ------------------------------ */
    const orc = NS.calc.orcamento.apurar(ctx, comp, false);
    for (const l of orc.linhas) {
      if (l.naoOrcado || l.desfavoravelPct === null || l.desfavoravelPct <= L.variacaoOrcamentariaPct) continue;
      const centro = ctx.centrosPorId.get(l.centroId);
      add({
        chave: `orcamento:${comp}:${l.centroId}:${l.conta}`, tipo: 'orcamento',
        gravidade: l.desfavoravelPct > L.variacaoOrcamentariaPct * 2 ? 'critico' : 'atencao',
        titulo: `Variação orçamentária desfavorável: ${l.conta}`,
        mensagem: `${l.natureza === 'receita' ? 'Realizado abaixo' : 'Gasto acima'} do orçado em ${F.pct(Math.abs(l.pct))} em ${F.competencia(comp)}${centro ? ` (${centro.nome})` : ''}.`,
        evidencias: [
          { rotulo: 'Orçado', valor: l.base, unidade: 'moeda' },
          { rotulo: 'Realizado', valor: l.realizado, unidade: 'moeda' },
          { rotulo: 'Variação', valor: l.variacao, unidade: 'moeda' }
        ],
        responsavel: (centro && centro.responsavel) || 'Controladoria', rota: `orcamento?comp=${comp}`, peso: l.desfavoravelPct,
        acaoSugerida: 'Identificar a causa da variação com o responsável do centro e ver se é pontual ou recorrente.'
      });
    }

    /* -------------------------------- Caixa -------------------------------- */
    const proj = ctx.projecaoCaixa();
    if (proj.semanasNegativas.length) {
      const sem = proj.semanas[proj.semanaMenorSaldo - 1];
      const primeira = proj.semanas[proj.semanasNegativas[0] - 1];
      add({
        chave: 'caixa-negativo', tipo: 'caixa-negativo', gravidade: 'critico',
        titulo: 'Caixa projetado negativo nas próximas 13 semanas',
        mensagem: `O caixa fica negativo a partir da semana ${primeira.semana} (${F.data(primeira.inicio)} a ${F.data(primeira.fim)}). O menor saldo é ${F.moeda(sem.saldoFinal)} na semana ${sem.semana}.`,
        evidencias: [
          { rotulo: 'Saldo atual', valor: proj.saldoInicial, unidade: 'moeda' },
          { rotulo: 'Menor saldo projetado', valor: proj.menorSaldo, unidade: 'moeda' },
          { rotulo: 'Semanas negativas', valor: proj.semanasNegativas.length, unidade: 'quantidade' }
        ],
        responsavel: 'Área financeira', rota: 'caixa', peso: -proj.menorSaldo,
        acaoSugerida: 'Antecipar cobrança dos recebíveis vencidos, renegociar prazos de pagamento ou contratar capital de giro.'
      });
    }

    /* --------------------------- Planos vencidos --------------------------- */
    for (const p of ctx.dados.planosAcao || []) {
      if (p.status === 'concluido' || p.status === 'cancelado' || !p.prazo || p.prazo >= hoje) continue;
      const atraso = B.diasEntre(p.prazo, hoje);
      add({
        chave: `plano-vencido:${p.id}`, tipo: 'plano-vencido', gravidade: atraso > 15 ? 'critico' : 'atencao',
        titulo: `Plano de ação vencido: ${p.acao}`,
        mensagem: `O prazo era ${F.data(p.prazo)} (${F.dias(atraso)} de atraso) e o plano está ${p.status === 'andamento' ? 'em andamento' : 'aberto'}. Responsável: ${p.responsavel}.`,
        evidencias: [{ rotulo: 'Desvio de origem', texto: p.desvio }],
        responsavel: p.responsavel, rota: `planos?id=${p.id}`, peso: atraso, planoId: p.id,
        acaoSugerida: 'Cobrar o responsável e registrar novo prazo com justificativa ou concluir o plano.'
      });
    }

    /* --------------------- Indicadores fora da meta --------------------- */
    for (const av of ctx.avaliacoes(comp)) {
      if (av.status !== 'fora' || INDICADORES_COM_REGRA.includes(av.indicador.id)) continue;
      const ind = av.indicador;
      add({
        chave: `indicador:${ind.id}`, tipo: 'indicador', origem: 'indicador', gravidade: 'atencao',
        titulo: `Indicador fora da meta: ${ind.nome}`,
        mensagem: `Em ${F.competencia(comp)}: ${F.porUnidade(av.valor, ind.unidade)} contra meta de ${F.porUnidade(ind.meta, ind.unidade)}.`,
        evidencias: [
          { rotulo: 'Realizado', valor: av.valor, unidade: ind.unidade },
          { rotulo: 'Meta', valor: ind.meta, unidade: ind.unidade }
        ].concat(av.detalhe.slice(0, 2)),
        responsavel: ind.responsavel || 'responsável do indicador (a definir)', rota: `painel?ind=${ind.id}`, peso: Math.abs(av.desvioDesfavoravel || 0),
        indicadorId: ind.id, acaoSugerida: ind.acaoSugerida
      });
    }

    /* ---------------- Situação: plano de ação e exceções ---------------- */
    const planosAbertos = (ctx.dados.planosAcao || []).filter((p) => p.status === 'aberto' || p.status === 'andamento');
    const excecoes = (ctx.dados.excecoes || []).filter((e) => e.validoAte >= hoje);
    for (const a of lista) {
      a.rotuloTipo = (TIPOS[a.tipo] || {}).rotulo || a.tipo;
      a.plano = a.tipo === 'plano-vencido' ? null : (planosAbertos.find((p) => p.referenciaId === a.chave) || null);
      a.excecao = excecoes.find((e) => e.alertaChave === a.chave) || null;
      a.dispensado = !!a.excecao;
    }

    // Ordem: não dispensados primeiro; crítico antes de atenção; prioridade do tipo; peso.
    lista.sort((x, y) => (x.dispensado - y.dispensado) ||
      ((x.gravidade === 'critico' ? 0 : 1) - (y.gravidade === 'critico' ? 0 : 1)) ||
      ((TIPOS[x.tipo] || {}).prioridade - (TIPOS[y.tipo] || {}).prioridade) ||
      (y.peso - x.peso));
    return lista;
  }

  const alertas = { AVISO_JURIDICO, TIPOS, INDICADORES_COM_REGRA, aniversarioRelevante, gerar };
  NS.calc.alertas = alertas;
  if (typeof module !== 'undefined' && module.exports) module.exports = alertas;
})(typeof window !== 'undefined' ? window : globalThis);
