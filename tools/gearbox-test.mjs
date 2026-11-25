// Gearbox test: 0-100 km/h, top speed, gear and rpm per car (automatic mode).
// node tools/gearbox-test.mjs
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const { Vehicle } = await import('../src/vehicle.js');
const { CARS } = await import('../src/cars.js');
for (const car of Object.values(CARS)) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(9000, 1, 9000).setTranslation(0, -1, 0));
  const v = new Vehicle(world, car.tuning); v.place(0, 1, 0, 0);
  const s = () => ({ grip: 1, rolling: 0, kind: 'gravel' });
  for (let i = 0; i < 90; i++) { v.step(1 / 60, { throttle: 0, brake: 0, steer: 0 }, s); world.step(); } // settle on the springs
  let t = 0, t100 = null, shifts = [];
  for (let i = 0; i < 60 * 60; i++) {
    const g = v.gear;
    v.step(1 / 60, { throttle: 1, brake: 0, steer: 0 }, s); world.step(); t += 1 / 60;
    if (v.gear !== g) shifts.push(`${g}->${v.gear}@${Math.round(v.speed * 3.6)}`);
    if (t100 === null && v.speed * 3.6 >= 100) t100 = t;
  }
  console.log(`${car.name.padEnd(14)} 0-100 ${t100.toFixed(2)} s | top ${Math.round(v.speed * 3.6)} km/h in ${v.gear}. Gang @ ${Math.round(v.rpm)} rpm | ${shifts.join(' ')}`);
}
