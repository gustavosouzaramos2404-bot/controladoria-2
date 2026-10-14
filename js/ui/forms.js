/* ==========================================================================
   ui/forms.js
   Formulários declarativos: cada campo tem rótulo ligado (label for),
   ajuda, marcação de obrigatório e mensagem de erro ao lado do campo, que
   diz o que está errado e como corrigir. Aceita números com vírgula
   decimal, percentuais digitados como "12,5", datas, competência mm/aaaa,
   listas repetíveis (itens, ficha técnica, entregas) e grupos (a.b).
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria = raiz.Controladoria || {};
  NS.ui = NS.ui || {};

  let contadorForm = 0;
  let contadorLinha = 0;
  const NUMERICOS = ['numero', 'moeda', 'pct', 'inteiro'];

  /** Lê um caminho "a.b" de um objeto. */
  function lerCaminho(obj, caminho) {
    return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  /** Grava um valor num caminho "a.b" de um objeto, criando os grupos. */
  function gravarCaminho(obj, caminho, valor) {
    const partes = caminho.split('.');
    let o = obj;
    partes.slice(0, -1).forEach((k) => {
      if (!o[k] || typeof o[k] !== 'object') o[k] = {};
      o = o[k];
    });
    o[partes[partes.length - 1]] = valor;
  }

  /** Valor inicial exibido no campo, já no formato brasileiro. */
  function valorExibido(def, v) {
    const F = NS.core.format;
    if (v === null || v === undefined || v === '') return '';
    switch (def.tipo) {
      case 'moeda': return typeof v === 'number' ? F.numero(v, 2) : String(v);
      case 'pct': return typeof v === 'number' ? String(+(v * 100).toFixed(def.casas ?? 2)).replace('.', ',') : String(v);
      case 'numero': return typeof v === 'number' ? String(+v.toFixed(def.casas ?? 4)).replace('.', ',') : String(v);
      case 'inteiro': return typeof v === 'number' ? String(Math.round(v)) : String(v);
      case 'competencia': return /^\d{4}-\d{2}$/.test(v) ? F.competencia(v) : String(v);
      default: return String(v);
    }
  }

  /** Opções de um select (lista fixa ou função). */
  function opcoesDe(def, valores) {
    const ops = typeof def.opcoes === 'function' ? def.opcoes(valores) : (def.opcoes || []);
    return ops.map((o) => (typeof o === 'object' ? o : { valor: o, rotulo: o }));
  }

  /** HTML de um campo simples. "id" único; "nomeCampo" vai em data-campo. */
  function campoHtml(def, valor, id, valores, emLista = false) {
    const { html, raw } = NS.ui;
    const largura = emLista ? '' : (def.largura ? ` campo-${def.largura}` : '');
    const ajudaId = def.ajuda ? `${id}-ajuda` : '';
    const erroId = `${id}-erro`;
    const descr = [ajudaId, erroId].filter(Boolean).join(' ');
    const obrig = def.obrigatorio ? html`<span class="obrigatorio" aria-hidden="true">*</span><span class="visualmente-oculto"> (obrigatório)</span>` : '';
    const atributos = raw(`id="${id}" data-campo="${NS.ui.esc(def.nome)}" aria-describedby="${descr}"${def.obrigatorio ? ' aria-required="true"' : ''}${def.somenteLeitura ? ' readonly' : ''}`);
    const ajuda = def.ajuda ? html`<p class="ajuda" id="${ajudaId}">${def.ajuda}</p>` : '';
    const erro = html`<p class="erro-campo" id="${erroId}" hidden></p>`;
    let controle;

    switch (def.tipo) {
      case 'textarea':
        controle = html`<textarea ${atributos} rows="${def.linhas || 3}">${valor ?? ''}</textarea>`;
        break;
      case 'select': {
        const ops = opcoesDe(def, valores);
        controle = html`<select ${atributos}>
          ${def.obrigatorio && valor ? '' : html`<option value="">${def.vazio || 'Selecione…'}</option>`}
          ${ops.map((o) => html`<option value="${o.valor}" ${String(o.valor) === String(valor ?? '') ? raw('selected') : ''}>${o.rotulo}</option>`)}
        </select>`;
        break;
      }
      case 'checkbox':
        return html`<div class="campo campo-checkbox${largura}">
          <label for="${id}"><input type="checkbox" ${atributos} ${valor ? raw('checked') : ''}>${def.rotulo}</label>${ajuda}${erro}</div>`;
      case 'data':
        controle = html`<input type="date" ${atributos} value="${valor || ''}">`;
        break;
      case 'competencia':
        controle = html`<input type="text" ${atributos} value="${valorExibido(def, valor)}" placeholder="mm/aaaa" inputmode="numeric" autocomplete="off">`;
        break;
      case 'numero':
      case 'moeda':
      case 'pct':
      case 'inteiro': {
        const sufixo = def.tipo === 'pct' ? ' (%)' : (def.tipo === 'moeda' && !emLista ? ' (R$)' : '');
        controle = html`<input type="text" class="numero" ${atributos} value="${valorExibido(def, valor)}" inputmode="decimal" autocomplete="off" ${def.placeholder ? raw(`placeholder="${NS.ui.esc(def.placeholder)}"`) : ''}>`;
        return html`<div class="campo${largura}"><label for="${id}">${def.rotulo}${sufixo}${obrig}</label>${controle}${ajuda}${erro}</div>`;
      }
      default:
        controle = html`<input type="text" ${atributos} value="${valor ?? ''}" autocomplete="off" ${def.placeholder ? raw(`placeholder="${NS.ui.esc(def.placeholder)}"`) : ''}>`;
    }
    return html`<div class="campo${largura}"><label for="${id}">${def.rotulo}${obrig}</label>${controle}${ajuda}${erro}</div>`;
  }

  /** HTML de uma linha de lista repetível. */
  function linhaListaHtml(defLista, item, formId, posicao, valores) {
    const { html, icone } = NS.ui;
    const n = ++contadorLinha;
    const rotuloItem = defLista.rotuloItem || 'item';
    return html`<div class="linha-lista" data-linha="${defLista.nome}">
      ${defLista.campos.map((c) => campoHtml(c, item ? item[c.nome] : undefined, `${formId}-${defLista.nome}-${n}-${c.nome}`, valores, true))}
      <button type="button" class="botao botao-texto botao-pequeno" data-remover-linha aria-label="Remover ${rotuloItem} ${posicao}">${icone('excluir')}Remover</button>
    </div>`;
  }

  /** HTML de uma lista repetível (fieldset). */
  function listaHtml(def, itens, formId, valores) {
    const { html, icone } = NS.ui;
    const lista = Array.isArray(itens) ? itens : [];
    return html`<fieldset class="lista" data-lista="${def.nome}">
      <legend>${def.rotulo}${def.obrigatorio ? html`<span class="obrigatorio" aria-hidden="true">*</span>` : ''}</legend>
      ${def.ajuda ? html`<p class="ajuda">${def.ajuda}</p>` : ''}
      <div class="lista-linhas">${lista.map((it, i) => linhaListaHtml(def, it, formId, i + 1, valores))}</div>
      <p class="lista-vazia" ${lista.length ? 'hidden' : ''}>Nenhum ${def.rotuloItem || 'item'} adicionado.</p>
      <p class="erro-campo" data-erro-lista="${def.nome}" hidden></p>
      <button type="button" class="botao botao-secundario botao-pequeno" data-adicionar-linha="${def.nome}">${icone('mais')}${def.rotuloAdicionar || 'Adicionar item'}</button>
    </fieldset>`;
  }

  /** Converte o texto digitado no tipo do campo. Devolve {valor, erroFormato}. */
  function lerControle(el, def) {
    const F = NS.core.format;
    if (def.tipo === 'checkbox') return { valor: el.checked };
    const texto = (el.value || '').trim();
    if (NUMERICOS.includes(def.tipo)) {
      if (!texto) return { valor: null };
      const n = F.parseNumero(texto);
      if (n === null) return { valor: null, erroFormato: def.tipo === 'pct' ? 'Digite um percentual válido, por exemplo 12,5.' : 'Digite um número válido, por exemplo 1.250,50.' };
      return { valor: def.tipo === 'pct' ? n / 100 : n };
    }
    if (def.tipo === 'competencia') {
      if (!texto) return { valor: null };
      const c = F.parseCompetencia(texto);
      return c ? { valor: c } : { valor: null, erroFormato: 'Informe a competência no formato mm/aaaa, por exemplo 09/2026.' };
    }
    if (def.tipo === 'data') return { valor: texto || null };
    if (def.tipo === 'select') return { valor: texto || null };
    return { valor: texto };
  }

  /** Valida um campo e devolve a mensagem de erro (ou null). */
  function validarCampo(def, lido, todos) {
    if (lido.erroFormato) return lido.erroFormato;
    const tipoRegra = { select: 'texto', textarea: 'texto', checkbox: 'booleano' }[def.tipo] || def.tipo;
    const regras = Object.assign({}, def, { tipo: tipoRegra });
    const rotulo = (def.rotuloErro || def.rotulo || 'este campo').toLowerCase();
    const msg = NS.core.validar.campo(lido.valor, regras, `o campo "${rotulo}"`);
    if (msg) return msg;
    if (def.validar) return def.validar(lido.valor, todos) || null;
    return null;
  }

  /** Mostra ou limpa o erro de um controle. */
  function marcarErro(el, mensagem) {
    const erroEl = document.getElementById(`${el.id}-erro`);
    if (mensagem) {
      el.setAttribute('aria-invalid', 'true');
      if (erroEl) { erroEl.textContent = mensagem; erroEl.hidden = false; }
    } else {
      el.removeAttribute('aria-invalid');
      if (erroEl) { erroEl.textContent = ''; erroEl.hidden = true; }
    }
  }

  /**
   * Cria o formulário. opcoes:
   *  campos, valores, rotuloSalvar, rotuloCancelar, aoSalvar(valores) -> true |
   *  {erros:[{campo, mensagem}]} | false, aoCancelar(), mensagemSucesso
   * Devolve o elemento <form>.
   */
  function formulario(opcoes) {
    const { html, elemento } = NS.ui;
    const { campos, valores = {}, rotuloSalvar = 'Salvar', rotuloCancelar = 'Cancelar', aoSalvar, aoCancelar } = opcoes;
    const formId = `form-${++contadorForm}`;
    const partes = campos.map((def) => {
      if (def.tipo === 'secao') return html`<h3 class="formulario-secao">${def.rotulo}</h3>`;
      if (def.tipo === 'info') return html`<p class="formulario-texto">${def.rotulo}</p>`;
      if (def.tipo === 'lista') return listaHtml(def, lerCaminho(valores, def.nome), formId, valores);
      return campoHtml(def, lerCaminho(valores, def.nome), `${formId}-${def.nome.replace(/\./g, '-')}`, valores);
    });
    const form = elemento(String(html`<form class="formulario" id="${formId}" novalidate>
      <div class="resumo-erros" tabindex="-1" role="alert" hidden></div>
      ${partes}
      <div class="formulario-acoes">
        ${typeof aoCancelar === 'function' ? html`<button type="button" class="botao botao-secundario" data-cancelar>${rotuloCancelar}</button>` : ''}
        <button type="submit" class="botao botao-primario">${rotuloSalvar}</button>
      </div>
    </form>`));

    const defsLista = new Map(campos.filter((c) => c.tipo === 'lista').map((c) => [c.nome, c]));

    // Adicionar e remover linhas de listas
    form.addEventListener('click', (ev) => {
      const add = ev.target.closest('[data-adicionar-linha]');
      if (add) {
        const def = defsLista.get(add.dataset.adicionarLinha);
        const fs = form.querySelector(`[data-lista="${CSS.escape(def.nome)}"]`);
        const cont = fs.querySelector('.lista-linhas');
        const padrao = typeof def.padraoItem === 'function' ? def.padraoItem() : (def.padraoItem || {});
        const nova = elemento(String(linhaListaHtml(def, padrao, formId, cont.children.length + 1, valores)));
        cont.appendChild(nova);
        fs.querySelector('.lista-vazia').hidden = true;
        const primeiro = nova.querySelector('input, select, textarea');
        if (primeiro) primeiro.focus();
        return;
      }
      const rem = ev.target.closest('[data-remover-linha]');
      if (rem) {
        const linha = rem.closest('.linha-lista');
        const fs = linha.closest('fieldset.lista');
        linha.remove();
        const restantes = fs.querySelectorAll('.linha-lista').length;
        fs.querySelector('.lista-vazia').hidden = restantes > 0;
        fs.querySelector('[data-adicionar-linha]').focus();
        return;
      }
      if (ev.target.closest('[data-cancelar]') && aoCancelar) aoCancelar();
    });

    // Limpa o erro do campo assim que o usuário corrige.
    form.addEventListener('input', (ev) => {
      if (ev.target.getAttribute('aria-invalid') === 'true') marcarErro(ev.target, null);
    });

    /** Lê e valida todos os campos. Devolve { valores, erros: [elemento] }. */
    function lerTudo() {
      const saida = {};
      const pendentes = [];
      const invalidos = [];
      // Campos simples (fora de listas)
      for (const def of campos) {
        if (['secao', 'info', 'lista'].includes(def.tipo)) continue;
        const el = form.querySelector(`#${CSS.escape(`${formId}-${def.nome.replace(/\./g, '-')}`)}`);
        if (!el) continue;
        const lido = lerControle(el, def);
        gravarCaminho(saida, def.nome, lido.valor);
        pendentes.push({ el, def, lido });
      }
      // Listas
      for (const def of defsLista.values()) {
        const fs = form.querySelector(`[data-lista="${CSS.escape(def.nome)}"]`);
        const itens = [];
        for (const linha of fs.querySelectorAll('.linha-lista')) {
          const item = {};
          for (const c of def.campos) {
            const el = linha.querySelector(`[data-campo="${CSS.escape(c.nome)}"]`);
            const lido = lerControle(el, c);
            item[c.nome] = lido.valor;
            pendentes.push({ el, def: c, lido, item });
          }
          itens.push(item);
        }
        gravarCaminho(saida, def.nome, itens);
        const erroLista = fs.querySelector(`[data-erro-lista]`);
        const minimo = def.minimo || (def.obrigatorio ? 1 : 0);
        if (itens.length < minimo) {
          erroLista.textContent = `Adicione pelo menos ${minimo} ${def.rotuloItem || 'item'}.`;
          erroLista.hidden = false;
          invalidos.push(fs.querySelector('[data-adicionar-linha]'));
        } else {
          erroLista.hidden = true;
        }
      }
      // Validação de cada campo (com acesso aos valores completos)
      for (const p of pendentes) {
        const msg = validarCampo(p.def, p.lido, saida);
        marcarErro(p.el, msg);
        if (msg) invalidos.push(p.el);
      }
      return { valores: saida, invalidos };
    }

    /** Mostra o resumo de erros e leva o foco ao primeiro campo inválido. */
    function mostrarResumo(qtd, mensagemExtra) {
      const resumo = form.querySelector('.resumo-erros');
      if (!qtd && !mensagemExtra) { resumo.hidden = true; return; }
      resumo.textContent = mensagemExtra || (qtd === 1
        ? 'Corrija o campo destacado abaixo para continuar.'
        : `Corrija os ${qtd} campos destacados abaixo para continuar.`);
      resumo.hidden = false;
    }

    /** Aplica erros vindos do salvamento (ex.: validação do esquema). */
    function aplicarErrosExternos(erros) {
      let primeiro = null;
      for (const e of erros) {
        const partesCaminho = String(e.campo || '').split('.');
        let el = null;
        if (defsLista.has(partesCaminho[0]) && partesCaminho.length >= 3) {
          const fs = form.querySelector(`[data-lista="${CSS.escape(partesCaminho[0])}"]`);
          const linha = fs.querySelectorAll('.linha-lista')[Number(partesCaminho[1])];
          if (linha) el = linha.querySelector(`[data-campo="${CSS.escape(partesCaminho.slice(2).join('.'))}"]`);
        } else {
          el = form.querySelector(`#${CSS.escape(`${formId}-${String(e.campo).replace(/\./g, '-')}`)}`);
        }
        if (el) { marcarErro(el, e.mensagem); if (!primeiro) primeiro = el; }
      }
      mostrarResumo(erros.length, erros.length && !primeiro ? erros.map((e) => e.mensagem).join(' ') : '');
      (primeiro || form.querySelector('.resumo-erros')).focus();
    }

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const { valores: lidos, invalidos } = lerTudo();
      if (invalidos.length) {
        mostrarResumo(invalidos.length);
        invalidos[0].focus();
        return;
      }
      mostrarResumo(0);
      try {
        const r = aoSalvar ? aoSalvar(lidos) : true;
        if (r && r.erros && r.erros.length) aplicarErrosExternos(r.erros);
      } catch (erro) {
        if (erro && erro.erros) aplicarErrosExternos(erro.erros);
        else {
          mostrarResumo(0, erro && erro.message ? erro.message : 'Não foi possível salvar.');
          form.querySelector('.resumo-erros').focus();
        }
      }
    });

    form.lerTudo = lerTudo;
    return form;
  }

  /**
   * Abre um formulário dentro de uma janela modal. Ao salvar com sucesso,
   * fecha a janela e mostra "mensagemSucesso" (mesmo verbo do botão).
   * aoSalvar(valores) deve lançar erro ou devolver {erros} se algo der errado.
   */
  function abrirFormulario({ titulo, campos, valores, rotuloSalvar = 'Salvar', mensagemSucesso = 'Registro salvo.', aoSalvar, larga = false, introducao, aoFechar }) {
    let janela = null;
    const form = formulario({
      campos, valores, rotuloSalvar,
      aoCancelar: () => janela && janela.fechar(),
      aoSalvar: (v) => {
        const r = aoSalvar(v);
        if (r && r.erros) return r;
        janela.fechar();
        if (mensagemSucesso) NS.ui.avisar(mensagemSucesso);
        return true;
      }
    });
    let conteudo = form;
    if (introducao) {
      conteudo = document.createElement('div');
      conteudo.innerHTML = String(introducao);
      conteudo.appendChild(form);
    }
    janela = NS.ui.modal.abrir({ titulo, conteudo, larga, aoFechar });
    return janela;
  }

  NS.ui.forms = { formulario, abrirFormulario, lerCaminho, gravarCaminho };
  NS.ui.formulario = formulario;
  NS.ui.abrirFormulario = abrirFormulario;
})(typeof window !== 'undefined' ? window : globalThis);
