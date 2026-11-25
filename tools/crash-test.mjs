// Crash test: how much damage hits at different speeds do. node tools/crash-test.mjs
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const { Vehicle } = await import('../src/vehicle.js');
const { CARS } = await import('../src/cars.js');
for (const kmh of [15, 30, 60, 100]) for (const what of ['wall', 'tree']) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0));
  if (what === 'wall') world.createCollider(RAPIER.ColliderDesc.cuboid(1, 3, 20).setTranslation(160, 2, 0));
  else world.createCollider(RAPIER.ColliderDesc.cylinder(2, 0.3).setTranslation(160, 1.8, 0.5));
  const v = new Vehicle(world); v.place(0, 1, 0, 0);
  const q = new RAPIER.EventQueue(true);
  let maxF = 0;
  for (let i = 0; i < 60 * 20; i++) {
    const inp = v.speed * 3.6 < kmh ? { throttle: 1, brake: 0, steer: 0 } : { throttle: 0, brake: 0.3, steer: 0 };
    v.step(1 / 60, inp, null); world.step(q);
    q.drainContactForceEvents((e) => { const f = e.totalForceMagnitude(); maxF = Math.max(maxF, f); if (v.colliders.has(e.collider1()) || v.colliders.has(e.collider2())) v.applyImpact(e.maxForceDirection()); });
    if (v.body.translation().x > 165) break;
  }
  const d = v.damage;
  console.log(`${what} @${kmh}: maxF ${(maxF / 1000).toFixed(0)} kN  engine ${d.engine.toFixed(2)} susp ${d.suspension.toFixed(2)} body ${d.body.toFixed(2)}`);
}
// ground scrape and a rough landing should do (almost) nothing
{
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0));
  const v = new Vehicle(world); v.place(0, 4, 0, 0); const q = new RAPIER.EventQueue(true);
  for (let i = 0; i < 120; i++) { v.step(1 / 60, { throttle: 0, brake: 0, steer: 0 }, null); world.step(q); q.drainContactForceEvents((e) => v.applyImpact(e.maxForceDirection())); }
  console.log('drop from 3 m:', JSON.stringify(v.damage));
}
