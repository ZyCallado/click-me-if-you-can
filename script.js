(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  const el = {
    app: $('app'), title: $('title'), arena: $('arena'), target: $('target'),
    dodges: $('dodges'), time: $('time'), pct: $('pct'), fill: $('fill'), bar: $('bar'),
    quip: $('quip'), loader: $('loader'), loaderText: $('loaderText'), loaderFill: $('loaderFill'),
    toasts: $('toasts'), notifs: $('notifs'), end: $('end'), endMsg: $('endMsg'), endStats: $('endStats'),
    giveup: $('giveup'), again: $('again'),
  };

  const COOLDOWN = 320;   // min ms between automatic dodges (prevents jitter)
  const FORCE_GAP = 320;  // min ms between forced dodges (direct clicks/taps)
  const PAD = 8;

  /* ---------- content ---------- */
  const LABELS = ['Click Me', 'Too Slow', 'Almost Had Me', 'LOL NO', 'Nice Try', 'Skill Issue',
    'Uninstall Your Mouse', "I'm Literally Right Here", 'Your Aim Is Concerning', 'Nope', 'Try Harder', 'Missed Me'];
  const QUIPS = {
    1: ['Oops!', 'Try again!', "You're getting close!"],
    2: ['Are you using a trackpad?', 'That was embarrassing.', 'My grandma clicks faster.', 'Take your time. Not that it will help.'],
    3: [(n) => `You have missed ${n} times. Reflect on that.`, 'Bro is fighting a rectangle.', 'Your ancestors are disappointed.',
      'Even the loading spinner has given up on you.'],
    4: ['The button has entered its villain arc.', 'Somewhere, a trackpad weeps.', 'Statistically, this should have worked by now.',
      'Have you tried wanting it less?', 'This is now a documentary about your cursor.', 'Please blink twice if your hand is being held hostage.',
      'The button is not even running. You are just slow.'],
  };
  const NOTIFS = ['Mouse driver confidence critically low.', 'Your cursor has filed a complaint.', 'Warning: skill not found.',
    'The button union has requested a break. Denied.', 'System update: your aim was not included.', 'Dignity is at 3%. Please recharge.'];
  const LOADER_RESULTS = ['Accuracy: 0.3%. Have you considered using your finger?', 'Accuracy: -12%. Mathematically impressive.',
    'Accuracy: NaN. Even the calculator gave up.', 'Accuracy: 0%. Rounded up out of pity.'];
  const ACHIEVEMENTS = [
    [1, 'First Blood', 'You missed. Savor it.'],
    [10, 'Persistent Little Goblin', '10 clicks. Adorable.'],
    [25, 'Professional Miss-er', '25 clicks. Frame the certificate.'],
    [50, 'Touch Grass', '50 clicks. The sun misses you.'],
    [100, 'You Need Help', '100 clicks. We are concerned.'],
  ];
  const ENDINGS = [
    [0, 'You gave up without a single miss. The button is flattered and offended.'],
    [5, 'So few clicks. The button has not even warmed up.'],
    [15, 'The button is not sweating. You, however, look tired.'],
    [30, 'Your mouse has requested a transfer.'],
    [60, 'Your ancestors are still disappointed. Now with data.'],
    [Infinity, 'This was a cry for help, and also a personal best.'],
  ];

  /* ---------- state ---------- */
  const freshState = () => ({
    dodges: 0, start: Date.now(), end: 0, running: true, x: 0, y: 0, last: 0,
    fake: false, surrender: false, surrenderAt: rand(8, 14), loading: false, loadAt: rand(7, 11),
    lastNotif: 0, lastLabel: 'Click Me',
    pointer: { x: -9999, y: -9999, type: 'mouse' }, achieved: new Set(), timers: new Set(), tick: 0,
  });
  let state = freshState();
  let resizeTimer = 0;

  const later = (fn, ms) => {
    const id = setTimeout(() => { state.timers.delete(id); fn(); }, ms);
    state.timers.add(id);
    return id;
  };
  const clearTimers = () => { state.timers.forEach(clearTimeout); state.timers.clear(); clearInterval(state.tick); };
  const elapsed = () => Math.floor(((state.end || Date.now()) - state.start) / 1000);
  const stage = () => (state.dodges <= 5 ? 1 : state.dodges <= 15 ? 2 : state.dodges <= 30 ? 3 : 4);

  /* ---------- rendering ---------- */
  function render() {
    const pct = Math.min(100, state.dodges);
    el.dodges.textContent = state.dodges;
    el.pct.textContent = `${pct}%`;
    el.fill.style.width = `${pct}%`;
    el.bar.setAttribute('aria-valuenow', pct);
    el.time.textContent = fmtTime(elapsed());
  }
  const say = (t) => { el.quip.textContent = t; };
  const quip = () => { const q = pick(QUIPS[stage()]); return typeof q === 'function' ? q(state.dodges) : q; };
  function setLabel(text) { state.lastLabel = text; el.target.textContent = text; }
  function nextLabel() {
    let t; do { t = pick(LABELS); } while (t === state.lastLabel);
    return t;
  }
  function pop() { el.target.classList.remove('pop'); void el.target.offsetWidth; el.target.classList.add('pop'); }
  function flash(node, cls, ms) {
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    later(() => node.classList.remove(cls), ms);
  }

  /* ---------- geometry ---------- */
  const bounds = () => ({
    w: el.arena.clientWidth - el.target.offsetWidth - PAD,
    h: el.arena.clientHeight - el.target.offsetHeight - PAD,
  });
  function place(x, y) {
    const b = bounds();
    state.x = clamp(x, PAD, b.w);
    state.y = clamp(y, PAD, b.h);
    el.target.style.transform = `translate(${state.x}px, ${state.y}px)`;
  }
  function snapToCenter() {
    const b = bounds();
    el.target.classList.add('snap');
    place(b.w / 2, b.h / 2);
    void el.target.offsetWidth;
    el.target.classList.remove('snap');
  }
  function arenaPointer() {
    const r = el.arena.getBoundingClientRect();
    return { x: state.pointer.x - r.left, y: state.pointer.y - r.top };
  }
  const radius = () => (state.pointer.type === 'touch' ? 130 : 95);
  function distToTarget() {
  const p = state.pointer;
  const a = el.arena.getBoundingClientRect();
  const hw = el.target.offsetWidth / 2, hh = el.target.offsetHeight / 2;
  const dest = Math.hypot(p.x - (a.left + state.x + hw), p.y - (a.top + state.y + hh));
  const r = el.target.getBoundingClientRect();
  const drawn = Math.hypot(p.x - (r.left + r.width / 2), p.y - (r.top + r.height / 2));
  return Math.min(dest, drawn);
}

  function chooseSpot(mode) {
    const b = bounds(), p = arenaPointer();
    const tw = el.target.offsetWidth, th = el.target.offsetHeight;
    const cx = state.x + tw / 2, cy = state.y + th / 2;
    const safe = radius() + 35;
    let best = { x: state.x, y: state.y }, bestD = -1;
    for (let i = 0; i < 14; i++) {
      let x, y;
      if (mode === 'tiny') {
        const ang = Math.atan2(cy - p.y, cx - p.x) + (Math.random() - 0.5) * 1.2, d = rand(70, 140);
        x = state.x + Math.cos(ang) * d; y = state.y + Math.sin(ang) * d;
      } else if (mode === 'far') {
        x = b.w - state.x + rand(-50, 50); y = b.h - state.y + rand(-30, 30);
      } else {
        x = rand(PAD, Math.max(PAD, b.w)); y = rand(PAD, Math.max(PAD, b.h));
      }
      x = clamp(x, PAD, b.w); y = clamp(y, PAD, b.h);
      const d = Math.hypot(x + tw / 2 - p.x, y + th / 2 - p.y);
      if (d > safe && Math.hypot(x - state.x, y - state.y) > 40) return { x, y };
      if (d > bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  }
  function pickMode() {
    const r = Math.random();
    if (state.dodges > 3 && r < 0.28) return 'far';   // teleport to the opposite side
    return r < 0.6 ? 'tiny' : 'any';
  }

  /* ---------- core dodge ---------- */
  function dodge(force = false) {
    if (!state.running) return;
    const now = performance.now();
    if (now - state.last < (force ? FORCE_GAP : COOLDOWN)) return;
    state.last = now;
    state.dodges++;
    clearFake();
    const spot = chooseSpot(pickMode());
    place(spot.x, spot.y);
    const lied = state.surrender;
    if (lied) {
      state.surrender = false;
      state.surrenderAt = state.dodges + rand(9, 16);
      el.target.classList.remove('surrender');
    }
    setLabel(lied ? 'HAHAHAHA I LIED.' : nextLabel());
    afterDodge(lied);
  }

  function afterDodge(lied) {
    render();
    pop();
    checkAchievements();
    const st = stage();
    document.body.dataset.stage = st;
    if (lied) say('The button lied. Shocking. Nobody saw this coming.');
    else if (!state.loading) say(quip());
    if (st === 4) chaos();
    if (!state.loading && !state.surrender) {
      if (state.dodges >= state.loadAt) runLoader();
      else if (state.dodges >= state.surrenderAt) startSurrender();
    }
  }

  /* ---------- fake-outs ---------- */
  function startFake() {
    state.fake = true;
    el.target.classList.add('fake');
    later(clearFake, 1400);
  }
  function clearFake() { state.fake = false; el.target.classList.remove('fake'); }
  function startSurrender() {
    state.surrender = true;
    setLabel('Okay, you win. Click me.');
    el.target.classList.add('surrender');
    say('The button looks exhausted. Is it... giving up?');
  }

  function runLoader() {
    state.loading = true;
    el.loader.hidden = false;
    el.loaderText.textContent = 'Calculating your click accuracy...';
    el.loaderFill.style.width = '0';
    void el.loaderFill.offsetWidth;
    el.loaderFill.style.width = '100%';
    later(() => {
      el.loaderText.textContent = pick(LOADER_RESULTS);
      later(() => {
        el.loader.hidden = true;
        state.loading = false;
        state.loadAt = state.dodges + rand(10, 16);
      }, 3200);
    }, 2300);
  }

  /* ---------- stage 4 chaos ---------- */
  function chaos() {
    if (Math.random() < 0.22) flash(el.app, 'shake', 450);
    if (Math.random() < 0.25) flash(el.title, 'glitch', 350);
    if (d < 60) { dodge(true); return; }
    if (performance.now() - state.lastNotif > 4500 && Math.random() < 0.3) notify(pick(NOTIFS));
  }
  function notify(text) {
    state.lastNotif = performance.now();
    const n = node('div', 'notif');
    n.append(node('span', 'ic', '⚠️'), node('b', '', text), node('small', '', 'Notification from this webpage. It is a joke.'));
    n.setAttribute('role', 'status');
    el.notifs.append(n);
    later(() => { n.classList.add('out'); later(() => n.remove(), 300); }, 3200);
  }

  /* ---------- achievements ---------- */
  function checkAchievements() {
    ACHIEVEMENTS.forEach(([n, title, text]) => {
      if (state.dodges >= n && !state.achieved.has(n)) {
        state.achieved.add(n);
        const t = node('div', 'toast');
        t.append(node('span', 'ic', '🏅'), node('b', '', `Achievement: ${title}`), node('span', '', text));
        while (el.toasts.children.length >= 3) el.toasts.firstChild.remove();
        el.toasts.append(t);
        later(() => { t.classList.add('out'); later(() => t.remove(), 300); }, 3800);
      }
    });
  }

  /* ---------- input ---------- */
  function onMove(e) {
    state.pointer = { x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse' };
    if (!state.running) return;
    const d = distToTarget();
    if (state.surrender) { if (d < 70) dodge(true); return; }
    if (d > radius()) return;
    if (state.fake) { if (d < 48) dodge(true); return; }
    if (performance.now() - state.last < COOLDOWN) return;
    if (state.dodges > 2 && Math.random() < 0.15) { startFake(); return; }
    dodge();
  }
  function onArenaDown(e) {
    state.pointer = { x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse' };
    if (distToTarget() < radius() + 25) dodge(true);
  }

  /* ---------- end / restart ---------- */
  function giveUp() {
    if (!state.running) return;
    state.end = Date.now();
    state.running = false;
    clearTimers();
    el.loader.hidden = true;
    const n = state.dodges;
    el.endMsg.textContent = ENDINGS.find(([max]) => n <= max)[1];
    el.endStats.textContent = `${n} clicks, ${fmtTime(elapsed())} wasted.`;
    el.end.hidden = false;
    el.app.inert = true;
    el.again.focus();
  }
  function reset(focusGiveUp = true) {
    clearTimers();
    el.toasts.replaceChildren();
    el.notifs.replaceChildren();
    el.loader.hidden = true;
    el.end.hidden = true;
    el.app.inert = false;
    el.app.classList.remove('shake');
    el.title.classList.remove('glitch');
    el.target.className = 'target';
    state = freshState();
    document.body.dataset.stage = 1;
    setLabel('Click Me');
    say("Go on. Click it. It's just a button. What could go wrong?");
    snapToCenter();
    render();
    state.tick = setInterval(() => { el.time.textContent = fmtTime(elapsed()); }, 1000);
    if (focusGiveUp) el.giveup.focus({ preventScroll: true });
  }

  /* ---------- init (listeners are registered exactly once) ---------- */
  document.addEventListener('pointermove', onMove, { passive: true });
  el.arena.addEventListener('pointerdown', onArenaDown);
  el.giveup.addEventListener('click', giveUp);
  el.again.addEventListener('click', () => reset(true));
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { place(state.x, state.y); }, 120);
  });

  reset(false);
})();
