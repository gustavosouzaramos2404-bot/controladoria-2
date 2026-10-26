/* ==========================================================================
   videoaula/src/sondagem.js
   Reconhecimento automático: abre cada tela do sistema com os dados
   fictícios e salva o texto visível, os botões, uma captura de tela e os
   erros de console em out/sondagem/. Serve para escrever o roteiro com os
   nomes exatos da interface. Uso: node src/sondagem.js [rota ...]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { abrir, urlSistema, RAIZ_VIDEOAULA } = require('./ambiente');

const ROTAS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'painel', 'cadastros/empresa', 'cadastros/centros', 'cadastros/insumos', 'cadastros/produtos', 'cadastros/orgaos',
  'cadastros/documentos', 'cadastros/alcadas', 'custos', 'estoque', 'estoque/fefo', 'estoque/movimentos', 'estoque/perdas',
  'contratos', 'contratos/orgaos', 'contratos/con-se', 'contratos/con-br', 'orcamento', 'configuracoes',
  'caixa', 'demonstracoes', 'controles', 'planos', 'relatorios'
];

(async () => {
  const dir = path.join(RAIZ_VIDEOAULA, 'out', 'sondagem');
  fs.mkdirSync(dir, { recursive: true });
  const { navegador, pagina, errosConsole } = await abrir({ dados: 'demo' });
  await pagina.goto(urlSistema('#/painel'));
  await pagina.waitForSelector('#tela h1');
  for (const rota of ROTAS) {
    errosConsole.length = 0;
    await pagina.evaluate((r) => { location.hash = `#/${r}`; }, rota);
    await pagina.waitForTimeout(600);
    const info = await pagina.evaluate(() => {
      const tela = document.getElementById('tela');
      const botoes = [...tela.querySelectorAll('button, a.botao, label.botao, .aba, summary')]
        .map((b) => `${b.tagName.toLowerCase()}${b.dataset.acao ? `[data-acao=${b.dataset.acao}]` : ''}: ${b.textContent.trim().replace(/\s+/g, ' ')}`);
      return { titulo: document.title, altura: document.documentElement.scrollHeight, texto: tela.innerText, botoes: [...new Set(botoes)] };
    });
    const nome = rota.replace(/\//g, '_');
    await pagina.screenshot({ path: path.join(dir, `${nome}.png`), fullPage: true });
    fs.writeFileSync(path.join(dir, `${nome}.txt`),
      `# ${info.titulo} (altura ${info.altura}px)\n\n## Erros de console\n${errosConsole.join('\n') || '(nenhum)'}\n\n## Botões\n${info.botoes.join('\n')}\n\n## Texto\n${info.texto}\n`, 'utf8');
    console.log(`${rota}: "${info.titulo}", ${info.altura}px, ${errosConsole.length} erro(s)`);
  }
  await navegador.close();
})();
