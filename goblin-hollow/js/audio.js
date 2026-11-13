/* WebAudio synth - no audio files. All sounds are generated. */
import { CFG } from './config.js';

export const Snd = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,
  droneNodes: null,
  _dripTimer: 0,

  // file-based audio (HTMLAudioElement, works over file://)
  music: null,
  pools: { stone: [], wood: [] },
  jumpPool: [],
  _poolIdx: { stone: 0, wood: 0, jump: 0 },
  _initDone: false,

  init() {
    if (this._initDone) return;
    this._initDone = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this._makeNoise(2.0);
    }
    this._loadFiles();
  },

  _loadFiles() {
    if (typeof Audio === 'undefined') return;
    const mk = (src, vol, loop) => {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = vol == null ? 0.5 : vol;
      if (loop) a.loop = true;
      a.muted = this.muted;
      a.addEventListener('error', () => { a._bad = true; });
      try { a.load(); } catch (e) { /* ignore */ }
      return a;
    };

    this.music = mk('assets/audio/music.mp3', CFG.MUSIC_VOL, true);
    this.music.addEventListener('ended', () => {
      this.music.currentTime = 0;
      this.startMusic();
    });

    const stone = [];
    for (let i = 1; i <= 8; i++) {
      stone.push(mk('assets/audio/steps/stepstone_' + i + '.wav', CFG.STEP_VOL));
    }
    const wood = [];
    for (let i = 1; i <= 2; i++) {
      wood.push(mk('assets/audio/steps/stepwood_' + i + '.wav', CFG.STEP_VOL));
    }
    this.pools.stone = stone;
    this.pools.wood = wood;
    this.jumpPool = [mk('assets/audio/jump.wav', CFG.JUMP_VOL)];

    // Music is started from the first user gesture (autoplay policy).
    this.startMusic();
  },

  startMusic() {
    if (!this.music || this.muted) return;
    const p = this.music.play();
    if (p && p.catch) p.catch(() => {});
  },

  pauseMusic() {
    if (this.music) this.music.pause();
  },

  resumeMusic() {
    if (this.music && !this.muted) this.startMusic();
  },

  _playPool(pool, key) {
    if (!pool || !pool.length) return false;
    let a = null;
    for (let i = 0; i < pool.length; i++) {
      const idx = (this._poolIdx[key] + i) % pool.length;
      const c = pool[idx];
      if (c._bad) continue;
      if (c.paused || c.ended) {
        a = c;
        this._poolIdx[key] = (idx + 1) % pool.length;
        break;
      }
    }
    if (!a) {
      a = pool[this._poolIdx[key] % pool.length];
      this._poolIdx[key] = (this._poolIdx[key] + 1) % pool.length;
    }
    if (!a || a._bad) return false;
    try {
      a.currentTime = 0;
      a.playbackRate = 0.9 + Math.random() * 0.2;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
    if (this.music) this.music.muted = m;
    for (const pool of [this.pools.stone, this.pools.wood, this.jumpPool]) {
      for (const a of pool) a.muted = m;
    }
    if (!m) this.startMusic();
  },

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  },

  _makeNoise(seconds) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  _env(gain, t, dur, peak, attack) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + (attack || 0.006));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  },

  tone(freq, dur, opts = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + (opts.delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + dur);
    this._env(g, t, dur, opts.gain == null ? 0.18 : opts.gain, opts.attack);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  noise(dur, opts = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + (opts.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = opts.type || 'lowpass';
    f.frequency.setValueAtTime(opts.freq || 900, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    f.Q.value = opts.q == null ? 0.8 : opts.q;
    const g = c.createGain();
    this._env(g, t, dur, opts.gain == null ? 0.16 : opts.gain, opts.attack);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  },

  /* ---------- ambient drone ---------- */
  startDrone() {
    if (!this.ctx || this.droneNodes) return;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.05, c.currentTime + 4);

    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 220;
    filt.Q.value = 3;

    const a = c.createOscillator();
    a.type = 'sine';
    a.frequency.value = 55;
    const b = c.createOscillator();
    b.type = 'sine';
    b.frequency.value = 58.2;

    // slow LFO breathing on the filter
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filt.frequency);

    a.connect(filt); b.connect(filt);
    filt.connect(g).connect(this.master);
    a.start(); b.start(); lfo.start();
    this.droneNodes = { a, b, lfo, g };
  },

  setTension(level) {
    // 0..1 - raises drone volume/intensity with danger
    if (!this.droneNodes) return;
    const c = this.ctx;
    const target = 0.04 + level * 0.05;
    this.droneNodes.g.gain.setTargetAtTime(target, c.currentTime, 0.6);
  },

  /* ---------- one-shots ---------- */
  step(surface) {
    const wood = surface === 'wood';
    const pool = wood ? this.pools.wood : this.pools.stone;
    if (!this._playPool(pool, wood ? 'wood' : 'stone')) this._synthStep();
  },

  _synthStep() {
    this.noise(0.09, { gain: 0.05, freq: 340, to: 120, type: 'lowpass' });
  },

  jump() {
    if (!this._playPool(this.jumpPool, 'jump')) {
      this.tone(300, 0.14, { type: 'square', gain: 0.08, to: 520 });
    }
  },

  swing() {
    this.noise(0.16, { gain: 0.13, freq: 1600, to: 320, type: 'bandpass', q: 1.2 });
  },

  hit() {
    this.tone(180, 0.16, { type: 'square', gain: 0.14, to: 60 });
    this.noise(0.14, { gain: 0.16, freq: 900, to: 200 });
  },

  enemyDie() {
    this.tone(150, 0.35, { type: 'sawtooth', gain: 0.10, to: 42 });
    this.noise(0.3, { gain: 0.08, freq: 600, to: 90 });
  },

  /* Skeleton bursting apart: bone crack over a low boom. */
  explode() {
    this.tone(120, 0.42, { type: 'sawtooth', gain: 0.13, to: 34 });
    this.tone(62, 0.36, { type: 'sine', gain: 0.16, to: 26 });
    this.noise(0.3, { gain: 0.2, freq: 1500, to: 140 });
    this.noise(0.16, { gain: 0.12, freq: 3400, to: 700, delay: 0.03 });
  },

  /* Bowstring release. */
  bow() {
    this.tone(430, 0.1, { type: 'triangle', gain: 0.08, to: 170 });
    this.noise(0.12, { gain: 0.11, freq: 2600, to: 900, type: 'highpass' });
  },

  /* Giant skeleton cues. */
  bossRoar() {
    this.tone(88, 0.7, { type: 'sawtooth', gain: 0.16, to: 38 });
    this.tone(52, 0.85, { type: 'sine', gain: 0.14, to: 26 });
    this.noise(0.6, { gain: 0.1, freq: 760, to: 90 });
  },

  bossSlam() {
    this.tone(64, 0.34, { type: 'sawtooth', gain: 0.17, to: 24 });
    this.noise(0.28, { gain: 0.2, freq: 520, to: 60 });
  },

  hurt() {
    this.tone(220, 0.30, { type: 'sawtooth', gain: 0.16, to: 70 });
    this.noise(0.22, { gain: 0.12, freq: 1200, to: 200 });
  },

  death() {
    this.tone(180, 1.4, { type: 'sawtooth', gain: 0.18, to: 30 });
    this.tone(90, 1.6, { type: 'sine', gain: 0.2, to: 24 });
    this.noise(1.2, { gain: 0.08, freq: 500, to: 60 });
  },

  pickup() {
    const base = 620;
    [0, 1, 2].forEach((i) => {
      this.tone(base * Math.pow(1.19, i), 0.28, {
        type: 'triangle', gain: 0.10, delay: i * 0.07,
      });
    });
    this.tone(1240, 0.5, { type: 'sine', gain: 0.05, delay: 0.18 });
  },

  checkpoint() {
    this.tone(330, 0.5, { type: 'triangle', gain: 0.09 });
    this.tone(495, 0.6, { type: 'triangle', gain: 0.06, delay: 0.09 });
  },

  brazier() {
    [0, 4, 7, 12].forEach((n, i) => {
      const f = 220 * Math.pow(2, n / 12);
      this.tone(f, 1.4, { type: 'triangle', gain: 0.08, delay: i * 0.12 });
    });
    this.noise(1.4, { gain: 0.1, freq: 900, to: 180 });
  },

  sting() {
    // jump-scare: dissonant cluster + noise burst + falling scream
    [880, 932, 1245, 1318].forEach((f, i) => {
      this.tone(f, 0.6, { type: 'sawtooth', gain: 0.09, delay: i * 0.015 });
    });
    this.noise(0.5, { gain: 0.2, freq: 3000, to: 300, type: 'highpass' });
    this.tone(900, 0.9, { type: 'sawtooth', gain: 0.08, to: 120, delay: 0.05 });
  },

  heartbeat(intensity) {
    const g = 0.12 + intensity * 0.14;
    this.tone(58, 0.16, { type: 'sine', gain: g, to: 34 });
    this.tone(52, 0.18, { type: 'sine', gain: g * 0.8, to: 30, delay: 0.17 });
  },

  drip() {
    const f = 900 + Math.random() * 900;
    this.tone(f, 0.18, { type: 'sine', gain: 0.035, to: f * 0.55 });
  },

  blip() {
    this.tone(560, 0.07, { type: 'square', gain: 0.05 });
  },

  ambient(dt, tension) {
    if (!this.ctx) return;
    this._dripTimer -= dt;
    if (this._dripTimer <= 0) {
      this._dripTimer = 2.5 + Math.random() * 5;
      this.drip();
    }
  },
};
