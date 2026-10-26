/* ==========================================================================
   videoaula/src/tts.js
   Narração por cena, com interface única para vários provedores e fallback
   automático (ordem em config.json → tts.provedores):
     1. elevenlabs: exige ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID (ambiente
        ou .env). Tempo por caractere (endpoint with-timestamps).
     2. edge:       Edge TTS (gratuito, sem chave). Tempo por palavra.
     3. sapi:       voz local do Windows (offline). Tempo proporcional.
   - Aplica o dicionário de pronúncia (config.json → pronuncia) antes de
     sintetizar, guardando o mapa texto original → texto falado (legendas).
   - Os marcadores [[N]] viram o instante (s) em que a ação N deve começar.
   - Cache por hash (provedor + voz + velocidade + texto falado).
   Uso: node src/tts.js [--cena <id>] [--preview]
   Nenhuma chave é gravada em arquivo: só lidas do ambiente ou do .env.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { RAIZ, DIR, lerJSON, gravarJSON, config, roteiro, hash, executar, ffmpeg, duracao, argumentos } = require('./util');

/** Lê o .env (se existir) sem sobrescrever variáveis já definidas. */
function carregarEnv() {
  const arq = path.join(RAIZ, '.env');
  if (!fs.existsSync(arq)) return;
  for (const linha of fs.readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/**
 * Prepara o texto falado: remove os marcadores (guardando a posição de cada
 * um no texto falado) e aplica o dicionário de pronúncia. Devolve também o
 * texto original limpo e o mapa de posições original → falado.
 */
function prepararTexto(narracao, pronuncia) {
  const chaves = Object.keys(pronuncia).sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = chaves.length ? new RegExp(`(?<![\\p{L}\\d])(${chaves.map(esc).join('|')})(?![\\p{L}\\d])`, 'gu') : null;
  let original = '';
  let falado = '';
  const mapa = []; // mapa[i] = posição no texto falado do caractere i do original
  const marcadores = {};
  const partes = narracao.split(/(\[\[\d+\]\])/);
  for (const parte of partes) {
    const m = parte.match(/^\[\[(\d+)\]\]$/);
    if (m) { marcadores[m[1]] = falado.length; continue; }
    let ultimo = 0;
    const adicionarLiteral = (txt) => {
      for (const ch of txt) { mapa.push(falado.length); original += ch; falado += ch; }
    };
    if (re) {
      for (const achado of parte.matchAll(re)) {
        adicionarLiteral(parte.slice(ultimo, achado.index));
        const inicio = falado.length;
        falado += pronuncia[achado[1]];
        for (let k = 0; k < achado[1].length; k++) { mapa.push(inicio); original += achado[1][k]; }
        ultimo = achado.index + achado[1].length;
      }
    }
    adicionarLiteral(parte.slice(ultimo));
  }
  mapa.push(falado.length);
  return { original, falado, mapa, marcadores };
}

/** Posição de cada palavra (do provedor) dentro do texto falado. */
function alinharPalavras(palavras, falado) {
  const baixo = falado.toLowerCase();
  let cursor = 0;
  for (const p of palavras) {
    const i = baixo.indexOf(String(p.texto).toLowerCase(), cursor);
    if (i >= 0 && i - cursor < 80) { p.pos = i; cursor = i + p.texto.length; } else p.pos = cursor;
  }
  return palavras;
}

/** Instante (s) de uma posição do texto falado: início da primeira palavra a partir dela. */
function instante(palavras, pos, total) {
  const p = palavras.find((w) => w.pos >= pos);
  return p ? p.t : total;
}

/* ------------------------------- provedores ------------------------------- */

const PROVEDORES = {
  elevenlabs: {
    disponivel: () => Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
    voz: () => `eleven:${process.env.ELEVENLABS_VOICE_ID}`,
    async sintetizar(texto, mp3, cfg) {
      const c = cfg.tts.elevenlabs || {};
      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/with-timestamps`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: texto, model_id: c.modelo || 'eleven_multilingual_v2', language_code: 'pt',
          voice_settings: { stability: c.estabilidade ?? 0.5, similarity_boost: c.similaridade ?? 0.75, speed: c.velocidade ?? 1 }
        })
      });
      if (!resp.ok) throw new Error(`ElevenLabs respondeu ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      const j = await resp.json();
      fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
      // Agrupa o alinhamento por caractere em palavras.
      const al = j.alignment || { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
      const palavras = [];
      let atual = null;
      al.characters.forEach((ch, i) => {
        if (/\s/.test(ch)) { atual = null; return; }
        if (!atual) { atual = { t: al.character_start_times_seconds[i], d: 0, texto: '' }; palavras.push(atual); }
        atual.texto += ch;
        atual.d = al.character_end_times_seconds[i] - atual.t;
      });
      return palavras;
    }
  },
  edge: {
    disponivel: () => true,
    voz: (cfg) => `edge:${cfg.tts.edge.voz}:${cfg.tts.edge.velocidade}`,
    async sintetizar(texto, mp3, cfg) {
      const tmpTxt = `${mp3}.txt`;
      const tmpJson = `${mp3}.palavras.json`;
      fs.writeFileSync(tmpTxt, texto, 'utf8');
      try {
        executar(process.platform === 'win32' ? 'python' : 'python3',
          [path.join(__dirname, 'tts_edge.py'), tmpTxt, cfg.tts.edge.voz, cfg.tts.edge.velocidade, mp3, tmpJson]);
        return lerJSON(tmpJson, []);
      } finally {
        for (const f of [tmpTxt, tmpJson]) if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
  },
  sapi: {
    disponivel: () => process.platform === 'win32',
    voz: (cfg) => `sapi:${(cfg.tts.sapi || {}).voz || 'pt-BR'}`,
    async sintetizar(texto, mp3, cfg) {
      const wav = `${mp3}.wav`;
      const tmpTxt = `${mp3}.txt`;
      fs.writeFileSync(tmpTxt, texto, 'utf8');
      const script = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
        $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1;
        if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}');
        $s.Speak([IO.File]::ReadAllText('${tmpTxt.replace(/'/g, "''")}', [Text.Encoding]::UTF8)); $s.Dispose()`;
      try {
        executar('powershell', ['-NoProfile', '-Command', script]);
        ffmpeg(['-i', wav, '-ar', '48000', '-ac', '1', '-b:a', '160k', mp3]);
      } finally {
        for (const f of [wav, tmpTxt]) if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      // Sem tempo por palavra: distribui proporcionalmente ao número de caracteres.
      const total = duracao(mp3);
      const palavras = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(texto))) palavras.push({ t: (m.index / texto.length) * total, d: (m[0].length / texto.length) * total, texto: m[0] });
      return palavras;
    }
  }
};

/** Gera (ou reaproveita do cache) a narração de uma cena. */
async function narrar(cena, cfg, log = console.log) {
  const { original, falado, mapa, marcadores } = prepararTexto(cena.narracao, cfg.pronuncia || {});
  const texto = falado; // sem normalizar espaços: as posições dos marcadores dependem dele
  const erros = [];
  for (const nome of cfg.tts.provedores) {
    const prov = PROVEDORES[nome];
    if (!prov || !prov.disponivel()) continue;
    const chave = hash(nome, prov.voz(cfg), texto);
    const mp3 = path.join(DIR.audio, `${cena.id}-${chave}.mp3`);
    const meta = `${mp3}.json`;
    if (fs.existsSync(mp3) && fs.existsSync(meta)) return Object.assign(lerJSON(meta), { emCache: true });
    try {
      const palavras = alinharPalavras(await prov.sintetizar(texto, mp3, cfg), texto);
      const dur = duracao(mp3);
      const r = {
        id: cena.id, provedor: nome, voz: prov.voz(cfg), arquivo: path.relative(RAIZ, mp3).replace(/\\/g, '/'), duracao: dur,
        original, falado: texto, mapa, palavras,
        marcadores: Object.fromEntries(Object.entries(marcadores).map(([n, pos]) => [n, instante(palavras, pos, dur)]))
      };
      gravarJSON(meta, r);
      if (erros.length) log(`  ${cena.id}: usado ${nome} (falharam: ${erros.join('; ')})`);
      return r;
    } catch (e) {
      erros.push(`${nome}: ${String(e.message || e).split('\n')[0]}`);
      if (fs.existsSync(mp3)) fs.unlinkSync(mp3);
    }
  }
  throw new Error(`Nenhum provedor de voz funcionou para "${cena.id}": ${erros.join(' | ')}`);
}

/** Narra todas as cenas pedidas e atualiza cache/audio/duracoes.json. */
async function narrarTodas(cenas, log = console.log) {
  carregarEnv();
  const cfg = config();
  const resultado = {};
  const duracoes = lerJSON(path.join(DIR.audio, 'duracoes.json'), {});
  for (const cena of cenas) {
    const r = await narrar(cena, cfg, log);
    resultado[cena.id] = r;
    duracoes[cena.id] = r.duracao;
    log(`  voz ${cena.id.padEnd(28)} ${r.duracao.toFixed(1).padStart(5)} s  ${r.provedor}${r.emCache ? ' (cache)' : ''}`);
  }
  gravarJSON(path.join(DIR.audio, 'duracoes.json'), duracoes);
  return resultado;
}

module.exports = { narrarTodas, prepararTexto, carregarEnv };

if (require.main === module) {
  const a = argumentos();
  const todas = roteiro().cenas;
  const cenas = a.cena ? todas.filter((c) => [].concat(a.cena).includes(c.id)) : a.preview ? todas.filter((c) => config().preview.includes(c.id)) : todas;
  narrarTodas(cenas).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
