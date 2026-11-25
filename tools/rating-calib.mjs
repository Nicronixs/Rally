// Prints the rating of every car: stock and fully tuned. node tools/rating-calib.mjs
const { TUNING } = await import('../src/vehicle.js');
const { CARS } = await import('../src/cars.js');
const { tunedOverrides, CAR_PRICES } = await import('../src/profile.js');
const { rateCar } = await import('../src/ratings.js');
globalThis.localStorage ??= { getItem: () => null, setItem() {} };
const full = { upgrades: {} };
for (const c of Object.values(CARS)) {
  full.upgrades[c.id] = { engine: 3, brakes: 3, suspension: 3, tyres: 3 };
  const s = rateCar({ ...TUNING, ...tunedOverrides(null, c.id, TUNING) });
  const f = rateCar({ ...TUNING, ...tunedOverrides(full, c.id, TUNING) });
  const st = Object.values(s.stats).map((x) => x.toFixed(1)).join(' ');
  console.log(`${c.name.padEnd(16)} ${String(CAR_PRICES[c.id]).padStart(6)} € | ${s.cls.id.padEnd(2)} ${s.pi} -> ${f.cls.id.padEnd(2)} ${f.pi} | ${Math.round(s.figures.vmax)} km/h ${s.figures.t100.toFixed(2)} s ${s.figures.brake.toFixed(1)} m | ${st}`);
}
