// Drift test: wheel slip in a normal corner vs a handbrake drift (threshold of the "Quertreiber" achievement).
// node tools/drift-test.mjs
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const R = '../src/';
const { Vehicle } = await import(R + 'vehicle.js');
const { CARS } = await import(R + 'cars.js');
// angle between heading and direction of travel, degrees (same as in main.js)
function slipAngle(v) {
  const lv = v.body.linvel(), f = v.forward();
  const sp = Math.hypot(lv.x, lv.z);
  if (sp < 3) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (lv.x * f.x + lv.z * f.z) / (sp * Math.hypot(f.x, f.z))))) * 180) / Math.PI;
}
const surf = () => ({ grip: 1, rolling: 0, kind: 'gravel' });
function run(carId, label, inputAt) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0));
  const v = new Vehicle(world, CARS[carId].tuning); v.place(0, 1, 0, 0);
  let streak = 0, best = 0, maxSlip = 0;
  for (let i = 0; i < 60 * 14; i++) {
    const t = i / 60;
    v.step(1 / 60, inputAt(t, v), surf); world.step();
    const s = slipAngle(v); maxSlip = Math.max(maxSlip, s);
    streak = t > 6 && s > 12 && s < 70 && Math.abs(v.speed) * 3.6 > 40 ? streak + 1 / 60 : 0;
    best = Math.max(best, streak);
  }
  console.log(`${carId.padEnd(7)} ${label.padEnd(34)} max Schwimmwinkel ${maxSlip.toFixed(0)}° | längster Drift ${best.toFixed(1)} s`);
}
const accel = (t) => ({ throttle: 1, brake: 0, steer: 0 });
for (const id of ['fuchs', 'bison', 'falke']) {
  run(id, 'gerade, Vollgas', accel);
  run(id, 'normale Kurve (Lenkung 0,3)', (t) => t < 6 ? accel(t) : { throttle: 0.5, brake: 0, steer: 0.3 });
  run(id, 'Handbremse + Vollgas + Gegenlenken', (t) => t < 6 ? accel(t) : t < 6.6 ? { throttle: 1, brake: 0, steer: 1, handbrake: true } : { throttle: 1, brake: 0, steer: -0.4 });
}
