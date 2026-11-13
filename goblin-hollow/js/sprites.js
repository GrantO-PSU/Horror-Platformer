/* Animation definitions + sprite drawing.

   The pack is a 10 x 4 grid of 32x64 cells.
   Row 0: idle (cols 0-1), walk (2-6), jump (7-8), fall (9)
   Row 1: stand (0-1), hurt (2-3), hurt-air (4), KO (6, wide 2 cells)
   Row 2: ground attack (0-3), guard (9)
   Row 3: air attack (0-3)
*/
export const AnimDefs = {
  idle:     { row: 0, start: 0, count: 2, fps: 3.2, loop: true },
  walk:     { row: 0, start: 2, count: 5, fps: 11, loop: true },
  jump:     { row: 0, start: 7, count: 2, fps: 8, loop: false },
  fall:     { row: 0, start: 9, count: 1, fps: 1, loop: false },
  attack:   { row: 2, start: 0, count: 4, fps: 15, loop: false },
  attackAir:{ row: 3, start: 0, count: 4, fps: 15, loop: false },
  hurt:     { row: 1, start: 2, count: 2, fps: 10, loop: false },
  hurtAir:  { row: 1, start: 4, count: 1, fps: 1, loop: false },
  ko:       { row: 1, start: 6, count: 1, fps: 1, loop: false, wide: 2 },
  guard:    { row: 2, start: 9, count: 1, fps: 1, loop: false },
};

/* Enemy sheet (mon2 skeleton) is a 8 x 8 grid of 64x64 cells.
   Row 0: idle (0-3), Row 1: walk (0-3), Row 2: attack (0-3),
   Row 3: death (0-6). Rows 5-7 hold the ghost-skull form (unused).
   Every cell shares the same foot line at y = 61. */
export const EnemyAnimDefs = {
  idle:   { row: 0, start: 0, count: 4, fps: 6, loop: true },
  walk:   { row: 1, start: 0, count: 4, fps: 10, loop: true },
  attack: { row: 2, start: 0, count: 4, fps: 14, loop: false },
  dead:   { row: 3, start: 0, count: 7, fps: 12, loop: false },
};

export const Sprites = {
  frame(name, t) {
    const a = AnimDefs[name] || AnimDefs.idle;
    let i = Math.floor(t * a.fps);
    if (a.loop) i %= a.count;
    else i = Math.min(i, a.count - 1);
    if (i < 0) i = 0;
    return { col: a.start + i, row: a.row, wide: a.wide || 1 };
  },

  enemyFrame(name, t) {
    const a = EnemyAnimDefs[name] || EnemyAnimDefs.idle;
    let i = Math.floor(t * a.fps);
    if (a.loop) i %= a.count;
    else i = Math.min(i, a.count - 1);
    if (i < 0) i = 0;
    return { col: a.start + i, row: a.row };
  },

  /* Draw one 64x64 enemy cell with its feet planted on (x, y). */
  drawEnemy(ctx, img, frame, x, y, flip, scale, alpha) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const CW = 64, CH = 64, FOOT = 61, CENTER = 3; // art sits 3px right of cell centre
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(
      img,
      frame.col * CW, frame.row * CH, CW, CH,
      -CW / 2 - CENTER, -FOOT, CW, CH
    );
    ctx.restore();
  },

  drawLayers(ctx, layers, frame, x, y, flip, scale, alpha, extra) {
    const cw = 32 * frame.wide;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    if (alpha != null) ctx.globalAlpha = alpha;
    for (const layer of layers) {
      if (!layer.img || !layer.img.complete || layer.img.naturalWidth === 0) continue;
      ctx.globalAlpha = alpha != null ? alpha : (layer.alpha == null ? 1 : layer.alpha);
      ctx.drawImage(
        layer.img,
        frame.col * 32, frame.row * 64, cw, 64,
        -cw / 2, -64, cw, 64
      );
    }
    if (extra) extra(ctx);
    ctx.restore();
  },

  /* Glowing eyes drawn after the darkness pass so they pierce the dark. */
  drawEyes(ctx, x, y, flip, scale, color, t) {
    const px = x + (flip ? -1 : 1) * 1.5 * scale;
    const py = y - 54 * scale;
    const blink = 0.75 + 0.25 * Math.sin(t * 3 + x * 0.03);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color || 'rgba(255, 40, 30, 0.95)';
    ctx.shadowColor = color || 'rgba(255, 40, 30, 0.9)';
    ctx.shadowBlur = 10;
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.arc(px - 4 * scale, py, 1.6 * scale, 0, Math.PI * 2);
    ctx.arc(px + 6 * scale, py, 1.6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /* Procedural bow held at the hip/chest. Pull 0..1 draws the string back. */
  drawBow(ctx, x, y, flip, pull) {
    const f = flip ? -1 : 1;
    ctx.save();
    ctx.translate(x + f * 14, y - 46);
    ctx.scale(f, 1);

    // limb
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 17, -1.15, 1.15);
    ctx.stroke();

    // string, pulled back toward the archer
    const tx = 17 * Math.cos(1.15);
    const ty = 17 * Math.sin(1.15);
    const back = -(2 + pull * 9);
    ctx.strokeStyle = 'rgba(238,231,214,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, -ty);
    ctx.lineTo(back, 0);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // nocked arrow
    if (pull > 0.05) {
      ctx.strokeStyle = '#cdb894';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(back - 22, 0);
      ctx.lineTo(back + 4, 0);
      ctx.stroke();
    }

    ctx.restore();
  },

  /* Procedural sword arc so the blade always follows the swing. */
  drawSword(ctx, x, y, flip, progress, scale) {
    if (progress < 0 || progress > 1) return;
    const s = scale;
    // Swing from high-back to low-front over the attack.
    const a0 = -2.0, a1 = 0.55;
    const ang = (a0 + (a1 - a0) * progress);
    const handX = x + (flip ? -1 : 1) * 8 * s;
    const handY = y - 40 * s;

    ctx.save();
    ctx.translate(handX, handY);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.95;

    // Blade
    const len = 34 * s;
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, '#9aa3ad');
    g.addColorStop(0.6, '#dfe6ee');
    g.addColorStop(1, '#f4f8ff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -3 * s);
    ctx.lineTo(len, -2 * s);
    ctx.lineTo(len + 4 * s, 0);
    ctx.lineTo(len, 2 * s);
    ctx.lineTo(0, 3 * s);
    ctx.closePath();
    ctx.fill();

    // Guard + grip
    ctx.fillStyle = '#5b4a34';
    ctx.fillRect(-4 * s, -5 * s, 5 * s, 10 * s);
    ctx.fillStyle = '#c8b071';
    ctx.fillRect(1 * s, -5 * s, 3 * s, 10 * s);
    ctx.restore();
  },
};
