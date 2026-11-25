// Rally car physics on top of Rapier's ray-cast vehicle controller.
// Local chassis frame: +X forward, +Y up, +Z right.
import RAPIER from '@dimforge/rapier3d-compat';

export const TUNING = {
  mass: 1250,
  inertia: { x: 750, y: 2000, z: 1800 }, // roll, yaw, pitch
  comY: -0.3,
  halfExtents: { x: 2.0, y: 0.36, z: 0.86 },
  wheelBase: 1.28, // half of the axle distance
  track: 0.8, // half of the track width
  wheelY: -0.18,
  wheelRadius: 0.34,
  restLength: 0.32,
  maxTravel: 0.28,
  stiffness: 28,
  compression: 3.2,
  relaxation: 4.2,
  power: 230000, // watts
  maxDriveForce: 9800, // newtons, total
  frontDriveShare: 0.45,
  reverseForce: 4500,
  maxReverse: 9, // m/s
  brakeImpulse: 52, // per wheel and step (N*s)
  handbrakeImpulse: 140,
  engineBrake: 4,
  steerLow: 0.58, // rad at standstill
  steerHigh: 0.17, // rad at high speed
  steerFadeSpeed: 32,
  steerRate: 3.4,
  steerReturn: 5.5,
  frontGrip: 1.0,
  rearGrip: 0.97,
  handbrakeGrip: 0.42,
  sideStiffness: 0.8,
  drag: 1.05,
  downforce: 2.2,
  rollDamping: 3.0,
  pitchDamping: 1.2,
  yawHold: 1.4,
  yawHoldHandbrake: 0.25,
};

const T = TUNING;
const DRIVEN = [true, true, true, true];

function rotate(q, v) {
  // rotate vector v by quaternion q
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

export class Vehicle {
  constructor(world) {
    this.world = world;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setCanSleep(false).setCcdEnabled(true));
    const h = T.halfExtents;
    const main = RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z)
      .setMassProperties(T.mass, { x: 0, y: T.comY, z: 0 }, T.inertia, { w: 1, x: 0, y: 0, z: 0 })
      .setFriction(0.35).setRestitution(0.05);
    world.createCollider(main, body);
    const cabin = RAPIER.ColliderDesc.cuboid(0.95, 0.27, 0.72).setTranslation(-0.45, 0.6, 0)
      .setDensity(0).setFriction(0.35);
    world.createCollider(cabin, body);
    this.body = body;

    const vc = world.createVehicleController(body);
    const positions = [
      { x: T.wheelBase, y: T.wheelY, z: -T.track }, // front left
      { x: T.wheelBase, y: T.wheelY, z: T.track }, // front right
      { x: -T.wheelBase, y: T.wheelY, z: -T.track }, // rear left
      { x: -T.wheelBase, y: T.wheelY, z: T.track }, // rear right
    ];
    positions.forEach((p, i) => {
      vc.addWheel(p, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, T.restLength, T.wheelRadius);
      vc.setWheelSuspensionStiffness(i, T.stiffness);
      vc.setWheelSuspensionCompression(i, T.compression);
      vc.setWheelSuspensionRelaxation(i, T.relaxation);
      vc.setWheelMaxSuspensionTravel(i, T.maxTravel);
      vc.setWheelMaxSuspensionForce(i, 120000);
      vc.setWheelSideFrictionStiffness(i, T.sideStiffness);
      vc.setWheelFrictionSlip(i, i < 2 ? T.frontGrip : T.rearGrip);
    });
    this.vc = vc;
    this.wheelPositions = positions;
    this.steer = 0;
    this.speed = 0;
    this.rpm = 900;
    this.gear = 1;
    this.wheelSpin = [0, 0, 0, 0];
    this.wheelSlip = [0, 0, 0, 0];
    this.wheelSurface = ['gravel', 'gravel', 'gravel', 'gravel'];
    this.airborne = false;
    this.slipAngle = 0;
  }

  place(x, y, z, yaw) {
    const b = this.body;
    b.setTranslation({ x, y, z }, true);
    b.setRotation({ w: Math.cos(yaw / 2), x: 0, y: Math.sin(yaw / 2), z: 0 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
  }

  // input: { throttle 0..1, brake 0..1, steer -1..1 (+ = left), handbrake bool }
  // surfaceAt(x, z) -> { grip, rolling, kind }
  step(dt, input, surfaceAt) {
    const vc = this.vc, b = this.body;
    const speed = vc.currentVehicleSpeed();
    this.speed = speed;
    const abs = Math.abs(speed);

    // steering
    const fade = Math.min(1, abs / T.steerFadeSpeed);
    const maxSteer = T.steerLow + (T.steerHigh - T.steerLow) * fade * fade * (3 - 2 * fade);
    const target = input.steer * maxSteer;
    const rate = (Math.sign(target - this.steer) !== Math.sign(this.steer) || target === 0) ? T.steerReturn : T.steerRate;
    const ds = target - this.steer;
    this.steer += Math.sign(ds) * Math.min(Math.abs(ds), rate * dt * Math.max(0.5, maxSteer));
    vc.setWheelSteering(0, this.steer);
    vc.setWheelSteering(1, this.steer);

    // drive & brakes
    let drive = 0, brake = 0;
    if (input.throttle > 0 && speed > -1) {
      drive = Math.min(T.maxDriveForce, T.power / Math.max(abs, 1)) * input.throttle;
    }
    if (input.brake > 0) {
      if (speed > 1.2) brake = T.brakeImpulse * input.brake;
      else if (speed > -T.maxReverse) drive = -T.reverseForce * input.brake;
    }
    if (input.throttle > 0 && speed < -1) brake = T.brakeImpulse * input.throttle;
    if (drive === 0 && brake === 0) brake = T.engineBrake;

    const q = b.rotation();
    const t = b.translation();
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const share = front ? T.frontDriveShare : 1 - T.frontDriveShare;
      let f = DRIVEN[i] ? drive * share * 0.5 : 0;
      let br = brake;
      let grip = front ? T.frontGrip : T.rearGrip;
      if (input.handbrake && !front) { f = 0; br = T.handbrakeImpulse; grip *= T.handbrakeGrip; }
      // surface under the wheel
      const wp = rotate(q, this.wheelPositions[i]);
      const s = surfaceAt ? surfaceAt(t.x + wp.x, t.z + wp.z) : { grip: 1, rolling: 0, kind: 'gravel' };
      this.wheelSurface[i] = s.kind;
      vc.setWheelFrictionSlip(i, grip * s.grip);
      vc.setWheelEngineForce(i, f);
      vc.setWheelBrake(i, f !== 0 ? 0 : br + s.rolling);
    }

    vc.updateVehicle(dt);

    // wheel contact / slip info
    let contacts = 0;
    for (let i = 0; i < 4; i++) {
      const c = vc.wheelIsInContact(i);
      if (c) contacts++;
      const side = Math.abs(vc.wheelSideImpulse(i) || 0);
      const susp = (vc.wheelSuspensionForce(i) || 0) * dt;
      this.wheelSlip[i] = c ? Math.min(1, side / Math.max(1, susp * 0.9)) : 0;
      const locked = input.handbrake && i >= 2;
      if (!locked) this.wheelSpin[i] += speed * dt / T.wheelRadius;
    }
    this.airborne = contacts === 0;

    // aerodynamics & assists
    const v = b.linvel();
    const vlen = Math.hypot(v.x, v.y, v.z);
    const up = rotate(q, { x: 0, y: 1, z: 0 });
    const fwd = rotate(q, { x: 1, y: 0, z: 0 });
    const right = rotate(q, { x: 0, y: 0, z: 1 });
    b.resetForces(true);
    b.resetTorques(true);
    b.addForce({
      x: -v.x * vlen * T.drag - up.x * T.downforce * vlen * vlen,
      y: -v.y * vlen * T.drag - up.y * T.downforce * vlen * vlen,
      z: -v.z * vlen * T.drag - up.z * T.downforce * vlen * vlen,
    }, true);
    const w = b.angvel();
    const rollRate = w.x * fwd.x + w.y * fwd.y + w.z * fwd.z;
    const pitchRate = w.x * right.x + w.y * right.y + w.z * right.z;
    const kr = -rollRate * T.rollDamping * T.inertia.x;
    const kp = -pitchRate * T.pitchDamping * T.inertia.z;
    // stability assist: pull the yaw rate towards what the steering asks for,
    // loosely, so the car can still slide and the handbrake still rotates it
    let yawT = 0;
    if (contacts > 0) {
      const yawRate = w.x * up.x + w.y * up.y + w.z * up.z;
      const limit = (T.frontGrip * 9.81 * 1.25) / Math.max(abs, 3);
      let targetYaw = (speed * Math.tan(this.steer)) / (2 * T.wheelBase);
      targetYaw = Math.max(-limit, Math.min(limit, targetYaw));
      // slip angle between heading and travel direction; catch big slides
      const vf = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
      const vs = v.x * right.x + v.y * right.y + v.z * right.z;
      const beta = abs > 3 ? Math.abs(Math.atan2(vs, Math.abs(vf))) : 0;
      this.slipAngle = beta;
      const catchUp = input.handbrake ? 1 : 1 + Math.max(0, beta - 0.35) * 2.5;
      const k = (input.handbrake ? T.yawHoldHandbrake : T.yawHold) * catchUp * Math.min(1, abs / 6) * (contacts / 4);
      yawT = (targetYaw - yawRate) * k * T.inertia.y;
    }
    b.addTorque({
      x: fwd.x * kr + right.x * kp + up.x * yawT,
      y: fwd.y * kr + right.y * kp + up.y * yawT,
      z: fwd.z * kr + right.z * kp + up.z * yawT,
    }, true);

    // simple gearbox for sound and HUD
    const kmh = abs * 3.6;
    const shifts = [0, 48, 80, 110, 140, 170, 999];
    let g = 1;
    while (g < 6 && kmh > shifts[g]) g++;
    this.gear = speed < -0.5 ? -1 : g;
    const lo = shifts[g - 1], hi = shifts[g] === 999 ? 220 : shifts[g];
    const targetRpm = (g > 1 ? 3600 : 1500) + ((kmh - lo) / (hi - lo)) * (g > 1 ? 4000 : 5800);
    const want = this.airborne && input.throttle > 0 ? 7600 : Math.max(900, Math.min(7600, targetRpm));
    const blended = input.throttle > 0 ? Math.max(want, 2400 * input.throttle) : want;
    this.rpm += (blended - this.rpm) * Math.min(1, dt * 9);
    this.throttle = input.throttle;
  }

  forward() { return rotate(this.body.rotation(), { x: 1, y: 0, z: 0 }); }
  up() { return rotate(this.body.rotation(), { x: 0, y: 1, z: 0 }); }
}

export { rotate };
