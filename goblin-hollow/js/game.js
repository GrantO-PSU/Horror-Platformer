/* Main loop, state machine, HUD, menus */
import { CFG } from './config.js';
import { Input } from './input.js';
import { Snd } from './audio.js';
import { Assets } from './assets.js';
import { Sprites } from './sprites.js';
import { Level } from './level.js';
import { Player, Enemy, Ember, Checkpoint, Arrow, BowPickup, BossSkeleton, Camera, Particles, clamp, lerp } from './entities.js';
import { Render } from './render.js';

function drawText(ctx, str, x, y, opts = {}) {
  ctx.save();
  ctx.font = opts.font || '16px "Courier New", monospace';
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  if (opts.shadow) {
    ctx.shadowColor = opts.shadow;
    ctx.shadowBlur = opts.blur == null ? 10 : opts.blur;
  }
  ctx.fillStyle = opts.color || '#cfd6dd';
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function drawHeart(ctx, cx, cy, s, filled) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0.85);
  ctx.bezierCurveTo(-1.15, 0.05, -0.95, -0.95, 0, -0.36);
  ctx.bezierCurveTo(0.95, -0.95, 1.15, 0.05, 0, 0.85);
  ctx.closePath();
  if (filled) {
    const g = ctx.createLinearGradient(0, -1, 0, 1);
    g.addColorStop(0, '#e0475c');
    g.addColorStop(1, '#8c1626');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(220,40,60,0.6)';
    ctx.shadowBlur = 8;
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,210,220,0.28)';
    ctx.lineWidth = 0.12;
    ctx.stroke();
  }
  ctx.restore();
}

function drawEmberIcon(ctx, cx, cy, r, lit) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (lit) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
    g.addColorStop(0, 'rgba(180,255,230,0.9)');
    g.addColorStop(1, 'rgba(20,140,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,255,245,0.95)';
  } else {
    ctx.fillStyle = 'rgba(90,110,110,0.35)';
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArrowIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = '#cdb894';
  ctx.fillRect(-10, -1, 18, 2);
  ctx.fillStyle = '#e6e0cf';
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(4, -4);
  ctx.lineTo(4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8a4a3a';
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(-5, -4);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const Game = {
  canvas: null,
  ctx: null,
  state: 'loading',
  last: 0,
  time: 0,

  player: null,
  enemies: [],
  embers: [],
  checkpoints: [],
  collected: 0,
  exitActive: false,
  respawn: { x: 96, y: 980 },

  level: 1,
  boss: null,
  bossActive: false,
  bossDefeated: false,

  flashA: 0,
  flashColor: '255,255,255',
  lightBoost: 1,
  deathTimer: 0,
  heartbeatT: 0.5,
  hintT: 0,

  toastMsg: '',
  toastT: 0,
  toastDur: 1,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    Input.init(this.canvas);

    const resize = () => {
      const s = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
      this.canvas.style.width = CFG.W * s + 'px';
      this.canvas.style.height = CFG.H * s + 'px';
    };
    window.addEventListener('resize', resize);
    resize();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) Snd.pauseMusic();
      else Snd.resumeMusic();
    });

    const unlock = () => {
      Snd.init();
      Snd.resume();
      Snd.startDrone();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);

    Assets.load(() => {
      Level.build();
      Render.init();
      this.newRun();
      this.state = 'title';
      this.last = performance.now() / 1000;
      requestAnimationFrame((ts) => this.loop(ts));
    });
  },

  newRun() {
    this.level = 1;
    this.startLevel(1, {});
  },

  /* Build a stage from Level data and drop the player into it. */
  startLevel(n, opts = {}) {
    this.level = n;
    Level.build(n);
    Particles.clear();

    const sp = opts.spawn || Level.spawn;
    this.player = new Player(sp.x, sp.y);
    this.player.arrows = opts.arrows || 0;
    if (opts.health != null) this.player.health = clamp(opts.health, 1, this.player.maxHealth);
    this.bowTaken = !!opts.bowTaken;

    this.enemies = Level.enemySpawns.map((s, i) => new Enemy(s, i));
    this.boss = Level.bossSpawn ? new BossSkeleton(Level.bossSpawn) : null;
    this.bossActive = false;
    this.bossDefeated = false;
    this.embers = Level.emberSpawns.map((s) => new Ember(s.x, s.y));
    this.bowPickups = Level.bowSpawns.map((s) => new BowPickup(s.x, s.y));
    this.checkpoints = Level.checkpointSpawns.map((s) => new Checkpoint(s.x, s.y));
    if (this.checkpoints.length) this.checkpoints[0].active = true;

    this.arrows = [];
    this.collected = 0;
    this.exitActive = false;
    this.respawn = { x: sp.x, y: sp.y };
    this.flashA = 0;
    this.lightBoost = 1;
    this.deathTimer = 0;
    this.heartbeatT = 0.6;
    this.hintT = opts.hint === false ? 0 : 9;
    this.toastT = 0;
    Camera.reset(this.player);
  },

  goToLevel(n) {
    const carry = {
      arrows: this.player ? this.player.arrows : 0,
      bowTaken: this.bowTaken,
      health: this.player ? this.player.maxHealth : 3,
    };
    this.startLevel(n, carry);
    this.state = 'playing';
    Snd.blip();
    this.flash(0.5, '150,255,210');
    this.addShake(5, 0.4);
    this.toast(n === 2 ? 'LEVEL 2  —  THE SUNKEN VAULT' : 'Level ' + n, 3.4);
  },

  startRun() {
    this.newRun();
    this.state = 'playing';
    Snd.blip();
  },

  respawnAtCheckpoint() {
    const rp = this.respawn;
    const arrows = this.player ? this.player.arrows : 0;
    this.player = new Player(rp.x, rp.y);
    this.player.arrows = arrows;
    this.player.invuln = 1.4;
    this.player.health = this.player.maxHealth;
    this.arrows = [];
    // Reset an unfinished boss fight so the arena can't be entered half-cleared.
    if (this.boss && !this.bossDefeated) {
      this.boss = new BossSkeleton(Level.bossSpawn);
      this.bossActive = false;
      if (Level.gate) Level.gate.open = true;
    }
    this.state = 'playing';
    this.deathTimer = 0;
    this.flashA = 0;
    this.lightBoost = 1;
    this.heartbeatT = 0.6;
    Camera.reset(this.player);
    Particles.clear();
  },

  killPlayer() {
    if (!this.player || this.player.state === 'dead') return;
    this.player.state = 'dead';
    this.player.deadT = 0;
    this.player.vx = 0;
    this.player.vy = -300;
    this.deathTimer = 0;
    Snd.death();
    this.addShake(16, 0.5);
    this.flash(0.7, '120,0,10');
    Particles.blood(this.player.x, this.player.y - 40, 16);
  },

  addShake(mag, time) { Camera.add(mag, time); },

  onEnemyKilled(/* enemy */) {
    // hook for future score / drops
  },

  startBossFight(/* boss */) {
    if (this.bossActive) return;
    this.bossActive = true;
    if (Level.gate) Level.gate.open = false;
    Snd.sting();
    Snd.bossRoar();
    this.addShake(16, 0.7);
    this.flash(0.5, '170,20,20');
    this.lightBoost = 1.8;
    this.toast('THE GIANT SKELETON WAKES', 3.2);
  },

  onBossDefeated(/* boss */) {
    this.bossDefeated = true;
    this.exitActive = true;
    if (Level.gate) Level.gate.open = true;
    this.toast('The guardian falls — the brazier awakens', 3.8);
  },

  flash(a, color) {
    this.flashA = Math.max(this.flashA, a);
    this.flashColor = color || '255,255,255';
  },

  spawnArrow(p) {
    const dir = p.facing >= 0 ? 1 : -1;
    this.arrows.push(new Arrow(p.x + dir * 20, p.y - 46, dir));
  },

  toast(msg, dur) {
    this.toastMsg = msg;
    this.toastDur = dur || 2.2;
    this.toastT = this.toastDur;
  },

  lightRadius() {
    const p = this.player;
    const base = CFG.LIGHT_MIN + (CFG.LIGHT_R - CFG.LIGHT_MIN) * (p.health / p.maxHealth);
    return base * this.lightBoost;
  },

  /* ---------------------------------------------------------------- update */
  update(dt) {
    this.time += dt;

    if (Input.wasPressed('KeyM')) {
      const m = Snd.toggleMute();
      this.toast(m ? 'Sound off' : 'Sound on', 1.2);
    }

    if (this.toastT > 0) this.toastT -= dt;
    this.flashA = Math.max(0, this.flashA - dt * 2.6);
    this.lightBoost = lerp(this.lightBoost, 1, 1 - Math.exp(-2.2 * dt));

    const anyInput = Object.keys(Input.pressed).length > 0 || Input.mouse.pressed;

    if (this.state === 'loading') return;

    if (this.state === 'title') {
      if (anyInput) this.startRun();
      return;
    }

    if (this.state === 'paused') {
      if (Input.wasPressed('Escape', 'KeyP')) this.state = 'playing';
      return;
    }

    if (this.state === 'dead') {
      if (Input.wasPressed('KeyR', 'Space', 'Enter') || Input.mouse.pressed) {
        this.respawnAtCheckpoint();
      }
      return;
    }

    if (this.state === 'win') {
      if (Input.wasPressed('KeyR', 'Space', 'Enter') || Input.mouse.pressed) {
        this.newRun();
        this.state = 'title';
      }
      return;
    }

    /* ---- playing ---- */
    if (Input.wasPressed('Escape', 'KeyP')) {
      this.state = 'paused';
      return;
    }

    Level.updateMoving(dt);
    if (this.hintT > 0) this.hintT -= dt;

    this.player.update(dt, this);

    for (const en of this.enemies) en.update(dt, this);
    this.enemies = this.enemies.filter((e) =>
      !(e.state === 'dead' && e.deadT > (e.exploded ? 0.4 : 2.6)));

    if (this.boss) {
      this.boss.update(dt, this);
      if (this.boss.state === 'dead' && this.boss.deadT > 0.8) this.boss = null;
    }

    // Sword hits
    if (this.player.attackActive()) {
      const ab = this.player.attackBox();
      for (const en of this.enemies) {
        if (en.state === 'dead' || this.player.hitSet.has(en)) continue;
        if (Level.overlap(ab, en.box)) {
          this.player.hitSet.add(en);
          en.hit(this.player.x, this);
        }
      }
      if (this.boss && this.boss.state !== 'dead' && !this.player.hitSet.has(this.boss) &&
          Level.overlap(ab, this.boss.box)) {
        this.player.hitSet.add(this.boss);
        this.boss.hit(this.player.x, this);
      }
    }

    // Arrows
    for (const a of this.arrows) {
      a.update(dt);
      if (a.dead) continue;
      if (this.boss && this.boss.state !== 'dead' && Level.overlap(a.box, this.boss.box)) {
        this.boss.hit(a.x, this);
        a.dead = true;
        Snd.hit();
        Particles.boneBurst(a.x, a.y, 5);
        continue;
      }
      for (const en of this.enemies) {
        if (en.state === 'dead') continue;
        if (Level.overlap(a.box, en.box)) {
          en.hit(a.x, this);
          a.dead = true;
          Snd.hit();
          Particles.boneBurst(a.x, a.y, 4);
          break;
        }
      }
    }
    this.arrows = this.arrows.filter((a) => !a.dead);

    // Giant skeleton contact (not during its hit recovery)
    if (this.boss && this.boss.state !== 'dead' &&
        this.boss.stun <= 0 && this.boss.hitFlash <= 0 &&
        this.player.state !== 'dead') {
      if (Level.overlap(this.player.box, this.boss.box)) {
        this.player.takeHit(1, this.boss.x, this);
      }
    }

    // Enemy contact: only a visible lunge attack hurts, not passive body overlap
    if (this.player.state !== 'dead') {
      const pb = this.player.box;
      for (const en of this.enemies) {
        if (en.state === 'dead' || en.stun > 0 || en.hitFlash > 0) continue;
        if (en.atkT <= 0) continue;
        if (Level.overlap(pb, en.box)) {
          if (this.player.takeHit(1, en.x, this)) break;
        }
      }
    }

    // Embers
    for (const e of this.embers) {
      e.update(dt);
      if (e.taken) continue;
      const dx = e.x - this.player.x;
      const dy = e.y - (this.player.y - 34);
      if (dx * dx + dy * dy < 46 * 46 && this.player.state !== 'dead') {
        e.taken = true;
        this.collected++;
        Snd.pickup();
        Particles.sparkle(e.x, e.y, 20);
        this.flash(0.18, '150,255,220');
        if (this.collected >= 3 && !this.exitActive) {
          this.exitActive = true;
          this.toast('The brazier awakens — return to it', 3.4);
        } else {
          this.toast('Ember recovered   ' + this.collected + '/3');
        }
      }
    }

    // Bow pickups
    for (const b of this.bowPickups) {
      b.update(dt);
      if (b.taken) continue;
      const dx = b.x - this.player.x;
      const dy = b.y - (this.player.y - 34);
      if (dx * dx + dy * dy < 48 * 48 && this.player.state !== 'dead') {
        b.taken = true;
        this.bowTaken = true;
        this.player.giveBow(CFG.BOW_PICKUP_AMMO);
        Snd.pickup();
        Particles.sparkle(b.x, b.y, 18);
        this.flash(0.14, '255,200,140');
        this.toast('Bow acquired   +' + CFG.BOW_PICKUP_AMMO + ' arrows', 2.8);
      }
    }

    // Checkpoints
    for (const c of this.checkpoints) {
      c.update(dt);
      if (c.active) continue;
      const dx = c.x - this.player.x;
      const dy = (c.y - 40) - (this.player.y - 30);
      if (dx * dx + dy * dy < 54 * 54 && this.player.state !== 'dead') {
        c.active = true;
        this.respawn = { x: c.x, y: c.y };
        this.player.health = this.player.maxHealth;
        Snd.checkpoint();
        Particles.sparkle(c.x, c.y - 72, 14);
        this.toast('Checkpoint lit');
      }
    }

    // Jump-scare triggers
    for (const tz of Level.triggerZones) {
      if (tz.used) continue;
      if (this.player.x > tz.x && this.player.x < tz.x + tz.w + 30 && this.player.y > tz.y) {
        tz.used = true;
        this.scare(tz);
      }
    }

    // Exit
    if (this.exitActive && this.player.state !== 'dead') {
      if (Level.overlap(this.player.box, Level.exit.box)) {
        if (this.level === 1) {
          this.goToLevel(2);
          return;
        }
        this.state = 'win';
        Snd.brazier();
        this.flash(0.85, '160,255,200');
        this.addShake(6, 0.4);
        return;
      }
    }

    // Death timing
    if (this.player.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer > 1.3) this.state = 'dead';
    }

    // Camera + atmosphere
    let lift = 0;
    if (this.boss && !this.boss.exploded) {
      lift = clamp((this.boss.groundY - this.boss.y) * 0.55, 0, 130);
    }
    Camera.update(dt, this.player, this.player.facing, lift);

    let nearest = 9999;
    for (const en of this.enemies) {
      if (en.state === 'dead') continue;
      nearest = Math.min(nearest, Math.abs(en.x - this.player.x));
    }
    if (this.boss && this.boss.state !== 'dead') {
      nearest = Math.min(nearest, Math.abs(this.boss.x - this.player.x));
    }
    const prox = clamp(1 - nearest / 420, 0, 1);
    const low = 1 - this.player.health / this.player.maxHealth;
    const tension = clamp(low * 0.8 + prox * 0.55, 0, 1);
    Snd.setTension(tension);
    this.heartbeatT -= dt;
    if (this.heartbeatT <= 0) {
      if (tension > 0.12) {
        Snd.heartbeat(tension);
        this.heartbeatT = 1.7 - tension * 1.15;
      } else {
        this.heartbeatT = 0.4;
      }
    }
    Snd.ambient(dt, tension);

    Particles.update(dt);
  },

  scare(tz) {
    const p = this.player;
    const spawn = { x: p.x + 235, y: p.y - 230, min: p.x + 70, max: p.x + 390 };
    const en = new Enemy(spawn, 1);
    en.state = 'chase';
    en.hp = 2;
    en.lungeCd = 0;
    this.enemies.push(en);
    Snd.sting();
    this.addShake(18, 0.6);
    this.flash(0.6, '190,10,20');
    this.lightBoost = 2.1;
    Particles.darkBurst(spawn.x, spawn.y - 40, 22);
  },

  /* ---------------------------------------------------------------- draw */
  loop(ts) {
    requestAnimationFrame((t) => this.loop(t));
    const now = ts / 1000;
    let dt = now - this.last;
    this.last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;

    this.update(dt);
    this.draw();
    Input.endFrame();
  },

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, CFG.W, CFG.H);
    ctx.fillStyle = '#030308';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    if (this.state === 'loading') {
      drawText(ctx, 'Entering the Hollow...', CFG.W / 2, CFG.H / 2, {
        align: 'center', color: '#8b93a0', font: '20px "Courier New", monospace',
      });
      return;
    }

    if (this.state === 'title') {
      this.drawTitle();
      return;
    }

    // --- world ---
    Render.background(ctx, Camera);
    ctx.save();
    ctx.translate(-Camera.x + Camera.sx, -Camera.y + Camera.sy);
    Render.geometry(ctx, Camera, Level);
    Render.props(ctx, Camera, Level);
    Render.torches(ctx, Camera, this.time);
    Render.exit(ctx, Camera, this.time, this.exitActive);
    for (const e of this.embers) e.draw(ctx);
    for (const b of this.bowPickups) b.draw(ctx);
    for (const c of this.checkpoints) c.draw(ctx);
    for (const en of this.enemies) en.draw(ctx, this.time);
    if (this.boss) this.boss.draw(ctx, this.time);
    for (const a of this.arrows) a.draw(ctx);
    this.player.draw(ctx, this.time);
    Particles.draw(ctx);
    ctx.restore();

    // --- darkness ---
    Render.darkness(ctx, Camera, this);

    // --- glow pass that pierces the dark ---
    ctx.save();
    ctx.translate(-Camera.x + Camera.sx, -Camera.y + Camera.sy);
    for (const e of this.embers) if (!e.taken) e.draw(ctx);
    for (const b of this.bowPickups) if (!b.taken) b.draw(ctx);
    Render.torches(ctx, Camera, this.time);
    Render.exit(ctx, Camera, this.time, this.exitActive);
    for (const c of this.checkpoints) if (c.active) c.draw(ctx);
    for (const en of this.enemies) en.drawEyes(ctx, this.time);
    if (this.boss) this.boss.drawEyes(ctx, this.time);
    for (const a of this.arrows) a.draw(ctx);
    this.drawPlayerGlow(ctx);
    ctx.restore();

    const low = 1 - this.player.health / this.player.maxHealth;
    Render.vignette(ctx, low);
    Render.grain(ctx, this.time);

    if (this.flashA > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = 'rgba(' + this.flashColor + ',1)';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.restore();
    }

    this.drawHUD();

    if (this.state === 'paused') this.drawPause();
    else if (this.state === 'dead') this.drawDead();
    else if (this.state === 'win') this.drawWin();
  },

  drawPlayerGlow(ctx) {
    const p = this.player;
    if (p.state === 'dead') return;
    const r = this.lightRadius() * 0.62;
    const g = ctx.createRadialGradient(p.x, p.y - 40, 0, p.x, p.y - 40, r);
    g.addColorStop(0, 'rgba(255,190,110,0.10)');
    g.addColorStop(0.5, 'rgba(255,150,70,0.05)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 40, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  drawHUD() {
    const ctx = this.ctx;
    const p = this.player;

    // hearts
    for (let i = 0; i < p.maxHealth; i++) {
      drawHeart(ctx, 34 + i * 34, 32, 12, i < p.health);
    }

    // embers (level 1 objective)
    if (this.level === 1) {
      for (let i = 0; i < 3; i++) {
        drawEmberIcon(ctx, 34 + i * 30, 70, 7, i < this.collected);
      }
      drawText(ctx, 'EMBERS', 34, 96, {
        font: '11px "Courier New", monospace', color: 'rgba(170,190,190,0.65)',
      });
    }

    // bow / arrows
    if (this.bowTaken) {
      drawArrowIcon(ctx, 38, 126, 1);
      drawText(ctx, 'ARROWS  ' + p.arrows, 56, 131, {
        font: '13px "Courier New", monospace',
        color: p.arrows > 0 ? 'rgba(235,214,175,0.9)' : 'rgba(150,145,135,0.55)',
      });
    }

    // objective
    let obj;
    if (this.level === 1) {
      obj = this.exitActive ? 'Reach the brazier' : 'Gather the three embers';
    } else {
      obj = this.exitActive
        ? 'Reach the brazier'
        : (this.bossActive ? 'Fell the giant skeleton' : 'Descend into the vault');
    }
    drawText(ctx, obj, CFG.W - 24, 34, {
      align: 'right', font: '14px "Courier New", monospace',
      color: this.exitActive ? 'rgba(150,255,210,0.9)' : 'rgba(180,190,200,0.7)',
      shadow: this.exitActive ? 'rgba(60,220,160,0.6)' : null, blur: 10,
    });

    this.drawBossBar();

    if (this.hintT > 0) {
      const a = clamp(this.hintT / 9, 0, 1);
      const atk = (this.bowTaken && p.arrows > 0) ? 'J / CLICK  shoot' : 'J / CLICK  attack';
      drawText(ctx, 'A / D  move      W / SPACE  jump      ' + atk, CFG.W / 2, CFG.H - 26, {
        align: 'center', font: '13px "Courier New", monospace',
        color: 'rgba(200,205,215,0.8)', alpha: a,
      });
      drawText(ctx, 'Esc pause    M mute', CFG.W / 2, CFG.H - 48, {
        align: 'center', font: '11px "Courier New", monospace',
        color: 'rgba(160,170,180,0.55)', alpha: a,
      });
    }

    if (this.toastT > 0) {
      const alpha = clamp(this.toastT / 0.4, 0, 1);
      drawText(ctx, this.toastMsg, CFG.W / 2, 128, {
        align: 'center', font: '17px "Courier New", monospace',
        color: '#dfe7e4', alpha: alpha,
        shadow: 'rgba(0,0,0,0.9)', blur: 8,
      });
    }
  },

  drawBossBar() {
    const b = this.boss;
    if (!b || !this.bossActive || b.state === 'dead') return;
    const ctx = this.ctx;
    const w = 420;
    const h = 12;
    const x = (CFG.W - w) / 2;
    const y = 64;

    drawText(ctx, 'THE GIANT SKELETON', CFG.W / 2, y - 10, {
      align: 'center', font: 'bold 15px "Courier New", monospace',
      color: 'rgba(240,224,202,0.95)', shadow: 'rgba(170,20,20,0.85)', blur: 12,
    });

    ctx.save();
    ctx.fillStyle = 'rgba(8,6,10,0.75)';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = 'rgba(52,12,16,0.9)';
    ctx.fillRect(x, y, w, h);

    const f = clamp(b.hp / b.maxHp, 0, 1);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#7d1120');
    g.addColorStop(0.6, '#d13a42');
    g.addColorStop(1, '#ff8a68');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * f, h);

    ctx.strokeStyle = 'rgba(232,198,182,0.38)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.restore();
  },

  drawTitle() {
    const ctx = this.ctx;
    const cam = { x: this.time * 24, y: 0, sx: 0, sy: 0 };
    Render.background(ctx, cam);

    const cx = CFG.W * 0.5;
    const cy = CFG.H * 0.88;

    // lantern glow behind the goblin
    const flick = 0.8 + 0.2 * Math.sin(this.time * 6) + Math.random() * 0.05;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy - 90, 0, cx, cy - 90, 250 * flick);
    g.addColorStop(0, 'rgba(255,170,90,0.16)');
    g.addColorStop(0.5, 'rgba(150,80,40,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.restore();

    const frame = Sprites.frame('idle', this.time * 0.9);
    Sprites.drawLayers(ctx, Assets.playerLook(), frame, cx, cy, false, 4.2, 1);

    // title flicker
    let a = 0.86 + 0.14 * Math.sin(this.time * 2.7);
    if (Math.random() < 0.035) a *= 0.45;
    drawText(ctx, "GOBLIN'S HOLLOW", CFG.W / 2, 132, {
      align: 'center', font: 'bold 62px Georgia, "Times New Roman", serif',
      color: '#e9e3d4', shadow: 'rgba(150,20,30,0.85)', blur: 26,
      alpha: clamp(a, 0.35, 1),
    });
    drawText(ctx, 'a  h o r r o r   p l a t f o r m e r', CFG.W / 2, 172, {
      align: 'center', font: '15px "Courier New", monospace',
      color: 'rgba(190,180,170,0.75)',
    });

    const pulse = 0.55 + 0.45 * Math.sin(this.time * 3.4);
    drawText(ctx, 'PRESS ANY KEY', CFG.W / 2, CFG.H - 108, {
      align: 'center', font: '20px "Courier New", monospace',
      color: '#d7d2c6', alpha: clamp(pulse, 0.25, 1),
      shadow: 'rgba(160,30,40,0.5)', blur: 12,
    });

    drawText(ctx, 'A / D  move      W / SPACE  jump      J / CLICK  attack / shoot', CFG.W / 2, CFG.H - 52, {
      align: 'center', font: '13px "Courier New", monospace',
      color: 'rgba(190,195,205,0.65)',
    });
    drawText(ctx, 'Esc pause     R restart     M mute', CFG.W / 2, CFG.H - 28, {
      align: 'center', font: '12px "Courier New", monospace',
      color: 'rgba(150,160,170,0.5)',
    });

    Render.vignette(ctx, 0);
    Render.grain(ctx, this.time);
  },

  drawPause() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(3,3,6,0.68)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.restore();
    drawText(ctx, 'PAUSED', CFG.W / 2, CFG.H / 2 - 30, {
      align: 'center', font: 'bold 52px Georgia, serif', color: '#e6e0d2',
      shadow: 'rgba(120,20,30,0.7)', blur: 18,
    });
    drawText(ctx, 'Esc  or  P  to resume', CFG.W / 2, CFG.H / 2 + 26, {
      align: 'center', font: '17px "Courier New", monospace',
      color: 'rgba(200,205,215,0.8)',
    });
    drawText(ctx, 'A / D  move    W / SPACE  jump    J / CLICK  attack / shoot    M  mute', CFG.W / 2, CFG.H / 2 + 62, {
      align: 'center', font: '12px "Courier New", monospace',
      color: 'rgba(150,160,170,0.6)',
    });
  },

  drawDead() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(10,0,2,0.74)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.restore();

    drawText(ctx, 'THE DARK TAKES YOU', CFG.W / 2, CFG.H / 2 - 20, {
      align: 'center', font: 'bold 46px Georgia, serif', color: '#c9303f',
      shadow: 'rgba(180,10,20,0.8)', blur: 26,
    });
    const sub = this.level === 1
      ? 'Embers held: ' + this.collected + ' / 3'
      : 'The guardian still stands';
    drawText(ctx, sub, CFG.W / 2, CFG.H / 2 + 26, {
      align: 'center', font: '16px "Courier New", monospace',
      color: 'rgba(210,200,200,0.75)',
    });
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.6);
    drawText(ctx, 'Press  R  to rise again', CFG.W / 2, CFG.H / 2 + 78, {
      align: 'center', font: '20px "Courier New", monospace',
      color: '#e0d8d0', alpha: clamp(pulse, 0.3, 1),
    });
  },

  drawWin() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(2,10,6,0.72)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const g = ctx.createRadialGradient(CFG.W / 2, CFG.H / 2, 0, CFG.W / 2, CFG.H / 2, CFG.W * 0.7);
    g.addColorStop(0, 'rgba(60,220,160,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.restore();

    drawText(ctx, 'THE BRAZIER BURNS', CFG.W / 2, CFG.H / 2 - 30, {
      align: 'center', font: 'bold 48px Georgia, serif', color: '#bff7dd',
      shadow: 'rgba(40,220,150,0.8)', blur: 26,
    });
    drawText(ctx, 'You escaped the Hollow.', CFG.W / 2, CFG.H / 2 + 18, {
      align: 'center', font: '18px "Courier New", monospace',
      color: 'rgba(200,235,220,0.85)',
    });
    drawText(ctx, 'The giant skeleton is dust.', CFG.W / 2, CFG.H / 2 + 46, {
      align: 'center', font: '14px "Courier New", monospace',
      color: 'rgba(160,210,190,0.7)',
    });
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.2);
    drawText(ctx, 'Press  R  to descend again', CFG.W / 2, CFG.H / 2 + 100, {
      align: 'center', font: '18px "Courier New", monospace',
      color: '#d6efe4', alpha: clamp(pulse, 0.3, 1),
    });
  },
};

// Module scripts run after the document is parsed.
Game.init();

