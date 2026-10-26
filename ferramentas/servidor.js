/* ==========================================================================
   ferramentas/servidor.js
   Servidor estático mínimo para abrir o Controladoria por http (necessário
   para o login e a sincronização com o banco). Sem dependências.
   Uso:  node ferramentas/servidor.js [porta]     (padrão: 5173)
   Depois abra http://localhost:5173 no navegador.
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PORTA = Number(process.argv[2]) || 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8'
};

http.createServer((req, res) => {
  let caminho;
  try {
    caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400).end('Endereço inválido.');
    return;
  }
  if (caminho.endsWith('/')) caminho += 'index.html';
  const arquivo = path.resolve(RAIZ, '.' + caminho);
  // Só serve arquivos dentro do projeto e nunca pastas ocultas (.git, .env…).
  if (!arquivo.startsWith(RAIZ + path.sep) || path.relative(RAIZ, arquivo).split(path.sep).some((p) => p.startsWith('.'))) {
    res.writeHead(403).end('Acesso negado.');
    return;
  }
  const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
  // Vídeos vão em partes (Range), para o player conseguir avançar e voltar sem baixar tudo.
  if (tipo.startsWith('video/')) {
    fs.stat(arquivo, (erro, info) => {
      if (erro || !info.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado.');
        return;
      }
      const faixa = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (!faixa) {
        res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': info.size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(arquivo).pipe(res);
        return;
      }
      const inicio = faixa[1] ? Number(faixa[1]) : Math.max(0, info.size - Number(faixa[2]));
      const fim = faixa[1] && faixa[2] ? Math.min(Number(faixa[2]), info.size - 1) : info.size - 1;
      if (inicio > fim || inicio >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
        return;
      }
      res.writeHead(206, { 'Content-Type': tipo, 'Content-Length': fim - inicio + 1, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${inicio}-${fim}/${info.size}` });
      fs.createReadStream(arquivo, { start: inicio, end: fim }).pipe(res);
    });
    return;
  }
  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': tipo,
      'Cache-Control': 'no-cache'
    });
    res.end(conteudo);
  });
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`Controladoria em http://localhost:${PORTA}  (Ctrl+C para parar)`);
});
