/* Goblin's Hollow - shared configuration */
export const CFG = {
  W: 960,
  H: 540,

  // Sprite sheets are 32x64 cells; draw them at this scale.
  SPRITE_SCALE: 2,

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
