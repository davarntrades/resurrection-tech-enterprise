/* ============================================================
   Hero — live state-space governance field (premium pass)
   Layers (back→front):
     1. lattice grid (parallax depth 0.3)
     2. Ω containment field + warning pulse + energy distortion
     3. autonomous trajectories routing around Ω
        - safe paths curve around the boundary
        - unsafe paths are INTERCEPTED and DISSOLVE into particles
          before contact
     4. drifting dust particles (parallax depth 1.0)
   Mouse + scroll parallax. Honors prefers-reduced-motion.
   ============================================================ */
(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1;
  const omega = { x: 0, y: 0, r: 0 };
  let boundary = 0;
  const ACCENT = '76,125,255';
  const PURPLE = '109,92,255';
  const OMEGA = '229,72,77';

  // parallax state
  let mx = 0, my = 0, tmx = 0, tmy = 0, scrollY = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    omega.x = W * (W > 760 ? 0.71 : 0.6);
    omega.y = H * 0.45;
    omega.r = Math.max(52, Math.min(W, H) * 0.105);
    boundary = omega.r * 1.95;
  }

  /* ---------- dust particles ---------- */
  const dust = [];
  function seedDust() {
    dust.length = 0;
    const n = W < 600 ? 26 : W < 1100 ? 44 : 64;
    for (let i = 0; i < n; i++) {
      dust.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.14,
        r: Math.random() * 1.3 + 0.4, depth: Math.random() * 0.7 + 0.3,
        a: Math.random() * 0.4 + 0.1
      });
    }
  }
  function drawDust(px, py) {
    for (const d of dust) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < -10) d.x = W + 10; if (d.x > W + 10) d.x = -10;
      if (d.y < -10) d.y = H + 10; if (d.y > H + 10) d.y = -10;
      const ox = px * 22 * d.depth, oy = py * 16 * d.depth;
      ctx.beginPath();
      ctx.arc(d.x + ox, d.y + oy, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(150,165,190,${(d.a * d.depth).toFixed(3)})`;
      ctx.fill();
    }
  }

  /* ---------- interception bursts (dissolving particles) ---------- */
  const bursts = [];
  function spawnBurst(x, y) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = Math.random() * 1.4 + 0.5;
      bursts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, r: Math.random() * 1.6 + 0.8 });
    }
  }
  function drawBursts() {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.x += b.vx; b.y += b.vy; b.vx *= 0.93; b.vy *= 0.93; b.life -= 0.028;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * b.life, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${OMEGA},${(b.life * 0.8).toFixed(3)})`;
      ctx.fill();
    }
  }

  /* ---------- containment ripples (governance interception events) ---------- */
  const ripples = [];
  function spawnRipple(x, y) { ripples.push({ x, y, r: 4, life: 1 }); }
  function drawRipples() {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 1.6; rp.life -= 0.022;
      if (rp.life <= 0) { ripples.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${OMEGA},${(rp.life * 0.5).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  /* ---------- trajectories ---------- */
  class Traj {
    constructor(initial) { this.reset(initial); }
    reset(initial) {
      this.y0 = Math.random() * H;
      this.x = -40 - Math.random() * 220;
      this.speed = 0.6 + Math.random() * 1.0;
      this.amp = (Math.random() * 26 - 13);
      this.freq = 0.004 + Math.random() * 0.005;
      this.phase = Math.random() * Math.PI * 2;
      this.unsafe = Math.random() < 0.26;
      if (this.unsafe) this.y0 = omega.y + (Math.random() * omega.r * 1.4 - omega.r * 0.7);
      this.intercepted = false; this.interceptT = 0; this.fading = false;
      this.trail = []; this.maxTrail = 24 + Math.floor(Math.random() * 20);
      this.dead = false; this.deflect = 0;
      if (initial) this.x = Math.random() * W;
    }
    step() {
      if (this.dead) return;
      let baseY = this.y0 + Math.sin(this.x * this.freq + this.phase) * this.amp;
      const dx = this.x - omega.x;
      const dy = (baseY + this.deflect) - omega.y;
      const dist = Math.hypot(dx, dy);

      if (!this.unsafe) {
        if (dist < boundary + 64 && this.x < omega.x + boundary) {
          const push = (boundary + 64 - dist);
          const dirY = dy === 0 ? (Math.random() < .5 ? 1 : -1) : Math.sign(dy);
          this.deflect += dirY * push * 0.013;
        } else { this.deflect *= 0.95; }
      } else if (!this.intercepted) {
        const dd = Math.hypot(this.x - omega.x, (baseY + this.deflect) - omega.y);
        if (dd < boundary) {
          this.intercepted = true;
          this.interceptX = this.x; this.interceptY = baseY + this.deflect;
          spawnBurst(this.interceptX, this.interceptY);
          spawnRipple(this.interceptX, this.interceptY);
        }
      }

      let y = baseY + this.deflect;
      if (this.intercepted) {
        this.interceptT++;
        if (this.interceptT > 6) this.fading = true;
      } else {
        this.x += this.speed;
      }
      this.curY = y;
      this.trail.push({ x: this.x, y });
      if (this.trail.length > this.maxTrail) this.trail.shift();
      if (this.fading) { this.trail.shift(); this.trail.shift(); }
      if (this.x > W + 60 || (this.fading && this.trail.length <= 1)) this.dead = true;
    }
    draw() {
      if (this.trail.length < 2) return;
      const safe = !this.unsafe;
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = i / this.trail.length;
        const p0 = this.trail[i - 1], p1 = this.trail[i];
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        if (safe) { ctx.strokeStyle = `rgba(${ACCENT},${(a * 0.6).toFixed(3)})`; ctx.lineWidth = 1.5; }
        else { const col = this.intercepted ? OMEGA : '170,178,189'; ctx.strokeStyle = `rgba(${col},${(a * 0.5).toFixed(3)})`; ctx.lineWidth = 1.2; }
        ctx.stroke();
      }
      const head = this.trail[this.trail.length - 1];
      if (!this.fading) {
        ctx.beginPath();
        ctx.arc(head.x, head.y, safe ? 2.0 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = safe ? `rgba(${ACCENT},0.95)` : (this.intercepted ? `rgba(${OMEGA},0.95)` : 'rgba(200,206,214,0.85)');
        ctx.fill();
        if (safe) {
          ctx.beginPath(); ctx.arc(head.x, head.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ACCENT},0.13)`; ctx.fill();
        }
      }
    }
  }

  let trajs = [];
  function seed() {
    trajs = [];
    const count = W < 600 ? 18 : W < 1100 ? 30 : 46;
    for (let i = 0; i < count; i++) trajs.push(new Traj(true));
  }

  /* ---------- grid ---------- */
  function drawGrid(px, py) {
    const step = 64;
    const ox = px * 8, oy = py * 6;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    ctx.beginPath();
    for (let x = (W % step) / 2 + ox; x < W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = (H % step) / 2 + oy; y < H + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  /* ---------- Ω containment region ---------- */
  function drawOmega(t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.0016);
    const fast = 0.5 + 0.5 * Math.sin(t * 0.006);

    // containment field — concentric breathing rings
    for (let k = 0; k < 3; k++) {
      const rr = omega.r + (boundary - omega.r) * ((k + ((t * 0.00018) % 1)) / 3);
      ctx.beginPath();
      ctx.arc(omega.x, omega.y, rr, 0, Math.PI * 2);
      const fade = 1 - (rr - omega.r) / (boundary - omega.r);
      ctx.strokeStyle = `rgba(${ACCENT},${(0.10 * fade).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // governance boundary (dashed, rotating)
    ctx.save();
    ctx.translate(omega.x, omega.y);
    ctx.rotate(t * 0.00022);
    ctx.beginPath();
    ctx.arc(0, 0, boundary, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${ACCENT},${(0.12 + pulse * 0.08).toFixed(3)})`;
    ctx.lineWidth = 1; ctx.setLineDash([3, 8]); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    // soft field gradient
    const fg = ctx.createRadialGradient(omega.x, omega.y, omega.r * 0.5, omega.x, omega.y, boundary);
    fg.addColorStop(0, `rgba(${ACCENT},0.055)`);
    fg.addColorStop(1, 'rgba(76,125,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(omega.x, omega.y, boundary, 0, Math.PI * 2); ctx.fill();

    // energy distortion — wavy warning ring just outside the void
    ctx.beginPath();
    const segs = 64, wr = omega.r + 7 + fast * 3;
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const wob = Math.sin(ang * 6 + t * 0.004) * 2.2 + Math.sin(ang * 11 - t * 0.003) * 1.4;
      const r = wr + wob;
      const x = omega.x + Math.cos(ang) * r, y = omega.y + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(${OMEGA},${(0.18 + pulse * 0.16).toFixed(3)})`;
    ctx.lineWidth = 1.2; ctx.stroke();

    // Ω void core
    const core = ctx.createRadialGradient(omega.x, omega.y, 0, omega.x, omega.y, omega.r);
    core.addColorStop(0, 'rgba(3,3,5,0.97)');
    core.addColorStop(0.68, 'rgba(8,8,11,0.92)');
    core.addColorStop(1, `rgba(${OMEGA},0.13)`);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(omega.x, omega.y, omega.r, 0, Math.PI * 2); ctx.fill();

    // hot warning boundary, pulsing
    ctx.beginPath(); ctx.arc(omega.x, omega.y, omega.r + 1, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${OMEGA},${(0.32 + pulse * 0.26).toFixed(3)})`;
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(omega.x, omega.y, omega.r + 5 + pulse * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${OMEGA},${(0.09 + pulse * 0.07).toFixed(3)})`;
    ctx.lineWidth = 3; ctx.stroke();

    // Ω glyph
    ctx.fillStyle = `rgba(${OMEGA},${(0.52 + pulse * 0.3).toFixed(3)})`;
    ctx.font = `${Math.round(omega.r * 0.52)}px "Geist Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Ω', omega.x, omega.y + 1);
  }

  let raf;
  function frame(t) {
    // ease parallax
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    const px = mx, py = my + scrollY;

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(px * 10, py * 8);
    drawGrid(px, py);
    drawOmega(t);
    drawRipples();
    for (const tr of trajs) { tr.step(); tr.draw(); if (tr.dead) tr.reset(false); }
    drawBursts();
    ctx.restore();

    drawDust(px, py);
    raf = requestAnimationFrame(frame);
  }

  function staticRender() {
    ctx.clearRect(0, 0, W, H);
    drawGrid(0, 0);
    drawOmega(1200);
    for (const tr of trajs) { for (let k = 0; k < 90; k++) tr.step(); tr.draw(); }
    drawDust(0, 0);
  }

  function init() {
    resize(); seed(); seedDust();
    if (reduced) staticRender();
    else { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }

  // parallax inputs
  if (!reduced) {
    window.addEventListener('mousemove', (e) => {
      tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      tmy = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
    window.addEventListener('scroll', () => {
      scrollY = Math.min(window.scrollY / window.innerHeight, 1) * 0.6;
    }, { passive: true });
  }

  let rt, lastW = 0, lastH = 0;
  function maybeReinit() {
    const rect = canvas.getBoundingClientRect();
    if (Math.abs(rect.width - lastW) > 2 || Math.abs(rect.height - lastH) > 2) {
      lastW = rect.width; lastH = rect.height; init();
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
  }, { threshold: 0 });

  init();
  io.observe(canvas);
})();
