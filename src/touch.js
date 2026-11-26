// Touch controls for phones and tablets: a steering pad on the left (drag sideways),
// throttle / brake / handbrake on the right and a row of small buttons for the one-shot actions.
// Only shown on touch screens (body.touch); the state is read by Input.read().

// primary pointer is a finger: phones and tablets, not laptops that merely have a touch screen
export const isTouch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

const STEER_RANGE = 70; // px of finger travel for full lock

export class TouchControls {
  constructor(pressed) {
    this.pressed = pressed; // Input.pressed: one-shot actions go in here like key presses
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.active = isTouch();
    if (!this.active) return;
    document.body.classList.add('touch');
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = `
      <div class="t-bar">
        <button data-act="TouchMenu" title="Menü">☰</button>
        <button data-act="KeyC" title="Kamera">🎥</button>
        <button data-act="KeyR" title="Zurück auf die Strecke">↺</button>
        <button data-act="KeyB" class="t-drive" title="Aufschrieb">📖</button>
        <button data-act="KeyG" class="t-drive" title="Automatik / manuell">A/M</button>
        <button data-act="KeyM" title="Ton">🔊</button>
        ${document.documentElement.requestFullscreen ? '<button data-act="KeyF" title="Vollbild">⛶</button>' : ''}
      </div>
      <div class="t-steer t-drive"><div class="t-ring"><div class="t-knob"></div></div><span>Lenken</span></div>
      <div class="t-shift t-drive"><button data-act="ShiftRight">▲</button><button data-act="ControlRight">▼</button></div>
      <div class="t-pedals t-drive">
        <button class="t-pedal t-hand" data-hold="handbrake">Hand&shy;bremse</button>
        <button class="t-pedal t-brake" data-hold="brake">Bremse</button>
        <button class="t-pedal t-gas" data-hold="throttle">Gas</button>
      </div>`;
    document.getElementById('hud').appendChild(el);

    // one-shot buttons
    for (const b of el.querySelectorAll('[data-act]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pressed.add(b.dataset.act);
        b.classList.add('down');
      });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    }

    // pedals: held while touched
    for (const b of el.querySelectorAll('[data-hold]')) {
      const key = b.dataset.hold;
      const set = (on) => {
        this[key] = key === 'handbrake' ? on : on ? 1 : 0;
        b.classList.toggle('down', on);
      };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
      b.addEventListener('pointerup', () => set(false));
      b.addEventListener('pointercancel', () => set(false));
      b.addEventListener('lostpointercapture', () => set(false));
    }

    // steering: drag sideways from wherever the finger lands
    const pad = el.querySelector('.t-steer'), ring = el.querySelector('.t-ring'), knob = el.querySelector('.t-knob');
    let id = null, x0 = 0;
    const move = (x) => {
      const d = Math.max(-1, Math.min(1, (x - x0) / STEER_RANGE));
      this.steer = -Math.sign(d) * Math.abs(d) ** 1.3; // finer near the centre
      knob.style.transform = `translateX(${d * STEER_RANGE}px)`;
    };
    pad.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      pad.setPointerCapture(id);
      x0 = e.clientX;
      const r = pad.getBoundingClientRect();
      ring.style.left = `${e.clientX - r.left}px`;
      ring.style.top = `${e.clientY - r.top}px`;
      pad.classList.add('down');
      move(x0);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e.clientX); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.steer = 0;
      knob.style.transform = '';
      ring.style.left = ring.style.top = '';
      pad.classList.remove('down');
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('lostpointercapture', end);

    // no long-press menus or text selection on the controls
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
