// Keyboard, gamepad and touch input.
import { TouchControls } from './touch.js';
//
// Gamepad (standard mapping, e.g. Xbox / PlayStation controllers):
//   driving: left stick steer · RT throttle · LT brake · A handbrake · RB/LB shift up/down
//            Y back on the road · View camera · D-pad ↑ pace-note book, ↓ voice, ← gearbox mode, → sound
//   menus:   left stick / D-pad move · A select · B back · Start confirm

const NAV_DIRS = { 12: 'NavUp', 13: 'NavDown', 14: 'NavLeft', 15: 'NavRight' };

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last frame
    this.steerKeys = 0;
    this.menuOpen = false; // set by the game: menus use the pad for navigation
    this.padButtonsPrev = [];
    this.navHold = { dir: null, next: 0 };
    this.pad = null;
    this.touch = new TouchControls(this.pressed);
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      // Ctrl is the downshift key: stop Ctrl+S (save), Ctrl+R (reload), Ctrl+D (bookmark) … while driving.
      // Ctrl+W cannot be blocked by a page (only in fullscreen with keyboard lock, see main.js).
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if ((e.ctrlKey || e.metaKey) && !typing && /^(Key[A-Z]|Digit\d|Space|Arrow)/.test(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.onPadChange = null; // (connected, name)
    window.addEventListener('gamepadconnected', (e) => this.onPadChange && this.onPadChange(true, e.gamepad.id));
    window.addEventListener('gamepaddisconnected', (e) => this.onPadChange && this.onPadChange(false, e.gamepad.id));
  }

  firstPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
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
    const t = this.touch;
    if (t.active) {
      throttle = Math.max(throttle, t.throttle);
      brake = Math.max(brake, t.brake);
      if (t.handbrake) handbrake = true;
      if (t.steer !== 0) steer = t.steer;
    }

    const actions = new Set(this.pressed);
    this.pressed.clear();

    const p = this.firstPad();
    this.pad = p;
    if (p) {
      const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const prev = this.padButtonsPrev;
      const edge = (i) => btn(i) && !prev[i];
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;

      if (this.menuOpen) {
        // menu navigation: D-pad or stick, with key-repeat while held
        let dir = null;
        for (const [i, name] of Object.entries(NAV_DIRS)) if (btn(+i)) dir = name;
        if (!dir && Math.abs(ay) > 0.6) dir = ay < 0 ? 'NavUp' : 'NavDown';
        if (!dir && Math.abs(ax) > 0.6) dir = ax < 0 ? 'NavLeft' : 'NavRight';
        const now = performance.now();
        if (dir && dir !== this.navHold.dir) { actions.add(dir); this.navHold = { dir, next: now + 380 }; }
        else if (dir && now >= this.navHold.next) { actions.add(dir); this.navHold.next = now + 140; }
        else if (!dir) this.navHold.dir = null;
        if (edge(0)) actions.add('NavOK');
        if (edge(9)) actions.add('NavStart');
        if (edge(1)) actions.add('NavBack');
      } else {
        if (Math.abs(ax) > 0.08) steer = -Math.sign(ax) * ((Math.abs(ax) - 0.08) / 0.92) ** 1.4;
        throttle = Math.max(throttle, p.buttons[7] ? p.buttons[7].value : 0);
        brake = Math.max(brake, p.buttons[6] ? p.buttons[6].value : 0);
        if (btn(0)) handbrake = true;
        if (edge(3)) actions.add('KeyR'); // Y: back on the road
        if (edge(5)) actions.add('ShiftRight'); // RB: shift up
        if (edge(4)) actions.add('ControlRight'); // LB: shift down
        if (edge(8)) actions.add('KeyC'); // View/Back: camera
        if (edge(12)) actions.add('KeyB'); // D-pad up: pace-note book
        if (edge(13)) actions.add('KeyV'); // D-pad down: spoken calls
        if (edge(14)) actions.add('KeyG'); // D-pad left: gearbox mode
        if (edge(15)) actions.add('KeyM'); // D-pad right: sound
      }
      this.padButtonsPrev = p.buttons.map((b) => b.pressed);
    }
    return { throttle, brake, steer, handbrake, actions };
  }

  // short vibration (0..1 strengths); silently ignored where unsupported
  rumble(strong, weak, ms) {
    const p = this.pad;
    const act = p && p.vibrationActuator;
    if (!act || !act.playEffect) return;
    act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
  }
}
