// supertrip-loader.js — self-contained <supertrip-loader> custom element.
// A portable port of the "Orbit" loading screen whose visuals are bound to a
// deterministic loading progress value (0 → 1). No framework, no audio.
//
//   <supertrip-loader></supertrip-loader>
//   const el = document.querySelector('supertrip-loader');
//   el.progress = 0.42;                 // set 0..1 as your app loads
//   el.addEventListener('complete', () => el.remove());  // fires once at 1.0
//
// Props / attributes:
//   progress (number 0..1) — the ONLY input you bind to real loading.
//   ease     (number, default 0.12) — how fast the shown value chases the
//            target each frame (0 = frozen, 1 = instant). Smooths chunky updates.
//
// Renders into light DOM with tag-scoped CSS + `stl-` prefixed classes so it
// won't collide with host styles. The dawn sky, sun-rise, frame-lighten,
// captions, percent and the porthole light line are ALL driven by `progress`.
// Clouds drift and stars twinkle on an internal clock so it stays alive even
// if progress stalls.

(() => {
  const CW = 402, CH = 874;
  const PW = { x: 67, y: 140, w: 268, h: 516, r: 92 };

  const clamp = (t, a = 0, b = 1) => Math.min(b, Math.max(a, t));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, t) => clamp((t - a) / (b - a));
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const wins = (t, a, b, f = 0.4) => clamp(inv(a, a + f, t)) * clamp(1 - inv(b - f, b, t));
  const hexRgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); t = clamp(t); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; };
  const mixStops = (stops, p) => { p = clamp(p); for (let i = 0; i < stops.length - 1; i++) { const [p0, c0] = stops[i], [p1, c1] = stops[i + 1]; if (p <= p1) return mix(c0, c1, (p - p0) / (p1 - p0)); } return stops[stops.length - 1][1]; };
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  const SKY_TOP = [[0, '#0A1838'], [0.34, '#2A2A64'], [0.6, '#586CB0'], [0.84, '#82B0E8'], [1, '#A6D0F4']];
  const SKY_MID = [[0, '#13245A'], [0.34, '#4A3A78'], [0.6, '#C2789A'], [0.84, '#E7C7C2'], [1, '#CCE4FB']];
  const SKY_BOT = [[0, '#1C2E66'], [0.34, '#6A4A7C'], [0.6, '#F2A258'], [0.84, '#FBD79E'], [1, '#E8F3FF']];

  const CAPTIONS = [
    ['Connecting to doc', 0.00, 0.16],
    ['Gathering your itinerary', 0.16, 0.36],
    ['Syncing flight details', 0.36, 0.58],
    ['Getting hotel information', 0.58, 0.78],
    ['Lining up your activities', 0.78, 0.96],
    ['Bon Voyage', 0.96, 1.0001],
  ];

  const roundRect = (x, y, w, h, r) => {
    const cx = x + w / 2;
    return `M ${cx} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  };

  const cloudBg = 'radial-gradient(ellipse 38% 58% at 28% 60%, #fff 0%, rgba(255,255,255,0) 72%), radial-gradient(ellipse 30% 82% at 48% 44%, #fff 0%, rgba(255,255,255,0) 73%), radial-gradient(ellipse 34% 64% at 68% 56%, #fff 0%, rgba(255,255,255,0) 72%), radial-gradient(ellipse 26% 48% at 85% 66%, #fff 0%, rgba(255,255,255,0) 73%), radial-gradient(ellipse 52% 34% at 50% 80%, #fff 0%, rgba(255,255,255,0) 74%)';

  const STYLE_ID = 'stl-style';
  const CSS = `
    supertrip-loader { position: fixed; inset: 0; display: block; background: #141517; z-index: 2147483000; overflow: hidden; }
    supertrip-loader .stl-scaler { position: absolute; left: 50%; top: 50%; width: ${CW}px; height: ${CH}px; transform-origin: center; will-change: transform; }
    supertrip-loader .stl-abs { position: absolute; }
    supertrip-loader .stl-glass { overflow: hidden; }
    supertrip-loader .stl-cloud { position: absolute; left: 0; width: 196px; height: 76px; will-change: transform; }
    supertrip-loader .stl-cap { position: absolute; left: 0; right: 0; font: 600 20px/1 -apple-system, "SF Pro Display", system-ui, sans-serif; letter-spacing: -0.01em; color: rgba(255,248,238,0.95); text-shadow: 0 1px 16px rgba(0,0,0,0.55); opacity: 0; text-align: center; }`;

  class SupertripLoader extends HTMLElement {
    constructor() { super(); this._target = 0; this._shown = 0; this._raf = 0; this._t0 = 0; this._completed = false; this._ease = 0.12; }
    static get observedAttributes() { return ['progress', 'ease']; }
    attributeChangedCallback(n, _o, v) {
      if (n === 'progress') this.progress = parseFloat(v);
      if (n === 'ease') this.ease = parseFloat(v);
    }
    get progress() { return this._target; }
    set progress(v) { this._target = clamp(Number(v) || 0); }
    get ease() { return this._ease; }
    set ease(v) { this._ease = clamp(Number(v) || 0.12, 0.01, 1); }

    connectedCallback() {
      if (!document.getElementById(STYLE_ID)) {
        const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
      }
      this._build();
      this._fit();
      this._ro = new ResizeObserver(() => this._fit()); this._ro.observe(this);
      window.addEventListener('resize', this._fitBound = () => this._fit());
      this._t0 = performance.now();
      const loop = (now) => {
        const time = (now - this._t0) / 1000;
        this._shown += (this._target - this._shown) * this._ease;
        if (this._target >= 0.999 && this._shown > 0.9985) this._shown = 1;
        this._render(this._shown, time);
        if (this._shown >= 1 && !this._completed) { this._completed = true; this.dispatchEvent(new CustomEvent('complete', { bubbles: true })); }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); window.removeEventListener('resize', this._fitBound); }

    _fit() {
      if (!this._scaler) return;
      const r = this.getBoundingClientRect();
      const s = Math.min(r.width / CW, r.height / CH);
      this._scaler.style.transform = `translate(-50%,-50%) scale(${s})`;
    }

    _build() {
      const stars = Array.from({ length: 34 }, (() => { const rnd = rng(7); return () => ({ x: rnd() * 100, y: rnd() * 52, r: 0.5 + rnd() * 1.3, ph: rnd() * 6.28, sp: 1.5 + rnd() * 2 }); })());
      const clouds = Array.from({ length: 6 }, (() => { const r2 = rng(21); return () => ({ base: r2() * 1.5, y: 30 + r2() * 55, scale: 0.6 + r2() * 0.9, speed: 0.02 + r2() * 0.05, op: 0.5 + r2() * 0.4 }); })());
      const fg = Array.from({ length: 3 }, (() => { const r3 = rng(41); return () => ({ base: r3(), y: 28 + r3() * 24, scale: 0.95 + r3() * 0.7, speed: 0.015 + r3() * 0.022, op: 0.72 + r3() * 0.24 }); })());
      this._stars = stars; this._clouds = clouds; this._fg = fg;

      this.innerHTML = `
        <div class="stl-scaler">
          <div class="stl-abs" style="inset:0;background:linear-gradient(165deg,#1b1c1e 0%,#232427 45%,#141517 100%)"></div>
          <div class="stl-abs" style="inset:0;background:radial-gradient(120% 50% at 50% -8%, rgba(255,230,200,0.06), rgba(0,0,0,0) 60%)"></div>
          <div class="stl-abs" data-cabinlight style="inset:0;opacity:0;mix-blend-mode:screen;background:linear-gradient(165deg,#8c8a86 0%,#a09d98 44%,#62615e 100%)"></div>

          <div class="stl-abs" data-surra style="left:${PW.x - 16}px;top:${PW.y - 16}px;width:${PW.w + 32}px;height:${PW.h + 32}px;border-radius:${PW.r + 16}px;background:linear-gradient(150deg,#36363a,#1e1e21);box-shadow:0 30px 60px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.08)"></div>
          <div class="stl-abs" data-surrb style="left:${PW.x - 7}px;top:${PW.y - 7}px;width:${PW.w + 14}px;height:${PW.h + 14}px;border-radius:${PW.r + 7}px;background:linear-gradient(150deg,#54545a,#2f2f33)"></div>

          <div class="stl-abs stl-glass" style="left:${PW.x}px;top:${PW.y}px;width:${PW.w}px;height:${PW.h}px;border-radius:${PW.r}px;box-shadow:inset 0 0 40px rgba(0,0,0,0.45)">
            <div class="stl-abs" data-sky style="inset:0"></div>
            <div class="stl-abs" data-starwrap style="inset:0">
              ${stars.map(s => `<div class="stl-abs" style="left:${s.x}%;top:${s.y}%;width:${s.r * 2}px;height:${s.r * 2}px;border-radius:50%;background:#fff;box-shadow:0 0 4px rgba(255,255,255,0.8)"></div>`).join('')}
            </div>
            <div class="stl-abs" data-warm style="inset:0;opacity:0;mix-blend-mode:screen;background:linear-gradient(0deg, rgba(255,170,90,0.6) 0%, rgba(255,150,120,0.18) 40%, rgba(0,0,0,0) 70%)"></div>
            <div class="stl-abs" data-sunglow style="left:64%;top:0;width:320px;height:320px;margin-left:-160px;border-radius:50%;opacity:0;mix-blend-mode:screen;background:radial-gradient(circle, rgba(255,240,210,0.95) 0%, rgba(255,200,130,0.5) 30%, rgba(255,180,110,0) 62%)"></div>
            <div class="stl-abs" data-sun style="left:64%;top:0;width:66px;height:66px;margin-left:-33px;border-radius:50%;opacity:0;background:radial-gradient(circle,#FFF6E6 0%,#FFE3AE 55%,#FFCF8A 100%);box-shadow:0 0 50px 14px rgba(255,225,170,0.7)"></div>
            ${fg.map(c => `<div class="stl-cloud" data-fg style="top:${c.y}%;opacity:${c.op};filter:blur(8px);background:${cloudBg}"></div>`).join('')}
            ${clouds.map(c => `<div class="stl-cloud" data-cloud style="top:${c.y}%;opacity:${c.op};filter:blur(9px);background:${cloudBg}"></div>`).join('')}
            <div class="stl-abs" style="inset:0;pointer-events:none;background:linear-gradient(125deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.06) 100%)"></div>
            <div class="stl-abs" style="inset:0;border-radius:${PW.r}px;pointer-events:none;box-shadow:inset 0 0 30px rgba(10,10,30,0.5)"></div>
            <svg width="${PW.w}" height="${PW.h}" viewBox="0 0 ${PW.w} ${PW.h}" style="position:absolute;inset:0;pointer-events:none;overflow:visible">
              <defs>
                <linearGradient id="stl-tailgrad" gradientUnits="userSpaceOnUse" x1="${PW.w / 2 - 34}" y1="2" x2="${PW.w / 2}" y2="2">
                  <stop offset="0" stop-color="#FFF3DA" stop-opacity="0"></stop>
                  <stop offset="1" stop-color="#FFF3DA" stop-opacity="1"></stop>
                </linearGradient>
              </defs>
              <line data-tail x1="${PW.w / 2 - 34}" y1="2" x2="${PW.w / 2}" y2="2" stroke="url(#stl-tailgrad)" stroke-width="4" stroke-linecap="butt" style="opacity:0;filter:drop-shadow(0 0 7px rgba(255,231,178,0.7)) drop-shadow(0 0 16px rgba(255,201,130,0.45))"></line>
              <path data-line d="${roundRect(2, 2, PW.w - 4, PW.h - 4, PW.r - 2)}" fill="none" stroke="#FFF3DA" stroke-width="4" stroke-linecap="butt" style="filter:drop-shadow(0 0 7px rgba(255,231,178,0.95)) drop-shadow(0 0 18px rgba(255,201,130,0.6))"></path>
            </svg>
          </div>

          <div class="stl-abs" style="left:50%;top:${PW.y - 14}px;transform:translateX(-50%);width:46px;height:7px;border-radius:5px;background:linear-gradient(#6b6b70,#3f3f43)"></div>

          <div class="stl-abs" style="left:0;right:0;top:${PW.y + PW.h + 80}px;height:26px">
            ${CAPTIONS.map(([txt]) => `<div class="stl-cap">${txt}</div>`).join('')}
          </div>
          <div class="stl-abs" style="left:0;right:0;top:${PW.y + PW.h + 116}px;text-align:center">
            <span data-pct style="font:620 14px/1 -apple-system, system-ui;font-variant-numeric:tabular-nums;color:rgba(255,248,238,0.55);letter-spacing:0.02em">0%</span>
          </div>
          <div class="stl-abs" data-white style="inset:0;background:#fff;opacity:0;pointer-events:none"></div>
          <div class="stl-abs" data-black style="inset:0;background:#000;opacity:0;pointer-events:none"></div>
        </div>`;

      const q = (s) => this.querySelector(s);
      this._scaler = q('.stl-scaler');
      this._el = {
        cabinLight: q('[data-cabinlight]'), surrA: q('[data-surra]'), surrB: q('[data-surrb]'),
        sky: q('[data-sky]'), starwrap: q('[data-starwrap]'), starEls: [...this.querySelectorAll('[data-starwrap] > div')],
        warm: q('[data-warm]'), sun: q('[data-sun]'), sunGlow: q('[data-sunglow]'),
        cloudEls: [...this.querySelectorAll('[data-cloud]')], fgEls: [...this.querySelectorAll('[data-fg]')],
        line: q('[data-line]'), tail: q('[data-tail]'), pct: q('[data-pct]'), caps: [...this.querySelectorAll('.stl-cap')],
        white: q('[data-white]'), black: q('[data-black]'),
      };
      this._lineLen = this._el.line.getTotalLength();
    }

    _render(P, time) {
      const e = this._el; if (!e) return;
      const dawn = smoother(P);

      e.sky.style.background = `linear-gradient(180deg, ${mixStops(SKY_TOP, dawn)} 0%, ${mixStops(SKY_MID, dawn)} 52%, ${mixStops(SKY_BOT, dawn)} 100%)`;

      e.starwrap.style.opacity = 1 - smooth(inv(0.18, 0.5, dawn));
      const stars = this._stars;
      e.starEls.forEach((el, i) => { el.style.opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * stars[i].sp + stars[i].ph)); });

      const rise = inv(0.42, 1, dawn);
      const sunY = lerp(1.18, 0.42, easeOutCubic(rise)) * PW.h;
      e.sun.style.transform = `translate(-50%, ${sunY}px)`;
      e.sun.style.opacity = smooth(inv(0.42, 0.9, dawn));
      e.sunGlow.style.transform = `translate(-50%, ${sunY}px) scale(${lerp(0.7, 1.25, rise)})`;
      e.sunGlow.style.opacity = smooth(inv(0.38, 0.7, dawn)) * 0.9;
      e.warm.style.opacity = wins(dawn, 0.45, 1.05, 0.25) * 0.5;

      e.cabinLight.style.opacity = (smooth(inv(0.4, 1, dawn)) * 0.72).toFixed(3);
      const fl = smooth(inv(0.35, 1, dawn));
      e.surrA.style.background = `linear-gradient(150deg, ${mix('#36363a', '#74747a', fl)}, ${mix('#1e1e21', '#4c4c51', fl)})`;
      e.surrB.style.background = `linear-gradient(150deg, ${mix('#54545a', '#9a9aa0', fl)}, ${mix('#2f2f33', '#666670', fl)})`;

      const drift = (el, c) => {
        const cw = 196 * c.scale, offR = PW.w + 60, offL = -cw - 60, span = offR - offL;
        const prog = ((c.base + c.speed * time) % 1 + 1) % 1;
        el.style.transform = `translate(${offR - prog * span}px,0) scale(${c.scale})`;
      };
      e.cloudEls.forEach((el, i) => drift(el, this._clouds[i]));
      e.fgEls.forEach((el, i) => drift(el, this._fg[i]));

      const lit = 0.7 + 0.3 * smooth(inv(0.3, 1, dawn));
      const fadeIn = smooth(inv(0.02, 0.14, P));
      e.line.style.strokeDasharray = this._lineLen;
      e.line.style.strokeDashoffset = this._lineLen * (1 - P);
      e.line.style.opacity = (lit * fadeIn).toFixed(3);
      e.tail.style.opacity = (lit * fadeIn).toFixed(3);

      e.caps.forEach((el, i) => { const [, a, b] = CAPTIONS[i]; const o = wins(P, a, b, 0.08); el.style.opacity = o; el.style.transform = `translateY(${lerp(8, 0, o)}px)`; });
      e.pct.textContent = Math.round(P * 100) + '%';

      e.white.style.opacity = smooth(inv(0.96, 0.985, P)).toFixed(3);
      e.black.style.opacity = smooth(inv(0.985, 1, P)).toFixed(3);
    }
  }

  if (!customElements.get('supertrip-loader')) customElements.define('supertrip-loader', SupertripLoader);
})();
