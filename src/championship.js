// Championship: rallies, stage seeds, rival times, points and the saved progress.
import { mulberry32 } from './noise.js';

export const RALLIES = [
  { id: 'nordwald', name: 'Rallye Nordwald', env: 'forest', icon: '🌲' },
  { id: 'schneeland', name: 'Rallye Schneeland', env: 'snow', icon: '❄️' },
  { id: 'alpen', name: 'Rallye Alpenpass', env: 'tarmac', icon: '⛰️' },
  { id: 'sandmeer', name: 'Rallye Sandmeer', env: 'desert', icon: '🏜️' },
];
export const STAGES_PER_RALLY = 3;
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SERVICE_MINUTES = 45; // service only between rallies
export const RESET_PENALTY = 5; // seconds for "R" (recovery) in the championship

// Fictional rivals; skill is a factor on the reference time (lower = faster).
export const RIVALS = [
  { name: 'L. Halvorsen', skill: 0.97 },
  { name: 'M. Duval', skill: 1.0 },
  { name: 'K. Arai', skill: 1.03 },
  { name: 'T. Brenner', skill: 1.06 },
  { name: 'S. Okafor', skill: 1.1 },
  { name: 'P. Lindgren', skill: 1.15 },
  { name: 'R. Castell', skill: 1.22 },
];
export const PLAYER = 'Du';

const KEY = 'rally.champ';

export function loadChampionship() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && c.version === 1 ? c : null;
  } catch { return null; }
}

export function saveChampionship(c) {
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function clearChampionship() {
  localStorage.removeItem(KEY);
}

export function newChampionship(carId) {
  const c = {
    version: 1,
    car: carId,
    seed: Math.floor(Math.random() * 90000) + 1000,
    rally: 0,
    stage: 0,
    times: RALLIES.map(() => []), // player stage times (incl. penalties) per rally
    refs: RALLIES.map(() => []), // reference times of the stages, filled when driven
    damage: { engine: 0, suspension: 0, body: 0 },
    points: {},
    finished: false,
  };
  saveChampionship(c);
  return c;
}

export function stageSeed(c, rally = c.rally, stage = c.stage) {
  return ((c.seed * 31 + rally * 1009 + stage * 97) % 99991) + 1;
}

// Fast estimate of a clean run: speed limited by corner radius, acceleration and braking.
export function referenceTime(stage, env) {
  const mu = 0.95 * env.grip.road;
  const vTop = 52, accel = 5.2, brake = 8.5 * Math.min(1.2, env.grip.road);
  const a = stage.startIndex, b = stage.finishIndex, n = b - a + 1;
  const v = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const kc = Math.max(Math.abs(stage.curv[a + k]), 1e-4);
    v[k] = Math.min(vTop, Math.sqrt((mu * 9.81) / kc));
  }
  v[0] = 0;
  for (let k = 1; k < n; k++) v[k] = Math.min(v[k], Math.sqrt(v[k - 1] ** 2 + 2 * accel));
  for (let k = n - 2; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] ** 2 + 2 * brake));
  let t = 0;
  for (let k = 1; k < n; k++) t += 2 / (v[k] + v[k - 1] + 0.1);
  return t * REF_FACTOR;
}
// calibrated so the reference roughly matches a tidy (not perfect) drive
const REF_FACTOR = 1.11; // raised from 1.08 with the real gearbox (about 3 % slower than before)

function rivalStageTime(c, rally, stage, i, ref) {
  const rng = mulberry32(stageSeed(c, rally, stage) * 13 + i * 7919);
  let t = ref * RIVALS[i].skill * (1 + (rng() - 0.5) * 0.05);
  if (rng() < 0.08) t += 4 + rng() * 18; // a mistake
  return t;
}

// Results of one stage, sorted, including the player if driven.
export function stageResults(c, rally, stage) {
  const ref = c.refs[rally][stage];
  if (ref == null) return [];
  const rows = RIVALS.map((r, i) => ({ name: r.name, time: rivalStageTime(c, rally, stage, i, ref) }));
  const mine = c.times[rally][stage];
  if (mine != null) rows.push({ name: PLAYER, time: mine, player: true });
  return rows.sort((x, y) => x.time - y.time);
}

// Overall rally classification over the stages driven so far.
export function rallyStandings(c, rally) {
  const driven = c.times[rally].length;
  const rows = RIVALS.map((r, i) => {
    let t = 0;
    for (let s = 0; s < driven; s++) t += rivalStageTime(c, rally, s, i, c.refs[rally][s]);
    return { name: r.name, time: t };
  });
  rows.push({ name: PLAYER, time: c.times[rally].reduce((a, b) => a + b, 0), player: true });
  return rows.sort((x, y) => x.time - y.time);
}

export function championshipStandings(c) {
  const names = [PLAYER, ...RIVALS.map((r) => r.name)];
  return names
    .map((n) => ({ name: n, points: c.points[n] || 0, player: n === PLAYER }))
    .sort((a, b) => b.points - a.points);
}

// Record the player's stage time; returns what happens next.
export function recordStage(c, time, ref, damage) {
  c.times[c.rally][c.stage] = time;
  c.refs[c.rally][c.stage] = ref;
  c.damage = { ...damage };
  const rally = c.rally;
  let rallyDone = false;
  if (c.stage + 1 >= STAGES_PER_RALLY) {
    rallyDone = true;
    rallyStandings(c, rally).forEach((row, pos) => {
      c.points[row.name] = (c.points[row.name] || 0) + (POINTS[pos] || 0);
    });
    if (rally + 1 >= RALLIES.length) c.finished = true;
    else { c.rally = rally + 1; c.stage = 0; c.serviceDue = true; } // damage stays until the service before the next rally
  } else {
    c.stage += 1;
  }
  saveChampionship(c);
  return { rally, rallyDone };
}

export function repairCost(damage) {
  return {
    engine: Math.ceil(damage.engine * 25),
    suspension: Math.ceil(damage.suspension * 20),
    body: Math.ceil(damage.body * 15),
  };
}
