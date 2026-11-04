/* Keyboard + mouse state */
import { CFG } from './config.js';

export const Input = {
  down: Object.create(null),
  pressed: Object.create(null),
  mouse: { x: 0, y: 0, down: false, pressed: false },
  _canvas: null,
  _scale: 1,

  init(canvas) {
    this._canvas = canvas;

    const stop = (e) => {
      const c = e.code;
      if (
        c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowUp' ||
        c === 'ArrowDown' || c === 'Space' || c === 'Tab'
      ) e.preventDefault();
    };

    window.addEventListener('keydown', (e) => {
      stop(e);
      if (!this.down[e.code]) this.pressed[e.code] = true;
      this.down[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.down[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.down = Object.create(null);
      this.mouse.down = false;
    });

    canvas.addEventListener('mousemove', (e) => this._setMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.pressed = true;
      }
      this._setMouse(e);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  _setMouse(e) {
    const r = this._canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) / r.width * CFG.W;
    this.mouse.y = (e.clientY - r.top) / r.height * CFG.H;
  },

  isDown(...codes) {
    for (const c of codes) if (this.down[c]) return true;
    return false;
  },

  wasPressed(...codes) {
    for (const c of codes) if (this.pressed[c]) return true;
    return false;
  },

  endFrame() {
    this.pressed = Object.create(null);
    this.mouse.pressed = false;
  },

  left() { return this.isDown('KeyA', 'ArrowLeft'); },
  right() { return this.isDown('KeyD', 'ArrowRight'); },
  jumpHeld() { return this.isDown('KeyW', 'Space', 'ArrowUp'); },
  jumpPressed() { return this.wasPressed('KeyW', 'Space', 'ArrowUp'); },
  attackPressed() {
    return this.wasPressed('KeyJ', 'KeyX', 'KeyK') || this.mouse.pressed;
  },
};
