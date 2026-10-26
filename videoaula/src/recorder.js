/* ==========================================================================
   videoaula/src/recorder.js
   Grava cada cena num clipe próprio (cache/clipes/<id>.mp4 + .json):
   - abre o sistema real (file://) com os dados da cena e o overlay;
   - captura a tela pelo screencast do Chrome (JPEG de alta qualidade, com
     marcação de tempo por quadro), mais nítido para texto que o vídeo
     nativo do Playwright;
   - dispara cada ação no instante em que a narração a cita (marcadores
     [[N]] resolvidos pelo TTS), com o cursor chegando um pouco antes;
   - duração da cena = max(fala + respiro, ações, minDuracaoS);
   - falha de ação: 1 nova tentativa; se persistir, vai para o relatório e a
     cena continua.
   Uso direto: node src/recorder.js [--cena <id>] [--preview] [--forcar]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { DIR, RAIZ, lerJSON, gravarJSON, config, roteiro, hash, hashArquivo, ffmpeg, argumentos } = require('./util');
const { abrir } = require('./ambiente');
const { executarComRetentativa, abrirRota } = require('./acoes');
const { scriptPagina, criarControle } = require('./overlay');

const VERSAO_GRAVADOR = hash(...['acoes.js', 'overlay.js', 'recorder.js', 'ambiente.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')));
// Quanto antes do marcador cada tipo de ação começa (o cursor precisa chegar).
const ANTECIPACAO = { clicar: 0.6, digitar: 0.6, preencher: 0.6, selecionar: 0.6, hover: 0.6, enviarArquivo: 0.6, rolar: 0.25, destacar: 0.15, zoom: 0.15 };
const COM_DURACAO = new Set(['destacar', 'zoom', 'hover']);

const espera = (ms) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));
const agoraS = () => Date.now() / 1000;

/** Captura de quadros pelo protocolo do Chrome. */
async function iniciarCaptura(pagina, dirQuadros) {
  fs.rmSync(dirQuadros, { recursive: true, force: true });
  fs.mkdirSync(dirQuadros, { recursive: true });
  const cdp = await pagina.context().newCDPSession(pagina);
  const quadros = [];
  const gravacoes = [];
  cdp.on('Page.screencastFrame', (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    const arq = path.join(dirQuadros, `q${String(quadros.length).padStart(6, '0')}.jpg`);
    quadros.push({ t: f.metadata.timestamp, arq });
    gravacoes.push(fs.promises.writeFile(arq, Buffer.from(f.data, 'base64')));
  });
  const { largura, altura } = config().video;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: largura, maxHeight: altura, everyNthFrame: 1 });
  const limite = Date.now() + 5000;
  while (!quadros.length && Date.now() < limite) await espera(30);
  return {
    quadros,
    async parar() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await Promise.all(gravacoes);
      await cdp.detach().catch(() => {});
    }
  };
}

/** Monta o clipe de [t0, t0 + dur] a partir dos quadros com marcação de tempo. */
function codificarClipe(quadros, t0, dur, destino) {
  const lista = quadros.filter((q) => q.t < t0 + dur).sort((a, b) => a.t - b.t);
  let i = 0;
  while (i + 1 < lista.length && lista[i + 1].t <= t0) i++;
  const usados = lista.slice(i);
  if (!usados.length) throw new Error('nenhum quadro capturado');
  const linhas = [];
  for (let k = 0; k < usados.length; k++) {
    const ini = Math.max(usados[k].t, t0);
    const fim = k + 1 < usados.length ? usados[k + 1].t : t0 + dur;
    const d = Math.max(0.001, fim - ini);
    linhas.push(`file '${usados[k].arq.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`, `duration ${d.toFixed(4)}`);
  }
  linhas.push(`file '${usados[usados.length - 1].arq.replace(/\\/g, '/')}'`);
  const arqLista = path.join(path.dirname(usados[0].arq), 'lista.txt');
  fs.writeFileSync(arqLista, linhas.join('\n'), 'utf8');
  const { largura, altura, fps } = config().video;
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', arqLista, '-vf', `fps=${fps},scale=${largura}:${altura}:flags=lanczos,format=yuv420p`,
    '-t', dur.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-an', destino]);
}

/** HTML das telas de abertura e encerramento (sem imagens externas). */
function htmlCartao(c, cfg) {
  const esc = (s) => String(s || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;font-family:'Segoe UI',system-ui,sans-serif}
    body{display:grid;place-items:center;background:radial-gradient(1200px 700px at 30% 20%,#1f3b2f 0%,#0f1c17 60%,#0a120f 100%);color:#f4f1ea;overflow:hidden}
    .caixa{text-align:center;animation:entra 1.2s cubic-bezier(.2,.7,.2,1) both}
    .marca{display:inline-block;font-size:20px;letter-spacing:.3em;text-transform:uppercase;color:#d9b45a;border-top:2px solid #d9b45a;padding-top:14px;margin-bottom:28px}
    h1{font-size:112px;font-weight:700;margin:0 0 18px;letter-spacing:-.02em}
    p{font-size:36px;margin:0;color:#cfd8d3;font-weight:400}
    footer{position:fixed;bottom:56px;left:0;right:0;text-align:center;font-size:22px;color:#8fa39a;animation:entra 1.2s .5s both}
    @keyframes entra{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
  </style></head><body><div class="caixa"><div class="marca">Videoaula</div><h1>${esc(c.titulo)}</h1><p>${esc(c.subtitulo)}</p></div>
  <footer>${esc(c.rodape || `Sistema versão ${cfg.versaoSistema}`)}</footer></body></html>`;
}

/** Grava uma cena. "audio" é o resultado do TTS para ela. */
async function gravarCena(cena, audio, { log = console.log } = {}) {
  const cfg = config();
  const lead = cfg.leadS ?? 0.5;
  const respiro = cfg.respiroS ?? 0.6;
  const destinoMp4 = path.join(DIR.clipes, `${cena.id}.mp4`);
  const destinoMeta = path.join(DIR.clipes, `${cena.id}.json`);
  const dirQuadros = path.join(DIR.quadros, cena.id);
  const { navegador, contexto, pagina, errosConsole } = await abrir({ dados: cena.dados || 'demo' });
  const avisos = [];
  const registroAcoes = [];
  const zooms = [];
  let textoVisto = '';
  try {
    await contexto.addInitScript(scriptPagina);
    if (cena.tipo === 'cartao') {
      await pagina.setContent(htmlCartao(cena.cartao, cfg));
    } else {
      await abrirRota(pagina, cena.rota);
      await pagina.evaluate(scriptPagina);
      await pagina.evaluate(() => window.__videoaula.montar());
      await pagina.evaluate((t) => window.__videoaula.capitulo(t), cena.capitulo);
      await pagina.waitForTimeout(700); // deixa a barra do capítulo e os gráficos assentarem
    }
    const captura = await iniciarCaptura(pagina, dirQuadros);
    const t0 = agoraS();
    const ui = criarControle(pagina, { registrarZoom: (z) => zooms.push(Object.assign(z, { inicio: z.inicio - t0 })), agora: agoraS });
    const inicioFala = t0 + lead;
    let livreEm = t0 + 0.3; // instante em que a ação anterior terminou
    for (const [k, acao] of (cena.acoes || []).entries()) {
      const n = String(k + 1);
      const marcador = acao.marca != null ? audio.marcadores[String(acao.marca)] : undefined;
      const alvo = marcador !== undefined ? inicioFala + marcador - (ANTECIPACAO[acao.tipo] || 0.3) : livreEm;
      const inicioPlanejado = Math.max(alvo, livreEm);
      await espera((inicioPlanejado - agoraS()) * 1000);
      if (marcador !== undefined) await pagina.evaluate(() => document.querySelectorAll('.va-halo').forEach((h) => h.remove())).catch(() => {});
      const tIni = agoraS();
      const erro = await executarComRetentativa(pagina, acao, ui);
      const tFim = agoraS();
      if (erro) {
        (acao.opcional ? avisos : avisos).push(`ação ${n} (${acao.tipo} ${acao.seletor || ''}) ${acao.opcional ? '[opcional] ' : ''}falhou: ${erro}`);
      }
      registroAcoes.push({
        n: Number(n), marca: acao.marca ?? null, tipo: acao.tipo, marcador: marcador ?? null,
        inicio: tIni - inicioFala, fim: tFim - inicioFala,
        atraso: marcador !== undefined ? Math.max(0, tIni + (ANTECIPACAO[acao.tipo] || 0.3) - (inicioFala + marcador)) : null, erro: erro || null, opcional: Boolean(acao.opcional)
      });
      livreEm = tFim + (COM_DURACAO.has(acao.tipo) && acao.tipo !== 'hover' ? 0 : 0.35);
      if (COM_DURACAO.has(acao.tipo)) {
        // Realce, zoom e hover "ocupam" o tempo pedido, mas cedem lugar à próxima ação marcada.
        const proxAcao = cena.acoes[k + 1];
        const prox = proxAcao && proxAcao.marca != null ? audio.marcadores[String(proxAcao.marca)] : undefined;
        const limiteProx = prox !== undefined ? inicioFala + prox - (ANTECIPACAO[(cena.acoes[k + 1] || {}).tipo] || 0.3) : Infinity;
        livreEm = Math.min(tIni + (acao.duracaoMs || 1200) / 1000, Math.max(tFim, limiteProx));
      }
      textoVisto += '\n' + await pagina.evaluate(() => document.body.innerText).catch(() => '');
    }
    const fimFala = inicioFala + audio.duracao + respiro;
    // Ações em andamento seguram a cena; um realce no fim segura no máximo 2 s além da fala.
    const fimAcoes = registroAcoes.length ? inicioFala + registroAcoes[registroAcoes.length - 1].fim + 0.8 : t0;
    const fim = Math.max(fimFala, fimAcoes, Math.min(livreEm + 0.8, fimFala + 2), t0 + (cena.minDuracaoS || 0));
    await espera((fim - agoraS()) * 1000 + 250);
    textoVisto += '\n' + await pagina.evaluate(() => document.body.innerText).catch(() => '');
    await captura.parar();
    const dur = fim - t0;
    codificarClipe(captura.quadros, t0, dur, destinoMp4);
    textoVisto = textoVisto.replace(/ /g, ' ');
    const conferirFaltando = (cena.conferir || []).filter((t) => !textoVisto.includes(t));
    const meta = {
      id: cena.id, capitulo: cena.capitulo, tipo: cena.tipo || 'tela', hashEntrada: entradaCena(cena, audio),
      duracao: dur, lead, audio: audio.arquivo, duracaoAudio: audio.duracao, quadros: captura.quadros.length,
      acoes: registroAcoes, zooms, avisos, errosConsole: [...errosConsole], conferirFaltando, gravadoEm: new Date().toISOString()
    };
    gravarJSON(destinoMeta, meta);
    log(`  gravada ${cena.id.padEnd(28)} ${dur.toFixed(1).padStart(5)} s, ${captura.quadros.length} quadros${avisos.length ? `, ${avisos.length} aviso(s)` : ''}`);
    return meta;
  } finally {
    await navegador.close().catch(() => {});
    fs.rmSync(dirQuadros, { recursive: true, force: true });
  }
}

/** Hash de tudo o que influencia o clipe (para regravar só o que mudou). */
function entradaCena(cena, audio) {
  return hash(cena, audio.arquivo, hashArquivo(path.join(RAIZ, 'dados', 'demo.json')), VERSAO_GRAVADOR, config().video, config().relogio, config().leadS, config().respiroS);
}

/** Grava as cenas cujo clipe está ausente ou desatualizado (ou todas, com forcar). */
async function gravarTodas(cenas, audios, { forcar = [], log = console.log } = {}) {
  const metas = {};
  for (const cena of cenas) {
    const meta = lerJSON(path.join(DIR.clipes, `${cena.id}.json`), null);
    const atual = meta && fs.existsSync(path.join(DIR.clipes, `${cena.id}.mp4`)) && meta.hashEntrada === entradaCena(cena, audios[cena.id]);
    if (atual && !forcar.includes(cena.id) && !forcar.includes('*')) {
      metas[cena.id] = meta;
      log(`  clipe  ${cena.id.padEnd(28)} (cache)`);
      continue;
    }
    metas[cena.id] = await gravarCena(cena, audios[cena.id], { log });
  }
  return metas;
}

module.exports = { gravarTodas, gravarCena };

if (require.main === module) {
  (async () => {
    const a = argumentos();
    const { narrarTodas } = require('./tts');
    const todas = roteiro().cenas;
    const cenas = a.cena ? todas.filter((c) => [].concat(a.cena).includes(c.id)) : a.preview ? todas.filter((c) => config().preview.includes(c.id)) : todas;
    const audios = await narrarTodas(cenas);
    await gravarTodas(cenas, audios, { forcar: a.forcar ? ['*'] : [].concat(a.cena || []) });
  })().catch((e) => { console.error(e); process.exitCode = 1; });
}
