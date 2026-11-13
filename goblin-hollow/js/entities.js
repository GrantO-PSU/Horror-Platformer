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

    this.arrows = 0;
    this.bowCd = 0;
    this.shootT = 0;
  }

  get box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  giveBow(n) {
    this.arrows += n;
    this.shootT = 0.18;
  }

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
    this.bowCd -= dt;
    if (this.shootT > 0) this.shootT -= dt;

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

    // Attack (bow when arrows are left, otherwise sword)
    if (Input.attackPressed() && this.state !== 'hurt' && this.state !== 'attack') {
      if (this.arrows > 0) {
        if (this.bowCd <= 0) {
          this.bowCd = CFG.BOW_COOLDOWN;
          this.arrows--;
          this.shootT = 0.18;
          Snd.bow();
          game.spawnArrow(this);
          if (this.onGround) this.vx *= 0.86;
        }
      } else if (this.cooldown <= 0) {
        this.state = 'attack';
        this.attackT = 0;
        this.hitSet.clear();
        this.cooldown = CFG.ATTACK_COOLDOWN;
        Snd.swing();
        if (this.onGround) this.vx *= 0.55;
      }
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

    if (this.arrows > 0 || this.shootT > 0) {
      const pull = clamp(this.shootT / 0.18, 0, 1);
      Sprites.drawBow(ctx, this.x, this.y, this.facing < 0, pull);
    }

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
    this.w = 32;
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
    this.atkT = 0;
    this.tint = tintIndex || 0;
    this.hitFlash = 0;
    this.stun = 0;
    this.deadT = 0;
    this.exploded = false;
    this.lungeCd = 0.6;
    this.homeY = spawn.y;
    this.wander = 0;
  }

  get box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  /* Leap at the player: strong horizontal commit, extra lift if they're above. */
  lungeAt(p) {
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    this.facing = dx < 0 ? -1 : 1;
    this.vx = this.facing * 330;
    const above = clamp(-dy, 0, 180);
    const below = clamp(dy, 0, 180);
    this.vy = -(170 + above * 0.55) + below * 0.45;
    this.atkT = 0.34;
    this.lungeCd = 1.5;
    Snd.tone(140 + Math.random() * 60, 0.22, { type: 'sawtooth', gain: 0.05, to: 70 });
  }

  setAnim(a) {
    if (this.anim !== a) {
      this.anim = a;
      this.animT = 0;
    }
  }

  update(dt, game) {
    this.animT += dt;
    this.hitFlash -= dt;
    this.lungeCd -= dt;
    if (this.atkT > 0) this.atkT -= dt;

    if (this.state === 'dead') {
      this.deadT += dt;
      if (this.exploded) return;     // gone in the blast, no corpse
      this.vy += CFG.GRAVITY * dt;
      Level.move(this, dt);
      return;
    }

    if (this.stun > 0) {
      this.stun -= dt;
    } else if (this.atkT > 0) {
      // committed lunge: let the leap carry through
    } else {
      const p = game.player;
      const dist = p.x - this.x;
      const adist = Math.abs(dist);
      const playerAlive = p.state !== 'dead';

      if (playerAlive && adist < 255) {
        this.state = 'chase';
        this.facing = dist < 0 ? -1 : 1;
        this.vx = this.facing * 132;
        if (adist < 140 && this.lungeCd <= 0) {
          this.lungeAt(p);
        } else if (this.onGround) {
          // Don't stroll off the ledge, but never teleport the skeleton back.
          if ((this.x <= this.min + 4 && this.vx < 0) ||
              (this.x >= this.max - 4 && this.vx > 0)) {
            this.vx = 0;
          }
        }
      } else {
        this.state = 'patrol';
        // occasionally pause and turn
        this.wander -= dt;
        if (this.wander <= 0) {
          this.wander = 1.6 + Math.random() * 2.4;
          if (Math.random() < 0.35) this.dir *= -1;
        }
        // turn around at the patrol edge instead of snapping position
        if (this.x <= this.min + 4) this.dir = 1;
        if (this.x >= this.max - 4) this.dir = -1;
        this.facing = this.dir;
        this.vx = this.dir * 52;
      }
    }

    this.vy += CFG.GRAVITY * dt;
    this.vy = Math.min(this.vy, CFG.MAX_FALL);
    Level.move(this, dt);
    if (this.y > Level.deathY + 200) this.state = 'dead';

    if (this.atkT > 0) this.setAnim('attack');
    else if (Math.abs(this.vx) > 10) this.setAnim('walk');
    else this.setAnim('idle');
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
      this.exploded = true;
      this.vx = 0;
      this.vy = 0;
      this.atkT = 0;
      Snd.explode();
      game.addShake(12, 0.3);
      game.flash(0.14, '255,214,170');
      game.lightBoost = Math.max(game.lightBoost, 1.4);
      Particles.boneBurst(this.x, this.y - 34, 30);
      game.onEnemyKilled(this);
    } else {
      Snd.hit();
      Particles.boneBurst(this.x, this.y - 34, 5);
    }
  }

  draw(ctx, t) {
    if (this.exploded) return;
    const img = Assets.enemyLook(this.tint)[0].img;
    const frame = this.state === 'dead'
      ? Sprites.enemyFrame('dead', this.deadT)
      : Sprites.enemyFrame(this.anim, this.animT);
    Sprites.drawEnemy(ctx, img, frame, this.x, this.y, this.facing < 0, CFG.ENEMY_SCALE, 1);

    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 2.2;
      ctx.fillStyle = 'rgba(255,150,150,0.8)';
      ctx.beginPath();
      ctx.arc(this.x, this.y - 44, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* Skull eye sockets glowing through the dark. Offsets match the sheet art
     (eyes sit ~8.5px left / 3px right of the head centre, at y = 26.5). */
  drawEyes(ctx, t) {
    if (this.state === 'dead') return;
    const s = CFG.ENEMY_SCALE;
    const f = this.facing < 0 ? -1 : 1;
    const ey = this.y - 34.5 * s;
    const blink = 0.7 + 0.3 * Math.sin(t * 4 + this.x * 0.02);
    const color = this.state === 'chase'
      ? 'rgba(255, 46, 26, 0.95)'
      : 'rgba(228, 116, 42, 0.8)';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.arc(this.x + f * -8.5 * s, ey, 1.7 * s, 0, Math.PI * 2);
    ctx.arc(this.x + f * 3 * s, ey, 1.7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- BossSkeleton */
/* Giant skeleton miniboss: slow stalk, telegraphed slam, big bone explosion. */
export class BossSkeleton {
  constructor(spawn) {
    this.spawn = spawn;
    this.x = spawn.x;
    this.y = spawn.y;
    this.groundY = spawn.y;
    this.ignoreOneways = true;   // the giant stomps through planks
    this.w = 100;
    this.h = 190;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.groundPlat = null;
    this.min = spawn.min;
    this.max = spawn.max;
    this.facing = -1;
    this.hp = CFG.BOSS_HP;
    this.maxHp = CFG.BOSS_HP;
    this.state = 'dormant';
    this.anim = 'idle';
    this.animT = 0;
    this.scale = CFG.BOSS_SCALE;
    this.hitFlash = 0;
    this.deadT = 0;
    this.exploded = false;
    this.aggro = false;
    this.telegraph = 0;
    this.recover = 0;
    this.slamCd = 2.2;
    this.hopCd = 1.1;
    this.slamLeap = false;
    this.stun = 0;
    this.wasAir = false;
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
    this.hitFlash -= dt;

    if (this.state === 'dead') {
      this.deadT += dt;
      return;
    }

    const p = game.player;

    if (!this.aggro) {
      if (p.state !== 'dead' && Math.abs(p.x - this.x) < 560) {
        this.aggro = true;
        game.startBossFight(this);
      } else {
        this.setAnim('idle');
        this.vy += CFG.GRAVITY * dt;
        this.vy = Math.min(this.vy, CFG.MAX_FALL);
        Level.move(this, dt);
        return;
      }
    }

    this.slamCd -= dt;
    this.hopCd -= dt;

    if (this.stun > 0) {
      this.stun -= dt;
      this.vx *= 0.9;
    } else if (this.telegraph > 0) {
      this.telegraph -= dt;
      this.vx = 0;
      this.setAnim('attack');
      if (this.telegraph <= 0) {
        this.vx = this.facing * CFG.BOSS_SLAM_SPEED;
        this.vy = -250;
        this.onGround = false;
        this.wasAir = true;
        this.slamLeap = true;
        Snd.bossSlam();
        game.addShake(8, 0.22);
      }
    } else if (this.recover > 0) {
      this.recover -= dt;
      this.vx *= 0.86;
      this.setAnim('idle');
    } else {
      const d = p.x - this.x;
      const ad = Math.abs(d);
      this.facing = d < 0 ? -1 : 1;
      if (ad > this.w * 0.55) {
        this.vx = this.facing * CFG.BOSS_SPEED;
        this.setAnim('walk');
      } else {
        this.vx *= 0.8;
        this.setAnim('idle');
      }

      // Between slams: hop so the player can run underneath.
      if (this.onGround && this.hopCd <= 0) {
        this.vx = this.facing * CFG.BOSS_HOP_SPEED;
        this.vy = -CFG.BOSS_HOP_V;
        this.onGround = false;
        this.wasAir = true;
        this.slamLeap = false;
        this.hopCd = 1.6 + Math.random() * 0.9;
        game.addShake(4, 0.15);
        Particles.dust(this.x, this.y, 8);
      } else if (this.onGround && this.slamCd <= 0 && ad < 520) {
        this.slamCd = 2.4 + Math.random() * 1.3;
        this.telegraph = 0.5;
        Snd.bossRoar();
      }
    }

    this.vy += CFG.GRAVITY * dt;
    this.vy = Math.min(this.vy, CFG.MAX_FALL);
    const wasAir = !this.onGround;
    Level.move(this, dt);

    if (wasAir && this.onGround && this.wasAir) {
      this.wasAir = false;
      if (this.slamLeap) {
        this.slamLeap = false;
        this.recover = 0.85;
        this.vx = 0;
        game.addShake(10, 0.25);
        Particles.dust(this.x, this.y, 12);
        Snd.bossSlam();
        this.hopCd = Math.max(this.hopCd, 1.0);
      } else {
        // ordinary hop landing: no punish window, just settle
        this.vx *= 0.35;
        game.addShake(5, 0.18);
        Particles.dust(this.x, this.y, 10);
        this.hopCd = Math.max(this.hopCd, 0.9);
      }
    }

    if (this.x < this.min) { this.x = this.min; if (this.vx < 0) this.vx = 0; }
    if (this.x > this.max) { this.x = this.max; if (this.vx > 0) this.vx = 0; }
    if (this.y > Level.deathY + 200) this.die(game);
  }

  hit(fromX, game) {
    if (this.state === 'dead') return;
    this.hp--;
    this.hitFlash = 0.14;
    this.stun = Math.max(this.stun, 0.1);
    this.vx += (this.x < fromX ? -1 : 1) * 14;
    Snd.hit();
    Particles.boneBurst(this.x, this.y - this.h * 0.55, 4);
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadT = 0;
    this.exploded = true;
    this.vx = 0;
    this.vy = 0;
    Snd.explode();
    Snd.bossSlam();
    game.addShake(26, 0.9);
    game.flash(0.42, '255,222,180');
    game.lightBoost = 2.2;
    Particles.boneBurst(this.x, this.y - this.h * 0.55, 70);
    Particles.dust(this.x, this.y, 24);
    game.onBossDefeated(this);
  }

  draw(ctx) {
    if (this.exploded) return;
    const img = Assets.enemyLook(0)[0].img;
    const frame = this.state === 'dead'
      ? Sprites.enemyFrame('dead', this.deadT)
      : Sprites.enemyFrame(this.anim, this.animT);
    Sprites.drawEnemy(ctx, img, frame, this.x, this.y, this.facing < 0, this.scale, 1);

    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 2.4;
      ctx.fillStyle = 'rgba(255,150,150,0.75)';
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.h * 0.6, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawEyes(ctx, t) {
    if (this.state === 'dead' || this.exploded) return;
    const s = this.scale;
    const f = this.facing < 0 ? -1 : 1;
    const ey = this.y - 34.5 * s;
    const blink = 0.75 + 0.25 * Math.sin(t * 4 + this.x * 0.02);
    const color = this.aggro
      ? 'rgba(255, 40, 22, 0.98)'
      : 'rgba(228, 116, 42, 0.8)';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.arc(this.x + f * -8.5 * s, ey, 1.6 * s, 0, Math.PI * 2);
    ctx.arc(this.x + f * 3 * s, ey, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- Arrow */
export class Arrow {
  constructor(x, y, dir) {
    this.x = x;
    this.y = y;
    this.vx = dir * CFG.ARROW_SPEED;
    this.vy = -CFG.ARROW_LOFT;
    this.w = CFG.ARROW_W;
    this.h = CFG.ARROW_H;
    this.life = CFG.ARROW_TTL;
    this.dead = false;
    this.ang = dir > 0 ? 0 : Math.PI;
  }

  get box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  kill() { this.dead = true; }

  update(dt) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    this.vy += CFG.ARROW_GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ang = Math.atan2(this.vy, this.vx);

    if (this.x < -60 || this.x > Level.w + 60 || this.y > Level.deathY) {
      this.dead = true;
      return;
    }

    if (Level.solidAt(this.box)) {
      this.dead = true;
      Particles.sparkle(this.x, this.y, 4);
      Particles.dust(this.x, this.y + 4, 3);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.ang);

    // faint trail
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(-this.w, 0, 0, 0);
    g.addColorStop(0, 'rgba(255,170,80,0)');
    g.addColorStop(1, 'rgba(255,220,160,0.5)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-this.w, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // shaft
    ctx.fillStyle = '#cdb894';
    ctx.fillRect(-this.w / 2 + 3, -1, this.w / 2 + 3, 2);
    // head
    ctx.fillStyle = '#e6e0cf';
    ctx.beginPath();
    ctx.moveTo(this.w / 2 + 5, 0);
    ctx.lineTo(this.w / 2 - 3, -4);
    ctx.lineTo(this.w / 2 - 3, 4);
    ctx.closePath();
    ctx.fill();
    // fletching
    ctx.fillStyle = '#8a4a3a';
    ctx.beginPath();
    ctx.moveTo(-this.w / 2, 0);
    ctx.lineTo(-this.w / 2 + 7, -4);
    ctx.lineTo(-this.w / 2 + 5, 0);
    ctx.lineTo(-this.w / 2 + 7, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
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

/* ---------------------------------------------------------------- BowPickup */
export class BowPickup {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.t = Math.random() * 6;
    this.taken = false;
  }

  update(dt) { this.t += dt; }

  draw(ctx) {
    if (this.taken) return;
    const bob = Math.sin(this.t * 2.2) * 5;
    const y = this.y + bob;
    const pulse = 0.8 + 0.2 * Math.sin(this.t * 4.6);

    ctx.save();

    // warm halo
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, y, 0, this.x, y, 42 * pulse);
    g.addColorStop(0, 'rgba(255,214,150,0.55)');
    g.addColorStop(0.35, 'rgba(230,150,60,0.28)');
    g.addColorStop(1, 'rgba(150,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, y, 42 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // bow + nocked arrow
    ctx.translate(this.x, y);
    ctx.rotate(Math.sin(this.t * 1.3) * 0.08);

    ctx.strokeStyle = '#a9702f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(4, 0, 16, -1.2, 1.2);
    ctx.stroke();

    const tx = 4 + 16 * Math.cos(1.2);
    const ty = 16 * Math.sin(1.2);
    ctx.strokeStyle = 'rgba(240,232,214,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, -ty);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.fillStyle = '#d9c9a4';
    ctx.fillRect(-22, -1.5, 30, 3);
    ctx.fillStyle = '#efe9d8';
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-16, -4);
    ctx.lineTo(-16, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a4a3a';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(3, -4);
    ctx.lineTo(5, 0);
    ctx.lineTo(3, 4);
    ctx.closePath();
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

  update(dt, p, facing, lift) {
    const tx = p.x - CFG.W / 2 + facing * 46;
    const ty = p.y - CFG.H * 0.62 - (lift || 0);
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

  /* Bone shards + dust for a skeleton blowing apart. */
  boneBurst(x, y, n) {
    // short hot core flash (only for full blasts, not chip hits)
    for (let i = 0; i < (n >= 12 ? 3 : 0); i++) {
      this.add({
        x, y, vx: 0, vy: 0,
        life: 0.09 + i * 0.04, max: 0.17, grav: 0,
        size: 15 - i * 4, color: 'rgba(255,238,206,',
      });
    }
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 120 + Math.random() * 330;
      this.add({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 150,
        life: 0.5 + Math.random() * 0.6, max: 1.1,
        grav: 1050,
        size: 2.2 + Math.random() * 3.2,
        shape: 'shard',
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 26,
        color: Math.random() < 0.22 ? 'rgba(66,58,50,' : 'rgba(232,223,202,',
      });
    }
    // pale dust cloud
    for (let i = 0; i < Math.round(n * 0.5); i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * 130, vy: (Math.random() - 0.5) * 130 - 30,
        life: 0.35 + Math.random() * 0.45, max: 0.8, grav: -40,
        size: 3 + Math.random() * 4, color: 'rgba(206,194,170,',
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
      if (p.spin) p.rot += p.spin * dt;
    }
  },

  draw(ctx) {
    // additive sparks / dust glows
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (p.shape === 'shard') continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color + (a * 0.9) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // solid bone shards
    for (const p of this.list) {
      if (p.shape !== 'shard') continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color + a + ')';
      ctx.fillRect(-p.size, -p.size * 0.55, p.size * 2, p.size * 1.1);
      ctx.restore();
    }
  },
};
