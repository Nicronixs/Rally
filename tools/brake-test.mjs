// Braking test: distance and deceleration from 100 km/h on each surface grip.
// node tools/brake-test.mjs '{"brakeImpulse":80}'
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const { Vehicle } = await import('../src/vehicle.js');
const { CARS } = await import('../src/cars.js');
const over = JSON.parse(process.argv[2] || '{}');
for (const car of Object.values(CARS)) {
  const row = [];
  for (const [surf, grip] of [['Asphalt', 1.3], ['Schotter', 1.0], ['Schnee', 0.72]]) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60;
    world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0));
    const v = new Vehicle(world, { ...car.tuning, ...over }); v.place(0, 1, 0, 0);
    const s = () => ({ grip, rolling: 0, kind: 'gravel' });
    for (let i = 0; i < 60 * 30 && v.speed * 3.6 < 100; i++) { v.step(1 / 60, { throttle: 1, brake: 0, steer: 0 }, s); world.step(); }
    const x0 = v.body.translation().x; let t = 0;
    while (v.speed > 0.5 && t < 20) { v.step(1 / 60, { throttle: 0, brake: 1, steer: 0 }, s); world.step(); t += 1 / 60; }
    const d = v.body.translation().x - x0;
    row.push(`${surf} ${d.toFixed(1)} m (${(27.8 / t / 9.81).toFixed(2)} g)`);
  }
  console.log(car.name.padEnd(14), row.join(' | '));
}
