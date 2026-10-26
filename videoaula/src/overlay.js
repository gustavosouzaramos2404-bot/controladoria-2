/* ==========================================================================
   videoaula/src/overlay.js
   Camada visual da gravação, desenhada por cima do sistema (sem alterá-lo):
   - cursor em SVG com trajetória curva e aceleração suave (ease-in-out);
   - anel (ripple) no clique;
   - realce (halo) que acompanha o elemento explicado;
   - barra discreta no rodapé com o nome do capítulo.
   O zoom é aplicado depois, na composição (compose.js), para não deformar
   o layout. scriptPagina roda dentro da página; criarControle é o lado Node.
   ========================================================================== */
'use strict';

/** Injetado em cada carga da página (addInitScript). */
function scriptPagina() {
  if (window.__videoaula) return;
  const css = `
    #va-raiz{position:fixed;inset:0;pointer-events:none;z-index:2147483646}
    #va-cursor{position:fixed;left:0;top:0;width:30px;height:30px;transform:translate(-3px,-2px);will-change:transform;z-index:2147483647;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    .va-ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #f59e0b;background:rgba(245,158,11,.25);animation:va-rip .55s ease-out forwards}
    @keyframes va-rip{to{transform:scale(3.4);opacity:0}}
    .va-halo{position:fixed;border-radius:10px;border:3px solid #f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.22),0 0 22px rgba(245,158,11,.45);opacity:0;transition:opacity .3s ease}
    .va-halo.va-on{opacity:1}
    #va-capitulo{position:fixed;left:16px;bottom:96px;max-width:200px;font:600 14px/1.2 system-ui,'Segoe UI',sans-serif;letter-spacing:.02em;color:#fff;background:rgba(17,24,39,.82);padding:8px 14px;border-radius:999px;opacity:0;transition:opacity .4s}
    #va-capitulo.va-on{opacity:1}`;
  const montar = () => {
    if (document.getElementById('va-raiz')) return;
    const estilo = document.createElement('style');
    estilo.textContent = css;
    document.documentElement.appendChild(estilo);
    const raiz = document.createElement('div');
    raiz.id = 'va-raiz';
    raiz.innerHTML = `<div id="va-capitulo"></div><svg id="va-cursor" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.6 14.8 L10.6 21.6 L13.6 20.3 L10.7 13.6 L17 13.6 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(raiz);
    posicionar(estado.x, estado.y);
  };
  const estado = { x: window.innerWidth * 0.62, y: window.innerHeight * 0.55, animacao: 0 };
  const posicionar = (x, y) => {
    estado.x = x; estado.y = y;
    const c = document.getElementById('va-cursor');
    if (c) c.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
  };
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // requestAnimationFrame pode estar sob o relógio falso; performance.now segue o tempo real da página.
  const quadro = (fn) => setTimeout(() => fn(performance.now()), 16);

  window.__videoaula = {
    montar,
    posicao: () => ({ x: estado.x, y: estado.y }),
    /** Põe o cursor direto numa posição (início da cena, onde a anterior parou). */
    colocar(x, y) { montar(); estado.animacao++; posicionar(x, y); },
    /** Move o cursor numa curva (Bézier quadrática) até (x, y). */
    mover(x, y, ms) {
      montar();
      const x0 = estado.x; const y0 = estado.y;
      const dx = x - x0; const dy = y - y0;
      const dist = Math.hypot(dx, dy);
      const dur = ms || Math.min(1100, 380 + dist * 0.42);
      const curva = Math.min(120, dist * 0.18) * (dx >= 0 ? 1 : -1);
      const cx = x0 + dx / 2 - (dy / (dist || 1)) * curva;
      const cy = y0 + dy / 2 + (dx / (dist || 1)) * curva;
      const minha = ++estado.animacao; // um movimento novo interrompe o anterior
      return new Promise((ok) => {
        const inicio = performance.now();
        const passo = (agora) => {
          if (estado.animacao !== minha) { ok(0); return; }
          const t = Math.min(1, (agora - inicio) / dur);
          const e = suave(t);
          const px = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x;
          const py = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y;
          posicionar(px, py);
          if (t < 1) quadro(passo); else ok(dur);
        };
        quadro(passo);
      });
    },
    ripple(x, y) {
      montar();
      const r = document.createElement('div');
      r.className = 'va-ripple';
      r.style.left = `${x}px`; r.style.top = `${y}px`;
      document.getElementById('va-raiz').appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
    /** Realça um elemento por "ms", acompanhando rolagem e mudanças de tamanho. */
    destacar(el, ms) {
      montar();
      const h = document.createElement('div');
      h.className = 'va-halo';
      document.getElementById('va-raiz').appendChild(h);
      let vivo = true;
      const seguir = () => {
        if (!vivo) return;
        const r = el.getBoundingClientRect();
        const m = 6;
        Object.assign(h.style, { left: `${r.left - m}px`, top: `${r.top - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
        quadro(seguir);
      };
      seguir();
      requestAnimationFrame(() => h.classList.add('va-on'));
      setTimeout(() => h.classList.add('va-on'), 20);
      setTimeout(() => { h.classList.remove('va-on'); setTimeout(() => { vivo = false; h.remove(); }, 350); }, ms);
    },
    capitulo(texto) {
      montar();
      const c = document.getElementById('va-capitulo');
      c.textContent = texto || '';
      c.classList.toggle('va-on', Boolean(texto));
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
}

/**
 * Controle do overlay pelo Node, usado por acoes.js. "registrarZoom" recebe
 * os pedidos de zoom (aplicados na composição).
 */
function criarControle(pagina, { registrarZoom, agora }) {
  const centro = async (loc) => {
    const b = await loc.boundingBox();
    if (!b) throw new Error('elemento sem posição na tela');
    // Ponto de mira: centro, ou perto do início em elementos largos (como um instrutor apontando).
    const x = b.width > 520 ? b.x + Math.min(160, b.width * 0.2) : b.x + b.width / 2;
    const y = b.height > 260 ? b.y + Math.min(60, b.height * 0.2) : b.y + b.height / 2;
    return { x, y, b };
  };
  const mover = async (loc) => {
    const { x, y } = await centro(loc);
    await pagina.evaluate(([x, y]) => window.__videoaula.mover(x, y), [x, y]);
    await pagina.mouse.move(x, y);
    return { x, y };
  };
  return {
    mover,
    async clicar(loc, { semClique = false } = {}) {
      const { x, y } = await mover(loc);
      await pagina.waitForTimeout(140);
      await pagina.evaluate(([x, y]) => window.__videoaula.ripple(x, y), [x, y]);
      if (!semClique) await loc.click();
    },
    async destacar(loc, ms) {
      await loc.evaluate((el, ms) => window.__videoaula.destacar(el, ms), ms);
      // O cursor segue para o elemento em segundo plano: o realce não espera o trajeto.
      mover(loc).catch(() => {});
      return ms;
    },
    async zoom(loc, escala, ms) {
      const b = await loc.boundingBox();
      if (b) registrarZoom({ inicio: agora(), duracao: ms / 1000, escala, cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
      await mover(loc).catch(() => {});
      return ms;
    },
    capitulo: (texto) => pagina.evaluate((t) => window.__videoaula && window.__videoaula.capitulo(t), texto)
  };
}

module.exports = { scriptPagina, criarControle };
