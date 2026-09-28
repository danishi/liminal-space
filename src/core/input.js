// Unified input: keyboard + mouse (pointer lock or drag), touch, gamepad.
// The game reads held actions with down() and one-shot presses with pressed().

const BINDINGS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowLeft: 'turnLeft', KeyQ: 'turnLeft',
  ArrowRight: 'turnRight', KeyC: 'turnRight',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: 'interact', Space: 'interact',
  KeyF: 'flashlight',
  KeyM: 'map', Tab: 'map',
  Escape: 'pause', KeyP: 'pause',
};

const PAD_BUTTONS = { 0: 'interact', 3: 'flashlight', 9: 'pause', 8: 'map', 12: 'map' };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.presses = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.touchMove = { x: 0, y: 0 };
    this.touchRun = false;
    this.padMove = { x: 0, y: 0 };
    this.padRun = false;
    this.padPrev = {};
    this.locked = false;
    this.dragLook = false; // fallback when pointer lock is unavailable
    this.dragging = false;
    this.enabled = false;
    this.usingTouch = false;
    this.lastManualLook = -1e9; // performance.now() of the last mouse/stick/touch look
    this.onLockChange = null;
    this.onFirstTouch = null;

    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => this.held.clear());
    // browsers announce a pad on its first button press; until then there is nothing to poll
    this.pads = 0;
    addEventListener('gamepadconnected', () => this.pads++);
    addEventListener('gamepaddisconnected', () => (this.pads = Math.max(0, this.pads - 1)));

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFailures = 0;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailures = (this.lockFailures || 0) + 1;
      if (this.lockFailures >= 3) this.dragLook = true;
      this.onLockFail?.();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        // guard against the occasional huge spike some browsers emit
        if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        this.lookX += e.movementX;
        this.lookY += e.movementY;
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) this.lastManualLook = performance.now();
      } else if (this.dragging) {
        this.lastManualLook = performance.now();
        this.lookX += e.movementX * 1.4;
        this.lookY += e.movementY * 1.4;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.locked && this.dragLook) this.dragging = true;
      if (this.locked) this.presses.add('interact');
    });
    addEventListener('mouseup', () => (this.dragging = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    addEventListener('touchstart', () => {
      if (!this.usingTouch) {
        this.usingTouch = true;
        this.onFirstTouch?.();
      }
    }, { passive: true });
  }

  key(e, isDown) {
    const action = BINDINGS[e.code];
    if (!action) return;
    if (this.enabled && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    if (isDown && (action === 'turnLeft' || action === 'turnRight')) this.lastKeyTurn = performance.now();
    if (isDown) {
      if (!e.repeat) this.presses.add(action);
      this.held.add(action);
    } else {
      this.held.delete(action);
    }
  }

  requestLock() {
    if (this.usingTouch || this.locked || this.dragLook) return;
    if (!this.canvas.requestPointerLock) {
      this.dragLook = true;
      return;
    }
    const fail = () => {
      // Sandboxed frames refuse every request; fall back to drag-to-look.
      this.lockFailures = (this.lockFailures || 0) + 1;
      if (this.lockFailures >= 3) this.dragLook = true;
      this.onLockFail?.();
    };
    try {
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(fail);
    } catch {
      fail();
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(action) {
    if (action === 'run') return this.held.has('run') || this.touchRun || this.padRun;
    return this.held.has(action);
  }

  pressed(action) {
    return this.presses.has(action);
  }

  press(action) {
    this.presses.add(action);
  }

  /** Keyboard turning in [-1, 1] (negative = left). */
  turn() {
    return (this.held.has('turnRight') ? 1 : 0) - (this.held.has('turnLeft') ? 1 : 0);
  }

  /** Seconds since the player last looked around manually. */
  idleLook() {
    return (performance.now() - this.lastManualLook) / 1000;
  }

  /** Movement vector in [-1,1]² (x = strafe, y = forward). */
  move() {
    let x = 0;
    let y = 0;
    if (this.held.has('forward')) y += 1;
    if (this.held.has('back')) y -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('left')) x -= 1;
    x += this.touchMove.x + this.padMove.x;
    y += this.touchMove.y + this.padMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  pollGamepad(dt) {
    let gp = null;
    if (this.pads && navigator.getGamepads) {
      for (const p of navigator.getGamepads()) {
        if (p && p.connected) {
          gp = p;
          break;
        }
      }
    }
    if (!gp) {
      this.padMove.x = this.padMove.y = 0;
      this.padRun = false;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    this.padMove.x = dz(gp.axes[0] || 0);
    this.padMove.y = -dz(gp.axes[1] || 0);
    const lx = dz(gp.axes[2] || 0);
    const ly = dz(gp.axes[3] || 0);
    this.lookX += lx * 900 * dt;
    this.lookY += ly * 650 * dt;
    if (lx || ly) this.lastManualLook = performance.now();
    this.padRun = !!(gp.buttons[5]?.pressed || gp.buttons[7]?.pressed || gp.buttons[10]?.pressed);
    for (const [idx, action] of Object.entries(PAD_BUTTONS)) {
      const p = !!gp.buttons[idx]?.pressed;
      if (p && !this.padPrev[idx]) this.presses.add(action);
      this.padPrev[idx] = p;
    }
  }

  consumeLook() {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return r;
  }

  endFrame() {
    this.presses.clear();
  }

  // ---- touch controls ------------------------------------------------------

  bindTouch({ moveZone, lookZone, stickBase, stickKnob, buttons }) {
    let moveId = null;
    let origin = null;
    const R = 50;
    moveZone.addEventListener('pointerdown', (e) => {
      if (moveId !== null) return;
      moveId = e.pointerId;
      moveZone.setPointerCapture(e.pointerId);
      origin = { x: e.clientX, y: e.clientY };
      stickBase.style.left = `${e.clientX}px`;
      stickBase.style.top = `${e.clientY}px`;
      stickBase.classList.add('on');
      stickKnob.style.transform = 'translate(0,0)';
    });
    moveZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== moveId) return;
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
      this.touchMove.x = dx / R;
      this.touchMove.y = -dy / R;
    });
    const endMove = (e) => {
      if (e.pointerId !== moveId) return;
      moveId = null;
      this.touchMove.x = this.touchMove.y = 0;
      stickBase.classList.remove('on');
    };
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);

    let lookId = null;
    let last = null;
    lookZone.addEventListener('pointerdown', (e) => {
      if (lookId !== null) return;
      lookId = e.pointerId;
      lookZone.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      this.lookX += (e.clientX - last.x) * 2.2;
      this.lookY += (e.clientY - last.y) * 2.2;
      this.lastManualLook = performance.now();
      last = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e) => {
      if (e.pointerId === lookId) lookId = null;
    };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    for (const b of buttons) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = b.dataset.action;
        if (action === 'run') {
          this.touchRun = !this.touchRun;
          b.classList.toggle('on', this.touchRun);
        } else {
          this.presses.add(action);
        }
      });
    }
  }
}
