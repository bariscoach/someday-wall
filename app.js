/* =============================================================
   Someday Wall — front end
   Talks to /api/bricks and /api/heart. If the API is unreachable
   (opening index.html straight off disk, say) it falls back to a
   handful of local bricks so the page still renders.
   ============================================================= */

const SIZE_FLOOR = 9, CANVAS_AT = 4000, MAXLEN = 140, PAGE = 800;

const CLAYS = [
  ['Fired clay', '#C0552F'], ['Sun brick', '#C9862B'], ['Old clay', '#8B5A4A'],
  ['Iris', '#7C6BF5'], ['Pine', '#16906F'], ['Plum', '#B8456F'], ['Slate', '#3D6FA8']
];
const BLOCK = ['stupid', 'idiot', 'ugly', 'kys'];

const EXAMPLES = ['learn my grandmother’s language', 'take my mother to Japan', 'stop waiting',
  'write the book', 'swim at sunrise', 'forgive someone', 'learn piano properly', 'plant a garden',
  'live abroad a year', 'call my brother', 'see the northern lights', 'sing in public',
  'go back to school', 'build something', 'sleep under stars', 'run a marathon', 'learn to sit still',
  'a month offline', 'visit my family’s village', 'write real letters', 'say yes more',
  'move near the sea', 'cook one dish perfectly', 'make peace with him', 'take the long way home',
  'finish what I started', 'drive south', 'keep my promise', 'finally learn to swim', 'ask the question'];

/* ---------------- identity + local memory ---------------- */
const LS_VOTER = 'somedaywall.voter', LS_MINE = 'somedaywall.mine';

function voterId() {
  let v = null;
  try { v = localStorage.getItem(LS_VOTER); } catch (e) {}
  if (!v) {
    v = (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    try { localStorage.setItem(LS_VOTER, v); } catch (e) {}
  }
  return v;
}
const VOTER = voterId();

const loadSet = k => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch (e) { return new Set(); } };
const saveSet = (k, s) => { try { localStorage.setItem(k, JSON.stringify([...s])); } catch (e) {} };

let mine  = loadSet(LS_MINE);   /* bricks this browser wrote or joined */
let liked = new Set();          /* authoritative copy comes from the server */

/* ---------------- state ---------------- */
let tiles = [], index = new Map(), offline = false;
let active = null, freshId = null, loading = false, done = false, msgTimer;

function norm(s) {
  return String(s).toLowerCase().replace(/[’‘`']/g, "'").replace(/\s+/g, ' ').replace(/[.…!?,;:]+$/, '').trim();
}
function reindex() {
  index = new Map();
  tiles.forEach(t => index.set(norm(t.text), t));
}

/* ---------------- elements ---------------- */
const ta = document.getElementById('ans'), ghost = document.getElementById('ghost');
const msg = document.getElementById('msg'), cnum = document.getElementById('cnum');
const counter = document.getElementById('counter'), rfg = document.getElementById('rfg');
const chipsEl = document.getElementById('chips');
const wall = document.getElementById('wall'), courses = document.getElementById('courses');
const veil = document.getElementById('veil'), zoomr = document.getElementById('zoomr');
const addBtn = document.getElementById('add');

/* ---------------- composer chrome ---------------- */
const CIRC = 2 * Math.PI * 8;
function tick() {
  ta.style.height = 'auto';
  ta.style.height = Math.min(280, Math.max(104, ta.scrollHeight)) + 'px';
  const used = ta.value.length;
  cnum.textContent = MAXLEN - used;
  rfg.style.strokeDashoffset = CIRC * (1 - used / MAXLEN);
  counter.classList.toggle('warn', MAXLEN - used <= 20);
  ghost.style.opacity = ta.value ? 0 : 1;
}
ta.addEventListener('input', () => { tick(); setMsg(''); });

let gi = 0;
function ghostRotate() { if (!ta.value) ghost.textContent = EXAMPLES[gi++ % EXAMPLES.length] + '…'; }
ghostRotate(); setInterval(ghostRotate, 3400);

const SLOTS = 3; let shown = [];
function freshPick() {
  let x, g = 0;
  do { x = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]; g++; } while (shown.includes(x) && g < 60);
  return x;
}
for (let i = 0; i < SLOTS; i++) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button';
  const v = freshPick(); shown.push(v); b.textContent = v;
  b.onclick = () => { ta.value = b.textContent; ta.focus(); tick(); setMsg('Make it yours.'); };
  chipsEl.appendChild(b);
}
function fitChips() {
  const cs = [...chipsEl.children];
  cs.forEach(c => c.classList.remove('hide'));
  for (let i = cs.length - 1; i > 0; i--) {
    let used = 0;
    cs.forEach(c => { if (!c.classList.contains('hide')) used += c.offsetWidth + 6; });
    if (used - 6 <= chipsEl.clientWidth) break;
    cs[i].classList.add('hide');
  }
}
let si = 0, paused = false;
setInterval(() => {
  if (paused) return;
  const vis = [...chipsEl.children].filter(c => !c.classList.contains('hide'));
  if (!vis.length) return;
  const el = vis[si++ % vis.length];
  el.classList.add('out');
  setTimeout(() => {
    shown[[...chipsEl.children].indexOf(el)] = el.textContent = freshPick();
    el.classList.remove('out'); fitChips();
  }, 300);
}, 1900);
['mouseenter', 'focusin'].forEach(e => chipsEl.addEventListener(e, () => paused = true));
['mouseleave', 'focusout'].forEach(e => chipsEl.addEventListener(e, () => paused = false));

/* clay dropdown */
let ci = 0, pick = CLAYS[0][1];
const claybtn = document.getElementById('claybtn'), claymenu = document.getElementById('claymenu');
const claydot = document.getElementById('claydot'), clayname = document.getElementById('clayname');
const TICK = '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
CLAYS.forEach(([name, hex], i) => {
  const o = document.createElement('button');
  o.className = 'clayopt'; o.type = 'button'; o.setAttribute('role', 'option');
  o.setAttribute('aria-selected', i === 0);
  o.innerHTML = '<span class="d" style="background:' + hex + '"></span><span>' + name + '</span>' + TICK;
  o.onclick = () => { ci = i; paintClay(); closeClay(); claybtn.focus(); };
  claymenu.appendChild(o);
});
function paintClay() {
  pick = CLAYS[ci][1];
  claydot.style.background = pick;
  clayname.textContent = CLAYS[ci][0];
  document.documentElement.style.setProperty('--pickcolor', pick);
  [...claymenu.children].forEach((el, i) => el.setAttribute('aria-selected', i === ci));
}
function openClay()  { claymenu.classList.add('open');  claybtn.setAttribute('aria-expanded', 'true'); }
function closeClay() { claymenu.classList.remove('open'); claybtn.setAttribute('aria-expanded', 'false'); }
claybtn.onclick = e => { e.stopPropagation(); claymenu.classList.contains('open') ? closeClay() : openClay(); };
document.addEventListener('click', e => { if (!claymenu.contains(e.target) && !claybtn.contains(e.target)) closeClay(); });
claymenu.addEventListener('keydown', e => {
  const opts = [...claymenu.children], at = opts.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(opts.length - 1, at + 1)].focus(); }
  if (e.key === 'ArrowUp')   { e.preventDefault(); at <= 0 ? claybtn.focus() : opts[at - 1].focus(); }
  if (e.key === 'Escape')    { closeClay(); claybtn.focus(); }
});
claybtn.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openClay(); claymenu.children[ci].focus(); }
});
paintClay();

const ICON = {
  bad:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>',
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>'
};
function setMsg(text, kind) {
  msg.className = 'msg' + (kind ? ' ' + kind : '');
  msg.innerHTML = text ? (kind ? ICON[kind] : '') + '<span>' + text + '</span>' : '';
}

/* ---------------- wall rendering ---------------- */
function jitter(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  const r = Math.sin(h) * 233280;
  return r - Math.floor(r);
}
function baseSize(c) {
  let s;
  if (c <= 24) s = 116; else if (c <= 70) s = 92; else if (c <= 180) s = 68;
  else if (c <= 450) s = 50; else if (c <= 1200) s = 34; else if (c <= 4000) s = 22; else s = 14;
  return Math.max(SIZE_FLOOR, s);
}
const ZOOM = [.5, .68, .85, 1, 1.3, 1.7];

function stats() {
  const hearts = tiles.reduce((s, t) => s + (t.hearts || 0), 0);
  document.getElementById('stat').textContent =
    tiles.length.toLocaleString() + ' bricks · ' + hearts.toLocaleString() + ' hearts' +
    (mine.size ? ' · ' + mine.size + ' yours' : '') + (offline ? ' · offline preview' : '');
}
function metaFor(item) {
  const bits = [];
  if (mine.has(String(item.id))) bits.push('your brick');
  bits.push((item.hearts || 0) + ((item.hearts === 1) ? ' heart' : ' hearts'));
  if (item.echoes > 0) bits.push((item.echoes + 1) + ' people wrote this');
  return bits.join(' · ');
}
function openSheet(item) {
  active = item;
  document.getElementById('quote').textContent = '“' + item.text + '”';
  document.getElementById('qmeta').textContent = metaFor(item);
  const bar = document.getElementById('bar');
  bar.style.background = item.color; bar.style.boxShadow = '0 0 20px 2px ' + item.color;
  document.getElementById('hc').textContent = item.hearts || 0;
  document.getElementById('heart').classList.toggle('lit', liked.has(String(item.id)));
  veil.classList.add('on');
}
function draw() {
  if (tiles.length > CANVAS_AT) console.warn('Past ' + CANVAS_AT + ' bricks — time to switch to canvas rendering.');
  const w = wall.clientWidth - 36;
  const unit = Math.max(SIZE_FLOOR, Math.round(baseSize(tiles.length) * ZOOM[+zoomr.value]));
  const gap = Math.max(1, Math.round(unit * .11));
  const bw = Math.round(unit * 1.42), bh = unit;
  const per = Math.max(2, Math.floor((w + gap) / (bw + gap)));
  const rich = unit >= 26, showText = bw >= 118, fontPx = Math.max(9, Math.round(bw * .098));

  courses.innerHTML = ''; let row = null;
  tiles.forEach((item, i) => {
    if (i % per === 0) {
      row = document.createElement('div'); row.className = 'course';
      row.style.gap = gap + 'px';
      row.style.marginTop = i === 0 ? '0' : gap + 'px';
      row.style.transform = ((i / per) % 2) ? 'translateX(' + Math.round((bw + gap) / 2) + 'px)' : 'none';
      courses.appendChild(row);
    }
    const id = String(item.id);
    const j1 = jitter(id), j2 = jitter(id + 'x'), j3 = jitter(id + 'y');
    const b = document.createElement('button');
    b.className = 'brick ' + (rich ? 'lg' : 'sm') + (mine.has(id) ? ' mine' : '') + (id === freshId ? ' fresh' : '');
    b.style.width  = (bw + Math.round(j2 * unit * .1)) + 'px';
    b.style.height = (bh + Math.round(j3 * unit * .09)) + 'px';
    b.style.background = item.color; b.style.color = item.color;
    b.style.transform = 'rotate(' + ((j1 - .5) * (rich ? 4 : 2)) + 'deg) translate(' +
      ((j2 - .5) * Math.min(6, unit * .06)) + 'px,' + ((j3 - .5) * Math.min(6, unit * .06)) + 'px)';
    b.style.animationDelay = Math.min(i * 8, 400) + 'ms';
    b.dataset.id = id;
    b.setAttribute('aria-label', (mine.has(id) ? 'your brick: ' : '') + item.text);
    if (mine.has(id)) { const m = document.createElement('span'); m.className = 'mark'; b.appendChild(m); }
    if (showText) {
      const s = document.createElement('span');
      s.className = 'btext'; s.style.fontSize = fontPx + 'px';
      s.textContent = item.text.length > 44 ? item.text.slice(0, 42) + '…' : item.text;
      b.appendChild(s);
      if (item.hearts > 0) {
        const p = document.createElement('span'); p.className = 'bpip'; p.textContent = '♥' + item.hearts;
        b.appendChild(p);
      }
    }
    b.onclick = () => openSheet(item);
    row.appendChild(b);
  });
  stats();
}
function pulse(id) {
  const el = [...courses.querySelectorAll('.brick')].find(b => b.dataset.id === String(id));
  if (!el) return;
  el.classList.remove('findme'); void el.offsetWidth; el.classList.add('findme');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => el.classList.remove('findme'), 4600);
}

/* ---------------- API ---------------- */
async function api(path, opts) {
  const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || ('Request failed (' + r.status + ')'));
  return body;
}

async function loadWall(reset) {
  if (loading) return;
  loading = true;
  try {
    const offset = reset ? 0 : tiles.length;
    const { bricks } = await api('/api/bricks?limit=' + PAGE + '&offset=' + offset);
    if (reset) tiles = [];
    tiles = tiles.concat(bricks);
    if (bricks.length < PAGE) done = true;
    reindex(); draw();
    offline = false;
  } catch (err) {
    offline = true;
    if (!tiles.length) seedOffline();
    console.warn('Wall could not load from the API:', err.message);
  } finally {
    loading = false;
  }
}
async function loadLiked() {
  try {
    const { liked: ids } = await api('/api/heart?voter=' + encodeURIComponent(VOTER));
    liked = new Set(ids.map(String));
  } catch (err) { /* keep whatever we have */ }
}
function seedOffline() {
  const demo = ['learn my grandmother’s language', 'take my mother to Japan', 'stop waiting for the right moment',
    'write the book I keep describing', 'swim in the sea at sunrise', 'forgive someone properly',
    'plant a garden and keep it alive', 'sleep under the stars again'];
  tiles = demo.map((t, i) => ({ id: 'demo' + i, text: t, color: CLAYS[i % CLAYS.length][1], hearts: (i * 3) % 11, echoes: 0 }));
  reindex(); draw();
  setMsg('Preview only — the wall is not connected to the database.', 'bad');
}

/* ---------------- lay a brick ---------------- */
async function lay() {
  const v = ta.value.trim();
  if (!v) { ta.focus(); setMsg('Write something first.', 'bad'); return; }
  if (BLOCK.some(w => v.toLowerCase().includes(w))) {
    setMsg('That didn’t pass moderation — try rephrasing.', 'bad'); return;
  }
  /* local dedupe first, so the obvious case never needs a round trip */
  const twin = index.get(norm(v));
  if (twin) { joinExisting(twin); return; }

  addBtn.disabled = true;
  try {
    const { brick, is_new } = await api('/api/bricks', {
      method: 'POST',
      body: JSON.stringify({ text: v, color: pick, voter: VOTER })
    });
    ta.value = ''; tick();

    const existing = tiles.find(t => String(t.id) === String(brick.id));
    if (existing) {
      Object.assign(existing, brick);
      reindex(); draw(); joinExisting(existing, true);
    } else {
      tiles.unshift(brick); reindex();
      mine.add(String(brick.id)); saveSet(LS_MINE, mine);
      freshId = String(brick.id);
      draw();
      setMsg(is_new ? 'Laid. Yours is outlined in white near the top.'
                    : "Someone already wrote this \u2014 you're on their brick now.", 'good');
      clearTimeout(msgTimer); msgTimer = setTimeout(() => setMsg(''), 5000);
      setTimeout(() => { freshId = null; }, 2800);
      wall.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    setMsg(err.message, 'bad');
  } finally {
    addBtn.disabled = false;
  }
}
function joinExisting(twin, silent) {
  mine.add(String(twin.id)); saveSet(LS_MINE, mine);
  ta.value = ''; tick(); draw();
  if (!silent) setMsg("Someone already wrote this \u2014 you're on their brick now.", 'good');
  openSheet(twin); pulse(twin.id);
}
addBtn.onclick = lay;
ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); lay(); } });

/* ---------------- spotlight ---------------- */
const spotBtn = document.getElementById('spot');
if (spotBtn) spotBtn.onclick = () => {
  if (tiles.length) openSheet(tiles[Math.floor(Math.random() * tiles.length)]);
};

/* ---------------- top bricks ---------------- */
const topbtn = document.getElementById('topbtn'), toppanel = document.getElementById('toppanel'), toplist = document.getElementById('toplist');
const HZ = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

async function buildTop() {
  let ranked;
  try {
    const { bricks } = await api('/api/bricks?sort=top&limit=100');
    ranked = bricks;
  } catch (err) {
    ranked = [...tiles].sort((a, b) => (b.hearts || 0) - (a.hearts || 0)).slice(0, 100);
  }
  toplist.innerHTML = '';
  ranked.forEach((item, i) => {
    const r = document.createElement('button');
    r.className = 'toprow' + (mine.has(String(item.id)) ? ' ismine' : '');
    r.type = 'button'; r.setAttribute('role', 'option');
    r.innerHTML = '<span class="rank">' + (i + 1) + '</span>' +
                  '<span class="d" style="background:' + esc(item.color) + '"></span>' +
                  '<span class="tx">' + esc(item.text) + '</span>' +
                  '<span class="hz">' + HZ + (item.hearts || 0) + '</span>';
    r.onclick = () => { closeTop(); openSheet(item); };
    toplist.appendChild(r);
  });
  document.getElementById('tophint').textContent = ranked.length < 100 ? ranked.length + ' shown' : 'by hearts';
}
function openTop()  { toppanel.classList.add('open');  topbtn.setAttribute('aria-expanded', 'true'); toplist.scrollTop = 0; buildTop(); }
function closeTop() { toppanel.classList.remove('open'); topbtn.setAttribute('aria-expanded', 'false'); }
topbtn.onclick = e => { e.stopPropagation(); toppanel.classList.contains('open') ? closeTop() : openTop(); };
document.addEventListener('click', e => { if (!toppanel.contains(e.target) && !topbtn.contains(e.target)) closeTop(); });

/* ---------------- hearts ---------------- */
const closeSheet = () => veil.classList.remove('on');
document.getElementById('close').onclick = closeSheet;
veil.onclick = e => { if (e.target === veil) closeSheet(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeTop(); } });

document.getElementById('heart').onclick = async () => {
  if (!active) return;
  const id = String(active.id);
  if (offline || id.startsWith('demo')) { setMsg('Hearts need the database.', 'bad'); return; }

  const btn = document.getElementById('heart');
  const wasLiked = liked.has(id);
  /* optimistic, reconciled by the server response */
  liked[wasLiked ? 'delete' : 'add'](id);
  active.hearts = Math.max(0, (active.hearts || 0) + (wasLiked ? -1 : 1));
  btn.classList.toggle('lit', !wasLiked);
  document.getElementById('hc').textContent = active.hearts;
  document.getElementById('qmeta').textContent = metaFor(active);
  draw();

  try {
    const r = await api('/api/heart', { method: 'POST', body: JSON.stringify({ brick_id: active.id, voter: VOTER }) });
    active.hearts = r.hearts;
    liked[r.liked ? 'add' : 'delete'](id);
    btn.classList.toggle('lit', r.liked);
    document.getElementById('hc').textContent = r.hearts;
    document.getElementById('qmeta').textContent = metaFor(active);
    draw();
  } catch (err) {
    liked[wasLiked ? 'add' : 'delete'](id);
    active.hearts = Math.max(0, (active.hearts || 0) + (wasLiked ? 1 : -1));
    btn.classList.toggle('lit', wasLiked);
    document.getElementById('hc').textContent = active.hearts;
    draw();
    setMsg(err.message, 'bad');
  }
};

/* ---------------- infinite scroll ---------------- */
zoomr.oninput = draw;
let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { draw(); fitChips(); }, 120); });
window.addEventListener('scroll', () => {
  if (done || loading || offline) return;
  if (window.innerHeight + window.scrollY > document.body.offsetHeight - 900) loadWall(false);
}, { passive: true });

/* ---------------- radio ---------------- */
const PLAYLIST_URI = 'spotify:playlist:2q7U9Dh7buTnrwHEWxcxiq';
const sndbtn = document.getElementById('sndbtn'), icOff = document.getElementById('icoff'), icOn = document.getElementById('icon');
const playerEl = document.getElementById('player');
let spot = null, playing = false, playLock = 0;
function paintSound() {
  sndbtn.classList.toggle('on', playing);
  sndbtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  sndbtn.setAttribute('aria-label', playing ? 'Mute wall radio' : 'Play wall radio');
  icOff.style.display = playing ? 'none' : 'block';
  icOn.style.display  = playing ? 'inline-flex' : 'none';
}
function flashPlayer(ms) {
  playerEl.classList.add('show');
  clearTimeout(flashPlayer._t);
  flashPlayer._t = setTimeout(() => playerEl.classList.remove('show'), ms || 2600);
}
if (window.spotifyReady) {
  window.spotifyReady.then(apiSp => {
    apiSp.createController(document.getElementById('spotholder'),
      { uri: PLAYLIST_URI, width: '100%', height: 80 },
      ctrl => {
        spot = ctrl;
        ctrl.addListener('playback_update', e => {
          const p = !!(e && e.data && e.data.isPaused === false);
          // Ignore spurious isPaused=true events for 3s after a play command
          if (!p && Date.now() < playLock) return;
          if (p !== playing) { playing = p; paintSound(); }
        });
        // Autoplay on desktop only; mobile requires an explicit user tap
        if (window.innerWidth > 640) {
          playLock = Date.now() + 3000;
          try { ctrl.play(); } catch (err) {}
          setTimeout(() => { if (!playing) flashPlayer(8000); }, 2500);
        }
      });
  }).catch(() => {});
}
sndbtn.onclick = () => {
  if (!spot) { flashPlayer(7000); return; }
  try {
    const willPlay = !playing;
    if (willPlay) playLock = Date.now() + 800;
    spot.togglePlay();
    playing = willPlay; paintSound(); flashPlayer(willPlay ? 2600 : 1400);
  } catch (err) { flashPlayer(7000); }
};
paintSound();

/* ---------------- go ---------------- */
tick(); fitChips();
if (window.innerWidth <= 640) zoomr.value = 1; /* step back by default on mobile */
(async () => { await loadLiked(); await loadWall(true); })();
