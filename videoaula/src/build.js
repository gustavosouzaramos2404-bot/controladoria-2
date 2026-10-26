/* ==========================================================================
   videoaula/src/build.js
   Comando único que regera a videoaula:
     npm run build:video              vídeo completo (out/videoaula.mp4)
     npm run preview                  preview de ~2 min (out/preview.mp4)
     npm run build:video -- --cena painel-central   regrava só essa cena
     npm run build:video -- --forcar  regrava todas as cenas
     npm run build:video -- --sem-legendado         pula a versão com legenda queimada
   Etapas: dados fictícios → narração (TTS, com cache) → gravação das cenas
   novas ou alteradas → composição → validação e relatório.
   ========================================================================== */
'use strict';
const path = require('path');
const { RAIZ, config, roteiro, executar, mmss, argumentos } = require('./util');
const { narrarTodas } = require('./tts');
const { gravarTodas } = require('./recorder');
const { compor } = require('./compose');
const { validar } = require('./validate');

(async () => {
  const a = argumentos();
  const preview = Boolean(a.preview);
  const nome = preview ? 'preview' : 'videoaula';
  const todas = roteiro().cenas;
  const cenas = preview ? config().preview.map((id) => todas.find((c) => c.id === id)).filter(Boolean) : todas;
  const inicio = Date.now();
  const etapa = (t) => console.log(`\n▶ ${t}`);

  etapa('Dados fictícios');
  executar(process.execPath, [path.join(RAIZ, 'dados', 'gerar-demo.js')]);
  console.log('  dados/demo.json atualizado');

  etapa(`Narração (${cenas.length} cenas)`);
  const audios = await narrarTodas(cenas);

  etapa('Gravação');
  const forcar = a.forcar ? ['*'] : [].concat(a.cena || []);
  const metas = await gravarTodas(cenas, audios, { forcar });

  etapa('Composição');
  const r = compor(cenas, metas, audios, { nome, legendado: !preview ? !a['sem-legendado'] : Boolean(a.legendado) });
  console.log(`  ${path.relative(RAIZ, r.arquivo)} · ${mmss(r.duracao)} · ${r.capitulos.length} capítulos · ${r.legendas} legendas`);

  etapa('Validação');
  const v = validar({ nome, preview });
  for (const c of v.checagens) console.log(`  ${c.ok ? '✓' : '✗'} ${c.texto}${c.detalhe ? ` (${c.detalhe})` : ''}`);
  console.log(`\nPronto em ${mmss((Date.now() - inicio) / 1000)}. Relatório: ${path.relative(RAIZ, v.arqRel)}`);
  process.exitCode = v.ok ? 0 : 1;
})().catch((e) => { console.error(`\n✗ ${e.stack || e.message}`); process.exitCode = 1; });
