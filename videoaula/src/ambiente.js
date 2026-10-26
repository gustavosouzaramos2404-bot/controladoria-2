/* ==========================================================================
   videoaula/src/ambiente.js
   Prepara o navegador de gravação sem alterar o sistema:
   - abre o index.html real via file://;
   - relógio fixo (config.relogio), para os vencimentos e alertas saírem
     iguais em toda gravação;
   - desliga o banco SÓ neste navegador: a "url" do Supabase é apagada em
     memória quando js/core/config.js define NS.config (sem login, sem
     enviar nada ao banco real);
   - opcionalmente pré-carrega os dados fictícios (dados/demo.json) no
     localStorage, na chave usada pelo sistema.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const RAIZ_VIDEOAULA = path.join(__dirname, '..');
const RAIZ_SISTEMA = path.join(RAIZ_VIDEOAULA, '..');
const config = JSON.parse(fs.readFileSync(path.join(RAIZ_VIDEOAULA, 'config.json'), 'utf8'));
const CHAVE_DADOS = 'controladoria:v1';

const urlSistema = (hash = '') => pathToFileURL(path.join(RAIZ_SISTEMA, 'index.html')).href + hash;

/** Script injetado antes de qualquer script da página. */
function scriptSemBanco() {
  const NS = window.Controladoria = window.Controladoria || {};
  let atual;
  Object.defineProperty(NS, 'config', {
    configurable: true,
    get() { return atual; },
    set(v) { atual = Object.assign({}, v, { supabase: { url: '', chavePublica: '' } }); }
  });
}

/**
 * Abre um contexto de gravação.
 * opcoes: { dados: 'demo' | 'vazio', video: { dir } | null, headless }
 */
async function abrir({ dados = 'demo', video = null, headless = true } = {}) {
  const { largura, altura } = config.video;
  const navegador = await chromium.launch({ headless, args: ['--hide-scrollbars', '--disable-infobars', '--force-color-profile=srgb'] });
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    colorScheme: config.tema || 'light',
    recordVideo: video ? { dir: video.dir, size: { width: largura, height: altura } } : undefined
  });
  await contexto.clock.install({ time: new Date(config.relogio) });
  await contexto.addInitScript(scriptSemBanco);
  if (dados === 'demo') {
    const demo = fs.readFileSync(path.join(RAIZ_VIDEOAULA, 'dados', 'demo.json'), 'utf8');
    // Grava os dados só na primeira carga da página (recargas mantêm o que a cena fez).
    await contexto.addInitScript(([chave, conteudo]) => {
      if (!sessionStorage.getItem('videoaula:carregado')) {
        localStorage.clear();
        localStorage.setItem(chave, conteudo);
        sessionStorage.setItem('videoaula:carregado', '1');
      }
    }, [CHAVE_DADOS, demo]);
  } else {
    await contexto.addInitScript(() => {
      if (!sessionStorage.getItem('videoaula:carregado')) {
        localStorage.clear();
        sessionStorage.setItem('videoaula:carregado', '1');
      }
    });
  }
  const pagina = await contexto.newPage();
  const errosConsole = [];
  pagina.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
  pagina.on('pageerror', (e) => errosConsole.push(String(e && e.message ? e.message : e)));
  return { navegador, contexto, pagina, errosConsole };
}

module.exports = { abrir, urlSistema, config, RAIZ_VIDEOAULA, RAIZ_SISTEMA, CHAVE_DADOS };
