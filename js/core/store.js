/* ==========================================================================
   core/store.js
   Camada de persistência. Encapsula o localStorage (chave
   "controladoria:v1") para que, no futuro, seja possível trocar por um
   backend sem reescrever as telas. Responsável por:
   - carregar e salvar o estado completo;
   - versão do esquema e migrações;
   - operações de cadastro (listar, obter, inserir, atualizar, remover);
   - exportar e substituir todos os dados (backup).
   Toda alteração dispara o evento 'dados:alterados'.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.core = NS.core || {};

  const CHAVE = 'controladoria:v1';
  const LIMITE_LOG = 2000;  // mantém o log enxuto para não estourar o armazenamento

  let estado = null;        // estado completo em memória
  let revisao = 0;          // aumenta a cada alteração (usado para cache de cálculos)
  let nivelLote = 0;        // controle de operações em lote (salva uma vez só no fim)
  let pendente = false;     // há alteração aguardando o fim do lote

  /** Cópia profunda de dados serializáveis em JSON. */
  function clonar(obj) {
    return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
  }

  /** Gera um id curto e único (base 36). */
  function novoId(prefixo = 'id') {
    let aleatorio;
    if (raiz.crypto && raiz.crypto.getRandomValues) {
      const a = new Uint32Array(2);
      raiz.crypto.getRandomValues(a);
      aleatorio = a[0].toString(36) + a[1].toString(36);
    } else {
      aleatorio = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return `${prefixo.slice(0, 3)}-${Date.now().toString(36)}-${aleatorio.slice(0, 8)}`;
  }

  /** Configurações padrão: limites dos alertas (seção 6) e preferências. */
  function configuracoesPadrao() {
    return {
      usuario: '',
      criterioRateioCIF: 'horas',
      alertas: {
        defasagemAtencao: 0.05,
        defasagemCritico: 0.10,
        margemMinimaContrato: 0.15,
        aniversarioAvisoDias: 30,
        aniversarioJanelaDepois: 60,
        vigenciaAtencaoDias: 60,
        vigenciaCriticoDias: 30,
        saldoAtaPct: 0.20,
        garantiaDias: 30,
        documentoDias: 15,
        insumoVencimentoDias: 7,
        produtoVencimentoDias: 15,
        rendimentoToleranciaCritico: 0.03,
        variacaoOrcamentariaPct: 0.10,
        caixaSemanas: 13
      },
      volumeOrcado: {}
    };
  }

  /**
   * Empresa em branco para uma instalação nova: nada é inventado. Só a
   * competência (mês anterior a hoje) e os dias do período (30, mês
   * comercial usado nas fórmulas de prazo médio) já vêm preenchidos.
   */
  function empresaPadrao() {
    const hoje = NS.core.hoje ? NS.core.hoje() : new Date().toISOString().slice(0, 10);
    const B = NS.calc.base;
    const comp = B ? B.somarCompetencia(hoje.slice(0, 7), -1) : hoje.slice(0, 7);
    return {
      nome: '',
      competenciaAtual: comp,
      aliquotaEfetiva: null,
      custoCapitalAA: null,
      diasPeriodo: 30,
      numeroFuncionarios: null,
      saldoInicialCaixa: null,
      dataSaldoInicial: null
    };
  }

  /** Registro de indicadores (estrutura de calc/indicadores.js, com metas em branco). */
  function indicadoresPadrao() {
    const agora = NS.core.agora();
    const lista = (NS.calc.indicadores && NS.calc.indicadores.PADRAO) || [];
    return lista.map((ind) => Object.assign(clonar(ind), { criadoEm: agora, atualizadoEm: agora }));
  }

  /** Estado vazio e válido, com coleções vazias e indicadores padrão. */
  function estadoVazio() {
    const agora = NS.core.agora();
    const e = {
      meta: { esquema: NS.core.schema.VERSAO, criadoEm: agora, atualizadoEm: agora },
      empresa: empresaPadrao(),
      configuracoes: configuracoesPadrao()
    };
    for (const col of NS.core.schema.COLECOES) e[col] = [];
    e.indicadores = indicadoresPadrao();
    return e;
  }

  // Migrações: a chave é a versão de origem; a função leva para versão+1.
  const MIGRACOES = {
    // Versão 0 (sem meta.esquema) para 1: cria o bloco meta.
    0(dados) {
      dados.meta = Object.assign({ criadoEm: NS.core.agora() }, dados.meta || {}, { esquema: 1 });
      return dados;
    }
  };

  /** Aplica as migrações em sequência até a versão atual do esquema. */
  function migrar(dados) {
    let versao = (dados.meta && typeof dados.meta.esquema === 'number') ? dados.meta.esquema : 0;
    while (versao < NS.core.schema.VERSAO) {
      const fn = MIGRACOES[versao];
      if (!fn) throw new Error(`Não há migração a partir da versão ${versao} do esquema.`);
      dados = fn(dados);
      versao += 1;
      dados.meta.esquema = versao;
    }
    return dados;
  }

  /** Garante que todas as coleções e configurações existam (completa faltantes). */
  function normalizar(dados) {
    const padrao = configuracoesPadrao();
    dados.meta = dados.meta || { esquema: NS.core.schema.VERSAO };
    dados.empresa = Object.assign(empresaPadrao(), dados.empresa || {});
    dados.configuracoes = Object.assign(padrao, dados.configuracoes || {});
    dados.configuracoes.alertas = Object.assign(configuracoesPadrao().alertas, dados.configuracoes.alertas || {});
    dados.configuracoes.volumeOrcado = dados.configuracoes.volumeOrcado || {};
    for (const col of NS.core.schema.COLECOES) {
      if (!Array.isArray(dados[col])) dados[col] = [];
    }
    if (dados.indicadores.length === 0) dados.indicadores = indicadoresPadrao();
    return dados;
  }

  /** Verifica se o localStorage está disponível (pode estar bloqueado). */
  function armazenamentoDisponivel() {
    try {
      const k = '__controladoria_teste__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Grava o estado no localStorage, com mensagem clara se o espaço acabar.
   * "manterCarimbo" preserva meta.atualizadoEm (importação de backup exata).
   */
  function persistir(manterCarimbo = false) {
    if (!manterCarimbo) estado.meta.atualizadoEm = NS.core.agora();
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (e) {
      const cheio = e && (e.name === 'QuotaExceededError' || e.code === 22);
      throw new Error(cheio
        ? 'O armazenamento do navegador está cheio (limite de cerca de 5 MB). Exporte um backup e apague registros antigos.'
        : 'Não foi possível salvar no navegador. Verifique se o armazenamento local está permitido.');
    }
  }

  /** Salva e avisa as telas. Dentro de um lote, adia para o fim do lote. */
  function salvar(manterCarimbo = false) {
    if (nivelLote > 0) { pendente = true; return; }
    persistir(manterCarimbo);
    revisao += 1;
    NS.core.eventos.emit('dados:alterados', { revisao });
  }

  /** Executa várias alterações e salva uma única vez ao final. */
  function emLote(fn) {
    nivelLote += 1;
    try {
      return fn();
    } finally {
      nivelLote -= 1;
      if (nivelLote === 0 && pendente) {
        pendente = false;
        salvar();
      }
    }
  }

  /** Cria um erro de validação com a lista de erros por campo. */
  function erroValidacao(erros) {
    const err = new Error('Há campos com erro: ' + erros.map((e) => `${e.campo} (${e.mensagem})`).join('; '));
    err.erros = erros;
    return err;
  }

  /**
   * Carrega o estado salvo. Devolve { novo: true } quando não há dados
   * (primeiro acesso) ou { erro } quando o conteúdo está corrompido.
   */
  function carregar() {
    try {
      const texto = localStorage.getItem(CHAVE);
      if (!texto) { estado = null; return { novo: true }; }
      estado = normalizar(migrar(JSON.parse(texto)));
      return { ok: true };
    } catch (erro) {
      estado = null;
      return { erro };
    }
  }

  const store = {
    CHAVE,
    clonar,
    novoId,
    migrar,
    normalizar,
    estadoVazio,
    configuracoesPadrao,
    armazenamentoDisponivel,
    carregar,
    emLote,
    salvar,

    /** Estado completo em memória (somente leitura para as telas). */
    dados() { return estado; },

    /** Número da revisão atual dos dados. */
    revisao() { return revisao; },

    /** Lista os registros de uma coleção (não altere o array devolvido). */
    listar(colecao) { return (estado && estado[colecao]) || []; },

    /** Busca um registro pelo id. */
    obter(colecao, id) { return store.listar(colecao).find((r) => r.id === id) || null; },

    /** Insere um registro novo, validando antes. Devolve o registro salvo. */
    inserir(colecao, dados, opcoes = {}) {
      const agora = NS.core.agora();
      const reg = Object.assign(clonar(dados), {
        id: dados.id || novoId(colecao), criadoEm: agora, atualizadoEm: agora
      });
      if (opcoes.validar !== false) {
        const erros = NS.core.schema.validarRegistro(colecao, reg);
        if (erros.length) throw erroValidacao(erros);
      }
      estado[colecao].push(reg);
      // O log é limitado aos registros mais recentes.
      if (colecao === 'log' && estado.log.length > LIMITE_LOG) {
        estado.log.splice(0, estado.log.length - LIMITE_LOG);
      }
      salvar();
      return reg;
    },

    /** Atualiza campos de um registro existente, validando o resultado. */
    atualizar(colecao, id, campos, opcoes = {}) {
      const lista = estado[colecao];
      const idx = lista.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error('Registro não encontrado. Ele pode ter sido apagado.');
      const atual = lista[idx];
      const novo = Object.assign({}, atual, clonar(campos), {
        id, criadoEm: atual.criadoEm, atualizadoEm: NS.core.agora()
      });
      if (opcoes.validar !== false) {
        const erros = NS.core.schema.validarRegistro(colecao, novo);
        if (erros.length) throw erroValidacao(erros);
      }
      lista[idx] = novo;
      salvar();
      return novo;
    },

    /** Remove um registro pelo id. */
    remover(colecao, id) {
      const antes = estado[colecao].length;
      estado[colecao] = estado[colecao].filter((r) => r.id !== id);
      if (estado[colecao].length !== antes) salvar();
    },

    /** Dados da empresa (objeto único). */
    empresa() { return estado ? estado.empresa : empresaPadrao(); },

    /** Atualiza dados da empresa com validação. */
    atualizarEmpresa(campos) {
      const novo = Object.assign({}, estado.empresa, clonar(campos), { atualizadoEm: NS.core.agora() });
      const erros = NS.core.schema.validarRegistro('empresa', novo);
      if (erros.length) throw erroValidacao(erros);
      estado.empresa = novo;
      salvar();
      return novo;
    },

    /** Configurações (limites de alerta, rateio, usuário). */
    config() { return estado ? estado.configuracoes : configuracoesPadrao(); },

    /** Atualiza configurações; o bloco "alertas" é mesclado campo a campo. */
    atualizarConfig(campos) {
      const atual = estado.configuracoes;
      const novo = Object.assign({}, atual, clonar(campos));
      if (campos.alertas) novo.alertas = Object.assign({}, atual.alertas, clonar(campos.alertas));
      estado.configuracoes = novo;
      salvar();
      return novo;
    },

    /**
     * Substitui todos os dados (importação de backup).
     * Preserva o carimbo de atualização do arquivo, para que exportar e
     * reimportar restaure exatamente o mesmo estado.
     */
    substituirTudo(dados) {
      estado = normalizar(migrar(clonar(dados)));
      salvar(true);
    },

    /** Cópia completa para exportação em JSON. */
    exportar() { return clonar(estado); },

    /** Volta ao estado vazio. "manter" lista partes a preservar (ex.: indicadores). */
    apagarTudo(manter = []) {
      const novo = estadoVazio();
      for (const parte of manter) {
        if (estado && estado[parte] !== undefined) novo[parte] = clonar(estado[parte]);
      }
      estado = normalizar(novo);
      salvar();
    }
  };

  NS.core.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
