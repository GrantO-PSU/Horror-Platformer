/* Hand-authored level data + AABB collision */
export const Level = {
  w: 4400,
  h: 1500,
  deathY: 1400,
  spawn: { x: 96, y: 980 },

  solids: [],
  oneways: [],
  hazards: [],
  emberSpawns: [],
  enemySpawns: [],
  checkpointSpawns: [],
  torches: [],
  props: [],
  triggerZones: [],
  exit: { x: 3980, y: 980, box: { x: 3940, y: 890, w: 90, h: 95 } },

  build() {
    const S = (x, y, w, h) => this.solids.push({ x, y, w, h });
    const O = (x, y, w) => this.oneways.push({ x, y, w, h: 12, isOneway: true });
    const H = (x, y, w) => this.hazards.push({ x, y, w, h: 20 });

    /* ---- Zone A: the broken gate ---- */
    S(-80, -200, 80, 1700);            // left wall
    S(0, 980, 720, 520);               // entry ground
    O(280, 860, 170);                  // first ledge
    S(840, 980, 660, 520);             // ground after first pit
    O(1050, 880, 150);
    O(1240, 790, 150);
    O(1430, 700, 160);

    /* ---- Zone B: the drowned cellar ---- */
    S(1500, 1120, 400, 380);           // lower cellar floor
    S(2080, 1120, 430, 380);           // far cellar floor
    H(2320, 1100, 120);                // spikes
    O(1620, 1000, 150);
    // moving plank over the pit
    S(1870, 1030, 150, 16);
    this.solids[this.solids.length - 1].move = { min: 1855, max: 2110, speed: 36, dir: 1, dx: 0 };

    /* ---- Zone C: the dark corridor ---- */
    S(2480, 1050, 100, 450);           // step up
    S(2560, 980, 490, 520);            // corridor floor (ends at pit)
    O(2850, 900, 150);
    H(2980, 960, 60);
    // pit 3050..3150

    /* ---- Zone D: the ember chamber ---- */
    S(3150, 980, 1100, 520);
    O(3260, 880, 120);
    O(3420, 790, 120);
    O(3580, 700, 120);
    O(3740, 610, 120);
    O(3580, 520, 120);
    O(3400, 430, 150);
    S(4250, -200, 80, 1700);           // right wall

    /* ---- collectibles ---- */
    this.emberSpawns = [
      { x: 365, y: 800 },
      { x: 2925, y: 840 },
      { x: 3475, y: 370 },
    ];

    /* ---- checkpoints ---- */
    this.checkpointSpawns = [
      { x: 130, y: 980 },
      { x: 1620, y: 1120 },
      { x: 2200, y: 1120 },
      { x: 3200, y: 980 },
    ];

    /* ---- enemies: x / feet y / patrol bounds ---- */
    this.enemySpawns = [
      { x: 540, y: 980, min: 380, max: 680 },
      { x: 1200, y: 980, min: 950, max: 1460 },
      { x: 1780, y: 1120, min: 1540, max: 1870 },
      { x: 2240, y: 1120, min: 2090, max: 2450 },
      { x: 2720, y: 980, min: 2600, max: 3000 },
      { x: 2920, y: 980, min: 2650, max: 3020 },
      { x: 3900, y: 980, min: 3650, max: 4170 },
    ];

    /* ---- ambient light ---- */
    this.torches = [
      { x: 250, y: 858, r: 130 },
      { x: 1080, y: 900, r: 105 },
      { x: 1650, y: 1046, r: 115 },
      { x: 2330, y: 1046, r: 105 },
      { x: 2620, y: 902, r: 120 },
      { x: 2980, y: 902, r: 105 },
      { x: 3240, y: 902, r: 100 },
      { x: 3440, y: 782, r: 105 },
      { x: 3720, y: 622, r: 105 },
      { x: 3830, y: 902, r: 115 },
    ];

    /* ---- decorative props ---- */
    this.props = [
      { type: 'bones', x: 470, y: 978 },
      { type: 'bones', x: 1360, y: 978 },
      { type: 'bones', x: 2210, y: 1118 },
      { type: 'bones', x: 2760, y: 978 },
      { type: 'pillar', x: 1960, y: 1440 },
      { type: 'pillar', x: 3120, y: 1440 },
      { type: 'web', x: 120, y: 700 },
      { type: 'web', x: 2600, y: 720 },
      { type: 'web', x: 3350, y: 700 },
      { type: 'statue', x: 4050, y: 980 },
    ];

    this.triggerZones = [
      { id: 'scare1', x: 2680, y: 500, w: 60, h: 520, used: false },
    ];
  },

  reset() {
    for (const t of this.triggerZones) t.used = false;
    for (const s of this.solids) {
      if (s.move) {
        s.x = 1870;
        s.move.dir = 1;
        s.move.dx = 0;
      }
    }
  },

  updateMoving(dt) {
    for (const s of this.solids) {
      if (!s.move) continue;
      const m = s.move;
      const prev = s.x;
      s.x += m.dir * m.speed * dt;
      if (s.x < m.min) { s.x = m.min; m.dir = 1; }
      if (s.x + s.w > m.max) { s.x = m.max - s.w; m.dir = -1; }
      m.dx = s.x - prev;
    }
  },

  box(e) {
    return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
  },

  overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  },

  move(e, dt) {
    // Horizontal sweep
    e.x += e.vx * dt;
    let b = this.box(e);
    for (const s of this.solids) {
      if (!this.overlap(b, s)) continue;
      if (e.vx > 0) e.x = s.x - e.w / 2;
      else if (e.vx < 0) e.x = s.x + s.w + e.w / 2;
      e.vx = 0;
      b = this.box(e);
    }

    // Vertical sweep
    const prevFeet = e.y;
    e.y += e.vy * dt;
    e.onGround = false;
    e.groundPlat = null;
    b = this.box(e);

    for (const s of this.solids) {
      if (!this.overlap(b, s)) continue;
      if (e.vy >= 0) {
        e.y = s.y;
        e.vy = 0;
        e.onGround = true;
        e.groundPlat = s;
      } else {
        e.y = s.y + s.h + e.h;
        e.vy = 0;
      }
      b = this.box(e);
    }

    // One-way platforms: only when falling from above
    if (e.vy >= 0) {
      for (const s of this.oneways) {
        if (!this.overlap(b, s)) continue;
        if (prevFeet <= s.y + 2 && e.y >= s.y) {
          e.y = s.y;
          e.vy = 0;
          e.onGround = true;
          e.groundPlat = s;
          b = this.box(e);
        }
      }
    }
  },

  hazardAt(b) {
    for (const h of this.hazards) if (this.overlap(b, h)) return h;
    return null;
  },
};
