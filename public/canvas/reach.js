/* ============================================================
   Reachability diagram — dedicated section
   A discrete state-space graph. Nodes = states, edges = transitions.
   A token propagates from START, exploring reachable states.
   Safe paths render in accent. Transitions that would step into
   the forbidden Ω set are DENIED at the boundary (blocked edge).
   ============================================================ */
(function () {
  if (typeof window !== 'undefined' && window.__rtReachStop) {
    try { window.__rtReachStop(); } catch (e) {}
  }
  const canvas = document.getElementById('reach-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACCENT = '76,125,255';
  const OMEGA = '229,72,77';

  let W = 0, H = 0, DPR = 1;
  let nodes = [], edges = [], omegaNodes = new Set();

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  // deterministic-ish layered DAG so it reads as "state-space"
  function build() {
    nodes = []; edges = []; omegaNodes = new Set();
    const cols = 5;
    const padX = W * 0.12, padY = H * 0.14;
    const colW = (W - padX * 2) / (cols - 1);
    const perCol = [1, 3, 4, 3, 2];
    const idByCol = [];
    let id = 0;
    for (let c = 0; c < cols; c++) {
      idByCol[c] = [];
      const n = perCol[c];
      for (let r = 0; r < n; r++) {
        const x = padX + c * colW;
        const yspan = H - padY * 2;
        const y = padY + (n === 1 ? yspan / 2 : (yspan * r) / (n - 1));
        // jitter
        const jx = (Math.sin(id * 12.9) * 10);
        const jy = (Math.cos(id * 7.3) * 8);
        nodes.push({ id, x: x + jx, y: y + jy, col: c, r: 4.5, act: 0 });
        idByCol[c].push(id);
        id++;
      }
    }
    // Ω cluster: the lowest-right states form the forbidden region
    const lastCol = idByCol[cols - 1];
    omegaNodes.add(lastCol[lastCol.length - 1]);
    const midRight = idByCol[cols - 2];
    omegaNodes.add(midRight[midRight.length - 1]);
    // compute Ω centroid for boundary
    let ox = 0, oy = 0; omegaNodes.forEach(i => { ox += nodes[i].x; oy += nodes[i].y; });
    const on = omegaNodes.size; ox /= on; oy /= on;
    omegaC = { x: ox + 10, y: oy, r: Math.max(46, colW * 0.62) };

    // edges between consecutive columns
    for (let c = 0; c < cols - 1; c++) {
      idByCol[c].forEach(a => {
        const targets = idByCol[c + 1];
        // connect to 1-2 nearest in next col
        const sorted = [...targets].sort((p, q) => Math.abs(nodes[p].y - nodes[a].y) - Math.abs(nodes[q].y - nodes[a].y));
        const k = 1 + (Math.random() < 0.6 ? 1 : 0);
        for (let i = 0; i < k && i < sorted.length; i++) {
          const b = sorted[i];
          const denied = omegaNodes.has(b);
          edges.push({ a, b, denied, prog: 0, lit: 0 });
        }
      });
    }
  }

  let omegaC = { x: 0, y: 0, r: 0 };

  // animated propagation wave: edges light up column by column on a loop
  let wave = 0, t = 0;

  function drawEdge(e, pulse) {
    const a = nodes[e.a], b = nodes[e.b];
    if (e.denied) {
      // draw up to the boundary, then a block marker
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // intersection with omega boundary (approx midpoint toward Ω)
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const bx = omegaC.x - Math.cos(ang) * omegaC.r;
      const by = omegaC.y - Math.sin(ang) * omegaC.r;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = `rgba(140,146,156,${(0.12 + e.lit * 0.18).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // block X at boundary
      if (e.lit > 0.2) {
        const s = 4 + e.lit * 2;
        ctx.strokeStyle = `rgba(${OMEGA},${(e.lit * 0.9).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx - s, by - s); ctx.lineTo(bx + s, by + s);
        ctx.moveTo(bx + s, by - s); ctx.lineTo(bx - s, by + s);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(${ACCENT},${(0.10 + e.lit * 0.5).toFixed(3)})`;
      ctx.lineWidth = 1 + e.lit * 0.6;
      ctx.stroke();
      // traveling pulse along safe lit edges
      if (e.lit > 0.4) {
        const p = (pulse) % 1;
        const px = a.x + (b.x - a.x) * p;
        const py = a.y + (b.y - a.y) * p;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT},${(e.lit).toFixed(3)})`;
        ctx.fill();
      }
    }
  }

  function drawOmega(pulse) {
    const p = 0.5 + 0.5 * Math.sin(pulse * 2.2);
    const fast = 0.5 + 0.5 * Math.sin(pulse * 5.5);

    // containment field — breathing concentric rings
    for (let k = 0; k < 3; k++) {
      const rr = omegaC.r * (0.55 + 0.5 * ((k + ((pulse * 0.18) % 1)) / 3));
      ctx.beginPath();
      ctx.arc(omegaC.x, omegaC.y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${OMEGA},${(0.10 * (1 - rr / omegaC.r)).toFixed(3)})`;
      ctx.lineWidth = 1; ctx.stroke();
    }

    // void fill
    ctx.beginPath();
    ctx.arc(omegaC.x, omegaC.y, omegaC.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(omegaC.x, omegaC.y, omegaC.r * 0.2, omegaC.x, omegaC.y, omegaC.r);
    g.addColorStop(0, 'rgba(4,4,6,0.94)');
    g.addColorStop(0.7, 'rgba(6,6,9,0.9)');
    g.addColorStop(1, `rgba(${OMEGA},0.12)`);
    ctx.fillStyle = g; ctx.fill();

    // energy-distortion warning ring (wavy)
    ctx.beginPath();
    const segs = 56, wr = omegaC.r - 2 + fast * 2;
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const wob = Math.sin(ang * 6 + pulse * 3) * 1.8 + Math.sin(ang * 10 - pulse * 2) * 1.1;
      const r = wr + wob;
      const x = omegaC.x + Math.cos(ang) * r, y = omegaC.y + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(${OMEGA},${(0.34 + p * 0.24).toFixed(3)})`;
    ctx.lineWidth = 1.4; ctx.stroke();

    // outer pulse glow
    ctx.beginPath();
    ctx.arc(omegaC.x, omegaC.y, omegaC.r + 4 + p * 5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${OMEGA},${(0.10 + p * 0.08).toFixed(3)})`;
    ctx.lineWidth = 2.5; ctx.stroke();

    // labels
    ctx.fillStyle = `rgba(${OMEGA},${(0.6 + p * 0.25).toFixed(3)})`;
    ctx.font = '600 15px "Geist Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Ω', omegaC.x, omegaC.y - omegaC.r - 13);
    ctx.font = '10px "Geist Mono", monospace';
    ctx.fillStyle = `rgba(${OMEGA},${(0.38 + p * 0.12).toFixed(3)})`;
    ctx.fillText('FORBIDDEN · CONTAINED', omegaC.x, omegaC.y + omegaC.r + 15);
  }

  function drawNode(n, pulse) {
    const isOmega = omegaNodes.has(n.id);
    const isStart = n.col === 0;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r + n.act * 2, 0, Math.PI * 2);
    if (isOmega) {
      ctx.fillStyle = `rgba(${OMEGA},0.7)`;
    } else {
      const a = 0.3 + n.act * 0.7;
      ctx.fillStyle = `rgba(${ACCENT},${a.toFixed(3)})`;
    }
    ctx.fill();
    if (!isOmega && n.act > 0.3) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 6 * n.act, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT},${(0.12 * n.act).toFixed(3)})`;
      ctx.fill();
    }
    if (isStart) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ACCENT},0.6)`; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  let raf;
  function frame() {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    // propagation wave sweeps columns 0..4
    const cyc = (t * 0.5) % 6; // 0..6
    edges.forEach(e => {
      const targetCol = nodes[e.a].col;
      const on = cyc > targetCol && cyc < targetCol + 2.5;
      e.lit += ((on ? 1 : 0) - e.lit) * 0.06;
    });
    nodes.forEach(n => {
      const on = cyc > n.col - 0.2 && cyc < n.col + 2.5;
      n.act += ((on ? 1 : 0) - n.act) * 0.07;
    });

    // draw edges first
    edges.forEach(e => drawEdge(e, t * 0.6));
    drawOmega(t);
    nodes.forEach(n => drawNode(n, t));
    raf = requestAnimationFrame(frame);
  }

  function staticRender() {
    ctx.clearRect(0, 0, W, H);
    edges.forEach(e => { e.lit = e.denied ? 0.6 : 0.7; drawEdge(e, 0.5); });
    drawOmega(0.5);
    nodes.forEach(n => { n.act = 0.6; drawNode(n, 0.5); });
  }

  function init() {
    resize();
    if (reduced) staticRender();
    else { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }

  let rt, lastW = 0, lastH = 0;
  function maybeReinit() {
    const rect = canvas.getBoundingClientRect();
    if (Math.abs(rect.width - lastW) > 2 || Math.abs(rect.height - lastH) > 2) {
      lastW = rect.width; lastH = rect.height;
      init();
    }
  }
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(maybeReinit, 180); });
  if ('ResizeObserver' in window) {
    const rzo = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(maybeReinit, 60); });
    rzo.observe(canvas);
  }
  requestAnimationFrame(() => requestAnimationFrame(maybeReinit));

  const io = new IntersectionObserver((es) => {
    es.forEach(e => {
      if (reduced) return;
      if (e.isIntersecting) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
      else cancelAnimationFrame(raf);
    });
  }, { threshold: 0.05 });

  init();
  io.observe(canvas);

  if (typeof window !== 'undefined') {
    window.__rtReachStop = function () {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      try { io.disconnect(); } catch (e) {}
    };
  }
})();
