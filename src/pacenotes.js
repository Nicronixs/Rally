// Builds rally pacenotes ("Aufschrieb") from the stage geometry.
// Grades follow the common 1–6 scale: 6 = very fast, 1 = very slow, plus "Haarnadel".
// Curvature sign: positive = right turn (heading turns from +X towards +Z).

const GRADES = [
  // [max radius in metres, label]
  [17, 'H'], // Haarnadel
  [26, 1],
  [40, 2],
  [60, 3],
  [90, 4],
  [140, 5],
  [230, 6],
];
const K_ON = 1 / 230; // curvature above which the road counts as a corner
const MIN_ANGLE = 0.24; // radians; smaller kinks are not called
const LINK_DIST = 30; // closer than this: "in" (next follows immediately)

function gradeFor(radius) {
  for (const [r, g] of GRADES) if (radius < r) return g;
  return null;
}

function roundDistance(d) {
  if (d < 70) return 50;
  if (d < 125) return 100;
  if (d < 175) return 150;
  if (d < 250) return 200;
  return Math.round(d / 100) * 100;
}

// Split a same-sign run where the road nearly straightens between two bends.
function splitRun(curv, s, e) {
  const pieces = [];
  let from = s;
  let peakLeft = 0;
  for (let k = s + 1; k < e; k++) {
    const a = Math.abs(curv[k]);
    peakLeft = Math.max(peakLeft, Math.abs(curv[k - 1]));
    if (a <= Math.abs(curv[k - 1]) && a <= Math.abs(curv[k + 1])) {
      let peakRight = 0;
      for (let j = k + 1; j <= e; j++) peakRight = Math.max(peakRight, Math.abs(curv[j]));
      if (a < 0.4 * Math.min(peakLeft, peakRight) && k - from > 8 && e - k > 8) {
        pieces.push([from, k]);
        from = k + 1;
        peakLeft = 0;
      }
    }
  }
  pieces.push([from, e]);
  return pieces;
}

// Trim a piece to its meaningful part and measure it.
function describe(curv, s, e, sign) {
  let peak = 0, apex = s;
  for (let k = s; k <= e; k++) if (Math.abs(curv[k]) > peak) { peak = Math.abs(curv[k]); apex = k; }
  const edge = Math.max(K_ON, 0.25 * peak);
  while (s < apex && Math.abs(curv[s]) < edge) s++;
  while (e > apex && Math.abs(curv[e]) < edge) e--;
  let angle = 0, coreAngle = 0, coreLen = 0;
  for (let k = s; k <= e; k++) {
    angle += Math.abs(curv[k]);
    if (Math.abs(curv[k]) >= 0.6 * peak) { coreAngle += Math.abs(curv[k]); coreLen++; }
  }
  if (angle < MIN_ANGLE) return null;
  // radius of the core of the corner (more representative than the single peak)
  const radius = Math.max(1 / peak, coreLen / Math.max(coreAngle, 1e-6) * 0.92);
  return { start: s, end: e, apex, dir: sign > 0 ? 'R' : 'L', radius, angle };
}

// Corner runs where |curvature| stays above K_ON with the same sign.
function findCorners(stage) {
  const { curv, count } = stage;
  const corners = [];
  let i = stage.startIndex;
  while (i < stage.finishIndex) {
    if (Math.abs(curv[i]) <= K_ON) { i++; continue; }
    const sign = Math.sign(curv[i]);
    let e = i;
    // extend; bridge short dips below the threshold with the same sign
    while (e < count - 1) {
      if (Math.sign(curv[e + 1]) === sign && Math.abs(curv[e + 1]) > K_ON) { e++; continue; }
      let gap = 1;
      while (gap < 14 && e + gap < count && Math.sign(curv[e + gap]) === sign && Math.abs(curv[e + gap]) <= K_ON) gap++;
      if (gap < 14 && e + gap < count && Math.sign(curv[e + gap]) === sign && Math.abs(curv[e + gap]) > K_ON) { e += gap; continue; }
      break;
    }
    for (const piece of splitRun(curv, i, e)) {
      const c = describe(curv, piece[0], piece[1], sign);
      if (c) corners.push(c);
    }
    i = e + 1;
  }
  return corners;
}

function findCrests(stage) {
  const { ys, count } = stage;
  const W = 18;
  const crests = [];
  let best = null;
  for (let i = Math.max(W, stage.startIndex); i < Math.min(count - W, stage.finishIndex); i++) {
    const d2 = (ys[i + W] - 2 * ys[i] + ys[i - W]) / (W * W);
    if (d2 < -0.0016) {
      if (!best || d2 < best.d2) best = { index: i, d2 };
    } else if (best) {
      crests.push(best.index);
      best = null;
    }
  }
  return crests;
}

export function buildPacenotes(stage) {
  const corners = findCorners(stage);
  const crests = findCrests(stage);
  const notes = [];

  for (const c of corners) {
    let grade = gradeFor(c.radius);
    if (grade === null) continue;
    // short kinks can be taken faster than their radius suggests
    if (grade !== 'H' && c.angle < 0.6) grade = Math.min(6, grade + 1);
    // a tight corner is only a hairpin if it actually turns back on itself
    if (grade === 'H' && c.angle < 2.0) grade = 1;
    const mods = [];
    const len = c.end - c.start;
    if (grade !== 'H') {
      // compare radius in the first and last third of the corner
      const third = Math.max(2, Math.floor(len / 3));
      let k1 = 0, k3 = 0;
      for (let k = c.start; k < c.start + third; k++) k1 = Math.max(k1, Math.abs(stage.curv[k]));
      for (let k = c.end - third; k <= c.end; k++) k3 = Math.max(k3, Math.abs(stage.curv[k]));
      if (k3 > k1 * 1.45) mods.push('zieht zu');
      else if (k1 > k3 * 1.45) mods.push('macht auf');
      if (c.angle > 1.75) mods.unshift('lang');
    }
    notes.push({ index: c.start, end: c.end, type: 'corner', dir: c.dir, grade, mods, radius: Math.round(c.radius) });
  }

  // crests: merge into a corner that starts right after, else stand alone
  for (const ci of crests) {
    const next = notes.find((n) => n.type === 'corner' && n.index >= ci - 5 && n.index - ci < 25);
    if (next) next.overCrest = true;
    else if (!notes.some((n) => ci >= n.index && ci <= n.end)) notes.push({ index: ci, end: ci + 8, type: 'crest' });
  }
  notes.sort((a, b) => a.index - b.index);

  // warnings, distances and links
  let prevEnd = stage.startIndex;
  notes.forEach((n, k) => {
    const straight = n.index - prevEnd;
    if (n.type === 'corner' && (n.grade === 'H' || n.grade <= 2) && straight > 160) n.caution = true;
    if (k > 0) {
      const p = notes[k - 1];
      const gap = n.index - p.end;
      p.next = gap < LINK_DIST ? 'in' : roundDistance(gap);
    }
    prevEnd = Math.max(prevEnd, n.end);
  });
  const last = notes[notes.length - 1];
  if (last) last.next = roundDistance(stage.finishIndex - last.end);
  notes.push({ index: stage.finishIndex, end: stage.finishIndex, type: 'finish' });
  return notes;
}

// Text for the notebook (short) and for speech (spoken German).
export function noteText(n) {
  if (n.type === 'finish') return { short: 'ZIEL', spoken: 'Ziel' };
  if (n.type === 'crest') {
    return { short: 'Kuppe', spoken: 'Kuppe' };
  }
  const dirWord = n.dir === 'L' ? 'Links' : 'Rechts';
  const gradeShort = n.grade === 'H' ? 'Haarnadel' : String(n.grade);
  const parts = [];
  if (n.caution) parts.push('Achtung');
  if (n.overCrest) parts.push('über Kuppe');
  parts.push(`${dirWord} ${gradeShort}`);
  parts.push(...n.mods);
  const text = parts.join(' ');
  return { short: text, spoken: text };
}

export function nextText(n) {
  if (n.next === undefined) return '';
  return n.next === 'in' ? 'in' : String(n.next);
}
