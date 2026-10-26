/* ==========================================================================
   videoaula/src/verificar.js
   Checagem a seco do roteiro: para cada cena, abre a rota inicial com os
   dados da cena, executa as ações sem pausas e confere se os textos de
   "conferir" aparecem na tela. Não grava vídeo.
   Uso: node src/verificar.js [--cena <id>]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { abrir, RAIZ_VIDEOAULA } = require('./ambiente');
const { executarComRetentativa, abrirRota } = require('./acoes');

const roteiro = JSON.parse(fs.readFileSync(path.join(RAIZ_VIDEOAULA, 'roteiro', 'cenas.json'), 'utf8'));
const i = process.argv.indexOf('--cena');
const cenas = roteiro.cenas.filter((c) => c.tipo !== 'cartao' && (i < 0 || c.id === process.argv[i + 1]));

(async () => {
  let falhas = 0;
  for (const cena of cenas) {
    const { navegador, pagina, errosConsole } = await abrir({ dados: cena.dados || 'demo' });
    await abrirRota(pagina, cena.rota);
    const problemas = [];
    let textoVisto = await pagina.evaluate(() => document.body.innerText);
    for (const [n, acao] of cena.acoes.entries()) {
      const erro = await executarComRetentativa(pagina, acao, null);
      if (erro && !acao.opcional) problemas.push(`ação ${n + 1} (${acao.tipo} ${acao.seletor || acao.alvo || ''}): ${erro}`);
      else if (erro) problemas.push(`(opcional) ação ${n + 1}: ${erro}`);
      textoVisto += '\n' + await pagina.evaluate(() => document.body.innerText);
    }
    textoVisto = textoVisto.replace(/ /g, ' ');
    for (const txt of cena.conferir || []) if (!textoVisto.includes(txt)) problemas.push(`texto não encontrado: "${txt}"`);
    if (errosConsole.length) problemas.push(`erros de console: ${errosConsole.join(' | ')}`);
    const graves = problemas.filter((p) => !p.startsWith('(opcional)'));
    falhas += graves.length ? 1 : 0;
    console.log(`${graves.length ? '✗' : '✓'} ${cena.id}${problemas.length ? '\n    ' + problemas.join('\n    ') : ''}`);
    await navegador.close();
  }
  console.log(`\n${cenas.length - falhas} de ${cenas.length} cenas sem problema.`);
  process.exitCode = falhas ? 1 : 0;
})();
