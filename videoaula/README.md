# Videoaula do Controladoria

Produção automatizada e reproduzível da videoaula do sistema: o cursor navega no sistema real
(`../index.html` via `file://`) enquanto uma voz em pt-BR explica cada tela. Nada fora desta pasta
é alterado.

## Requisitos

- Node.js 18+ (`npm install` aqui dentro instala o Playwright; depois `npx playwright install chromium`)
- Python 3.10+ com `pip install edge-tts`
- FFmpeg 6+ no PATH (`winget install Gyan.FFmpeg`), ou o caminho em `config.json` → `ffmpeg.caminho`

## Comandos

| Comando | O que faz |
|---|---|
| `npm run build:video` | Regera tudo: dados fictícios → narração → gravação → composição → validação |
| `npm run preview` | Preview de ~2 min com as cenas de `config.json` → `preview` (`-- --legendado` gera também a versão legendada) |
| `npm run build:video -- --cena <id>` | Regrava só essa cena (pode repetir `--cena`) e recompõe |
| `npm run build:video -- --forcar` | Regrava todas as cenas |
| `npm run build:video -- --sem-legendado` | Pula `videoaula-legendado.mp4` (mais rápido) |
| `npm run validate` | Só valida o vídeo já composto e refaz o relatório |
| `node src/verificar.js [--cena <id>]` | Checagem a seco do roteiro no sistema, sem gravar |
| `node src/roteiro.js` | Atualiza `roteiro/roteiro.md` a partir de `cenas.json` |

Tudo tem cache: a voz só é sintetizada de novo quando o texto muda, e uma cena só é regravada
quando a cena, a voz, os dados ou o código do gravador mudam.

## Saídas (`out/`)

`videoaula.mp4` (1920x1080, 30 fps, H.264 + AAC, -16 LUFS, com capítulos), `videoaula-legendado.mp4`,
`videoaula.srt`, `capitulos.txt` (formato YouTube), `relatorio.md` (duração por cena, critérios de
aceite, avisos e suposições) e `videoaula-linha-do-tempo.json`.

## Editar uma cena

1. Edite a cena em `roteiro/cenas.json`. `narracao` é o texto falado; `[[N]]` marca um instante da
   fala, e cada ação diz em `marca` qual marcador a dispara (`null` = começa assim que a anterior
   termina). O cursor chega ~0,6 s antes, para o clique cair na palavra.
2. Rode `node src/verificar.js --cena <id>` para conferir no sistema.
3. Rode `npm run build:video -- --cena <id>`.

Tipos de ação: `navegar`, `clicar`, `digitar` (com `limpar`, `delayMs`), `preencher` (datas),
`selecionar` (`indice`, `rotulo` ou `valor`), `rolar` (`dentro: ".modal"`), `destacar`
(`duracaoMs`), `zoom` (`escala`, `duracaoMs`), `hover`, `tecla`, `esperar` (`ms`),
`enviarArquivo` (`arquivo`, `nome`). `opcional: true` não reprova a cena se falhar. `conferir`
lista textos que precisam aparecer na tela durante a cena.

## Trocar a voz

- **Edge TTS** (padrão, gratuito): `config.json` → `tts.edge.voz` (`pt-BR-AntonioNeural` ou
  `pt-BR-FranciscaNeural`) e `velocidade` (ex.: `+10%`).
- **ElevenLabs:** defina `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` no ambiente ou num `.env` nesta
  pasta (o `.env` está no `.gitignore`). Ele passa a ser usado automaticamente, por estar primeiro em
  `tts.provedores`. Atenção: cobra por caractere (cerca de 25 mil para a aula inteira).
- **Offline:** voz do Windows (SAPI), usada se as outras falharem.
- Pronúncia de siglas e números: `config.json` → `pronuncia`.

## Como funciona

- `src/ambiente.js`: abre o Chromium com relógio fixo (`config.relogio`), desliga o banco só neste
  navegador (sem login, sem tocar no Supabase real) e carrega `dados/demo.json` (100% fictício,
  gerado por `dados/gerar-demo.js`).
- `src/tts.js`: narração por cena, com o tempo de cada palavra, que define quando cada ação acontece.
- `src/recorder.js` + `src/overlay.js` + `src/acoes.js`: gravação cena a cena por screencast do Chrome,
  com cursor desenhado (trajetória curva), clique com anel, realce e etiqueta do capítulo.
- `src/compose.js`: zoom, fades entre capítulos, mixagem com o deslocamento exato de cada fala,
  loudness, legendas e capítulos.
- `src/validate.js`: critérios de aceite e `relatorio.md`.

## Publicar na aba Videoaula do sistema

A aba **Videoaula** (`js/modules/videoaula.js`) lê um único vídeo, `../midia/videoaula-completa.mp4`,
com as legendas `.vtt` ao lado. Depois de gerar o vídeo, recodifique tudo de uma vez (um fluxo contínuo,
quadro-chave a cada 2 s e sem trilhas de dados extras, para o navegador tocar do início ao fim e avançar
sem travar):

```bash
ffmpeg -i out/videoaula.mp4 -map 0:v:0 -map 0:a:0 -dn -map_metadata 0 -map_chapters 0 -c:v libx264 -preset medium -crf 23 -tune stillimage -profile:v high -level 4.0 -g 60 -keyint_min 60 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -b:a 160k -ar 48000 -movflags +faststart ../midia/videoaula-completa.mp4
ffmpeg -i out/videoaula.srt ../midia/videoaula-completa.vtt
```

Se a duração ou os capítulos mudarem, atualize a lista `VIDEOS` em `js/modules/videoaula.js`
(os tempos estão em `out/capitulos.txt` e `out/videoaula-linha-do-tempo.json`).
