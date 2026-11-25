// Synthesised engine and gravel sounds with Web Audio.

export class CarAudio {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('rally.muted') === '1';
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // engine: two detuned oscillators through a low-pass filter
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(g2).connect(this.engineFilter);
    this.osc1.start(); this.osc2.start();

    // gravel: filtered noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf; this.noise.loop = true;
    this.gravelFilter = ctx.createBiquadFilter();
    this.gravelFilter.type = 'bandpass';
    this.gravelFilter.frequency.value = 900;
    this.gravelFilter.Q.value = 0.7;
    this.gravelGain = ctx.createGain();
    this.gravelGain.gain.value = 0;
    this.noise.connect(this.gravelFilter).connect(this.gravelGain).connect(this.master);
    this.noise.start();
  }

  // short thump of filtered noise for a crash; sev 0..1
  crash(sev) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise.buffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + sev * 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.4 + sev), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + sev * 0.4);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 1);
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('rally.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  update(rpm, throttle, speed, slip, onGravel) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = (rpm / 60) * 2; // four-cylinder firing frequency
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f * 0.5 * 1.01, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(400 + rpm * 0.25 + throttle * 1400, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.13 + throttle * 0.14, t, 0.05);
    const abs = Math.abs(speed);
    const g = Math.min(0.5, abs / 60) * (onGravel ? 1 : 0.5) + slip * 0.35 * Math.min(1, abs / 5);
    this.gravelGain.gain.setTargetAtTime(g, t, 0.08);
    this.gravelFilter.frequency.setTargetAtTime(500 + abs * 18, t, 0.1);
  }
}
