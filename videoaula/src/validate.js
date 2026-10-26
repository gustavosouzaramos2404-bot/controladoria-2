/* ==========================================================================
   videoaula/src/validate.js
   Checagens de qualidade do vídeo composto e geração do relatório:
   - formato (1920x1080, 30 fps, H.264 + AAC) e duração (20:00–30:00 na
     versão completa);
   - loudness integrado ≈ -16 LUFS e pico abaixo de 0 dBTP (sem clipping);
   - sincronia voz × ação (atraso ≤ 500 ms), silêncios > 4 s, falas
     sobrepostas;
   - ações que falharam, textos esperados ausentes, erros de console;
   - sistema intacto (git sem mudanças fora de videoaula/) e nenhuma chave
     de API nos arquivos da pasta.
   Uso: node src/validate.js [--preview]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { RAIZ, DIR, lerJSON, config, executar, bin, mmss, hhmmss, argumentos } = require('./util');

const TOLERANCIA_SINCRONIA = 0.5;
const SILENCIO_MAX = 4;

function sondar(arq) {
  const { stdout } = executar(bin('ffprobe'), ['-v', 'error', '-show_streams', '-show_format', '-show_chapters', '-of', 'json', arq]);
  return JSON.parse(stdout);
}

function loudness(arq) {
  const r = executar(bin('ffmpeg'), ['-hide_banner', '-nostats', '-i', arq, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const resumo = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (re) => { const m = resumo.match(re); return m ? Number(m[1]) : null; };
  return { integrado: num(/I:\s+(-?[\d.]+) LUFS/), pico: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

/** Procura chaves de API nos arquivos da pasta (exceto .env, dependências e saídas). */
function procurarSegredos() {
  const segredos = ['ELEVENLABS_API_KEY'].map((k) => process.env[k]).filter((v) => v && v.length > 8);
  const achados = [];
  const varrer = (dir) => {
    for (const nome of fs.readdirSync(dir)) {
      if (['node_modules', 'out', 'cache', '.env'].includes(nome)) continue;
      const arq = path.join(dir, nome);
      if (fs.statSync(arq).isDirectory()) varrer(arq);
      else if (fs.statSync(arq).size < 5e6) {
        const txt = fs.readFileSync(arq, 'utf8');
        if (segredos.some((s) => txt.includes(s)) || /sk_[a-f0-9]{40,}/i.test(txt)) achados.push(path.relative(RAIZ, arq));
      }
    }
  };
  varrer(RAIZ);
  return achados;
}

function validar({ nome = 'videoaula', preview = false } = {}) {
  require('./tts').carregarEnv();
  const cfg = config();
  const linha = lerJSON(path.join(DIR.out, `${nome}-linha-do-tempo.json`));
  if (!linha) throw new Error(`Rode a composição antes: out/${nome}-linha-do-tempo.json não existe.`);
  const arq = path.join(DIR.out, `${nome}.mp4`);
  const info = sondar(arq);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const dur = Number(info.format.duration);
  const loud = loudness(arq);
  const checagens = [];
  const ok = (cond, texto, detalhe = '') => checagens.push({ ok: Boolean(cond), texto, detalhe });

  ok(v && v.width === cfg.video.largura && v.height === cfg.video.altura, 'Resolução 1920x1080', v ? `${v.width}x${v.height}` : 'sem vídeo');
  ok(v && v.r_frame_rate === `${cfg.video.fps}/1`, '30 quadros por segundo', v && v.r_frame_rate);
  ok(v && v.codec_name === 'h264' && a && a.codec_name === 'aac', 'H.264 + AAC', `${v && v.codec_name} + ${a && a.codec_name}`);
  if (!preview) ok(dur >= 20 * 60 && dur <= 30 * 60, 'Duração entre 20:00 e 30:00', mmss(dur));
  else ok(dur <= 3 * 60, 'Preview com até ~2–3 min', mmss(dur));
  ok(loud.integrado !== null && Math.abs(loud.integrado - (cfg.audio.lufs || -16)) <= 1, 'Loudness ≈ -16 LUFS', `${loud.integrado} LUFS`);
  ok(loud.pico !== null && loud.pico < -0.5, 'Sem clipping (pico < -0,5 dBFS)', `${loud.pico} dBFS`);
  ok((info.chapters || []).length === linha.capitulos.length, 'Capítulos gravados no MP4', `${(info.chapters || []).length}`);

  // Sincronia, falhas e silêncios.
  const atrasos = [];
  const falhas = [];
  const faltando = [];
  const console_ = [];
  const silencios = [];
  linha.cenas.forEach((c, i) => {
    for (const ac of c.acoes || []) {
      if (ac.atraso !== null && ac.atraso !== undefined) atrasos.push({ cena: c.id, n: ac.n, atraso: ac.atraso });
      if (ac.erro && !ac.opcional) falhas.push(`${c.id} · ação ${ac.n} (${ac.tipo}): ${ac.erro}`);
    }
    for (const t of c.conferirFaltando || []) faltando.push(`${c.id}: "${t}"`);
    for (const e of c.errosConsole || []) console_.push(`${c.id}: ${e}`);
    const prox = linha.cenas[i + 1];
    const gap = (prox ? prox.falaInicio : c.inicio + c.duracao) - c.falaFim;
    if (gap > SILENCIO_MAX) silencios.push(`${c.id} → ${prox ? prox.id : 'fim'}: ${gap.toFixed(1)} s sem fala`);
    if (prox && prox.falaInicio < c.falaFim) silencios.push(`SOBREPOSIÇÃO ${c.id} × ${prox.id}`);
  });
  const piorAtraso = atrasos.reduce((m, x) => (x.atraso > m.atraso ? x : m), { atraso: 0 });
  ok(piorAtraso.atraso <= TOLERANCIA_SINCRONIA, 'Sincronia voz × ação ≤ 500 ms', `pior: ${(piorAtraso.atraso * 1000).toFixed(0)} ms${piorAtraso.cena ? ` (${piorAtraso.cena}, ação ${piorAtraso.n})` : ''}`);
  ok(!silencios.some((s) => s.startsWith('SOBREPOSIÇÃO')), 'Nenhuma fala sobreposta');
  ok(!silencios.filter((s) => !s.startsWith('SOBREPOSIÇÃO')).length, `Nenhum silêncio > ${SILENCIO_MAX} s`, silencios.join('; '));
  ok(!falhas.length, 'Todas as ações executadas', `${falhas.length} falha(s)`);
  ok(!faltando.length, 'Textos citados na narração aparecem na tela', `${faltando.length} ausente(s)`);
  ok(!console_.length, 'Nenhum erro de console do sistema', `${console_.length}`);

  // Sistema intacto e segredos.
  let gitLimpo = null;
  try {
    const { stdout } = executar('git', ['status', '--porcelain'], { cwd: path.join(RAIZ, '..') });
    // Alterações pedidas pelo usuário (aba Videoaula) não contam como mexer no sistema.
    const autorizadas = cfg.alteracoesAutorizadas || [];
    gitLimpo = stdout.split('\n').filter((l) => l.trim() && !/^\?\? videoaula\/|\svideoaula\//.test(l))
      .filter((l) => !autorizadas.some((a) => l.slice(3).trim().startsWith(a)));
  } catch (e) { gitLimpo = [`git indisponível: ${e.message}`]; }
  ok(gitLimpo && !gitLimpo.length, 'Sistema original intacto (fora de videoaula/ e da aba Videoaula pedida)', gitLimpo && gitLimpo.join('; '));
  const segredos = procurarSegredos();
  ok(!segredos.length, 'Nenhuma chave de API nos arquivos', segredos.join(', '));

  const relatorio = montarRelatorio({ nome, preview, linha, dur, loud, checagens, falhas, faltando, console_, silencios, atrasos, cfg });
  const arqRel = path.join(DIR.out, preview ? `${nome}-relatorio.md` : 'relatorio.md');
  fs.writeFileSync(arqRel, relatorio, 'utf8');
  return { checagens, arqRel, ok: checagens.every((c) => c.ok) };
}

function montarRelatorio({ nome, preview, linha, dur, loud, checagens, falhas, faltando, console_, silencios, atrasos, cfg }) {
  const provedores = [...new Set(linha.cenas.map((c) => c.provedor))].join(', ');
  const medio = atrasos.length ? atrasos.reduce((s, x) => s + x.atraso, 0) / atrasos.length : 0;
  const avisos = linha.cenas.flatMap((c) => (c.avisos || []).map((x) => `${c.id}: ${x}`));
  return `# Relatório da videoaula${preview ? ' (preview)' : ''}

Gerado em ${new Date().toLocaleString('pt-BR')} · arquivo \`out/${nome}.mp4\` · **${mmss(dur)}** · voz: ${provedores}
(${cfg.tts.edge.voz} ${cfg.tts.edge.velocidade} quando Edge TTS) · loudness ${loud.integrado} LUFS, pico ${loud.pico} dBFS.

## Critérios de aceite

| | Critério | Resultado |
|---|---|---|
${checagens.map((c) => `| ${c.ok ? '✅' : '❌'} | ${c.texto} | ${c.detalhe || ''} |`).join('\n')}

Sincronia: ${atrasos.length} ações marcadas na narração, atraso médio ${(medio * 1000).toFixed(0)} ms.

## Duração por cena

| Início | Cena | Capítulo | Duração | Fala |
|---|---|---|---|---|
${linha.cenas.map((c) => `| ${hhmmss(c.inicio)} | ${c.id} | ${c.capitulo} | ${c.duracao.toFixed(1)} s | ${(c.falaFim - c.falaInicio).toFixed(1)} s |`).join('\n')}

## Capítulos

${linha.capitulos.map((c) => `- ${hhmmss(c.inicio)} ${c.titulo}`).join('\n')}

## Avisos

${[...falhas.map((x) => `- Ação com falha: ${x}`), ...avisos.filter((x) => x.includes('[opcional]')).map((x) => `- (opcional) ${x}`),
    ...faltando.map((x) => `- Texto esperado não visto: ${x}`), ...console_.map((x) => `- Erro de console: ${x}`), ...silencios.map((x) => `- ${x}`)].join('\n') || '- Nenhum.'}

## Funcionalidades do sistema ausentes ou incompletas (não demonstradas)

- **Caixa e capital de giro, Demonstrações, Controles internos, Planos de ação e Relatórios**
  aparecem no menu, mas não têm tela: abrem "Página não encontrada". A aula apenas menciona isso.
- O botão **"Relatório do mês"** do Painel leva a \`#/relatorios\`, que não existe.
- Os dados de demonstrações mensais (DRE e balanço), lançamentos de caixa, planos de ação e
  controles internos só entram por backup JSON, porque essas telas não existem.

## Decisões e suposições

- **Sem alterar o sistema:** o banco (Supabase) é desligado apenas no navegador da gravação, apagando a
  \`url\` em memória quando \`js/core/config.js\` é carregado. Assim não há login nem acesso ao banco real.
- **Dados 100% fictícios:** \`dados/demo.json\`, gerado por \`dados/gerar-demo.js\` e validado pelo
  esquema do próprio sistema. Empresa, órgãos, pessoas, números de contrato e valores são inventados.
- **Relógio fixo** em ${cfg.relogio}, para os vencimentos e alertas saírem iguais em toda gravação.
- **Cada cena começa com os dados de demonstração intactos.** O que uma cena altera (registrar ação,
  pagamento, ajuste) não passa para a seguinte; por isso nenhuma fala depende de cena anterior.
- **Captura** pelo screencast do Chrome (JPEG 92) em vez do vídeo nativo do Playwright, que usa
  bitrate baixo e borra texto em 1080p.
- **Zoom** aplicado na composição (FFmpeg), para não deformar o layout durante a gravação.
- **ElevenLabs** só é usado se ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID estiverem definidos; nesta
  máquina falta o VOICE_ID, então a voz é o Edge TTS. O caminho do ElevenLabs não foi testado.
`;
}

module.exports = { validar };

if (require.main === module) {
  const a = argumentos();
  const r = validar({ nome: a.preview ? 'preview' : 'videoaula', preview: Boolean(a.preview) });
  for (const c of r.checagens) console.log(`${c.ok ? '✓' : '✗'} ${c.texto}${c.detalhe ? ` (${c.detalhe})` : ''}`);
  console.log(`\nRelatório: ${path.relative(RAIZ, r.arqRel)}`);
  process.exitCode = r.ok ? 0 : 1;
}
