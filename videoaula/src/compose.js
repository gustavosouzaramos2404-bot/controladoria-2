/* ==========================================================================
   videoaula/src/compose.js
   Monta o vídeo final a partir dos clipes e áudios de cada cena:
   - segmento por cena (cache/segmentos): zoom suave (aplicado aqui, para
     não deformar o layout na gravação) e fade de 300 ms nas trocas de
     capítulo; duração arredondada ao quadro e igual no vídeo e no áudio;
   - áudio por cena: narração com atraso exato (adelay = lead), fade de
     30 ms, silêncio até o fim da cena; depois concatenação, compressão
     leve e loudness normalizado (-16 LUFS, pico -1,5 dBTP, em 2 passadas);
   - legendas .srt (texto original, cronometrado pelas palavras do TTS),
     capítulos (metadados MP4 + capitulos.txt) e linha do tempo para o
     validate; versão com legendas queimadas opcional.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { RAIZ, DIR, gravarJSON, config, hash, hashArquivo, ffmpeg, executar, bin, hhmmss } = require('./util');

const FADE = 0.3;

/** Expressões do zoompan para uma lista de zooms (um ativo por vez). */
function filtroZoom(zooms, largura, altura, fps) {
  const k = 2; // processa em 2× para o zoom não "tremer"
  const rampa = 0.6;
  const termos = zooms.map((z) => {
    const a = z.inicio.toFixed(3);
    const b = (z.inicio + z.duracao).toFixed(3);
    return { a, b, s: z.escala, r: `clip((it-${a})/${rampa}\\,0\\,1)*clip((${b}-it)/${rampa}\\,0\\,1)`, cx: z.cx * k, cy: z.cy * k };
  });
  const suave = (r) => `(${r})*(${r})*(3-2*(${r}))`;
  const z = `1${termos.map((t) => `+${(t.s - 1).toFixed(3)}*${suave(t.r)}`).join('')}`;
  const centro = (eixo, total) => termos.reduceRight((acc, t) => `if(between(it\\,${(Number(t.a) - 0.05).toFixed(3)}\\,${(Number(t.b) + 0.05).toFixed(3)})\\,${t[eixo].toFixed(1)}\\,${acc})`, `${total / 2}`);
  const x = `clip(${centro('cx', largura * k)}-iw/zoom/2\\,0\\,iw-iw/zoom)`;
  const y = `clip(${centro('cy', altura * k)}-ih/zoom/2\\,0\\,ih-ih/zoom)`;
  return `scale=${largura * k}:${altura * k}:flags=lanczos,zoompan=z=${z}:x=${x}:y=${y}:d=1:s=${largura}x${altura}:fps=${fps}`;
}

/** Codifica o segmento final de uma cena (com cache por hash). */
function segmento(cena, meta, { fadeIn, fadeOut }) {
  const cfg = config();
  const { largura, altura, fps, crf } = cfg.video;
  const quadros = Math.round(meta.duracao * fps);
  const dur = quadros / fps;
  const clipe = path.join(DIR.clipes, `${cena.id}.mp4`);
  const chave = hash(meta.hashEntrada, hashArquivo(clipe), fadeIn, fadeOut, cfg.video, fs.readFileSync(__filename, 'utf8'));
  const destino = path.join(DIR.segmentos, `${cena.id}-${chave}.mp4`);
  if (!fs.existsSync(destino)) {
    for (const f of fs.readdirSync(DIR.segmentos)) if (f.startsWith(`${cena.id}-`) && f.endsWith('.mp4')) fs.unlinkSync(path.join(DIR.segmentos, f));
    const filtros = [];
    // O zoompan já entrega o tamanho e o fps finais (repetir fps+scale depois dele esgota a memória no FFmpeg 9).
    if (meta.zooms && meta.zooms.length) filtros.push(filtroZoom(meta.zooms, largura, altura, fps), 'format=yuv420p');
    else filtros.push(`fps=${fps}`, `scale=${largura}:${altura}`, 'format=yuv420p');
    if (fadeIn) filtros.push(`fade=t=in:st=0:d=${FADE}`);
    if (fadeOut) filtros.push(`fade=t=out:st=${(dur - FADE).toFixed(3)}:d=${FADE}`);
    // tpad garante o último quadro caso o clipe tenha ficado alguns ms mais curto.
    filtros.push('tpad=stop_mode=clone:stop_duration=1');
    ffmpeg(['-i', clipe, '-vf', filtros.join(','), '-frames:v', String(quadros), '-r', String(fps),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf || 20), '-profile:v', 'high', '-g', String(fps * 2),
      '-bf', '2', '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360', '-an', destino]);
  }
  return { arquivo: destino, duracao: dur };
}

/** Áudio da cena: narração deslocada pelo lead, fades curtos e silêncio até o fim. */
function audioCena(cena, audio, meta, dur, dirTrab) {
  const fade = (config().audio.fadeMs || 30) / 1000;
  const destino = path.join(dirTrab, `${cena.id}.wav`);
  const lead = Math.round(meta.lead * 1000);
  ffmpeg(['-f', 'lavfi', '-t', dur.toFixed(4), '-i', 'anullsrc=r=48000:cl=mono', '-i', path.join(RAIZ, audio.arquivo),
    '-filter_complex', `[1:a]aresample=48000,aformat=channel_layouts=mono,afade=t=in:d=${fade},areverse,afade=t=in:d=${fade},areverse,adelay=${lead}[n];` +
      `[0:a][n]amix=inputs=2:duration=first:normalize=0,atrim=0:${dur.toFixed(4)}[s]`,
    '-map', '[s]', '-c:a', 'pcm_s16le', destino]);
  return destino;
}

/** Normaliza o loudness em 2 passadas (medição + correção linear). */
function normalizar(entrada, destino) {
  const alvo = config().audio.lufs || -16;
  const pre = 'acompressor=threshold=-20dB:ratio=2.5:attack=15:release=200:makeup=2';
  const medida = executar(bin('ffmpeg'), ['-hide_banner', '-i', entrada, '-af', `${pre},loudnorm=I=${alvo}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
  const j = JSON.parse(medida.stderr.slice(medida.stderr.lastIndexOf('{'), medida.stderr.lastIndexOf('}') + 1));
  ffmpeg(['-i', entrada, '-af', `${pre},loudnorm=I=${alvo}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`,
    '-ac', '2', '-c:a', 'aac', '-b:a', '192k', destino]);
}

/** Cues de legenda de uma cena (texto original, tempo das palavras). */
function cuesCena(audio, inicioFala) {
  const { original, mapa, palavras } = audio;
  const cues = [];
  // Frases, quebradas em pedaços de até ~84 caracteres (2 linhas de 42).
  const frases = [];
  const re = /[^.!?:;]+[.!?:;]*\s*/g;
  let m;
  while ((m = re.exec(original))) {
    let ini = m.index;
    const fimFrase = m.index + m[0].length;
    while (fimFrase - ini > 84) {
      const trecho = original.slice(ini, ini + 84);
      let corte = Math.max(trecho.lastIndexOf(', '), trecho.lastIndexOf(' e '));
      if (corte < 30) corte = trecho.lastIndexOf(' ');
      frases.push([ini, ini + corte + 1]);
      ini += corte + 1;
    }
    frases.push([ini, fimFrase]);
  }
  for (const [a, b] of frases) {
    const texto = original.slice(a, b).replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const pa = mapa[a]; const pb = mapa[Math.min(b, mapa.length - 1)];
    const ws = palavras.filter((w) => w.pos >= pa && w.pos < pb);
    if (!ws.length) continue;
    const ini = inicioFala + ws[0].t;
    const fim = inicioFala + ws[ws.length - 1].t + ws[ws.length - 1].d + 0.15;
    cues.push({ ini, fim: Math.max(fim, ini + 1), texto: quebrarLinhas(texto) });
  }
  for (let i = 0; i + 1 < cues.length; i++) cues[i].fim = Math.min(cues[i].fim, cues[i + 1].ini - 0.02);
  return cues;
}

function quebrarLinhas(t) {
  if (t.length <= 42) return t;
  const meio = t.length / 2;
  let melhor = -1;
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (melhor < 0 || Math.abs(i - meio) < Math.abs(melhor - meio))) melhor = i;
  return melhor < 0 ? t : `${t.slice(0, melhor)}\n${t.slice(melhor + 1)}`;
}

const srtTempo = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000); const mi = Math.floor((ms % 3600000) / 60000); const se = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

/**
 * Compõe o vídeo. nome: base dos arquivos em out/ (videoaula ou preview).
 * Devolve a linha do tempo (também gravada em out/<nome>-linha-do-tempo.json).
 */
function compor(cenas, metas, audios, { nome = 'videoaula', legendado = true, log = console.log } = {}) {
  const cfg = config();
  const dirTrab = path.join(DIR.segmentos, `_${nome}`);
  fs.rmSync(dirTrab, { recursive: true, force: true });
  fs.mkdirSync(dirTrab, { recursive: true });
  const linha = [];
  let t = 0;
  const segs = [];
  const wavs = [];
  cenas.forEach((cena, i) => {
    const meta = metas[cena.id];
    const fadeIn = i === 0 || cenas[i - 1].capitulo !== cena.capitulo;
    const fadeOut = i === cenas.length - 1 || cenas[i + 1].capitulo !== cena.capitulo;
    const seg = segmento(cena, meta, { fadeIn, fadeOut });
    segs.push(seg.arquivo);
    wavs.push(audioCena(cena, audios[cena.id], meta, seg.duracao, dirTrab));
    linha.push({
      id: cena.id, capitulo: cena.capitulo, inicio: t, duracao: seg.duracao,
      falaInicio: t + meta.lead, falaFim: t + meta.lead + audios[cena.id].duracao,
      acoes: meta.acoes, avisos: meta.avisos, errosConsole: meta.errosConsole, conferirFaltando: meta.conferirFaltando,
      provedor: audios[cena.id].provedor
    });
    t += seg.duracao;
    log(`  segmento ${cena.id.padEnd(26)} ${seg.duracao.toFixed(2).padStart(6)} s`);
  });

  // Vídeo: concatenação sem recodificar (todos os segmentos têm os mesmos parâmetros).
  const listaV = path.join(dirTrab, 'video.txt');
  fs.writeFileSync(listaV, segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const video = path.join(dirTrab, 'video.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', listaV, '-c', 'copy', video]);

  // Áudio: concatenação das cenas + normalização.
  const listaA = path.join(dirTrab, 'audio.txt');
  fs.writeFileSync(listaA, wavs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const bruto = path.join(dirTrab, 'audio.wav');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', listaA, '-c', 'copy', bruto]);
  const audio = path.join(dirTrab, 'audio.m4a');
  normalizar(bruto, audio);

  // Capítulos.
  const capitulos = [];
  for (const c of linha) if (!capitulos.length || capitulos[capitulos.length - 1].titulo !== c.capitulo) capitulos.push({ titulo: c.capitulo, inicio: c.inicio });
  capitulos.forEach((c, i) => { c.fim = i + 1 < capitulos.length ? capitulos[i + 1].inicio : t; });
  const meta = [';FFMETADATA1', `title=Controladoria: videoaula completa`, `comment=Sistema versão ${cfg.versaoSistema}. Dados fictícios.`,
    ...capitulos.flatMap((c) => ['[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.inicio * 1000)}`, `END=${Math.round(c.fim * 1000)}`, `title=${c.titulo}`])];
  const arqMeta = path.join(dirTrab, 'capitulos.ffmeta');
  fs.writeFileSync(arqMeta, meta.join('\n'), 'utf8');
  fs.writeFileSync(path.join(DIR.out, nome === 'videoaula' ? 'capitulos.txt' : `${nome}-capitulos.txt`),
    capitulos.map((c) => `${hhmmss(c.inicio)} ${c.titulo}`).join('\n') + '\n', 'utf8');

  const final = path.join(DIR.out, `${nome}.mp4`);
  ffmpeg(['-i', video, '-i', audio, '-i', arqMeta, '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2',
    '-c', 'copy', '-movflags', '+faststart', '-shortest', final]);

  // Legendas.
  const cues = linha.flatMap((c) => cuesCena(audios[c.id], c.falaInicio));
  const srt = cues.map((c, i) => `${i + 1}\n${srtTempo(c.ini)} --> ${srtTempo(c.fim)}\n${c.texto}\n`).join('\n');
  const arqSrt = path.join(DIR.out, `${nome}.srt`);
  fs.writeFileSync(arqSrt, srt, 'utf8');
  if (legendado) {
    const estilo = 'FontName=Segoe UI,FontSize=10,PrimaryColour=&H00FFFFFF,OutlineColour=&H30000000,BackColour=&H30000000,BorderStyle=4,Outline=1,Shadow=0,MarginV=28';
    executar(bin('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${nome}.mp4`, '-vf', `subtitles=${nome}.srt:force_style='${estilo}'`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(cfg.video.crf || 20), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-map_chapters', '0',
      '-movflags', '+faststart', `${nome}-legendado.mp4`], { cwd: DIR.out });
  }
  const resultado = { nome, arquivo: final, duracao: t, capitulos, cenas: linha, legendas: cues.length };
  gravarJSON(path.join(DIR.out, `${nome}-linha-do-tempo.json`), resultado);
  fs.rmSync(dirTrab, { recursive: true, force: true });
  return resultado;
}

module.exports = { compor };
