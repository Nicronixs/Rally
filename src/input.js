// Keyboard and gamepad input.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last frame
    this.steerKeys = 0;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.padButtonsPrev = [];
  }

  // returns driving input plus one-shot actions
  read(dt) {
    const k = this.keys;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    let handbrake = k.has('Space');
    // keyboard steering ramps so tapping gives small corrections
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = target === 0 ? 7 : (Math.sign(target) !== Math.sign(this.steerKeys) ? 9 : 4.5);
    const d = target - this.steerKeys;
    this.steerKeys += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    let steer = this.steerKeys;

    const actions = new Set(this.pressed);
    this.pressed.clear();

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.08) steer = -Math.sign(ax) * ((Math.abs(ax) - 0.08) / 0.92) ** 1.4;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      if (p.buttons[0] && p.buttons[0].pressed) handbrake = true;
      const prev = this.padButtonsPrev;
      const edge = (i) => p.buttons[i] && p.buttons[i].pressed && !prev[i];
      if (edge(3)) actions.add('KeyR');
      if (edge(9)) actions.add('Enter');
      if (edge(5)) actions.add('KeyC');
      this.padButtonsPrev = p.buttons.map((b) => b.pressed);
      break;
    }
    return { throttle, brake, steer, handbrake, actions };
  }
}
