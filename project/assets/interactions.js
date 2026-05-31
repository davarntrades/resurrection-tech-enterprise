/* ============================================================
   Interactions — reveals, nav blur, active-section, count-up,
   flow sequencing, table row reveal, loader.
   ============================================================ */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Loader ---- */
  window.addEventListener('load', () => {
    const l = document.getElementById('loader');
    if (l) setTimeout(() => l.classList.add('done'), 520);
  });
  // safety: never trap behind loader
  setTimeout(() => { const l = document.getElementById('loader'); if (l) l.classList.add('done'); }, 2600);

  /* ---- Nav scroll blur ---- */
  const nav = document.querySelector('.nav');
  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 24);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- Reveal on scroll ---- */
  const revs = document.querySelectorAll('.reveal');
  if (reduced) {
    revs.forEach(r => r.classList.add('in'));
  } else {
    const ro = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revs.forEach(r => ro.observe(r));
  }

  /* ---- Table row staggered reveal ---- */
  const rowGroups = document.querySelectorAll('[data-rowreveal]');
  rowGroups.forEach(group => {
    const rows = group.querySelectorAll('tbody tr');
    rows.forEach((r, i) => { r.classList.add('tbl-row-rest'); r.style.transitionDelay = (i * 80) + 'ms'; });
    if (reduced) { rows.forEach(r => r.classList.add('in')); return; }
    const o = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (e.isIntersecting) { rows.forEach(r => r.classList.add('in')); o.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    o.observe(group);
  });

  /* ---- Count-up ---- */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const dur = 1500, suffix = el.dataset.suffix || '', prefix = el.dataset.prefix || '';
    const dec = (el.dataset.dec ? parseInt(el.dataset.dec) : 0);
    const fmt = (v) => {
      const n = parseFloat(v.toFixed(dec));
      return n.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };
    if (reduced) { el.textContent = prefix + fmt(target) + suffix; return; }
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + fmt(target * e) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const counters = document.querySelectorAll('[data-count]');
  const co = new IntersectionObserver((es) => {
    es.forEach(e => { if (e.isIntersecting) { animateCount(e.target); co.unobserve(e.target); } });
  }, { threshold: 0.5 });
  counters.forEach(c => co.observe(c));

  /* ---- Flow sequencing ---- */
  const flow = document.querySelector('.flow-track');
  if (flow) {
    const stages = flow.querySelectorAll('.flow-stage');
    const arrows = flow.querySelectorAll('.flow-arrow');
    function lightUp() {
      stages.forEach((s, i) => {
        setTimeout(() => {
          s.classList.add('lit');
          if (arrows[i]) arrows[i].classList.add('lit');
        }, i * 420);
      });
    }
    if (reduced) { stages.forEach(s => s.classList.add('lit')); arrows.forEach(a => a.classList.add('lit')); }
    else {
      const fo = new IntersectionObserver((es) => {
        es.forEach(e => { if (e.isIntersecting) { lightUp(); fo.unobserve(e.target); } });
      }, { threshold: 0.4 });
      fo.observe(flow);
    }
  }

  /* ---- Engagement model sequencing ---- */
  const engage = document.querySelector('.engage-track');
  if (engage) {
    const eStages = engage.querySelectorAll('.engage-stage');
    if (reduced) { eStages.forEach(s => s.classList.add('lit')); }
    else {
      const eo = new IntersectionObserver((es) => {
        es.forEach(e => {
          if (e.isIntersecting) {
            eStages.forEach((s, i) => setTimeout(() => s.classList.add('lit'), i * 380));
            eo.unobserve(e.target);
          }
        });
      }, { threshold: 0.4 });
      eo.observe(engage);
    }
  }

  /* ---- Active section in nav ---- */
  const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (sections.length) {
    const so = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (e.isIntersecting) {
          const id = '#' + e.target.id;
          navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === id));
        }
      });
    }, { threshold: 0.01, rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => so.observe(s));
  }
})();
