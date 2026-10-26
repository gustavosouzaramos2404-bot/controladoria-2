/* ==========================================================================
   videoaula/src/roteiro.js
   Gera roteiro/roteiro.md (versão legível para revisão) a partir de
   roteiro/cenas.json, com o tempo estimado de cada cena e do total.
   Antes da gravação, a estimativa usa a velocidade medida da voz
   (palavrasPorMinuto em config.json); depois do TTS, usa a duração real
   dos áudios (cache/audio/duracoes.json), se existir.
   Uso: node src/roteiro.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'config.json'), 'utf8'));
const { cenas } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'roteiro', 'cenas.json'), 'utf8'));
const arqDuracoes = path.join(RAIZ, 'cache', 'audio', 'duracoes.json');
const duracoesReais = fs.existsSync(arqDuracoes) ? JSON.parse(fs.readFileSync(arqDuracoes, 'utf8')) : {};
const ppm = config.tts.palavrasPorMinuto || 150;

const limpar = (t) => t.replace(/\[\[\d+\]\]/g, '').replace(/\s+/g, ' ').trim();
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

let total = 0;
let palavrasTotal = 0;
const porCapitulo = new Map();
const linhas = [];
const corpo = [];
let capituloAtual = null;
for (const c of cenas) {
  const texto = limpar(c.narracao);
  const palavras = texto.split(' ').length;
  const fala = duracoesReais[c.id] || (palavras / ppm) * 60;
  const dur = Math.max(fala + (config.respiroS || 0.6), c.minDuracaoS || 0);
  total += dur;
  palavrasTotal += palavras;
  porCapitulo.set(c.capitulo, (porCapitulo.get(c.capitulo) || 0) + dur);
  linhas.push(`| ${c.id} | ${c.capitulo} | ${palavras} | ${mmss(dur)} |`);
  if (c.capitulo !== capituloAtual) {
    capituloAtual = c.capitulo;
    corpo.push(`\n## ${c.capitulo}\n`);
  }
  const acoes = (c.acoes || []).map((a, i) => `${i + 1}. ${a.marca != null ? `**⟨${a.marca}⟩** ` : '(segue) '}\`${a.tipo}\` ${a.seletor || a.alvo || ''}${a.texto ? ` → "${a.texto}"` : ''}`).join('\n');
  corpo.push(`### ${c.id} · ${mmss(dur)}${c.rota ? ` · tela inicial \`#/${c.rota}\`` : ''}${c.dados === 'vazio' ? ' · sistema vazio' : ''}\n`);
  corpo.push(`> ${c.narracao.replace(/\[\[(\d+)\]\]/g, '**⟨$1⟩** ')}\n`);
  if (acoes) corpo.push(`<details><summary>Ações na tela</summary>\n\n${acoes}\n\n</details>\n`);
}

const md = `# Roteiro da videoaula: Controladoria

Gerado de \`roteiro/cenas.json\` (a fonte de verdade). Para mudar a fala, edite o campo
\`narracao\` lá e rode \`node src/roteiro.js\`. Os marcadores **⟨N⟩** mostram o momento em que
a ação N acontece na tela.

- **Cenas:** ${cenas.length} · **palavras:** ${palavrasTotal}
- **Duração estimada:** ${mmss(total)} (${Object.keys(duracoesReais).length ? 'duração real dos áudios' : `estimativa a ${ppm} palavras/min, voz ${config.tts.edge.voz} ${config.tts.edge.velocidade}`})
- **Dados:** 100% fictícios (\`dados/demo.json\`, gerado por \`dados/gerar-demo.js\`); relógio fixo em ${config.relogio.slice(0, 10)}

## Tempo por capítulo

| Capítulo | Duração |
|---|---|
${[...porCapitulo].map(([cap, s]) => `| ${cap} | ${mmss(s)} |`).join('\n')}
| **Total** | **${mmss(total)}** |

## Fora do roteiro (não existe no sistema)

- **Caixa e capital de giro, Demonstrações, Controles internos, Planos de ação e Relatórios** estão
  no menu, mas não têm tela (abrem "Página não encontrada"). A aula só menciona isso, na cena
  \`visao-geral\`.
- O botão **"Relatório do mês"** do Painel leva a \`#/relatorios\`, que também não existe. Não é
  clicado na aula.
- Não há lançamentos, contas a pagar/receber, DRE ou conciliação bancária como telas próprias:
  esses dados entram pelos empenhos, lotes, movimentos e backup.
${corpo.join('\n')}

## Resumo por cena

| Cena | Capítulo | Palavras | Duração |
|---|---|---|---|
${linhas.join('\n')}
`;
fs.writeFileSync(path.join(RAIZ, 'roteiro', 'roteiro.md'), md, 'utf8');
console.log(`roteiro.md: ${cenas.length} cenas, ${palavrasTotal} palavras, ${mmss(total)} estimados.`);
for (const [cap, s] of porCapitulo) console.log(`  ${cap.padEnd(20)} ${mmss(s)}`);
