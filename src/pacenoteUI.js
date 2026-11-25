// Co-driver notebook panel and spoken calls.
// In the coming co-op mode this panel moves to the co-driver's device.
import { noteText, nextText } from './pacenotes.js';
import { CodriverVoice, noteClips, distanceClip } from './codriverVoice.js';

let recorded = null; // shared across stages (loaded once)

const TURN_DEG = { H: 180, 1: 135, 2: 110, 3: 90, 4: 65, 5: 45, 6: 25 };

function arrowSvg(n) {
  if (n.type === 'finish') return '<span class="pn-flag">🏁</span>';
  if (n.type === 'crest') {
    return '<svg viewBox="0 0 40 40"><path d="M4 30 Q20 6 36 30" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
  }
  // a stroke going up and bending by the corner angle
  const total = (TURN_DEG[n.grade] * Math.PI) / 180;
  const side = n.dir === 'R' ? 1 : -1;
  const pts = [[20, 36], [20, 26]];
  let x = 20, y = 26, h = -Math.PI / 2;
  const seg = 12, steps = 8;
  const r = n.grade === 'H' ? 7 : 16;
  for (let i = 0; i < steps; i++) {
    h += (side * total) / steps;
    const len = Math.min(seg, (r * total) / steps);
    x += Math.cos(h) * len; y += Math.sin(h) * len;
    pts.push([x, y]);
  }
  // fit into the box
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min(1, 30 / Math.max(maxX - minX, maxY - minY));
  const ox = 20 - ((minX + maxX) / 2) * sc, oy = 20 - ((minY + maxY) / 2) * sc;
  const P = pts.map(([px, py]) => [px * sc + ox, py * sc + oy]);
  const [ex, ey] = P[P.length - 1], [bx, by] = P[P.length - 2];
  const a = Math.atan2(ey - by, ex - bx);
  const head = [[ex + Math.cos(a) * 3, ey + Math.sin(a) * 3],
    [ex + Math.cos(a + 2.4) * 7, ey + Math.sin(a + 2.4) * 7],
    [ex + Math.cos(a - 2.4) * 7, ey + Math.sin(a - 2.4) * 7]];
  return `<svg viewBox="0 0 40 40"><polyline points="${P.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polygon points="${head.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="currentColor"/></svg>`;
}

export class PacenoteUI {
  constructor(notes) {
    this.notes = notes;
    this.panel = document.getElementById('notebook');
    this.list = document.getElementById('notebook-list');
    this.bookOn = localStorage.getItem('rally.book') !== '0';
    this.voiceOn = localStorage.getItem('rally.voice') !== '0';
    this.voice = null;
    recorded = recorded || new CodriverVoice();
    this.rec = recorded;
    this.role = 'solo';
    this.visibleRows = 6;
    this.distEl = document.getElementById('notebook-dist');
    this.current = 0; // first note not yet passed
    this.called = 0; // first note not yet spoken
    this.list.innerHTML = notes.map((n, i) => {
      const t = noteText(n);
      const nx = nextText(n);
      const cls = n.caution ? ' pn-caution' : '';
      return `<div class="pn-row${cls}" data-i="${i}"><div class="pn-icon">${arrowSvg(n)}</div>` +
        `<div class="pn-text">${t.short}</div><div class="pn-next">${nx}</div></div>`;
    }).join('');
    this.rows = [...this.list.children];
    this.applyVisibility();
    if ('speechSynthesis' in window) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voice = vs.find((v) => v.lang.startsWith('de') && /Katja|Hedda|Google/.test(v.name)) ||
          vs.find((v) => v.lang.startsWith('de')) || null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }
  }

  // driver in co-op: no notebook, no voice (the co-driver calls); co-driver: big notebook, no voice.
  // These are not saved, so solo play keeps its own settings.
  setRole(role) {
    this.role = role;
    if (role === 'driver') { this.bookOn = false; this.voiceOn = false; }
    if (role === 'codriver') {
      this.bookOn = true;
      this.voiceOn = false;
      // as many big rows as fit on the screen
      const fit = () => { this.visibleRows = Math.max(3, Math.min(8, Math.floor((window.innerHeight - 260) / 82))); this.render(); };
      window.addEventListener('resize', fit);
      fit();
    }
    this.silence();
    this.applyVisibility();
    this.render();
  }

  applyVisibility() {
    this.panel.classList.toggle('hidden', !this.bookOn);
    document.getElementById('voice-state').textContent = this.role !== 'solo' ? '' : this.voiceOn ? 'Ansagen an (V)' : 'Ansagen aus (V)';
  }

  toggleBook() {
    this.bookOn = !this.bookOn;
    if (this.role === 'solo') localStorage.setItem('rally.book', this.bookOn ? '1' : '0');
    this.applyVisibility();
  }

  toggleVoice() {
    this.voiceOn = !this.voiceOn;
    if (this.role === 'solo') localStorage.setItem('rally.voice', this.voiceOn ? '1' : '0');
    if (!this.voiceOn) this.silence();
    this.applyVisibility();
  }

  // jump to the position of the car (start, restart, reset)
  sync(trackIndex) {
    let k = 0;
    while (k < this.notes.length - 1 && this.notes[k].end < trackIndex) k++;
    this.current = k;
    this.called = k;
    this.silence();
    this.render();
  }

  silence() {
    this.rec.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  // recorded voice when every clip exists, otherwise the browser's speech synthesis
  speak(text, clips) {
    if (!this.voiceOn) return;
    if (clips && this.rec.play(clips)) return;
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (this.voice) u.voice = this.voice;
    u.rate = 1.3;
    u.pitch = 1.0;
    speechSynthesis.speak(u);
  }

  update(trackIndex, speed, running) {
    const notes = this.notes;
    let changed = false;
    while (this.current < notes.length - 1 && notes[this.current].end < trackIndex) { this.current++; changed = true; }
    if (running) {
      // call ahead: about 3 seconds before the corner, at least 55 m
      const lead = Math.max(55, Math.abs(speed) * 3.2);
      if (this.called < notes.length && notes[this.called].index - trackIndex < lead) {
        // speak this note and every note linked to it with "in"
        const parts = [], clips = [];
        let k = this.called;
        while (k < notes.length) {
          const n = notes[k];
          let s = noteText(n).spoken;
          clips.push(...noteClips(n));
          if (n.next === 'in' && k + 1 < notes.length) { parts.push(`${s} in`); clips.push('in'); k++; continue; }
          if (typeof n.next === 'number' && n.next >= 100) { s += `, ${n.next}`; clips.push(distanceClip(n.next)); }
          parts.push(s);
          k++;
          break;
        }
        this.called = Math.max(k, this.current);
        this.speak(parts.join(' '), clips);
        changed = true;
      }
    }
    if (changed) this.render();
    const d = notes[this.current] ? notes[this.current].index - trackIndex : 0;
    this.distEl.textContent = d > 0 ? `noch ${Math.round(d / 5) * 5} m` : '';
  }

  render() {
    const first = this.current;
    this.rows.forEach((row, i) => {
      const visible = i >= first && i < first + this.visibleRows;
      row.style.display = visible ? '' : 'none';
      row.classList.toggle('pn-active', i === first);
      row.classList.toggle('pn-called', i < this.called && i !== first);
    });
  }
}
