/* Player, enemies, pickups, camera, particles */
import { CFG } from './config.js';
import { Input } from './input.js';
import { Snd } from './audio.js';
import { Assets } from './assets.js';
import { Sprites } from './sprites.js';
import { Level } from './level.js';

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }

/* ---------------------------------------------------------------- Player */
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = CFG.P_W;
    this.h = CFG.P_H;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.groundPlat = null;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumpCut = false;

    this.health = 3;
    this.maxHealth = 3;
    this.invuln = 0;

    this.state = 'normal'; // normal | attack | hurt | dead
    this.anim = 'idle';
    this.animT = 0;
    this.attackT = 0;
    this.cooldown = 0;
    this.hitSet = new Set();
    this.deadT = 0;
    this.stepT = 0;
    this.hurtT = 0;
  }

  get box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  setAnim(a) {
    if (this.anim !== a) {
      this.anim = a;
      this.animT = 0;
    }
  }

  update(dt, game) {
    this.animT += dt;
    this.cooldown -= dt;
    this.invuln -= dt;

    if (this.state === 'dead') {
      this.deadT += dt;
      this.vy += CFG.GRAVITY * dt;
      this.vy = Math.min(this.vy, CFG.MAX_FALL);
      Level.move(this, dt);
      this.setAnim('ko');
      return;
    }

    if (this.state === 'hurt') {
      this.hurtT -= dt;
      if (this.hurtT <= 0) this.state = 'normal';
    }
    if (this.state === 'attack') {
      this.attackT += dt;
      if (this.attackT >= CFG.ATTACK_TIME) this.state = 'normal';
    }

    // Ride moving platforms
    if (this.groundPlat && this.groundPlat.move) this.x += this.groundPlat.move.dx;

    const canControl = this.state !== 'hurt' || this.hurtT < 0.22;
    const left = canControl && Input.left();
    const right = canControl && Input.right();
    const dir = (right ? 1 : 0) - (left ? 1 : 0);

    const accel = this.onGround ? CFG.ACCEL : CFG.AIR_ACCEL;
    if (dir !== 0) {
      this.vx += dir * accel * dt;
      if (this.state !== 'attack' && this.state !== 'hurt') this.facing = dir;
    } else {
      const fric = (this.onGround ? CFG.FRICTION : CFG.FRICTION * 0.35) * dt;
      if (Math.abs(this.vx) <= fric) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * fric;
    }
    this.vx = clamp(this.vx, -CFG.MAX_RUN, CFG.MAX_RUN);

    // Jump buffering + coyote time
    if (this.onGround) this.coyote = CFG.COYOTE;
    else this.coyote -= dt;
    if (Input.jumpPressed()) this.jumpBuf = CFG.JUMP_BUFFER;
    else this.jumpBuf -= dt;

    if (this.jumpBuf > 0 && this.coyote > 0 && this.state !== 'hurt') {
      this.vy = -CFG.JUMP_V;
      this.jumpBuf = 0;
      this.coyote = 0;
      this.jumpCut = false;
      this.onGround = false;
      Snd.jump();
    }
    if (!Input.jumpHeld() && this.vy < 0 && !this.jumpCut) {
      this.vy *= CFG.JUMP_CUT;
      this.jumpCut = true;
    }
    if (this.onGround) this.jumpCut = false;

    // Attack
    if (Input.attackPressed() && this.cooldown <= 0 &&
        this.state !== 'hurt' && this.state !== 'attack') {
      this.state = 'attack';
      this.attackT = 0;
      this.hitSet.clear();
      this.cooldown = CFG.ATTACK_COOLDOWN;
      Snd.swing();
      if (this.onGround) this.vx *= 0.55;
    }

    // Gravity
    this.vy += CFG.GRAVITY * dt;
    this.vy = Math.min(this.vy, CFG.MAX_FALL);

    const wasAir = !this.onGround;
    Level.move(this, dt);

    // Land dust
    if (wasAir && this.onGround) {
      Particles.dust(this.x, this.y, 5);
    }

    // Footsteps
    if (this.onGround && Math.abs(this.vx) > 30) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        const surface = (this.groundPlat && this.groundPlat.isOneway) ? 'wood' : 'stone';
        Snd.step(surface);
        this.stepT = clamp(0.42 - Math.abs(this.vx) / 1600, 0.14, 0.42);
      }
    } else {
      this.stepT = 0;
    }

    // Hazards
    const hz = Level.hazardAt(this.box);
    if (hz && this.invuln <= 0) {
      this.takeHit(1, this.x + (this.vx >= 0 ? -40 : 40), game);
    }

    // Pit
    if (this.y > Level.deathY) {
      game.killPlayer();
      return;
    }

    // Animation selection
    if (this.state === 'attack') this.setAnim(this.onGround ? 'attack' : 'attackAir');
    else if (this.state === 'hurt') this.setAnim(this.onGround ? 'hurt' : 'hurtAir');
    else if (!this.onGround) this.setAnim(this.vy < 0 ? 'jump' : 'fall');
    else if (Math.abs(this.vx) > 22) this.setAnim('walk');
    else this.setAnim('idle');
  }

  attackActive() {
    return this.state === 'attack' && this.attackT > 0.07 && this.attackT < 0.26;
  }

  attackBox() {
    const reach = CFG.ATTACK_REACH;
    const x = this.facing > 0 ? this.x + 4 : this.x - 4 - reach;
    return { x, y: this.y - CFG.ATTACK_H, w: reach, h: CFG.ATTACK_H };
  }

  takeHit(dmg, fromX, game) {
    if (this.invuln > 0 || this.state === 'dead') return false;
    this.health -= dmg;
    this.invuln = CFG.INVULN;
    this.state = 'hurt';
    this.hurtT = 0.34;
    this.vx = (this.x < fromX ? -1 : 1) * 250;
    this.vy = -340;
    this.onGround = false;
    Snd.hurt();
    game.addShake(11, 0.35);
    game.flash(0.34, '120, 0, 16');
    Particles.blood(this.x, this.y - 40, 8);
    if (this.health <= 0) {
      this.health = 0;
      game.killPlayer();
    }
    return true;
  }

  draw(ctx, t) {
    const alpha = this.invuln > 0
      ? 0.45 + 0.55 * Math.abs(Math.sin(t * 16))
      : 1;
    const frame = Sprites.frame(this.anim, this.animT);
    Sprites.drawLayers(ctx, Assets.playerLook(), frame, this.x, this.y, this.facing < 0,
      CFG.SPRITE_SCALE, alpha);

    if (this.state === 'attack') {
      const p = clamp(this.attackT / CFG.ATTACK_TIME, 0, 1);
      const sp = clamp((p - 0.1) / 0.65, 0, 1);
      Sprites.drawSword(ctx, this.x, this.y, this.facing < 0, sp, CFG.SPRITE_SCALE);
    }
  }
}

/* ---------------------------------------------------------------- Enemy */
export class Enemy {
  constructor(spawn, tintIndex) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.w = 28;
    this.h = 66;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.min = spawn.min;
    this.max = spawn.max;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.facing = this.dir;
    this.hp = 2;
    this.state = 'patrol';
    this.anim = 'walk';
    this.animT = Math.random() * 2;
    this.tint = tintIndex || 0;
    this.hitFlash = 0;
    this.stun = 0;
    this.deadT = 0;
    this.lungeCd = 0.6;
    this.homeY = spawn.y;
    this.wander = 0;
  }

  get box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  update(dt, game) {
    this.animT += dt * (this.state === 'chase' ? 1.5 : 1);
    this.hitFlash -= dt;
    this.lungeCd -= dt;

    if (this.state === 'dead') {
      this.deadT += dt;
      this.vy += CFG.GRAVITY * dt;
      Level.move(this, dt);
      return;
    }

    if (this.stun > 0) {
      this.stun -= dt;
    } else {
      const p = game.player;
      const dist = p.x - this.x;
      const adist = Math.abs(dist);
      const playerAlive = p.state !== 'dead';

      if (playerAlive && adist < 255) {
        this.state = 'chase';
        this.facing = dist < 0 ? -1 : 1;
        this.vx = this.facing * 132;
        if (adist < 100 && this.lungeCd <= 0) {
          this.vx = this.facing * 300;
          this.vy = -180;
          this.lungeCd = 1.5;
          Snd.tone(140 + Math.random() * 60, 0.22, { type: 'sawtooth', gain: 0.05, to: 70 });
        }
      } else {
        this.state = 'patrol';
        // occasionally pause and turn
        this.wander -= dt;
        if (this.wander <= 0) {
          this.wander = 1.6 + Math.random() * 2.4;
          if (Math.random() < 0.35) this.dir *= -1;
        }
        this.facing = this.dir;
        this.vx = this.dir * 52;
      }

      // Keep them on their ledge
      if (this.x <= this.min + 4) { this.x = this.min + 4; this.dir = 1; }
      if (this.x >= this.max - 4) { this.x = this.max - 4; this.dir = -1; }
    }

    this.vy += CFG.GRAVITY * dt;
    this.vy = Math.min(this.vy, CFG.MAX_FALL);
    Level.move(this, dt);
    if (this.y > Level.deathY + 200) this.state = 'dead';
  }

  hit(fromX, game) {
    if (this.state === 'dead') return;
    this.hp--;
    this.hitFlash = 0.18;
    this.stun = 0.28;
    this.vx = (this.x < fromX ? -1 : 1) * 210;
    this.vy = -230;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadT = 0;
      Snd.enemyDie();
      game.addShake(7, 0.2);
      Particles.darkBurst(this.x, this.y - 34, 14);
      game.onEnemyKilled(this);
    } else {
      Snd.hit();
      Particles.darkBurst(this.x, this.y - 34, 6);
    }
  }

  draw(ctx, t) {
    const layers = Assets.enemyLook(this.tint);
    const frame = this.state === 'dead'
      ? Sprites.frame('ko', 0)
      : Sprites.frame(this.state === 'chase' ? 'walk' : 'walk', this.animT);
    const flip = this.facing < 0;
    Sprites.drawLayers(ctx, layers, frame, this.x, this.y, flip, CFG.SPRITE_SCALE, 1);

    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 2.2;
      ctx.fillStyle = 'rgba(255,150,150,0.8)';
      ctx.beginPath();
      ctx.arc(this.x, this.y - 36, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawEyes(ctx, t) {
    if (this.state === 'dead') return;
    Sprites.drawEyes(ctx, this.x, this.y, this.facing < 0, CFG.SPRITE_SCALE,
      this.state === 'chase' ? 'rgba(255,60,30,0.95)' : 'rgba(220,120,40,0.75)', t);
  }
}

/* ---------------------------------------------------------------- Ember */
export class Ember {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.t = Math.random() * 8;
    this.taken = false;
    this.pop = 0;
  }

  update(dt) { this.t += dt; if (this.pop > 0) this.pop -= dt; }

  draw(ctx) {
    if (this.taken) return;
    const bob = Math.sin(this.t * 2.1) * 4;
    const y = this.y + bob;
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 5);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, y, 0, this.x, y, 46 * pulse);
    g.addColorStop(0, 'rgba(180,255,230,0.9)');
    g.addColorStop(0.25, 'rgba(90,230,190,0.55)');
    g.addColorStop(1, 'rgba(20,120,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, y, 46 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(220,255,245,0.95)';
    ctx.beginPath();
    ctx.arc(this.x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- Checkpoint */
export class Checkpoint {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.active = false;
    this.t = Math.random() * 5;
  }

  update(dt) { this.t += dt; }

  draw(ctx) {
    const flick = 0.8 + 0.2 * Math.sin(this.t * 9);
    // post
    ctx.save();
    ctx.fillStyle = '#211a17';
    ctx.fillRect(this.x - 4, this.y - 66, 8, 66);
    ctx.fillStyle = '#3a2f28';
    ctx.fillRect(this.x - 9, this.y - 70, 18, 6);
    // lantern
    ctx.fillStyle = this.active ? '#ffcf7a' : '#4a4238';
    ctx.beginPath();
    ctx.moveTo(this.x - 7, this.y - 66);
    ctx.lineTo(this.x + 7, this.y - 66);
    ctx.lineTo(this.x + 5, this.y - 86);
    ctx.lineTo(this.x - 5, this.y - 86);
    ctx.closePath();
    ctx.fill();

    if (this.active) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this.x, this.y - 76, 0, this.x, this.y - 76, 42 * flick);
      g.addColorStop(0, 'rgba(255,200,110,0.85)');
      g.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 76, 42 * flick, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- Camera */
export const Camera = {
  x: 0,
  y: 0,
  sx: 0,
  sy: 0,
  shakeMag: 0,
  shakeTime: 0,

  reset(p) {
    this.x = clamp(p.x - CFG.W / 2, 0, Math.max(0, Level.w - CFG.W));
    this.y = clamp(p.y - CFG.H * 0.62, 0, Math.max(0, Level.h - CFG.H));
    this.sx = this.sy = 0;
    this.shakeMag = this.shakeTime = 0;
  },

  update(dt, p, facing) {
    const tx = p.x - CFG.W / 2 + facing * 46;
    const ty = p.y - CFG.H * 0.62;
    const k = 1 - Math.exp(-CFG.CAM_LERP * dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this.x = clamp(this.x, 0, Math.max(0, Level.w - CFG.W));
    this.y = clamp(this.y, 0, Math.max(0, Level.h - CFG.H));

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const m = this.shakeMag * Math.max(0, this.shakeTime);
      this.sx = (Math.random() * 2 - 1) * m;
      this.sy = (Math.random() * 2 - 1) * m;
    } else {
      this.sx = this.sy = 0;
      this.shakeMag = 0;
    }
  },

  add(mag, time) {
    this.shakeMag = Math.max(this.shakeMag, mag / Math.max(0.05, time));
    this.shakeTime = Math.max(this.shakeTime, time);
  },
};

/* ---------------------------------------------------------------- Particles */
export const Particles = {
  list: [],

  clear() { this.list.length = 0; },

  add(p) {
    if (this.list.length > 380) this.list.shift();
    this.list.push(p);
  },

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.add({
        x, y: y - 2, vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 60,
        life: 0.5 + Math.random() * 0.4, max: 0.9, grav: 320,
        size: 1.5 + Math.random() * 2, color: 'rgba(120,110,95,',
      });
    }
  },

  blood(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.add({
        x, y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 200,
        life: 0.5 + Math.random() * 0.5, max: 1, grav: 700,
        size: 2 + Math.random() * 2.5, color: 'rgba(150,20,30,',
      });
    }
  },

  darkBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.add({
        x, y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200,
        life: 0.4 + Math.random() * 0.5, max: 0.9, grav: 60,
        size: 2 + Math.random() * 3, color: 'rgba(120,60,190,',
      });
    }
  },

  sparkle(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.add({
        x, y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160,
        life: 0.4 + Math.random() * 0.5, max: 0.9, grav: -20,
        size: 1.5 + Math.random() * 2.5, color: 'rgba(140,255,220,',
      });
    }
  },

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  },

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color + (a * 0.9) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};
