// Car ratings: key figures estimated from the physics values, six 0–10 stats and a
// performance index (100–999) with a class letter.

const G = 9.81;
const KMH = 3.6;

// classes by performance index
export const CLASSES = [
  { id: 'D', min: 100, color: '#3fb6e8' },
  { id: 'C', min: 501, color: '#f2c12e' },
  { id: 'B', min: 601, color: '#f08a24' },
  { id: 'A', min: 701, color: '#e2453c' },
  { id: 'S1', min: 801, color: '#a34fd9' },
  { id: 'S2', min: 901, color: '#3d5bd9' },
  { id: 'X', min: 999, color: '#2fbf71' },
];

export const classOf = (pi) => [...CLASSES].reverse().find((c) => pi >= c.min);

// top speed limited by gearing (redline in top gear) or by drag
function topSpeed(t) {
  const gearLimited = ((t.redline / 60) * 2 * Math.PI * t.wheelRadius) / (t.gearRatios[t.gearRatios.length - 1] * t.finalDrive);
  const dragLimited = Math.cbrt(t.power / t.drag);
  return Math.min(gearLimited, dragLimited); // m/s
}

// 0–100 km/h: traction- and power-limited acceleration with drag and gear-change losses
function zeroTo100(t) {
  let v = 0, time = 0;
  const dt = 0.01;
  while (v < 100 / KMH && time < 30) {
    const drive = Math.min(t.maxDriveForce, t.power / Math.max(v, 1)) * 0.93; // torque curve and shifts
    v += ((drive - t.drag * v * v) / t.mass) * dt;
    time += dt;
  }
  return time + 0.05; // calibrated against tools/gearbox-test.mjs
}

// 100–0 km/h: brakes or tyre grip, whichever gives up first
function brakingDistance(t) {
  const grip = (t.frontGrip + t.rearGrip) / 2;
  const brake = (t.brakeImpulse * 4 * 60) / t.mass; // m/s²
  const decel = Math.min(brake, 2.1 * grip * G);
  const v = 100 / KMH;
  return (v * v) / (2 * decel);
}

const clamp10 = (x) => Math.max(0, Math.min(10, x));

// t: full tuning (TUNING merged with car tuning and upgrades)
export function rateCar(t) {
  const vmax = topSpeed(t) * KMH;
  const t100 = zeroTo100(t);
  const brake = brakingDistance(t);
  const grip = (t.frontGrip + t.rearGrip) / 2;
  const launch = t.maxDriveForce / t.mass;
  const stats = {
    speed: clamp10(((vmax - 150) / (240 - 150)) * 10),
    accel: clamp10(((7.5 - t100) / (7.5 - 2.8)) * 10),
    handling: clamp10(((grip - 0.8) / (1.25 - 0.8)) * 8 + ((t.yawHold - 0.9) / (2.0 - 0.9)) * 2),
    braking: clamp10(((32 - brake) / (32 - 12)) * 10),
    launch: clamp10(((launch - 5) / (11 - 5)) * 10),
    robust: clamp10(((1.2 - (t.damageResist ?? 1)) / (1.2 - 0.55)) * 10),
  };
  const weights = { speed: 0.25, accel: 0.3, handling: 0.2, braking: 0.1, launch: 0.1, robust: 0.05 };
  const score = Object.entries(weights).reduce((s, [k, w]) => s + stats[k] * w, 0); // 0..10
  const pi = Math.max(100, Math.min(999, Math.round(100 + score * 89.9)));
  return { pi, cls: classOf(pi), stats, figures: { vmax, t100, brake, grip } };
}

export const STAT_NAMES = {
  speed: 'Tempo', accel: 'Beschleunigung', handling: 'Handling', braking: 'Bremsen', launch: 'Start', robust: 'Robustheit',
};
