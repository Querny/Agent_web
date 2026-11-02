/* ============================================================
   Обсерватория «Тихая» — единственный скрипт.
   Никаких зависимостей: небо на canvas, расчёты Луны и ночи,
   лаборатория созвездий с localStorage.
   ============================================================ */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const TAU = Math.PI * 2;
  const RAD = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad = (n) => String(n).padStart(2, '0');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); return true; } catch { return false; } },
  };

  /* ─── 1. Небо на фоне ───────────────────────────────────── */

  const skyCanvas = $('#bg');
  const sky = skyCanvas.getContext('2d');
  let skyW = 0, skyH = 0, skyDpr = 1;
  let stars = [];
  let meteors = [];
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function buildStars() {
    const count = clamp(Math.round((skyW * skyH) / 8600), 70, 300);
    stars = Array.from({ length: count }, () => {
      const big = Math.random() < 0.06;
      return {
        x: Math.random() * skyW,
        y: Math.random() * skyH,
        r: big ? rand(1.1, 1.7) : rand(0.35, 1.05),
        a: big ? rand(0.55, 0.95) : rand(0.18, 0.8),
        sp: rand(0.25, 1.4),
        ph: rand(0, TAU),
        depth: rand(0.15, 1),
        warm: Math.random() < 0.22,
      };
    });
  }

  function resizeSky() {
    skyDpr = Math.min(2, window.devicePixelRatio || 1);
    skyW = window.innerWidth;
    skyH = window.innerHeight;
    skyCanvas.width = Math.round(skyW * skyDpr);
    skyCanvas.height = Math.round(skyH * skyDpr);
    sky.setTransform(skyDpr, 0, 0, skyDpr, 0, 0);
    buildStars();
  }

  function drawSky(time) {
    sky.clearRect(0, 0, skyW, skyH);

    pointer.x = lerp(pointer.x, pointer.tx, 0.045);
    pointer.y = lerp(pointer.y, pointer.ty, 0.045);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = reduceMotion ? 1 : 0.62 + 0.38 * Math.sin(time * 0.0012 * s.sp + s.ph);
      const x = s.x + pointer.x * 14 * s.depth;
      const y = s.y + pointer.y * 14 * s.depth;

      sky.globalAlpha = s.a * tw;
      sky.fillStyle = s.warm ? '#f7e9cf' : '#e2ebff';

      if (s.r > 1.05) {
        sky.shadowColor = s.warm ? 'rgba(247,233,207,.9)' : 'rgba(226,235,255,.9)';
        sky.shadowBlur = 10;
      }
      sky.beginPath();
      sky.arc(x, y, s.r, 0, TAU);
      sky.fill();
      sky.shadowBlur = 0;
    }
    sky.globalAlpha = 1;

    if (!reduceMotion) drawMeteors(time);
  }

  function drawMeteors(time) {
    if (Math.random() < 0.0022 && meteors.length < 3) {
      meteors.push({
        x: rand(skyW * 0.2, skyW * 1.08),
        y: rand(-60, skyH * 0.5),
        vx: rand(0.24, 0.52),
        vy: rand(0.08, 0.22),
        life: 0,
        max: rand(620, 1080),
        len: rand(70, 170),
      });
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      const p = m.life / m.max;
      if (p >= 1) { meteors.splice(i, 1); continue; }

      const headX = m.x, headY = m.y;
      const tailX = m.x - m.vx * m.len;
      const tailY = m.y - m.vy * m.len;
      const fade = Math.sin(p * Math.PI);

      const grad = sky.createLinearGradient(headX, headY, tailX, tailY);
      grad.addColorStop(0, `rgba(255,248,232,${0.85 * fade})`);
      grad.addColorStop(0.35, `rgba(200,220,255,${0.28 * fade})`);
      grad.addColorStop(1, 'rgba(200,220,255,0)');

      sky.strokeStyle = grad;
      sky.lineWidth = 1.4;
      sky.lineCap = 'round';
      sky.beginPath();
      sky.moveTo(headX, headY);
      sky.lineTo(tailX, tailY);
      sky.stroke();

      sky.globalAlpha = fade * 0.9;
      sky.fillStyle = '#fffaf0';
      sky.beginPath();
      sky.arc(headX, headY, 1.5, 0, TAU);
      sky.fill();
      sky.globalAlpha = 1;

      m.life = Math.min(m.max, m.life + 16.7);
      m.x += m.vx * 16.7;
      m.y += m.vy * 16.7;
    }
  }

  /* ─── 2. Луна ───────────────────────────────────────────── */

  const SYNODIC = 29.530588853 * 86400000;
  const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

  function moonState(now = Date.now()) {
    const age = (((now - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC;
    const phase = age / SYNODIC;
    return {
      ageDays: age / 86400000,
      phase,
      illum: (1 - Math.cos(TAU * phase)) / 2,
      waxing: phase < 0.5,
    };
  }

  function shadowPath(ctx, R, k) {
    const rx = R * (1 - 2 * k);
    const N = 40;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const th = -Math.PI / 2 - Math.PI * (i / N);
      const x = R * Math.cos(th);
      const y = R * Math.sin(th);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = 0; i <= N; i++) {
      const u = Math.PI / 2 - Math.PI * (i / N);
      ctx.lineTo(rx * Math.cos(u), R * Math.sin(u));
    }
    ctx.closePath();
  }

  function drawMoon(k, waxing) {
    const el = $('#moon');
    if (!el) return;
    const ctx = el.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 96;
    el.width = size * dpr;
    el.height = size * dpr;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, R = size * 0.4;

    const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.45);
    halo.addColorStop(0, 'rgba(243,238,228,.16)');
    halo.addColorStop(1, 'rgba(243,238,228,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.45, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();

    const body = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R * 1.15);
    body.addColorStop(0, '#fdf8ee');
    body.addColorStop(0.5, '#e7ddcb');
    body.addColorStop(1, '#b6a893');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, size, size);

    const craters = [
      [-0.24, -0.18, 0.17], [0.22, 0.08, 0.12], [-0.06, 0.36, 0.1],
      [0.32, -0.28, 0.07], [-0.42, 0.14, 0.06], [0.05, -0.42, 0.05],
    ];
    for (const [x, y, r] of craters) {
      ctx.beginPath();
      ctx.arc(cx + x * R, cy + y * R, r * R, 0, TAU);
      ctx.fillStyle = 'rgba(120,108,90,.11)';
      ctx.fill();
    }

    ctx.save();
    ctx.translate(cx, cy);
    if (!waxing) ctx.scale(-1, 1);
    shadowPath(ctx, R, k);
    ctx.fillStyle = '#070b14';
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  function moonFill() {
    const el = $('#moon');
    if (el) el.dataset.ready = '1';
    const m = moonState();

    const names = [
      [0.015, 'Новолуние'], [0.235, 'Молодая Луна'], [0.265, 'Первая четверть'],
      [0.485, 'Растущая Луна'], [0.515, 'Полнолуние'], [0.735, 'Убывающая Луна'],
      [0.765, 'Последняя четверть'], [0.985, 'Старая Луна'], [1.01, 'Новолуние'],
    ];
    let name = 'Луна';
    for (const [limit, label] of names) {
      if (m.phase < limit) { name = label; break; }
    }

    $('#moonPhase').textContent = name;
    $('#moonIllum').textContent = `${Math.round(m.illum * 100)} % освещено`;

    const note = $('#moonNote');
    const toFull = 14.765 - m.ageDays;
    if (toFull > 0.8) {
      const d = Math.round(toFull);
      note.textContent = `До полнолуния ${d} ${plural(d, ['ночь', 'ночи', 'ночей'])}`;
    } else if (toFull > -1) {
      note.textContent = 'Полнолуние — этой ночью';
    } else {
      const toNew = 29.53 - m.ageDays;
      const d = Math.max(0, Math.round(toNew));
      note.textContent = `До новолуния ${d} ${plural(d, ['ночь', 'ночи', 'ночей'])}`;
    }

    drawMoon(m.illum, m.waxing);
  }

  /* ─── 3. Ночь: закат, рассвет, тихое окно ───────────────── */

  const SITE = { lat: 53.348, lon: 83.779, tz: 7 };
  const barnaulDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Barnaul', year: 'numeric', month: '2-digit', day: '2-digit',
  });

  function sunModel() {
    const [y, mo, d] = barnaulDate.format(new Date()).split('-').map(Number);
    const n = (Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 1)) / 86400000 + 1;
    const decl = -23.44 * Math.cos(TAU * (n + 10) / 365) * RAD;
    const B = TAU * (n - 81) / 364;
    const eqt = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const noon = 12 + (SITE.tz - SITE.lon / 15) - eqt / 60;
    return { n, decl, noon };
  }

  function hourAngle(altitudeDeg, decl) {
    const phi = SITE.lat * RAD;
    const cosH = (Math.sin(altitudeDeg * RAD) - Math.sin(phi) * Math.sin(decl)) /
      (Math.cos(phi) * Math.cos(decl));
    if (cosH > 1) return { state: 'below' };
    if (cosH < -1) return { state: 'above' };
    return { state: 'ok', hours: Math.acos(cosH) / RAD / 15 };
  }

  function fmtHour(h) {
    const total = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function fillNight() {
    const { decl, noon } = sunModel();
    const win = $('#darkWindow');
    const note = $('#sunNote');
    const bars = $('#darkBars');
    if (!win || !bars) return;

    const sun = hourAngle(-0.833, decl);
    if (sun.state === 'ok') {
      note.textContent = `Закат ${fmtHour(noon + sun.hours)} · рассвет ${fmtHour(noon - sun.hours + 24)}`;
    } else {
      note.textContent = sun.state === 'above' ? 'Полярный день' : 'Полярная ночь';
    }

    const dark = hourAngle(-18, decl);
    if (dark.state === 'ok') {
      win.textContent = `${fmtHour(noon + dark.hours)} — ${fmtHour(noon - dark.hours + 24)}`;
    } else {
      win.textContent = 'Светлая ночь';
      note.textContent += ' · астрономической темноты нет';
    }

    bars.textContent = '';
    const phi = SITE.lat * RAD;
    for (let i = 0; i < 24; i++) {
      const clock = 18 + i * 0.5;
      const solar = clock - (noon - 12);
      const alt = Math.asin(
        Math.sin(phi) * Math.sin(decl) +
        Math.cos(phi) * Math.cos(decl) * Math.cos((solar - 12) * 15 * RAD)
      ) / RAD;
      const depth = clamp(-alt / 55, 0, 1);
      const bar = document.createElement('i');
      bar.style.height = `${8 + depth * 92}%`;
      bar.style.opacity = String(0.22 + depth * 0.78);
      bar.style.transitionDelay = `${i * 18}ms`;
      bars.append(bar);
    }
  }

  /* ─── 4. Часы ───────────────────────────────────────────── */

  function startClock() {
    const clock = $('#clock');
    const date = $('#todayDate');
    if (!clock) return;

    const timeFmt = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Barnaul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const dateFmt = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Barnaul', day: 'numeric', month: 'long', weekday: 'short',
    });

    const tick = () => {
      const now = new Date();
      clock.textContent = timeFmt.format(now);
      if (date) date.textContent = dateFmt.format(now).replace(' г.', '');
    };

    tick();
    const delay = 1000 - (Date.now() % 1000);
    setTimeout(() => {
      tick();
      setInterval(tick, 1000);
    }, delay);
  }

  /* ─── 5. Лаборатория созвездий ──────────────────────────── */

  const LAB_KEY = 'tihaya.atlas.v1';
  const MAX_STARS = 40;

  const ADJ = ['Тихая', 'Малая', 'Ночная', 'Дальняя', 'Сонная', 'Ледяная', 'Медленная', 'Бледная', 'Тонкая', 'Ржавая'];
  const NOUN = ['Чаша', 'Лодка', 'Свеча', 'Тропа', 'Птица', 'Лестница', 'Игла', 'Река', 'Нить', 'Лампада', 'Дверь', 'Мелодия'];

  function generatedName() {
    return `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
  }

  function loadAtlas() {
    const raw = store.get(LAB_KEY);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter((c) => c && typeof c.name === 'string' && Array.isArray(c.pts) && c.pts.length > 1)
        .slice(0, 60);
    } catch {
      return [];
    }
  }

  function createLab() {
    const canvas = $('#labCanvas');
    const wrap = $('.skybox');
    const saveBtn = $('#saveBtn');
    const nameInput = $('#constName');
    const starCount = $('#starCount');
    const statusEl = $('#labStatus');
    const form = $('#labForm');

    let ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let visible = true;
    let atlas = loadAtlas();
    let statusTimer = 0;
    let decor = [];
    let dragging = -1;
    let hover = -1;

    const state = { pts: [] };
    const bgLayer = document.createElement('canvas');

    const glow = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,247,230,.95)');
      rg.addColorStop(0.18, 'rgba(250,226,190,.55)');
      rg.addColorStop(0.45, 'rgba(240,200,150,.16)');
      rg.addColorStop(1, 'rgba(240,200,150,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 64, 64);
      return c;
    })();

    function buildDecor() {
      const n = 190;
      decor = Array.from({ length: n }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() < 0.08 ? rand(0.9, 1.4) : rand(0.3, 0.8),
        a: Math.random() < 0.08 ? rand(0.5, 0.75) : rand(0.12, 0.45),
        ph: rand(0, TAU),
        sp: rand(0.3, 1.2),
      }));
    }

    // Фон (градиент, «Млечный Путь», виньетка) рисуется один раз при ресайзе.
    function paintBackground() {
      bgLayer.width = Math.max(1, Math.round(W * dpr));
      bgLayer.height = Math.max(1, Math.round(H * dpr));
      const g = bgLayer.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const base = g.createRadialGradient(W * 0.5, -H * 0.2, 10, W * 0.5, H * 0.85, Math.max(W, H) * 1.15);
      base.addColorStop(0, '#182740');
      base.addColorStop(0.42, '#0b1524');
      base.addColorStop(1, '#04070d');
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);

      const band = g.createLinearGradient(W * 0.1, 0, W * 0.95, H);
      band.addColorStop(0, 'rgba(130,150,210,0)');
      band.addColorStop(0.45, 'rgba(160,170,225,0.055)');
      band.addColorStop(1, 'rgba(130,150,210,0)');
      g.fillStyle = band;
      g.fillRect(0, 0, W, H);

      const clouds = [
        [0.16, 0.2, 0.62, 'rgba(84,116,190,.17)'],
        [0.86, 0.8, 0.66, 'rgba(122,96,182,.13)'],
      ];
      for (const [cx, cy, rad, color] of clouds) {
        const blob = g.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, Math.max(W, H) * rad * 0.5);
        blob.addColorStop(0, color);
        blob.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = blob;
        g.fillRect(0, 0, W, H);
      }

      const vig = g.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.2, W * 0.5, H * 0.5, Math.max(W, H) * 0.82);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(2,4,9,.6)');
      g.fillStyle = vig;
      g.fillRect(0, 0, W, H);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackground();
    }

    function setStatus(text, timeout = 2600) {
      statusEl.textContent = text;
      statusEl.classList.add('is-on');
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => statusEl.classList.remove('is-on'), timeout);
    }

    function sync() {
      const n = state.pts.length;
      starCount.textContent = `${n} ${plural(n, ['звезда', 'звезды', 'звёзд'])}`;
      saveBtn.disabled = n < 2;
      wrap.classList.toggle('is-drawn', n > 0);
    }

    function localPoint(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y, nx: clamp(x / rect.width, 0, 1), ny: clamp(y / rect.height, 0, 1) };
    }

    function hitTest(x, y) {
      const grab = 22;
      for (let i = state.pts.length - 1; i >= 0; i--) {
        const p = state.pts[i];
        if (Math.hypot(p.x * W - x, p.y * H - y) < grab) return i;
      }
      return -1;
    }

    function addPoint(nx, ny) {
      if (state.pts.length >= MAX_STARS) {
        setStatus('Хватит звёзд — сохраните рисунок');
        return;
      }
      state.pts.push({ x: nx, y: ny, born: performance.now() });
      sync();
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const { x, y, nx, ny } = localPoint(e);
      const idx = hitTest(x, y);
      if (idx >= 0) {
        dragging = idx;
        canvas.setPointerCapture(e.pointerId);
      } else {
        addPoint(nx, ny);
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const { x, y, nx, ny } = localPoint(e);
      if (dragging >= 0) {
        const p = state.pts[dragging];
        p.x = clamp(nx, 0.015, 0.985);
        p.y = clamp(ny, 0.02, 0.98);
      } else {
        hover = hitTest(x, y);
        canvas.style.cursor = hover >= 0 ? 'grab' : 'crosshair';
      }
    });

    const endDrag = (e) => {
      if (dragging >= 0 && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      dragging = -1;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => {
      if (dragging < 0) hover = -1;
    });

    function clearAll(silent = false) {
      state.pts = [];
      hover = -1;
      dragging = -1;
      sync();
      if (!silent) setStatus('Небо снова пустое');
    }

    function randomize() {
      const n = 6 + Math.floor(Math.random() * 4);
      const stepBase = Math.min(W || 800, H || 400) * 0.16;
      let angle = rand(0, TAU);
      const pts = [{ x: 0.5, y: 0.5 }];

      for (let i = 1; i < n; i++) {
        angle += rand(-1.15, 1.15);
        const step = stepBase * rand(0.8, 1.4);
        let x = pts[i - 1].x + Math.cos(angle) * step / (W || 800);
        let y = pts[i - 1].y + Math.sin(angle) * step / (H || 400);
        if (x < 0.07 || x > 0.93) { angle = Math.PI - angle; x = clamp(x, 0.07, 0.93); }
        if (y < 0.1 || y > 0.9) { angle = -angle; y = clamp(y, 0.1, 0.9); }
        pts.push({ x, y });
      }

      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const dx = 0.5 - (Math.min(...xs) + Math.max(...xs)) / 2;
      const dy = 0.5 - (Math.min(...ys) + Math.max(...ys)) / 2;

      state.pts = pts.map((p) => ({
        x: clamp(p.x + dx, 0.06, 0.94),
        y: clamp(p.y + dy, 0.1, 0.9),
        born: performance.now(),
      }));
      sync();
      setStatus('Набросано — подпишите');
    }

    function persist() {
      const ok = store.set(LAB_KEY, JSON.stringify(atlas));
      if (!ok) setStatus('Браузер не разрешил сохранение', 4000);
      return ok;
    }

    function renderShelf() {
      const list = $('#shelfList');
      const empty = $('#shelfEmpty');
      const count = $('#shelfCount');
      list.textContent = '';

      atlas.forEach((c) => {
        const li = document.createElement('li');
        li.className = 'atlas-card';
        li.dataset.id = c.id;

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 120 68');
        svg.setAttribute('aria-hidden', 'true');
        const pts = c.pts.map((p) => ({ x: 7 + p.x * 106, y: 7 + p.y * 54 }));
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(232,195,154,.6)');
        path.setAttribute('stroke-width', '1');
        svg.append(path);
        pts.forEach((p) => {
          const dot = document.createElementNS(svgNS, 'circle');
          dot.setAttribute('cx', p.x.toFixed(1));
          dot.setAttribute('cy', p.y.toFixed(1));
          dot.setAttribute('r', '1.7');
          dot.setAttribute('fill', '#f4e9d6');
          svg.append(dot);
        });

        const del = document.createElement('button');
        del.className = 'atlas-del';
        del.type = 'button';
        del.dataset.del = c.id;
        del.setAttribute('aria-label', `Удалить созвездие «${c.name}»`);
        del.textContent = '×';

        const title = document.createElement('p');
        title.className = 'atlas-name';
        title.textContent = c.name;

        const meta = document.createElement('p');
        meta.className = 'atlas-meta';
        const d = new Date(c.at || Date.now());
        meta.textContent = `${c.pts.length} ${plural(c.pts.length, ['звезда', 'звезды', 'звёзд'])} · ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;

        li.append(svg, del, title, meta);
        list.append(li);
      });

      const n = atlas.length;
      count.textContent = n ? `${n} ${plural(n, ['созвездие', 'созвездия', 'созвездий'])}` : '';
      empty.hidden = n > 0;
    }

    function save() {
      if (state.pts.length < 2) {
        setStatus('Нужно хотя бы две звезды');
        nameInput.focus();
        return;
      }
      const name = (nameInput.value || '').trim() || generatedName();
      const item = {
        id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: name.slice(0, 40),
        pts: state.pts.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) })),
        at: Date.now(),
      };
      atlas.unshift(item);
      atlas = atlas.slice(0, 60);
      persist();
      renderShelf();
      nameInput.value = '';
      clearAll(true);
      setStatus(`«${name}» — в атласе`, 3600);
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });

    $('#randomBtn').addEventListener('click', randomize);
    $('#clearBtn').addEventListener('click', () => clearAll());

    $('#shelfList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const id = btn.dataset.del;
      const item = atlas.find((c) => c.id === id);
      atlas = atlas.filter((c) => c.id !== id);
      persist();
      renderShelf();
      setStatus(item ? `«${item.name}» убрано из атласа` : 'Удалено');
    });

    canvas.addEventListener('focus', () => {
      if (!state.pts.length) setStatus('Клик по небу — звезда. Или кнопка «Случайно»', 4200);
    });

    function render(time) {
      if (!W || !H) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bgLayer, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (const d of decor) {
        const tw = reduceMotion ? 1 : 0.55 + 0.45 * Math.sin(time * 0.001 * d.sp + d.ph);
        ctx.globalAlpha = d.a * tw;
        ctx.fillStyle = '#dbe6ff';
        ctx.beginPath();
        ctx.arc(d.x * W, d.y * H, d.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const pts = state.pts;

      if (pts.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x * W, pts[0].y * H);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y * H);
        ctx.strokeStyle = 'rgba(232,195,154,.55)';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(232,195,154,.55)';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      pts.forEach((p, i) => {
        const age = (time - p.born) / 240;
        const grow = reduceMotion ? 1 : clamp(age, 0, 1);
        const ease = 1 - Math.pow(1 - grow, 3);
        const nx = p.x * W, ny = p.y * H;
        const size = 42 * (0.6 + ease * 0.4);
        ctx.globalAlpha = 0.9 * ease;
        ctx.drawImage(glow, nx - size / 2, ny - size / 2, size, size);
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#fffdf6';
        ctx.beginPath();
        ctx.arc(nx, ny, 2.6 * ease, 0, TAU);
        ctx.fill();

        if (i === hover) {
          ctx.strokeStyle = 'rgba(232,195,154,.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(nx, ny, 10, 0, TAU);
          ctx.stroke();
        }
      });
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    }, { rootMargin: '120px' }).observe(wrap);

    resize();
    buildDecor();
    renderShelf();
    sync();

    return {
      render,
      get visible() { return visible; },
      resize,
    };
  }

  /* ─── 6. Общее: навигация, появление, год ───────────────── */

  function setupNav() {
    const nav = $('#nav');
    const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function setupReveal() {
    const items = document.querySelectorAll('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach((el) => io.observe(el));
  }

  /* ─── 7. Запуск ─────────────────────────────────────────── */

  let lab = null;
  let rafId = 0;
  let lastTime = 0;

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    lastTime = time;
    drawSky(time);
    if (lab && lab.visible) lab.render(time);
  }

  function start() {
    resizeSky();
    moonFill();
    fillNight();
    startClock();
    setupNav();
    setupReveal();
    lab = createLab();

    window.addEventListener('resize', () => {
      resizeSky();
      moonFill();
      if (lab) lab.resize();
    });

    window.addEventListener('pointermove', (e) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    });

    const yearEl = $('#year');
    if (yearEl) yearEl.textContent = `© ${new Date().getFullYear()}`;

    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
