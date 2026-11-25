// Headless handling test: node tools/physics-test.mjs [{"frontGrip":1.0,...}]
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const { Vehicle, TUNING } = await import('../src/vehicle.js');
const over = JSON.parse(process.argv[2] || '{}'); Object.assign(TUNING, over);
function mk() { const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1/60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0));
  const v = new Vehicle(world); v.place(0, 1.0, 0, 0); return { world, v }; }
const surf = () => ({ grip: 1, rolling: 0, kind: 'gravel' });
function run(v, world, secs, input, cb) { for (let i = 0; i < secs*60; i++) { v.step(1/60, typeof input==='function'?input(i/60):input, surf); world.step(); if (cb && cb(i/60, i)) return i/60; } return secs; }
for (const [kmh, st] of [[40,1],[80,1],[80,0.4],[120,0.5],[120,1]]) { const { world, v } = mk();
  run(v, world, 30, ()=>({ throttle: 1, brake: 0, steer: 0 }), ()=>v.speed*3.6>=kmh);
  let log=[];
  run(v, world, 4, ()=>({ throttle: 0.5, brake: 0, steer: st }), (t,i)=>{ if(i%30===29){ const w=v.body.angvel(); const vel=v.body.linvel(); const f=v.forward(); const sp=Math.hypot(vel.x,vel.z);
     const slip=Math.atan2(vel.x*f.z - vel.z*f.x, vel.x*f.x+vel.z*f.z)*57.3; log.push(`${(sp*3.6).toFixed(0)}kmh yaw${(w.y*57.3).toFixed(0)} slip${slip.toFixed(0)} latG${(sp*Math.abs(w.y)/9.81).toFixed(2)}`);} });
  console.log(`@${kmh} steer ${st}:`, log.join(' | '));
}
{ const { world, v } = mk();
  run(v, world, 30, ()=>({ throttle: 1, brake: 0, steer: 0 }), ()=>v.speed*3.6>=60);
  let log=[];
  run(v, world, 2.5, (t)=>({ throttle: t>0.8?0.8:0, brake: 0, steer: 1, handbrake: t<0.8 }), (t,i)=>{ if(i%15===14){ const w=v.body.angvel(); const vel=v.body.linvel(); const f=v.forward(); const sp=Math.hypot(vel.x,vel.z);
     const slip=Math.atan2(vel.x*f.z - vel.z*f.x, vel.x*f.x+vel.z*f.z)*57.3; log.push(`${(sp*3.6).toFixed(0)} y${(w.y*57.3).toFixed(0)} s${slip.toFixed(0)}`);} });
  const f=v.forward(); console.log('handbrake@60:', log.join(' | '), 'heading', (Math.atan2(-f.z,f.x)*57.3).toFixed(0));
}
