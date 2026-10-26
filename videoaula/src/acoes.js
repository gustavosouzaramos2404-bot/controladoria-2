/* ==========================================================================
   videoaula/src/acoes.js
   Executa as ações de uma cena no sistema real. Usado pela gravação
   (recorder.js, com cursor e realces do overlay) e pela checagem a seco
   (verificar.js, sem pausas). Cada ação tem 1 nova tentativa; se falhar de
   novo, o erro é devolvido para o relatório e a cena continua.
   Tipos: navegar, clicar, digitar, preencher, selecionar, rolar, destacar,
   zoom, esperar, tecla, hover, enviarArquivo.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { RAIZ_VIDEOAULA, urlSistema } = require('./ambiente');

const TEMPO_LIMITE = 6000;

/** Localiza o elemento da ação (o primeiro visível que casa com o seletor). */
async function alvo(pagina, seletor) {
  const loc = pagina.locator(seletor).first();
  await loc.waitFor({ state: 'visible', timeout: TEMPO_LIMITE });
  return loc;
}

/** Rola até o elemento com animação suave (na página ou dentro de um contêiner). */
async function rolarAte(pagina, loc, { dentro = null, suave = true } = {}) {
  await loc.evaluate((el, { dentro, suave }) => {
    const caixa = dentro ? el.closest(dentro) || document.querySelector(dentro) : null;
    const rolavel = caixa ? (caixa.querySelector('.modal-corpo') || caixa) : null;
    if (rolavel && rolavel.scrollHeight > rolavel.clientHeight) {
      const r = el.getBoundingClientRect();
      const rc = rolavel.getBoundingClientRect();
      rolavel.scrollTo({ top: rolavel.scrollTop + (r.top - rc.top) - 80, behavior: suave ? 'smooth' : 'auto' });
    } else {
      const topo = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: Math.max(0, topo), behavior: suave ? 'smooth' : 'auto' });
    }
  }, { dentro, suave });
  await pagina.waitForTimeout(suave ? 900 : 50);
}

/** Rola na horizontal as tabelas largas até o elemento aparecer inteiro. */
async function garantirVisivelHorizontal(pagina, loc, suave) {
  const rolou = await loc.evaluate((el, suave) => {
    let mudou = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollWidth <= p.clientWidth + 2) continue;
      const r = el.getBoundingClientRect();
      const rp = p.getBoundingClientRect();
      if (r.right > rp.right - 8 || r.left < rp.left + 8) {
        const destino = p.scrollLeft + (r.left - rp.left) - Math.max(16, (rp.width - r.width) / 2);
        p.scrollTo({ left: Math.max(0, destino), behavior: suave ? 'smooth' : 'auto' });
        mudou = true;
      }
    }
    return mudou;
  }, suave);
  if (rolou) await pagina.waitForTimeout(suave ? 700 : 50);
}

/** Garante que o elemento está visível na tela (rola só se precisar). */
async function garantirVisivel(pagina, loc, suave) {
  await garantirVisivelHorizontal(pagina, loc, suave);
  const fora = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top < 70 || r.bottom > window.innerHeight - 70;
  });
  if (fora) {
    const modal = await loc.evaluate((el) => Boolean(el.closest('.modal')));
    await rolarAte(pagina, loc, { dentro: modal ? '.modal' : null, suave });
  }
}

/**
 * Executa uma ação. "ui" (opcional) é o controle do overlay: mover o cursor,
 * clicar com ripple, realçar e dar zoom. Sem "ui", executa direto.
 */
async function executar(pagina, acao, ui = null) {
  const suave = Boolean(ui);
  const t = acao.tipo;
  if (t === 'esperar') { await pagina.waitForTimeout(acao.ms || 500); return; }
  if (t === 'navegar') {
    await pagina.evaluate((h) => { location.hash = h.startsWith('#') ? h : `#/${h}`; }, acao.alvo);
    await pagina.waitForSelector('#tela h1');
    return;
  }
  if (t === 'tecla') { await pagina.keyboard.press(acao.tecla); return; }

  const loc = await alvo(pagina, acao.seletor);
  if (t === 'rolar') { await rolarAte(pagina, loc, { dentro: acao.dentro, suave }); return; }
  await garantirVisivel(pagina, loc, suave);

  switch (t) {
    case 'clicar':
      if (ui) await ui.clicar(loc); else await loc.click();
      await pagina.waitForTimeout(suave ? 500 : 150);
      break;
    case 'hover':
      if (ui) await ui.mover(loc); else await loc.hover();
      if (ui) await pagina.waitForTimeout(acao.duracaoMs || 1200);
      break;
    case 'digitar':
      if (ui) await ui.clicar(loc); else await loc.click();
      if (acao.limpar) await loc.fill('');
      if (ui) {
        for (const ch of acao.texto) {
          await pagina.keyboard.type(ch);
          await pagina.waitForTimeout((acao.delayMs || 70) * (0.6 + Math.random() * 0.8));
        }
      } else {
        await loc.pressSequentially(acao.texto);
      }
      break;
    case 'preencher':
      if (ui) await ui.clicar(loc); else await loc.click();
      await loc.fill(acao.texto);
      break;
    case 'selecionar': {
      if (ui) await ui.clicar(loc, { semClique: true });
      if (acao.indice !== undefined) await loc.selectOption({ index: acao.indice });
      else if (acao.rotulo) await loc.selectOption({ label: acao.rotulo });
      else await loc.selectOption(acao.valor);
      await pagina.waitForTimeout(suave ? 500 : 150);
      break;
    }
    case 'destacar':
      if (ui) await ui.destacar(loc, acao.duracaoMs || 2000);
      break;
    case 'zoom':
      if (ui) await ui.zoom(loc, acao.escala || 1.3, acao.duracaoMs || 3000);
      break;
    case 'enviarArquivo': {
      const arquivo = path.join(RAIZ_VIDEOAULA, acao.arquivo);
      const espera = pagina.waitForEvent('filechooser', { timeout: TEMPO_LIMITE });
      if (ui) await ui.clicar(loc); else await loc.click();
      const seletor = await espera;
      await seletor.setFiles({ name: acao.nome || path.basename(arquivo), mimeType: 'application/json', buffer: fs.readFileSync(arquivo) });
      await pagina.waitForTimeout(suave ? 700 : 300);
      break;
    }
    default:
      throw new Error(`Tipo de ação desconhecido: ${t}`);
  }
}

/** Executa com 1 nova tentativa. Devolve null (ok) ou a mensagem de erro. */
async function executarComRetentativa(pagina, acao, ui) {
  try {
    await executar(pagina, acao, ui);
    return null;
  } catch (e1) {
    try {
      await pagina.waitForTimeout(600);
      await executar(pagina, acao, ui);
      return null;
    } catch (e2) {
      return String(e2.message || e2).split('\n')[0];
    }
  }
}

/** Abre a rota inicial da cena. */
async function abrirRota(pagina, rota) {
  await pagina.goto(urlSistema(`#/${rota || 'painel'}`));
  await pagina.waitForSelector('#tela h1');
  await pagina.waitForTimeout(300);
}

module.exports = { executar, executarComRetentativa, abrirRota, alvo };
