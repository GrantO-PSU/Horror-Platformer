/* Goblin's Hollow - shared configuration */
export const CFG = {
  W: 960,
  H: 540,

  // Sprite sheets are 32x64 cells; draw them at this scale.
  SPRITE_SCALE: 2,
  // Skeleton enemy sheet uses 64x64 cells (art is ~42px tall).
  ENEMY_SCALE: 1.5,

  // Giant skeleton miniboss
  BOSS_SCALE: 4.5,
  BOSS_HP: 20,
  BOSS_SPEED: 84,
  BOSS_SLAM_SPEED: 430,
  BOSS_HOP_V: 1000,
  BOSS_HOP_SPEED: 110,

  // Movement / physics (world px, seconds)
  GRAVITY: 2250,
  MAX_FALL: 1250,
  ACCEL: 2900,
  MAX_RUN: 258,
  FRICTION: 2700,
  AIR_ACCEL: 1900,
  JUMP_V: 745,
  JUMP_CUT: 0.42,
  COYOTE: 0.11,
  JUMP_BUFFER: 0.13,

  // Player collision box (feet-anchored, centred on x)
  P_W: 30,
  P_H: 74,

  // Combat
  ATTACK_TIME: 0.30,
  ATTACK_COOLDOWN: 0.36,
  ATTACK_REACH: 52,
  ATTACK_H: 62,
  INVULN: 1.15,

  // Bow / arrows
  ARROW_SPEED: 920,
  ARROW_GRAVITY: 700,
  ARROW_LOFT: 100,
  ARROW_TTL: 1.3,
  ARROW_W: 26,
  ARROW_H: 5,
  BOW_COOLDOWN: 0.38,
  BOW_PICKUP_AMMO: 5,

  // Light
  LIGHT_R: 238,
  LIGHT_MIN: 96,

  // Audio (file-based)
  MUSIC_VOL: 0.22,
  STEP_VOL: 0.5,
  JUMP_VOL: 0.55,

  // Camera
  CAM_LERP: 7.5,
  SHAKE_DECAY: 3.2,
};
