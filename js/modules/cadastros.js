/* ==========================================================================
   modules/cadastros.js
   Cadastros básicos, em abas: empresa (competência, alíquota efetiva,
   custo de capital, dias do período), centros de responsabilidade,
   insumos, produtos com ficha técnica padrão (e custo padrão calculado),
   órgãos públicos, documentos de habilitação e alçadas de aprovação.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;
  NS.modules = NS.modules || {};

  const ABAS = [
    { id: 'empresa', rotulo: 'Empresa', rota: 'cadastros/empresa' },
    { id: 'centros', rotulo: 'Centros de responsabilidade', rota: 'cadastros/centros' },
    { id: 'insumos', rotulo: 'Insumos', rota: 'cadastros/insumos' },
    { id: 'produtos', rotulo: 'Produtos e fichas técnicas', rota: 'cadastros/produtos' },
    { id: 'orgaos', rotulo: 'Órgãos públicos', rota: 'cadastros/orgaos' },
    { id: 'documentos', rotulo: 'Documentos de habilitação', rota: 'cadastros/documentos' },
    { id: 'alcadas', rotulo: 'Alçadas de aprovação', rota: 'cadastros/alcadas' }
  ];

  /** Aba "Empresa": formulário direto na tela. */
  function abaEmpresa(el) {
    const { html } = NS.ui;
    const store = NS.core.store;
    const empresa = store.empresa();
    el.insertAdjacentHTML('beforeend', String(html`<section class="bloco"><div class="bloco-cabecalho"><h2>Dados da empresa</h2>
      <p>Usados nos cálculos de NOPAT, EVA, prazos médios e projeção de caixa.</p></div><div data-slot="form"></div></section>`));
    const form = NS.ui.formulario({
      campos: [
        { nome: 'nome', rotulo: 'Nome da empresa', tipo: 'texto', obrigatorio: true, largura: 'meia', placeholder: 'Preencha o nome da empresa' },
        { nome: 'competenciaAtual', rotulo: 'Competência atual', tipo: 'competencia', obrigatorio: true, largura: 'quarto', ajuda: 'Último mês fechado. É a competência padrão do painel e dos alertas mensais.' },
        { nome: 'diasPeriodo', rotulo: 'Dias do período', tipo: 'inteiro', obrigatorio: true, min: 1, max: 366, largura: 'quarto', ajuda: 'Usado em PMR, PME e PMP (normalmente 30).' },
        { nome: 'aliquotaEfetiva', rotulo: 'Alíquota efetiva de IR/CSLL', tipo: 'pct', min: 0, max: 1, largura: 'quarto', placeholder: 'Preencher', ajuda: 'Para o NOPAT. Confirme o percentual com a contabilidade. Em branco, NOPAT e EVA ficam sem dados.' },
        { nome: 'custoCapitalAA', rotulo: 'Custo de capital ao ano', tipo: 'pct', min: 0, max: 2, largura: 'quarto', placeholder: 'Preencher', ajuda: 'Taxa mínima de atratividade, para o EVA. Em branco, o EVA fica sem dados.' },
        { nome: 'numeroFuncionarios', rotulo: 'Número de funcionários', tipo: 'inteiro', min: 0, largura: 'quarto', placeholder: 'Preencher', ajuda: 'Opcional: produção por funcionário.' },
        { nome: 'saldoInicialCaixa', rotulo: 'Saldo inicial de caixa', tipo: 'moeda', largura: 'quarto', placeholder: 'Preencher', ajuda: 'Saldo bancário na data abaixo. Em branco, a projeção parte de zero.' },
        { nome: 'dataSaldoInicial', rotulo: 'Data do saldo inicial', tipo: 'data', largura: 'quarto', ajuda: 'Lançamentos realizados depois desta data somam ao saldo.' }
      ],
      valores: empresa,
      rotuloSalvar: 'Salvar dados da empresa',
      aoCancelar: null,
      aoSalvar: (v) => {
        store.emLote(() => {
          store.atualizarEmpresa(v);
          NS.core.log.registrar({ entidade: 'empresa', tipo: 'alteracao', descricao: 'Dados da empresa atualizados.' });
        });
        NS.ui.avisar('Dados da empresa salvos.');
        return true;
      }
    });
    NS.ui.encaixar(el, { form });
  }

  /** Aba "Centros de responsabilidade". */
  function abaCentros(el) {
    const C = NS.modules.comum;
    const { html } = NS.ui;
    el.insertAdjacentHTML('beforeend', String(html`<section class="bloco"><div class="bloco-cabecalho"><h2>Centros de responsabilidade</h2>
      <p>Contabilidade por responsabilidade: cada centro responde pelo que controla (custo, receita, resultado ou investimento).</p></div><div data-slot="crud"></div></section>`));
    NS.ui.encaixar(el, {
      crud: C.blocoCrud({
        colecao: 'centros', singular: 'centro', genero: 'o', csv: 'centros', ordenarPor: 'nome',
        vazio: 'Nenhum centro cadastrado. Cadastre os centros para atribuir cada custo e receita a quem pode agir.',
        colunas: [
          { chave: 'nome', rotulo: 'Centro' },
          { chave: 'tipo', rotulo: 'Tipo', exibir: (l) => C.ROTULOS.tipoCentro[l.tipo], csv: (l) => C.ROTULOS.tipoCentro[l.tipo] },
          { chave: 'responsavel', rotulo: 'Responsável' }
        ],
        campos: [
          { nome: 'nome', rotulo: 'Nome do centro', tipo: 'texto', obrigatorio: true },
          { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: C.opcoes(C.ROTULOS.tipoCentro), largura: 'meia' },
          { nome: 'responsavel', rotulo: 'Responsável (nome ou cargo)', tipo: 'texto', obrigatorio: true, largura: 'meia' }
        ]
      })
    });
  }

  /** Aba "Insumos": com saldo atual e último preço de compra para comparação. */
  function abaInsumos(el, ctx) {
    const C = NS.modules.comum;
    const { html } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const est = ctx.estoque(ctx.hoje);
    const ultimaCompra = new Map();
    for (const m of ctx.dados.movimentosEstoque) {
      if (m.itemTipo !== 'insumo' || m.tipo !== 'entrada' || !(m.qtd > 0)) continue;
      const atual = ultimaCompra.get(m.itemId);
      if (!atual || m.data > atual.data) ultimaCompra.set(m.itemId, { data: m.data, preco: m.valor / m.qtd });
    }
    const linhas = ctx.dados.insumos.map((i) => {
      const s = est.saldos.get(`insumo:${i.id}`);
      const uc = ultimaCompra.get(i.id);
      return Object.assign({}, i, {
        saldo: s ? s.qtd : 0,
        ultimoPreco: uc ? uc.preco : null,
        variacaoPreco: uc ? B.variacaoPct(uc.preco, i.precoPadrao) : null
      });
    });
    el.insertAdjacentHTML('beforeend', String(html`<section class="bloco"><div class="bloco-cabecalho"><h2>Insumos</h2>
      <p>O preço padrão é a referência para a variação de preço (responsabilidade de Compras).</p></div><div data-slot="crud"></div></section>`));
    NS.ui.encaixar(el, {
      crud: C.blocoCrud({
        colecao: 'insumos', singular: 'insumo', genero: 'o', csv: 'insumos', ordenarPor: 'nome', linhas,
        vazio: 'Nenhum insumo cadastrado. Cadastre os insumos para montar as fichas técnicas e calcular o custo padrão.',
        classeLinha: (l) => (l.estoqueMinimo > 0 && l.saldo < l.estoqueMinimo ? 'linha-atencao' : ''),
        colunas: [
          { chave: 'nome', rotulo: 'Insumo' },
          { chave: 'unidade', rotulo: 'Unidade' },
          { chave: 'precoPadrao', rotulo: 'Preço padrão', tipo: 'moeda', exibir: (l) => F.moeda(l.precoPadrao) },
          { chave: 'ultimoPreco', rotulo: 'Última compra', tipo: 'moeda' },
          { chave: 'variacaoPreco', rotulo: 'Variação vs padrão', tipo: 'pct', exibir: (l) => (l.variacaoPreco === null ? '—' : NS.ui.variacao(l.variacaoPreco <= 0, F.pct(l.variacaoPreco))) },
          { chave: 'validadeDias', rotulo: 'Validade (dias)', tipo: 'quantidade' },
          { chave: 'estoqueMinimo', rotulo: 'Estoque mínimo', tipo: 'numero', casas: 0 },
          { chave: 'saldo', rotulo: 'Saldo atual', tipo: 'numero', casas: 1 }
        ],
        campos: [
          { nome: 'nome', rotulo: 'Nome do insumo', tipo: 'texto', obrigatorio: true, largura: 'meia' },
          { nome: 'unidade', rotulo: 'Unidade', tipo: 'texto', obrigatorio: true, largura: 'quarto', placeholder: 'kg, L, un' },
          { nome: 'precoPadrao', rotulo: 'Preço padrão', tipo: 'moeda', obrigatorio: true, min: 0, largura: 'quarto' },
          { nome: 'validadeDias', rotulo: 'Prazo de validade padrão (dias)', tipo: 'inteiro', min: 0, largura: 'meia' },
          { nome: 'estoqueMinimo', rotulo: 'Estoque mínimo', tipo: 'numero', min: 0, largura: 'meia', ajuda: 'Na unidade do insumo. Abaixo dele, o sistema gera alerta.' }
        ]
      })
    });
  }

  /** Aba "Produtos": ficha técnica padrão e custo padrão calculado. */
  function abaProdutos(el, ctx) {
    const C = NS.modules.comum;
    const { html } = NS.ui;
    const F = NS.core.format;
    const linhas = ctx.dados.produtos.map((p) => {
      const cp = ctx.custosPadrao.get(p.id);
      return Object.assign({}, p, { custoPadrao: cp ? cp.total : null, custoVariavel: cp ? cp.variavel : null, nInsumos: (p.fichaTecnica || []).length });
    });
    el.insertAdjacentHTML('beforeend', String(html`<section class="bloco"><div class="bloco-cabecalho"><h2>Produtos e fichas técnicas</h2>
      <p>Custo padrão unitário = [Σ(qtd padrão × preço padrão) ÷ rendimento padrão] + MOD padrão + CIF padrão.</p></div><div data-slot="crud"></div></section>`));
    NS.ui.encaixar(el, {
      crud: C.blocoCrud({
        colecao: 'produtos', singular: 'produto', genero: 'o', csv: 'produtos', ordenarPor: 'nome', linhas, larga: true,
        vazio: 'Nenhum produto cadastrado. Cadastre o primeiro produto com a ficha técnica para calcular o custo padrão.',
        colunas: [
          { chave: 'nome', rotulo: 'Produto' },
          { chave: 'unidade', rotulo: 'Unidade' },
          { chave: 'pesoKg', rotulo: 'Peso (kg)', tipo: 'numero', casas: 3 },
          { chave: 'rendimentoPadrao', rotulo: 'Rendimento padrão', tipo: 'pct' },
          { chave: 'modPadrao', rotulo: 'MOD padrão', tipo: 'moeda' },
          { chave: 'cifPadrao', rotulo: 'CIF padrão', tipo: 'moeda' },
          { chave: 'custoVariavel', rotulo: 'Custo variável padrão', tipo: 'moeda' },
          { chave: 'custoPadrao', rotulo: 'Custo padrão unitário', tipo: 'moeda', exibir: (l) => html`<strong>${F.moeda(l.custoPadrao)}</strong>` },
          { chave: 'nInsumos', rotulo: 'Insumos na ficha', tipo: 'quantidade' }
        ],
        campos: [
          { nome: 'nome', rotulo: 'Nome do produto', tipo: 'texto', obrigatorio: true, largura: 'meia' },
          { nome: 'unidade', rotulo: 'Unidade', tipo: 'texto', obrigatorio: true, largura: 'quarto', placeholder: 'un, pct, L' },
          { nome: 'pesoKg', rotulo: 'Peso por unidade (kg)', tipo: 'numero', min: 0, largura: 'quarto', ajuda: 'Para volume em kg e rateio por peso.' },
          { nome: 'validadeDias', rotulo: 'Validade (dias)', tipo: 'inteiro', min: 0, largura: 'quarto' },
          { nome: 'rendimentoPadrao', rotulo: 'Rendimento padrão', tipo: 'pct', obrigatorio: true, min: 0.01, max: 1, largura: 'quarto', ajuda: 'Ex.: 97 para 97%.' },
          { nome: 'modPadrao', rotulo: 'MOD padrão por unidade', tipo: 'moeda', obrigatorio: true, min: 0, largura: 'quarto' },
          { nome: 'cifPadrao', rotulo: 'CIF padrão por unidade', tipo: 'moeda', obrigatorio: true, min: 0, largura: 'quarto' },
          {
            nome: 'fichaTecnica', rotulo: 'Ficha técnica (por unidade produzida)', tipo: 'lista', obrigatorio: true, minimo: 1,
            rotuloItem: 'insumo', rotuloAdicionar: 'Adicionar insumo',
            campos: [
              { nome: 'insumoId', rotulo: 'Insumo', tipo: 'select', obrigatorio: true, opcoes: () => C.opcoesColecao('insumos', (i) => `${i.nome} (${i.unidade})`) },
              { nome: 'qtdPadrao', rotulo: 'Quantidade padrão', tipo: 'numero', obrigatorio: true, min: 0, casas: 4 }
            ]
          }
        ]
      })
    });
  }

  /** Aba "Órgãos públicos": prazo contratual × prazo médio real. */
  function abaOrgaos(el, ctx) {
    const C = NS.modules.comum;
    const { html } = NS.ui;
    const analises = new Map(ctx.orgaosAnalisados(ctx.hoje).map((a) => [a.orgao.id, a]));
    const linhas = ctx.dados.orgaos.map((o) => {
      const a = analises.get(o.id);
      return Object.assign({}, o, { prazoReal: a ? a.prazoMedioLiquidacao : null, contratos: a ? a.contratos.length : 0 });
    });
    el.insertAdjacentHTML('beforeend', String(html`<section class="bloco"><div class="bloco-cabecalho"><h2>Órgãos públicos</h2>
      <p>O prazo médio real é calculado a partir dos pagamentos registrados e é o usado na projeção de caixa.</p></div><div data-slot="crud"></div></section>`));
    NS.ui.encaixar(el, {
      crud: C.blocoCrud({
        colecao: 'orgaos', singular: 'órgão', genero: 'o', csv: 'orgaos', ordenarPor: 'nome', linhas,
        vazio: 'Nenhum órgão cadastrado. Cadastre os órgãos para vincular contratos e acompanhar recebimentos.',
        classeLinha: (l) => (l.prazoReal !== null && l.prazoReal > l.prazoPagamentoContratual + 10 ? 'linha-fora' : ''),
        colunas: [
          { chave: 'nome', rotulo: 'Órgão' },
          { chave: 'esfera', rotulo: 'Esfera', exibir: (l) => C.ROTULOS.esfera[l.esfera], csv: (l) => C.ROTULOS.esfera[l.esfera] },
          { chave: 'uf', rotulo: 'UF' },
          { chave: 'prazoPagamentoContratual', rotulo: 'Prazo contratual', tipo: 'dias' },
          { chave: 'prazoReal', rotulo: 'Prazo médio real', tipo: 'dias', casas: 0 },
          { chave: 'contratos', rotulo: 'Contratos', tipo: 'quantidade' }
        ],
        campos: [
          { nome: 'nome', rotulo: 'Nome do órgão', tipo: 'texto', obrigatorio: true },
          { nome: 'esfera', rotulo: 'Esfera', tipo: 'select', obrigatorio: true, opcoes: C.opcoes(C.ROTULOS.esfera), largura: 'terco' },
          { nome: 'uf', rotulo: 'UF', tipo: 'texto', obrigatorio: true, maxTamanho: 2, largura: 'terco', placeholder: 'MG',
            validar: (v) => (v && !/^[A-Za-z]{2}$/.test(v) ? 'Use a sigla da UF com 2 letras, por exemplo MG.' : null) },
          { nome: 'prazoPagamentoContratual', rotulo: 'Prazo de pagamento contratual (dias)', tipo: 'inteiro', obrigatorio: true, min: 0, largura: 'terco' }
        ],
        preparar: (v) => Object.assign({}, v, { uf: String(v.uf || '').toUpperCase() })
      })
    });
  }

  /** Aba "Documentos de habilitação": status pelo vencimento. */
  function abaDocumentos(el, ctx) {
    const C = NS.modules.comum;
    const { html, status } = NS.ui;
    const F = NS.core.format;
    const B = NS.calc.base;
    const limite = ctx.limites.documentoDias ?? 15;
    const linhas = ctx.dados.documentos.map((d) => Object.assign({}, d, { dias: B.diasEntre(ctx.hoje, d.vencimento) }));
    const situacao = (d) => {
      if (d.dias < 0) return status('fora', `Vencido há ${F.dias(-d.dias)}`);
      if (d.dias <= limite) return status('atencao', `Vence em ${F.dias(d.dias)}`);
      return status('dentro', 'Em dia');
    };
    el.insertAdjacentHTML('beforeend', String(html`<section class="bloco"><div class="bloco-cabecalho"><h2>Documentos de habilitação</h2>
      <p>Alerta ${F.dias(limite)} antes do vencimento; vencido é crítico (pode inabilitar a empresa ou reter pagamentos).</p></div><div data-slot="crud"></div></section>`));
    NS.ui.encaixar(el, {
      crud: C.blocoCrud({
        colecao: 'documentos', singular: 'documento', genero: 'o', csv: 'documentos', ordenarPor: 'vencimento', linhas,
        vazio: 'Nenhum documento cadastrado. Cadastre CNDs, FGTS, CNDT e alvarás para ser avisado antes do vencimento.',
        classeLinha: (l) => (l.dias < 0 ? 'linha-fora' : (l.dias <= limite ? 'linha-atencao' : '')),
        colunas: [
          { chave: 'nome', rotulo: 'Documento' },
          { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' },
          { chave: 'dias', rotulo: 'Situação', exibir: situacao, csv: (l) => (l.dias < 0 ? `Vencido há ${l.dias * -1} dias` : `Vence em ${l.dias} dias`) },
          { chave: 'observacao', rotulo: 'Observação' }
        ],
        campos: [
          { nome: 'nome', rotulo: 'Documento', tipo: 'texto', obrigatorio: true, largura: 'meia' },
          { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'data', obrigatorio: true, largura: 'meia' },
          { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea' }
        ]
      })
    });
  }

  /** Aba "Alçadas de aprovação". */
  function abaAlcadas(el) {
    const C = NS.modules.comum;
    const { html } = NS.ui;
    el.insertAdjacentHTML('beforeend', String(html`<section class="bloco"><div class="bloco-cabecalho"><h2>Alçadas de aprovação</h2>
      <p>Operações acima do limite exigem o registro da aprovação (aprovador e justificativa), que fica em Controles internos.</p></div><div data-slot="crud"></div></section>`));
    NS.ui.encaixar(el, {
      crud: C.blocoCrud({
        colecao: 'alcadas', singular: 'alçada', genero: 'a', csv: 'alcadas', ordenarPor: 'operacao',
        vazio: 'Nenhuma alçada cadastrada. Cadastre limites para pagamentos, compras e ajustes de estoque.',
        colunas: [
          { chave: 'operacao', rotulo: 'Tipo de operação' },
          { chave: 'limite', rotulo: 'Limite', tipo: 'moeda' },
          { chave: 'aprovador', rotulo: 'Aprovador acima do limite' }
        ],
        campos: [
          { nome: 'operacao', rotulo: 'Tipo de operação', tipo: 'texto', obrigatorio: true, ajuda: 'Use exatamente: Pagamento a fornecedor, Compra de insumos, Ajuste de estoque ou Concessão de desconto em contrato para a conferência automática.' },
          { nome: 'limite', rotulo: 'Limite', tipo: 'moeda', obrigatorio: true, min: 0, largura: 'meia' },
          { nome: 'aprovador', rotulo: 'Aprovador (nome ou cargo)', tipo: 'texto', obrigatorio: true, largura: 'meia' }
        ]
      })
    });
  }

  const RENDER = { empresa: abaEmpresa, centros: abaCentros, insumos: abaInsumos, produtos: abaProdutos, orgaos: abaOrgaos, documentos: abaDocumentos, alcadas: abaAlcadas };

  /** Tela de cadastros (uma aba por vez). */
  function tela(el, rota, ctx) {
    const { html } = NS.ui;
    const C = NS.modules.comum;
    const aba = RENDER[rota.params.aba] ? rota.params.aba : 'empresa';
    el.innerHTML = String(html`${C.cabecalho({ titulo: 'Cadastros', subtitulo: 'Base de todos os cálculos: mantenha preços padrão, fichas técnicas e prazos atualizados.' })}
      ${C.abas(ABAS, aba)}`);
    RENDER[aba](el, ctx);
  }

  NS.modules.cadastros = { rotas: { cadastros: tela, 'cadastros/:aba': tela } };
})(window);
