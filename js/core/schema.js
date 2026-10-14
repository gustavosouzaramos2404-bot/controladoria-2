/* ==========================================================================
   core/schema.js
   Esquema completo de dados do sistema: entidades, campos, tipos, regras
   e referências entre coleções. Usado para validar registros antes de
   salvar e para validar um backup JSON antes de importar.
   Tipos de campo: texto, numero, inteiro, moeda, pct (fração 0–1), data,
   competencia, enum, booleano, lista (de objetos), objeto, listaTexto, livre.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  // Versão atual do esquema. Se mudar, criar migração em store.js.
  const VERSAO = 1;

  // Atalhos para declarar campos de forma compacta.
  const t = (extra = {}) => Object.assign({ tipo: 'texto' }, extra);
  const n = (extra = {}) => Object.assign({ tipo: 'numero' }, extra);
  const m = (extra = {}) => Object.assign({ tipo: 'moeda' }, extra);
  const i = (extra = {}) => Object.assign({ tipo: 'inteiro' }, extra);
  const p = (extra = {}) => Object.assign({ tipo: 'pct' }, extra);
  const d = (extra = {}) => Object.assign({ tipo: 'data' }, extra);
  const e = (opcoes, extra = {}) => Object.assign({ tipo: 'enum', opcoes }, extra);
  const OBR = { obrigatorio: true };

  // Campos numéricos da demonstração mensal (DRE + balanço + apoio).
  const CAMPOS_DRE = ['receitaBruta', 'deducoes', 'cpv', 'custosVariaveis', 'despesasVariaveis',
    'custosFixos', 'despesasFixas', 'depreciacao', 'despesasFinanceiras', 'receitasFinanceiras', 'irCsll'];
  const CAMPOS_BALANCO = ['disponivel', 'contasReceber', 'estoques', 'outrosAC', 'rlp', 'imobilizado',
    'intangivel', 'fornecedores', 'emprestimosCP', 'obrigacoesOperacionais', 'outrosPC',
    'emprestimosLP', 'outrosPNC', 'pl'];
  const CAMPOS_APOIO = ['compras', 'cifFixosEstoqueInicial', 'cifFixosEstoqueFinal'];

  const camposDemonstracao = { competencia: { tipo: 'competencia', obrigatorio: true } };
  for (const c of [...CAMPOS_DRE, ...CAMPOS_BALANCO, ...CAMPOS_APOIO]) {
    // PL pode ser negativo (passivo a descoberto); os demais também aceitam
    // negativo apenas onde faz sentido contábil (receitas/despesas são >= 0).
    camposDemonstracao[c] = m({ obrigatorio: true, min: c === 'pl' ? undefined : 0 });
  }

  // Definição das entidades. "unico: true" indica objeto único (não coleção).
  const ENTIDADES = {
    // Empresa: só competência e dias do período são obrigatórios; o restante
    // começa em branco e é preenchido pelo usuário.
    empresa: {
      unico: true,
      campos: {
        nome: t(),
        competenciaAtual: { tipo: 'competencia', obrigatorio: true },
        aliquotaEfetiva: p({ min: 0, max: 1 }),
        custoCapitalAA: p({ min: 0, max: 2 }),
        diasPeriodo: i({ obrigatorio: true, min: 1, max: 366 }),
        numeroFuncionarios: i({ min: 0 }),
        saldoInicialCaixa: m(),
        dataSaldoInicial: d()
      }
    },
    centros: {
      campos: {
        nome: t(OBR),
        tipo: e(['custo', 'receita', 'resultado', 'investimento'], OBR),
        responsavel: t(OBR)
      }
    },
    insumos: {
      campos: {
        nome: t(OBR),
        unidade: t(OBR),
        precoPadrao: m({ obrigatorio: true, min: 0 }),
        validadeDias: i({ min: 0 }),
        estoqueMinimo: n({ min: 0 })
      }
    },
    produtos: {
      campos: {
        nome: t(OBR),
        unidade: t(OBR),
        pesoKg: n({ min: 0 }),
        validadeDias: i({ min: 0 }),
        fichaTecnica: {
          tipo: 'lista', obrigatorio: true, minimo: 1,
          item: {
            insumoId: t({ obrigatorio: true, ref: 'insumos' }),
            qtdPadrao: n({ obrigatorio: true, min: 0 })
          }
        },
        rendimentoPadrao: p({ obrigatorio: true, min: 0.01, max: 1 }),
        modPadrao: m({ obrigatorio: true, min: 0 }),
        cifPadrao: m({ obrigatorio: true, min: 0 })
      }
    },
    lotes: {
      campos: {
        produtoId: t({ obrigatorio: true, ref: 'produtos' }),
        lote: t(OBR),
        data: d(OBR),
        qtdPlanejada: n({ min: 0 }),
        qtdProduzida: n({ obrigatorio: true, min: 0 }),
        horasProducao: n({ min: 0 }),
        consumo: {
          tipo: 'lista',
          item: {
            insumoId: t({ obrigatorio: true, ref: 'insumos' }),
            qtd: n({ obrigatorio: true, min: 0 }),
            precoReal: m({ obrigatorio: true, min: 0 })
          }
        },
        modReal: m({ min: 0 }),
        perdas: {
          tipo: 'lista',
          item: {
            motivo: e(['processo', 'validade', 'avaria', 'qualidade'], OBR),
            qtd: n({ min: 0 }),
            valor: m({ obrigatorio: true, min: 0 })
          }
        },
        horasParadas: n({ min: 0 })
      }
    },
    movimentosEstoque: {
      campos: {
        data: d(OBR),
        itemTipo: e(['insumo', 'produto'], OBR),
        itemId: t({ obrigatorio: true, refPor: { campo: 'itemTipo', mapa: { insumo: 'insumos', produto: 'produtos' } } }),
        tipo: e(['entrada', 'saida', 'perda', 'ajuste'], OBR),
        qtd: n(OBR),
        valor: m(),
        lote: t(),
        validade: d(),
        documento: t(),
        motivo: t()
      }
    },
    orgaos: {
      campos: {
        nome: t(OBR),
        esfera: e(['municipal', 'estadual', 'federal'], OBR),
        uf: t({ obrigatorio: true, maxTamanho: 2 }),
        prazoPagamentoContratual: i({ obrigatorio: true, min: 0 })
      }
    },
    contratos: {
      campos: {
        numero: t(OBR),
        tipo: e(['ata', 'contrato'], OBR),
        orgaoId: t({ obrigatorio: true, ref: 'orgaos' }),
        processo: t(),
        modalidade: t(),
        assinatura: d(),
        vigenciaInicio: d(OBR),
        vigenciaFim: d(OBR),
        dataBaseProposta: d(OBR),
        indiceReajuste: t(),
        garantia: { tipo: 'objeto', campos: { valor: m({ min: 0 }), vencimento: d() } },
        itens: {
          tipo: 'lista', obrigatorio: true, minimo: 1,
          item: {
            produtoId: t({ obrigatorio: true, ref: 'produtos' }),
            qtdRegistrada: n({ obrigatorio: true, min: 0 }),
            precoContratado: m({ obrigatorio: true, min: 0 }),
            custoProposta: m({ obrigatorio: true, min: 0 })
          }
        },
        penalidades: {
          tipo: 'lista',
          item: { data: d(OBR), motivo: t(OBR), valor: m({ obrigatorio: true, min: 0 }) }
        }
      }
    },
    empenhos: {
      campos: {
        contratoId: t({ obrigatorio: true, ref: 'contratos' }),
        numero: t(OBR),
        data: d(OBR),
        itens: {
          tipo: 'lista',
          item: { produtoId: t({ obrigatorio: true, ref: 'produtos' }), qtd: n({ obrigatorio: true, min: 0 }) }
        },
        entregas: {
          tipo: 'lista',
          item: {
            produtoId: t({ obrigatorio: true, ref: 'produtos' }),
            prevista: d(OBR),
            real: d(),
            nf: t(),
            qtd: n({ obrigatorio: true, min: 0 }),
            valor: m({ obrigatorio: true, min: 0 }),
            frete: m({ min: 0 })
          }
        },
        liquidacao: { tipo: 'objeto', campos: { data: d(), valor: m({ min: 0 }), glosa: m({ min: 0 }) } },
        pagamento: { tipo: 'objeto', campos: { data: d(), valor: m({ min: 0 }) } }
      }
    },
    documentos: {
      campos: { nome: t(OBR), vencimento: d(OBR), observacao: t() }
    },
    lancamentos: {
      campos: {
        data: d(OBR),
        competencia: { tipo: 'competencia', obrigatorio: true },
        tipo: e(['entrada', 'saida'], OBR),
        categoria: t(OBR),
        centroId: t({ ref: 'centros' }),
        contratoId: t({ ref: 'contratos' }),
        valor: m({ obrigatorio: true, min: 0 }),
        situacao: e(['previsto', 'realizado'], OBR),
        descricao: t(),
        origemId: t()
      }
    },
    demonstracoes: { campos: camposDemonstracao },
    orcamento: {
      campos: {
        competencia: { tipo: 'competencia', obrigatorio: true },
        centroId: t({ obrigatorio: true, ref: 'centros' }),
        conta: t(OBR),
        natureza: e(['receita', 'custo'], OBR),
        valor: m({ obrigatorio: true, min: 0 }),
        parteVariavel: p({ obrigatorio: true, min: 0, max: 1 })
      }
    },
    indicadores: {
      campos: {
        nome: t(OBR),
        perspectiva: e(['financeira', 'clientes', 'processos', 'aprendizado'], OBR),
        unidade: e(['pct', 'moeda', 'dias', 'vezes', 'numero', 'quantidade', 'kg'], OBR),
        formula: t(OBR),
        funcaoCalculo: t(OBR),
        sentido: e(['maior-melhor', 'menor-melhor'], OBR),
        // Meta, tolerâncias e responsável começam em branco (definidos pelo usuário).
        meta: n(),
        toleranciaAtencao: n({ min: 0 }),
        toleranciaFora: n({ min: 0 }),
        responsavel: t(),
        periodicidade: t(),
        controlavel: e(['sim', 'parcial', 'nao'], OBR),
        acaoSugerida: t(),
        fonte: t(OBR),
        colecoesFonte: { tipo: 'listaTexto' },
        historico: { tipo: 'booleano' },
        pareadoCom: t()
      }
    },
    planosAcao: {
      campos: {
        origem: e(['alerta', 'indicador', 'manual'], OBR),
        referenciaId: t(),
        desvio: t(OBR),
        causa: t(),
        acao: t(OBR),
        responsavel: t(OBR),
        prazo: d(OBR),
        status: e(['aberto', 'andamento', 'concluido', 'cancelado'], OBR),
        efeito: t(),
        dataConclusao: d()
      }
    },
    controles: {
      campos: {
        area: e(['compras', 'estoque', 'faturamento', 'tesouraria', 'contratos'], OBR),
        controle: t(OBR),
        frequencia: e(['semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual'], OBR),
        ultimoTeste: d(),
        resultado: e(['efetivo', 'ressalva', 'falha']),
        responsavel: t(OBR),
        testes: {
          tipo: 'lista',
          item: { data: d(OBR), resultado: e(['efetivo', 'ressalva', 'falha'], OBR), observacao: t() }
        }
      }
    },
    alcadas: {
      campos: { operacao: t(OBR), limite: m({ obrigatorio: true, min: 0 }), aprovador: t(OBR) }
    },
    aprovacoes: {
      campos: {
        data: d(OBR),
        operacao: t(OBR),
        valor: m({ obrigatorio: true, min: 0 }),
        aprovador: t(OBR),
        referencia: t(),
        justificativa: t(OBR)
      }
    },
    excecoes: {
      campos: {
        alertaChave: t(OBR),
        titulo: t(),
        justificativa: t(OBR),
        autor: t(OBR),
        data: d(OBR),
        validoAte: d(OBR)
      }
    },
    log: {
      campos: {
        data: t(OBR),
        autor: t(OBR),
        entidade: t(),
        entidadeId: t(),
        tipo: e(['alteracao', 'excecao', 'aprovacao', 'sistema', 'exclusao'], OBR),
        descricao: t(OBR),
        justificativa: t()
      }
    }
  };

  // Lista das coleções (entidades que são arrays de registros).
  const COLECOES = Object.keys(ENTIDADES).filter((k) => !ENTIDADES[k].unico);

  /** Lê um caminho "a.b" de um objeto. */
  function ler(obj, caminho) {
    return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  /** Converte o tipo do esquema no tipo usado pelo validador de campo. */
  function regrasDe(def) {
    return Object.assign({}, def, { tipo: def.tipo === 'enum' ? 'enum' : def.tipo });
  }

  /**
   * Valida os campos de um objeto contra um mapa de definições.
   * Acumula erros em "erros" com o caminho completo do campo.
   * "dados" (opcional) permite conferir referências entre coleções.
   */
  function validarCampos(obj, campos, prefixo, erros, dados) {
    const V = NS.core.validar;
    for (const [nome, def] of Object.entries(campos)) {
      const caminho = prefixo ? `${prefixo}.${nome}` : nome;
      const valor = obj ? obj[nome] : undefined;

      if (def.tipo === 'lista') {
        if (valor == null || (Array.isArray(valor) && valor.length === 0)) {
          if (def.obrigatorio) erros.push({ campo: caminho, mensagem: 'Adicione pelo menos um item.' });
          continue;
        }
        if (!Array.isArray(valor)) { erros.push({ campo: caminho, mensagem: 'Deveria ser uma lista.' }); continue; }
        if (def.minimo && valor.length < def.minimo) {
          erros.push({ campo: caminho, mensagem: `Adicione pelo menos ${def.minimo} item(ns).` });
        }
        valor.forEach((item, idx) => validarCampos(item, def.item, `${caminho}.${idx}`, erros, dados));
        continue;
      }
      if (def.tipo === 'objeto') {
        if (valor != null && typeof valor !== 'object') {
          erros.push({ campo: caminho, mensagem: 'Deveria ser um grupo de campos.' });
          continue;
        }
        validarCampos(valor || {}, def.campos, caminho, erros, dados);
        continue;
      }
      if (def.tipo === 'listaTexto') {
        if (valor != null && (!Array.isArray(valor) || valor.some((x) => typeof x !== 'string'))) {
          erros.push({ campo: caminho, mensagem: 'Deveria ser uma lista de textos.' });
        }
        continue;
      }
      if (def.tipo === 'livre') continue;

      const msg = V.campo(valor, regrasDe(def), 'este campo');
      if (msg) { erros.push({ campo: caminho, mensagem: msg }); continue; }

      // Referência a outra coleção (só quando "dados" é informado).
      if (dados && valor != null && valor !== '') {
        let colecaoRef = def.ref;
        if (def.refPor) colecaoRef = def.refPor.mapa[obj[def.refPor.campo]];
        if (colecaoRef) {
          const existe = (dados[colecaoRef] || []).some((r) => r.id === valor);
          if (!existe) erros.push({ campo: caminho, mensagem: `Referência não encontrada em ${colecaoRef} (${valor}).` });
        }
      }
    }
  }

  /**
   * Valida um registro de uma entidade. Devolve lista de erros
   * [{campo, mensagem}] — vazia quando está tudo certo.
   */
  function validarRegistro(entidade, registro, dados) {
    const def = ENTIDADES[entidade];
    if (!def) return [{ campo: '', mensagem: `Entidade desconhecida: ${entidade}.` }];
    if (!registro || typeof registro !== 'object') return [{ campo: '', mensagem: 'Registro vazio.' }];
    const erros = [];
    validarCampos(registro, def.campos, '', erros, dados);
    return erros;
  }

  /**
   * Valida um backup completo (já migrado para a versão atual) antes de
   * importar. Confere estrutura, ids únicos, campos e referências.
   * Devolve { ok, erros: [texto] } com no máximo 30 mensagens.
   */
  function validarBackup(dados) {
    const erros = [];
    const LIMITE = 30;
    const add = (msg) => { if (erros.length < LIMITE) erros.push(msg); };

    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      return { ok: false, erros: ['O arquivo não contém um objeto de dados do Controladoria.'] };
    }
    if (!dados.meta || typeof dados.meta.esquema !== 'number') {
      return { ok: false, erros: ['O arquivo não tem a identificação de versão (meta.esquema). Use um arquivo exportado pelo próprio sistema.'] };
    }
    if (dados.meta.esquema > VERSAO) {
      return { ok: false, erros: [`O arquivo foi gerado por uma versão mais nova do sistema (esquema ${dados.meta.esquema}). Atualize o sistema antes de importar.`] };
    }

    // Empresa
    for (const er of validarRegistro('empresa', dados.empresa)) add(`Empresa, campo ${er.campo}: ${er.mensagem}`);

    // Configurações: apenas estrutura mínima.
    if (!dados.configuracoes || typeof dados.configuracoes !== 'object') add('Configurações ausentes.');

    // Coleções
    for (const col of COLECOES) {
      const lista = dados[col];
      if (!Array.isArray(lista)) { add(`A coleção "${col}" deveria ser uma lista.`); continue; }
      const ids = new Set();
      lista.forEach((reg, idx) => {
        if (!reg || typeof reg.id !== 'string' || !reg.id) { add(`${col} #${idx + 1}: registro sem id.`); return; }
        if (ids.has(reg.id)) add(`${col} #${idx + 1}: id repetido (${reg.id}).`);
        ids.add(reg.id);
        for (const er of validarRegistro(col, reg, dados)) add(`${col} #${idx + 1}, campo ${er.campo}: ${er.mensagem}`);
      });
    }
    return { ok: erros.length === 0, erros };
  }

  const schema = {
    VERSAO, ENTIDADES, COLECOES, CAMPOS_DRE, CAMPOS_BALANCO, CAMPOS_APOIO,
    ler, validarRegistro, validarBackup
  };
  NS.core.schema = schema;
  if (typeof module !== 'undefined' && module.exports) module.exports = schema;
})(typeof window !== 'undefined' ? window : globalThis);
