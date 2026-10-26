/* ==========================================================================
   videoaula/src/util.js
   Utilitários comuns: caminhos, leitura do roteiro, localização do FFmpeg,
   execução de processos, hash para cache e formatação de tempo.
   ========================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const DIR = {
  audio: path.join(RAIZ, 'cache', 'audio'),
  clipes: path.join(RAIZ, 'cache', 'clipes'),
  segmentos: path.join(RAIZ, 'cache', 'segmentos'),
  out: path.join(RAIZ, 'out'),
  // Quadros brutos da captura: fora do OneDrive (são muitos e temporários).
  quadros: path.join(os.tmpdir(), 'videoaula-quadros')
};
for (const d of Object.values(DIR)) fs.mkdirSync(d, { recursive: true });

const lerJSON = (arq, padrao) => (fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : padrao);
const gravarJSON = (arq, obj) => fs.writeFileSync(arq, JSON.stringify(obj, null, 2), 'utf8');
const config = () => lerJSON(path.join(RAIZ, 'config.json'));
const roteiro = () => lerJSON(path.join(RAIZ, 'roteiro', 'cenas.json'));
const hash = (...partes) => crypto.createHash('sha1').update(partes.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\u0000')).digest('hex').slice(0, 16);
const hashArquivo = (arq) => crypto.createHash('sha1').update(fs.readFileSync(arq)).digest('hex').slice(0, 16);

/** Caminho de um executável do FFmpeg (ffmpeg ou ffprobe). */
function bin(nome) {
  const cfg = config().ffmpeg || {};
  if (cfg.caminho) return path.join(cfg.caminho, `${nome}${process.platform === 'win32' ? '.exe' : ''}`);
  const teste = spawnSync(nome, ['-version'], { encoding: 'utf8' });
  if (!teste.error && teste.status === 0) return nome;
  // Instalação do winget (Gyan.FFmpeg) ainda fora do PATH desta sessão.
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(base)) {
    for (const pacote of fs.readdirSync(base).filter((p) => /ffmpeg/i.test(p))) {
      const dir = path.join(base, pacote);
      for (const sub of fs.readdirSync(dir)) {
        const exe = path.join(dir, sub, 'bin', `${nome}.exe`);
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  throw new Error(`${nome} não encontrado. Instale o FFmpeg (winget install Gyan.FFmpeg) ou informe "ffmpeg.caminho" em config.json.`);
}

/** Executa um processo e devolve stdout; lança erro com o fim do stderr. */
function executar(cmd, args, opcoes = {}) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 28 }, opcoes));
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const fim = String(r.stderr || '').split('\n').slice(-15).join('\n');
    throw new Error(`${path.basename(cmd)} falhou (código ${r.status}):\n${fim}`);
  }
  return { stdout: r.stdout, stderr: r.stderr };
}

const ffmpeg = (args) => executar(bin('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

/** Duração de um arquivo de mídia, em segundos. */
function duracao(arq) {
  const { stdout } = executar(bin('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq]);
  return Number(stdout.trim());
}

const mmss = (s) => {
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const hhmmss = (s) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  return `${h ? `${h}:` : ''}${String(Math.floor((t % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Argumentos da linha de comando: --flag e --chave valor. */
function argumentos(argv = process.argv.slice(2)) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { a._.push(argv[i]); continue; }
    const k = argv[i].slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { a[k] = a[k] ? [].concat(a[k], argv[++i]) : argv[++i]; } else a[k] = true;
  }
  return a;
}

module.exports = { RAIZ, DIR, lerJSON, gravarJSON, config, roteiro, hash, hashArquivo, bin, executar, ffmpeg, duracao, mmss, hhmmss, argumentos };
