/* ==========================================================================
   modules/videoaula.js
   Videoaulas de uso do sistema (gravadas com dados fictícios):
   - player com legendas em português e capítulos clicáveis;
   - lista de vídeos disponíveis (arquivos em midia/).
   Os vídeos são gerados pela pasta videoaula/ (npm run preview ou
   npm run build:video) e copiados para midia/.
   ========================================================================== */
(function (raiz) {
  'use strict';
  const NS = raiz.Controladoria;

  // Vídeos disponíveis, do mais recente para o mais antigo. "inicio" dos capítulos em segundos.
  const VIDEOS = [
    {
      id: 'completa',
      titulo: 'Videoaula completa: do Painel ao fechamento do mês',
      duracao: '24:32',
      descricao: 'Todas as telas do sistema, com narração: Painel, Cadastros, Custos e produção, Estoque e perdas, Contratos públicos, Orçamento e Configurações.',
      arquivo: 'midia/videoaula-completa.mp4',
      legendas: 'midia/videoaula-completa.vtt',
      capitulos: [
        { inicio: 0, titulo: 'Abertura' },
        { inicio: 48.5, titulo: 'Primeiros passos' },
        { inicio: 150.4, titulo: 'Painel' },
        { inicio: 493.1, titulo: 'Cadastros' },
        { inicio: 645.5, titulo: 'Custos e produção' },
        { inicio: 814.3, titulo: 'Estoque e perdas' },
        { inicio: 948.4, titulo: 'Contratos públicos' },
        { inicio: 1212.1, titulo: 'Orçamento' },
        { inicio: 1333.6, titulo: 'Configurações' },
        { inicio: 1416.7, titulo: 'Encerramento' }
      ]
    },
    {
      id: 'previa',
      titulo: 'Prévia: Painel e contratos públicos',
      duracao: '2:16',
      descricao: 'Resumo do mês, Central de desvios e a análise de reequilíbrio de uma ata, com narração.',
      arquivo: 'midia/videoaula-preview.mp4',
      legendas: 'midia/videoaula-preview.vtt',
      capitulos: [
        { inicio: 0, titulo: 'Painel: resumo do mês' },
        { inicio: 40.2, titulo: 'Painel: Central de desvios' },
        { inicio: 96.7, titulo: 'Contratos públicos: itens e reequilíbrio' }
      ]
    }
  ];

  const minutos = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /** Renderiza a tela de videoaulas. */
  function tela(el, rota) {
    const { html, icone } = NS.ui;
    const C = NS.modules.comum;
    const video = VIDEOS.find((v) => v.id === rota.query.video) || VIDEOS[0];

    el.innerHTML = String(html`
      ${C.cabecalho({ titulo: 'Videoaula', subtitulo: 'Aprenda a usar o Controladoria com vídeos narrados. Os dados mostrados nos vídeos são fictícios.' })}
      <section class="bloco">
        <div class="bloco-cabecalho"><h2>${video.titulo}</h2><p>${video.descricao} Duração: ${video.duracao}.</p></div>
        <div class="videoaula-player">
          <video controls preload="metadata" playsinline data-video>
            <source src="${video.arquivo}" type="video/mp4">
            ${video.legendas ? html`<track kind="subtitles" src="${video.legendas}" srclang="pt-BR" label="Português" default>` : ''}
          </video>
        </div>
        <p class="caixa-alerta" data-erro-video hidden>Não foi possível reproduzir o vídeo neste navegador. Use o Chrome, o Edge ou o Firefox atualizados e confira se o arquivo ${video.arquivo} existe.</p>
        ${video.capitulos.length ? html`
          <h3 class="espaco-acima">Capítulos</h3>
          <ol class="videoaula-capitulos">
            ${video.capitulos.map((c) => html`<li><button type="button" class="botao botao-texto botao-pequeno" data-acao="capitulo" data-inicio="${c.inicio}">
              <span class="num">${minutos(c.inicio)}</span> ${c.titulo}</button></li>`)}
          </ol>` : ''}
        <p class="nota">As legendas podem ser ligadas ou desligadas no botão de legendas do player.</p>
      </section>
      ${VIDEOS.length > 1 ? html`
        <section class="bloco">
          <div class="bloco-cabecalho"><h2>Todos os vídeos</h2></div>
          <ul class="videoaula-lista">
            ${VIDEOS.map((v) => html`<li><a href="#/videoaula?video=${v.id}" ${v.id === video.id ? NS.ui.raw('aria-current="true"') : ''}>${icone('videoaula')}${v.titulo}</a> <span class="suave">${v.duracao}</span></li>`)}
          </ul>
        </section>` : ''}`);

    const player = el.querySelector('[data-video]');
    player.addEventListener('error', () => { el.querySelector('[data-erro-video]').hidden = false; }, true);
    el.onclick = (ev) => {
      const alvo = ev.target.closest('[data-acao="capitulo"]');
      if (!alvo) return;
      player.currentTime = Number(alvo.dataset.inicio) || 0;
      player.play().catch(() => {});
      player.focus();
    };
  }

  NS.modules.videoaula = { rotas: { videoaula: tela } };
})(window);
