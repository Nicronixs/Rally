// Recorded co-driver voice (ElevenLabs, voice "Leo"): one recording with every word of the
// pace note vocabulary, cut into clips by public/voice/codriver.json, played back to back.
// If the files are missing the notebook falls back to the browser's speech synthesis.
const GAP = 0.03; // s between clips
const RATE = 1.08; // co-drivers talk fast

// clip keys for one note (the keys in public/voice/codriver.json)
export function noteClips(n) {
  if (n.type === 'finish') return ['ziel'];
  if (n.type === 'crest') return ['kuppe'];
  const out = [];
  if (n.caution) out.push('achtung');
  if (n.overCrest) out.push('ueber_kuppe');
  out.push(`${n.dir === 'L' ? 'links' : 'rechts'}_${n.grade === 'H' ? 'h' : n.grade}`);
  for (const m of n.mods) out.push(m.replace(' ', '_')); // lang, zieht_zu, macht_auf
  return out;
}

export function distanceClip(d) {
  return `d${Math.min(1000, d)}`;
}

export class CodriverVoice {
  constructor() {
    this.ready = false;
    this.playing = [];
    this.load();
    // mobile browsers start the context suspended; it may only be resumed inside a touch or click
    const wake = () => { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, wake);
  }

  async load() {
    try {
      const base = import.meta.env.BASE_URL;
      const [cuts, data] = await Promise.all([
        fetch(`${base}voice/codriver.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch(`${base}voice/codriver.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))),
      ]);
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.buffer = await this.ctx.decodeAudioData(data);
      this.cuts = cuts.clips;
      // intercom sound: a little band-limited, like a helmet radio
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      this.out = this.ctx.createGain(); this.out.gain.value = 1.15;
      hp.connect(lp).connect(this.out).connect(this.ctx.destination);
      this.input = hp;
      this.ready = true;
    } catch {
      this.ready = false; // no recording: speech synthesis is used
    }
  }

  has(keys) {
    return this.ready && keys.every((k) => this.cuts[k]);
  }

  play(keys) {
    if (!this.has(keys)) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.stop();
    let t = this.ctx.currentTime + 0.02;
    for (const k of keys) {
      const [start, end] = this.cuts[k];
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.playbackRate.value = RATE;
      src.connect(this.input);
      src.start(t, start, end - start);
      this.playing.push(src);
      t += (end - start) / RATE + GAP;
    }
    return true;
  }

  stop() {
    for (const s of this.playing) { try { s.stop(); } catch { /* already done */ } }
    this.playing = [];
  }
}
