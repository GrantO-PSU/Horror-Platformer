/* Background, geometry, darkness, vignette, grain */
import { CFG } from './config.js';
import { Assets } from './assets.js';
import { Level } from './level.js';

export const Render = {
  lightCanvas: null,
  lctx: null,
  vignetteCanvas: null,
  noise: null,
  _pattern: null,
  _rockPat: null,
  _mossPat: null,

  init() {
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = CFG.W;
    this.lightCanvas.height = CFG.H;
    this.lctx = this.lightCanvas.getContext('2d');

    // Vignette overlay
    const v = document.createElement('canvas');
    v.width = CFG.W;
    v.height = CFG.H;
    const vc = v.getContext('2d');
    const g = vc.createRadialGradient(
      CFG.W / 2, CFG.H / 2, CFG.H * 0.28,
      CFG.W / 2, CFG.H / 2, CFG.H * 0.82
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(3,2,6,0.92)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, CFG.W, CFG.H);
    this.vignetteCanvas = v;

    // Grain
    const n = document.createElement('canvas');
    n.width = 160;
    n.height = 160;
    const nc = n.getContext('2d');
    const img = nc.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v2 = Math.random() * 255;
      img.data[i] = v2;
      img.data[i + 1] = v2;
      img.data[i + 2] = v2;
      img.data[i + 3] = 26 + Math.random() * 26;
    }
    nc.putImageData(img, 0, 0);
    this.noise = n;
  },

  /* ---------- parallax cave background ---------- */
  background(ctx, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, CFG.H);
    g.addColorStop(0, '#080910');
    g.addColorStop(0.55, '#05060c');
    g.addColorStop(1, '#030308');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    this._rock(ctx, cam, 0.18, 200, 46, '#0a0b12', 1.7, 'ceil');
    this._rock(ctx, cam, 0.34, 120, 60, '#070810', 4.1, 'ceil');
    this._rock(ctx, cam, 0.22, CFG.H - 120, 40, '#0a0b11', 2.3, 'floor');
    this._rock(ctx, cam, 0.42, CFG.H - 40, 52, '#060709', 6.2, 'floor');

    // faint distant glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(CFG.W * 0.5, CFG.H * 0.72, 0,
      CFG.W * 0.5, CFG.H * 0.72, CFG.W * 0.7);
    gg.addColorStop(0, 'rgba(30,20,55,0.10)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.restore();
  },

  _rock(ctx, cam, factor, baseY, amp, color, seed, dir) {
    const off = cam.x * factor;
    const step = 70;
    const start = Math.floor((off - 140) / step) * step;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    if (dir === 'ceil') {
      ctx.moveTo(-10, -10);
      for (let x = start; x <= off + CFG.W + 140; x += step) {
        const y = baseY
          + Math.sin(x * 0.008 + seed) * amp
          + Math.sin(x * 0.031 + seed * 2.2) * amp * 0.4;
        ctx.lineTo(x - off, y);
      }
      ctx.lineTo(CFG.W + 10, -10);
    } else {
      ctx.moveTo(-10, CFG.H + 10);
      for (let x = start; x <= off + CFG.W + 140; x += step) {
        const y = baseY
          + Math.sin(x * 0.007 + seed) * amp
          + Math.sin(x * 0.025 + seed * 1.7) * amp * 0.5;
        ctx.lineTo(x - off, y);
      }
      ctx.lineTo(CFG.W + 10, CFG.H + 10);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  /* ---------- level geometry ---------- */
  geometry(ctx, cam, level) {
    for (const s of level.solids) {
      if (s.isGate) continue;
      if (s.x > cam.x + CFG.W + 240 || s.x + s.w < cam.x - 240) continue;
      this._platform(ctx, s);
    }
    for (const o of level.oneways) {
      if (o.x > cam.x + CFG.W + 120 || o.x + o.w < cam.x - 120) continue;
      this._plank(ctx, o);
    }
    for (const h of level.hazards) {
      if (h.x > cam.x + CFG.W + 120 || h.x + h.w < cam.x - 120) continue;
      this._spikes(ctx, h);
    }
    if (level.gate && !level.gate.open) this._gate(ctx, level.gate);
  },

  /* Bone portcullis for the guardian arena. */
  _gate(ctx, g) {
    ctx.save();
    ctx.fillStyle = '#161a20';
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = 'rgba(190,182,160,0.55)';
    for (let y = g.y + 6; y < g.y + g.h - 6; y += 26) {
      ctx.fillRect(g.x + 3, y, g.w - 6, 5);
    }
    ctx.fillStyle = 'rgba(120,110,95,0.75)';
    ctx.fillRect(g.x + 2, g.y, 4, g.h);
    ctx.fillRect(g.x + g.w - 6, g.y, 4, g.h);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(g.x, g.y + g.h - 10, g.w, 10);
    ctx.restore();
  },

  _platform(ctx, s) {
    const h = Math.min(s.h, 520);

    // dark base so any transparent texture pixels fall back to stone
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(s.x, s.y, s.w, h);

    // textured rock body
    if (Assets.rockTile) {
      if (!this._rockPat) this._rockPat = ctx.createPattern(Assets.rockTile, 'repeat');
      if (this._rockPat) {
        const tw = Assets.rockTile.width;
        const th = Assets.rockTile.height;
        const ox = ((s.x * 7 + s.y * 13) % tw + tw) % tw;
        const oy = ((s.x * 3 + s.y * 5) % th + th) % th;
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, h);
        ctx.clip();
        ctx.translate(s.x - ox, s.y - oy);
        ctx.fillStyle = this._rockPat;
        ctx.fillRect(0, 0, s.w + tw, h + th);
        ctx.restore();
      }
    }

    // tonal overlay keeps it moody and hides the pattern's symmetry
    const g = ctx.createLinearGradient(0, s.y, 0, s.y + h);
    g.addColorStop(0, 'rgba(26,32,48,0.10)');
    g.addColorStop(0.45, 'rgba(6,8,14,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0.74)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, h);

    // mossy top cap
    this._mossCap(ctx, s);

    // side rims
    ctx.fillStyle = 'rgba(120,140,160,0.06)';
    ctx.fillRect(s.x, s.y, 2, h);
    ctx.fillRect(s.x + s.w - 2, s.y, 2, h);
  },

  _mossCap(ctx, s) {
    const capH = Assets.mossTile ? Assets.mossTile.height : 14;
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x, s.y, s.w, capH);
    ctx.clip();
    if (Assets.mossTile) {
      if (!this._mossPat) this._mossPat = ctx.createPattern(Assets.mossTile, 'repeat-x');
      if (this._mossPat) {
        const mw = Assets.mossTile.width;
        const ox = ((s.x * 5) % mw + mw) % mw;
        ctx.translate(s.x - ox, s.y);
        ctx.fillStyle = this._mossPat;
        ctx.fillRect(0, 0, s.w + mw, capH);
      }
    } else {
      ctx.fillStyle = '#2a3a30';
      ctx.fillRect(s.x, s.y, s.w, capH);
    }
    ctx.restore();

    // highlight the cap, then fade it into the rock below
    const g = ctx.createLinearGradient(0, s.y, 0, s.y + capH);
    g.addColorStop(0, 'rgba(190,220,210,0.14)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, capH);
  },

  _plank(ctx, o) {
    ctx.fillStyle = '#241c16';
    ctx.fillRect(o.x, o.y, o.w, 12);
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(o.x, o.y, o.w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(o.x, o.y + 9, o.w, 3);
    // nails
    ctx.fillStyle = '#7a6a4a';
    ctx.fillRect(o.x + 4, o.y + 4, 2, 2);
    ctx.fillRect(o.x + o.w - 6, o.y + 4, 2, 2);
  },

  _spikes(ctx, h) {
    const n = Math.max(1, Math.floor(h.w / 12));
    const w = h.w / n;
    ctx.save();
    ctx.fillStyle = '#3a3f47';
    ctx.strokeStyle = '#0a0b0e';
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const x = h.x + i * w;
      ctx.beginPath();
      ctx.moveTo(x, h.y + h.h);
      ctx.lineTo(x + w / 2, h.y);
      ctx.lineTo(x + w, h.y + h.h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,30,30,0.5)';
    for (let i = 0; i < n; i++) {
      const x = h.x + i * w + w / 2;
      ctx.beginPath();
      ctx.arc(x, h.y + 2, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  /* ---------- props / torches / exit ---------- */
  props(ctx, cam, level) {
    for (const p of level.props) {
      if (p.x > cam.x + CFG.W + 200 || p.x < cam.x - 200) continue;
      if (p.type === 'bones') this._bones(ctx, p.x, p.y);
      else if (p.type === 'pillar') this._pillar(ctx, p.x, p.y);
      else if (p.type === 'web') this._web(ctx, p.x, p.y);
      else if (p.type === 'statue') this._statue(ctx, p.x, p.y);
    }
  },

  _bones(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(190,185,165,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = -0.5 + i * 0.34;
      ctx.beginPath();
      ctx.moveTo(-14, -2 + i * 3);
      ctx.lineTo(14 * Math.cos(a), -2 + i * 3 + 5 * Math.sin(a));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-17, -3, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  _pillar(ctx, x, y) {
    const g = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
    g.addColorStop(0, '#0a0b10');
    g.addColorStop(0.45, '#1a1d25');
    g.addColorStop(1, '#0a0b10');
    ctx.fillStyle = g;
    ctx.fillRect(x - 18, y - 320, 36, 320);
    ctx.fillStyle = '#22262e';
    ctx.fillRect(x - 22, y - 330, 44, 14);
    ctx.fillRect(x - 22, y - 12, 44, 12);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 320);
    ctx.lineTo(x - 6, y - 12);
    ctx.moveTo(x + 8, y - 320);
    ctx.lineTo(x + 8, y - 12);
    ctx.stroke();
  },

  _web(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(160,170,180,0.13)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 60, Math.sin(a) * 60);
      ctx.stroke();
    }
    for (let r = 16; r <= 56; r += 14) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  },

  _statue(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#151820';
    // plinth
    ctx.fillRect(x - 22, y - 20, 44, 20);
    // robed idol
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 20);
    ctx.lineTo(x - 10, y - 80);
    ctx.lineTo(x - 4, y - 92);
    ctx.lineTo(x + 4, y - 92);
    ctx.lineTo(x + 10, y - 80);
    ctx.lineTo(x + 16, y - 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(120,150,140,0.18)';
    ctx.beginPath();
    ctx.arc(x, y - 84, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  torches(ctx, cam, t) {
    for (const tr of Level.torches) {
      if (tr.x > cam.x + CFG.W + 80 || tr.x < cam.x - 80) continue;
      // bracket
      ctx.fillStyle = '#1d1712';
      ctx.fillRect(tr.x - 3, tr.y + 6, 6, 16);
      // flame (additive)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const f = 0.8 + 0.2 * Math.sin(t * 11 + tr.x) + Math.random() * 0.08;
      const g = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 22 * f);
      g.addColorStop(0, 'rgba(255,220,150,0.95)');
      g.addColorStop(0.4, 'rgba(255,140,40,0.55)');
      g.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 22 * f, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  exit(ctx, cam, t, active) {
    const e = Level.exit;
    if (e.x > cam.x + CFG.W + 120 || e.x < cam.x - 120) return;
    const x = e.x, y = e.y;
    // pedestal
    ctx.fillStyle = '#171a20';
    ctx.fillRect(x - 30, y - 34, 60, 34);
    ctx.fillStyle = '#242832';
    ctx.fillRect(x - 34, y - 40, 68, 8);
    // bowl
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.ellipse(x, y - 42, 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (active) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const f = 0.85 + 0.15 * Math.sin(t * 9) + Math.random() * 0.05;
      const g = ctx.createRadialGradient(x, y - 50, 0, x, y - 50, 62 * f);
      g.addColorStop(0, 'rgba(220,255,230,0.95)');
      g.addColorStop(0.3, 'rgba(120,255,190,0.6)');
      g.addColorStop(1, 'rgba(30,160,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - 50, 62 * f, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = t * (1.5 + i * 0.3) + i;
        ctx.fillStyle = 'rgba(160,255,210,0.5)';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * (10 + i * 3), y - 58 - i * 4, 2 + i * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(70,60,55,0.7)';
      ctx.beginPath();
      ctx.ellipse(x, y - 42, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /* ---------- darkness ---------- */
  darkness(ctx, cam, game) {
    const lc = this.lctx;
    const t = game.time;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, CFG.W, CFG.H);
    lc.fillStyle = 'rgba(2,1,4,0.965)';
    lc.fillRect(0, 0, CFG.W, CFG.H);
    lc.globalCompositeOperation = 'destination-out';

    const sx = cam.sx, sy = cam.sy;
    const toScreen = (wx, wy) => ({ x: wx - cam.x + sx, y: wy - cam.y + sy });

    const p = game.player;
    const ps = toScreen(p.x, p.y - 40);
    const flick = 0.93 + 0.07 * Math.sin(t * 9.3) + (Math.random() - 0.5) * 0.03;
    this._hole(lc, ps.x, ps.y, game.lightRadius() * flick, 1);

    if (game.boss && game.boss.state !== 'dead') {
      const bs = toScreen(game.boss.x, game.boss.y - game.boss.h * 0.55);
      this._hole(lc, bs.x, bs.y, 300, 0.7);
    }

    for (const tr of Level.torches) {
      const s = toScreen(tr.x, tr.y);
      const r = tr.r * (0.9 + 0.1 * Math.sin(t * 7 + tr.x));
      this._hole(lc, s.x, s.y, r, 0.9);
    }

    for (const e of game.embers) {
      if (e.taken) continue;
      const s = toScreen(e.x, e.y);
      this._hole(lc, s.x, s.y, 76, 0.85);
    }

    for (const c of game.checkpoints) {
      if (!c.active) continue;
      const s = toScreen(c.x, c.y - 76);
      this._hole(lc, s.x, s.y, 86, 0.8);
    }

    if (game.exitActive) {
      const e = Level.exit;
      const s = toScreen(e.x, e.y - 48);
      this._hole(lc, s.x, s.y, 170, 0.95);
    }

    ctx.drawImage(this.lightCanvas, 0, 0);
  },

  _hole(lc, x, y, r, strength) {
    const g = lc.createRadialGradient(x, y, r * 0.08, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + strength + ')');
    g.addColorStop(0.58, 'rgba(0,0,0,' + (strength * 0.88) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = g;
    lc.beginPath();
    lc.arc(x, y, r, 0, Math.PI * 2);
    lc.fill();
  },

  /* ---------- post effects ---------- */
  vignette(ctx, lowHealth) {
    ctx.drawImage(this.vignetteCanvas, 0, 0);
    if (lowHealth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(
        CFG.W / 2, CFG.H / 2, CFG.H * 0.25,
        CFG.W / 2, CFG.H / 2, CFG.H * 0.8
      );
      g.addColorStop(0, 'rgba(80,0,0,0)');
      g.addColorStop(1, 'rgba(110,0,10,' + (0.32 * lowHealth) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.restore();
    }
  },

  grain(ctx, t) {
    if (!this._pattern) this._pattern = ctx.createPattern(this.noise, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.16;
    const ox = (t * 173) % 160;
    const oy = (t * 121) % 160;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = this._pattern;
    ctx.fillRect(0, 0, CFG.W + 160, CFG.H + 160);
    ctx.restore();
  },
};
