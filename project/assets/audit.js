/* ============================================================
   Request Audit — multi-step intake flow
   Step navigation, validation, dynamic risk scoring, submit.
   ============================================================ */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps = [...document.querySelectorAll('.step')];
  const psItems = [...document.querySelectorAll('.progress-steps .ps')];
  const bar = document.querySelector('.progress-bar i');
  const btnNext = document.getElementById('btn-next');
  const btnBack = document.getElementById('btn-back');
  const stepCount = document.getElementById('stepcount');
  const total = steps.length;
  let cur = 0;

  function render() {
    steps.forEach((s, i) => s.classList.toggle('active', i === cur));
    psItems.forEach((p, i) => {
      p.classList.toggle('active', i === cur);
      p.classList.toggle('done', i < cur);
    });
    bar.style.width = ((cur + 1) / total * 100) + '%';
    btnBack.disabled = cur === 0;
    btnNext.textContent = cur === total - 1 ? 'Request Runtime Governance Audit' : 'Continue';
    const arr = btnNext.querySelector('.arr'); // ensure arrow persists
    if (!arr) { btnNext.insertAdjacentHTML('beforeend', ' <span class="arr">→</span>'); }
    stepCount.textContent = 'Step ' + String(cur + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    if (cur === total - 1) revealDeliverables();
    // move focus to first field for a11y without scroll jank
    const card = document.querySelector('.audit-card');
    if (card) card.scrollIntoView({ block: 'nearest' });
  }

  /* ---- validation (step 1 required fields) ---- */
  function validateStep() {
    if (cur !== 0) return true;
    let ok = true;
    const reqs = steps[0].querySelectorAll('[data-req]');
    reqs.forEach(inp => {
      const f = inp.closest('.field');
      let valid = inp.value.trim() !== '';
      if (inp.type === 'email' && valid) valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value.trim());
      f.classList.toggle('err', !valid);
      if (!valid) ok = false;
    });
    return ok;
  }
  // clear error on input
  steps[0] && steps[0].querySelectorAll('[data-req]').forEach(inp => {
    inp.addEventListener('input', () => inp.closest('.field').classList.remove('err'));
  });

  /* ---- chip / radio toggles ---- */
  document.querySelectorAll('.chips').forEach(group => {
    group.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      chip.classList.toggle('on');
    });
  });
  document.querySelectorAll('.radios').forEach(group => {
    group.addEventListener('click', e => {
      const r = e.target.closest('.radio');
      if (!r) return;
      group.querySelectorAll('.radio').forEach(x => x.classList.remove('on'));
      r.classList.add('on');
    });
  });

  /* ---- risk scoring ---- */
  const checklist = document.querySelector('.checklist');
  const rmLevel = document.querySelector('.rm-level');
  const rmSegs = [...document.querySelectorAll('.rm-seg')];
  const rmNote = document.querySelector('.rm-note');
  const LEVELS = [
    { name: 'Low Exposure', color: 'var(--accent)', cls: 'on1', note: 'No high-consequence capabilities selected. Baseline trajectory review.' },
    { name: 'Medium Exposure', color: 'var(--accent-bright)', cls: 'on2', note: 'Operationally significant actions present. Boundary partitioning recommended.' },
    { name: 'High Exposure', color: 'var(--accent-purple)', cls: 'on3', note: 'Multiple consequential capabilities reachable. Runtime governance strongly advised.' },
    { name: 'Critical Exposure', color: 'var(--omega)', cls: 'on4', note: 'Catastrophic reachable states present. Pre-execution containment required before deployment.' }
  ];
  function scoreRisk() {
    if (!checklist) return;
    let score = 0;
    checklist.querySelectorAll('.check.on').forEach(c => { score += parseInt(c.dataset.weight || '1', 10); });
    let lvl;
    if (score === 0) lvl = 0;
    else if (score <= 5) lvl = 1;
    else if (score <= 11) lvl = 2;
    else lvl = 3;
    const L = LEVELS[lvl];
    rmLevel.textContent = L.name;
    rmLevel.style.color = L.color;
    rmNote.textContent = L.note;
    rmSegs.forEach((seg, i) => {
      seg.className = 'rm-seg' + (i <= lvl ? ' ' + LEVELS[i].cls : '');
    });
  }
  if (checklist) {
    checklist.addEventListener('click', e => {
      const c = e.target.closest('.check');
      if (!c) return;
      c.classList.toggle('on');
      scoreRisk();
    });
    scoreRisk();
  }

  /* ---- deliverables stagger ---- */
  let deliveredOnce = false;
  function revealDeliverables() {
    if (deliveredOnce) return; deliveredOnce = true;
    const lis = document.querySelectorAll('.deliverables li');
    lis.forEach((li, i) => {
      if (reduced) { li.classList.add('in'); return; }
      setTimeout(() => li.classList.add('in'), 120 + i * 90);
    });
  }

  /* ---- navigation ---- */
  btnNext.addEventListener('click', () => {
    if (!validateStep()) return;
    if (cur < total - 1) { cur++; render(); }
    else submit();
  });
  btnBack.addEventListener('click', () => { if (cur > 0) { cur--; render(); } });

  /* ---- submit + confirmation ---- */
  function submit() {
    const workflow = document.getElementById('workflow');
    const confirm = document.getElementById('confirm');
    const ref = 'RGA-' + Math.random().toString(36).slice(2, 7).toUpperCase() + '-' + new Date().getFullYear();
    const refEl = confirm.querySelector('.ref');
    if (refEl) refEl.textContent = 'REFERENCE · ' + ref;
    workflow.style.transition = 'opacity .4s ease, transform .4s ease';
    workflow.style.opacity = '0';
    workflow.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      workflow.style.display = 'none';
      confirm.classList.add('active');
      window.dispatchEvent(new Event('audit-complete'));
    }, 380);
  }

  render();
})();
