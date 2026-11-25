// Generates a point-to-point rally stage: a centreline sampled every metre,
// with heights, tangents and curvature, plus fast nearest-point lookups.
import * as THREE from 'three';
import { mulberry32, fbm, valueNoise } from './noise.js';
import { getEnvironment } from './environments.js';

const CELL = 16; // spatial hash cell size in metres

export const ROAD_HALF_WIDTH = 4.2;

export function makeBaseHeight(seed, env = getEnvironment('forest')) {
  const T = env.terrain;
  const dunes = env.id === 'desert';
  return (x, z) => {
    let h = T.amp * fbm(x / T.scale, z / T.scale, seed, 4) + T.detail * fbm(x / 70, z / 70, seed + 99, 3);
    if (dunes) h += 7 * (1 - Math.abs(valueNoise(x / 90 + z / 300, z / 140, seed + 7))) ** 2;
    return h;
  };
}

function controlPoints(rng, count) {
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(60, 0, 0)];
  let heading = 0;
  let tries = 0;
  while (pts.length < count && tries < count * 40) {
    tries++;
    const prev = pts[pts.length - 1];
    const sharp = rng() < 0.14;
    const turn = sharp
      ? (rng() < 0.5 ? -1 : 1) * (1.2 + rng() * 0.7)
      : (rng() * 2 - 1) * 0.75;
    const step = sharp ? 45 + rng() * 20 : 55 + rng() * 45;
    const h = heading + turn;
    const p = new THREE.Vector3(prev.x + Math.cos(h) * step, 0, prev.z + Math.sin(h) * step);
    // keep away from older parts of the stage
    let ok = true;
    for (let i = 0; i < pts.length - 3; i++) {
      if (pts[i].distanceTo(p) < 110) { ok = false; break; }
    }
    if (!ok) continue;
    heading = h;
    pts.push(p);
  }
  return pts;
}

function boxBlur(src, radius) {
  const n = src.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      s += src[j]; c++;
    }
    out[i] = s / c;
  }
  return out;
}

class SpatialHash {
  constructor(xs, zs) {
    this.xs = xs; this.zs = zs;
    this.map = new Map();
    for (let i = 0; i < xs.length; i++) {
      const k = this.key(Math.floor(xs[i] / CELL), Math.floor(zs[i] / CELL));
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(i);
    }
  }
  key(cx, cz) { return (cx + 30000) * 60000 + (cz + 30000); }
  // returns index of nearest sample within radius, or -1
  nearest(x, z, radius) {
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -1, bestD = radius * radius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const arr = this.map.get(this.key(cx + dx, cz + dz));
        if (!arr) continue;
        for (let a = 0; a < arr.length; a++) {
          const i = arr[a];
          const ex = this.xs[i] - x, ez = this.zs[i] - z;
          const d = ex * ex + ez * ez;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    return best;
  }
}

function tryGenerate(seed, env) {
  const rng = mulberry32(seed);
  const pts = controlPoints(rng, 42);
  if (pts.length < 30) return null;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const length = curve.getLength();
  const count = Math.floor(length);
  const spaced = curve.getSpacedPoints(count - 1);

  const xs = new Float32Array(count), zs = new Float32Array(count);
  for (let i = 0; i < count; i++) { xs[i] = spaced[i].x; zs[i] = spaced[i].z; }

  // tangents & curvature
  const tx = new Float32Array(count), tz = new Float32Array(count);
  const heading = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1), b = Math.min(count - 1, i + 1);
    let dx = xs[b] - xs[a], dz = zs[b] - zs[a];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
    heading[i] = Math.atan2(tz[i], tx[i]);
  }
  const rawCurv = new Float32Array(count);
  const W = 4;
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - W), b = Math.min(count - 1, i + W);
    let dh = heading[b] - heading[a];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    rawCurv[i] = dh / Math.max(1, b - a);
  }
  const curv = boxBlur(rawCurv, 3);
  for (let i = 0; i < count; i++) if (Math.abs(curv[i]) > 1 / 13) return null;

  // separation check between non-adjacent parts of the stage
  const hash = new SpatialHash(xs, zs);
  for (let i = 0; i < count; i += 4) {
    const r = Math.ceil(45 / CELL);
    const cx = Math.floor(xs[i] / CELL), cz = Math.floor(zs[i] / CELL);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const arr = hash.map.get(hash.key(cx + dx, cz + dz));
      if (!arr) continue;
      for (const j of arr) {
        if (Math.abs(i - j) < 160) continue;
        if (Math.hypot(xs[j] - xs[i], zs[j] - zs[i]) < 45) return null;
      }
    }
  }

  const baseHeight = makeBaseHeight(seed, env);
  let ys = new Float32Array(count);
  for (let i = 0; i < count; i++) ys[i] = baseHeight(xs[i], zs[i]);
  ys = boxBlur(boxBlur(boxBlur(ys, 30), 30), 20);
  // limit the gradient so the stage stays drivable, then smooth the kinks
  const MAX_GRADE = 0.1;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < count; i++) ys[i] = Math.min(ys[i - 1] + MAX_GRADE, Math.max(ys[i - 1] - MAX_GRADE, ys[i]));
    for (let i = count - 2; i >= 0; i--) ys[i] = Math.min(ys[i + 1] + MAX_GRADE, Math.max(ys[i + 1] - MAX_GRADE, ys[i]));
    ys = boxBlur(ys, 12);
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
  }

  return { seed, xs, ys, zs, tx, tz, curv, count, length: count - 1, hash, baseHeight,
    bounds: { minX, maxX, minZ, maxZ } };
}

export function generateStage(seed = 1, env = getEnvironment('forest')) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const t = tryGenerate(seed + attempt * 7919, env);
    if (t) { t.env = env; return new Stage(t); }
  }
  throw new Error('Keine gültige Strecke gefunden');
}

export class Stage {
  constructor(t) {
    Object.assign(this, t);
    this.halfWidth = ROAD_HALF_WIDTH;
    this.startIndex = 25;
    this.finishIndex = this.count - 35;
    const span = this.finishIndex - this.startIndex;
    this.splitIndices = [this.startIndex + Math.round(span / 3), this.startIndex + Math.round((2 * span) / 3)];
  }

  // Nearest sample to (x, z) within radius; -1 if none.
  nearestGlobal(x, z, radius = 60) {
    return this.hash.nearest(x, z, radius);
  }

  // Nearest sample searching near a previous index first (for the car).
  nearestTracked(x, z, hint) {
    let best = -1, bestD = Infinity;
    const a = Math.max(0, hint - 60), b = Math.min(this.count - 1, hint + 60);
    for (let i = a; i <= b; i++) {
      const dx = this.xs[i] - x, dz = this.zs[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD > 30 * 30) {
      const g = this.hash.nearest(x, z, 400);
      if (g >= 0) return g;
    }
    return best;
  }

  // Signed lateral offset from the centreline (positive = right of driving direction).
  lateral(i, x, z) {
    return -(x - this.xs[i]) * this.tz[i] + (z - this.zs[i]) * this.tx[i];
  }
}
