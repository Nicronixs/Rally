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
  maxReverse: 9, // m/s
  // sequential gearbox
  gearRatios: [3.3, 2.5, 2.02, 1.7, 1.46, 1.27], // close-ratio rally box
  reverseRatio: 3.3,
  finalDrive: 3.85,
  idleRpm: 900,
  redline: 7600,
  shiftTime: 0.09, // s without drive while shifting
  upshiftRpm: 7200, // automatic
  downshiftRpm: 3300, // automatic
  brakeImpulse: 180, // per wheel and step (N*s); about 2 g from 100 km/h, snow is grip-limited
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

const T_IDLE = 900;
const IMPACT_THRESHOLD = 60000; // newtons; below this a contact does no harm

// Torque curve, 1 = peak torque (scaled per car so the peak power matches TUNING.power).
const TORQUE_CURVE = [[0, 0.55], [1000, 0.62], [2500, 0.88], [4000, 1.0], [6000, 1.0], [7000, 0.96], [7600, 0.92], [9000, 0.7]];
function torqueShape(rpm) {
  for (let i = 1; i < TORQUE_CURVE.length; i++) {
    const [r1, t1] = TORQUE_CURVE[i];
    if (rpm <= r1) {
      const [r0, t0] = TORQUE_CURVE[i - 1];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return TORQUE_CURVE[TORQUE_CURVE.length - 1][1];
}
const RPM_PER_RAD_S = 60 / (2 * Math.PI);
const DRIVETRAIN_EFFICIENCY = 1.0; // TUNING.power is power at the wheels

export class Vehicle {
  // overrides: per-car tuning (see cars.js)
  constructor(world, overrides = {}) {
    this.world = world;
    this.T = { ...TUNING, ...overrides };
    const T = this.T;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setCanSleep(false).setCcdEnabled(true));
    const h = T.halfExtents;
    const main = RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z)
      .setMassProperties(T.mass, { x: 0, y: T.comY, z: 0 }, T.inertia, { w: 1, x: 0, y: 0, z: 0 })
      .setFriction(0.35).setRestitution(0.05);
    // collisions report their force so we can turn hard hits into damage
    main.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(IMPACT_THRESHOLD);
    this.colliders = new Set([world.createCollider(main, body).handle]);
    // cabin up to the roof of the model (roof at about +0.70)
    const cabin = RAPIER.ColliderDesc.cuboid(0.95, 0.25, 0.66).setTranslation(-0.45, 0.45, 0)
      .setDensity(0).setFriction(0.35)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(IMPACT_THRESHOLD);
    this.colliders.add(world.createCollider(cabin, body).handle);
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
    this.damage = { engine: 0, suspension: 0, body: 0 };
    this.pull = Math.random() < 0.5 ? -1 : 1; // which way a bent suspension pulls
    this.lastImpact = 0;
    // gearbox: -1 = reverse, 0 = neutral, 1..6
    this.gear = 1;
    this.manual = false;
    this.shiftTimer = 0;
    this.limiter = false;
    let best = 0;
    for (let r = 1000; r <= T.redline; r += 100) best = Math.max(best, torqueShape(r) * r / RPM_PER_RAD_S);
    this.peakTorque = T.power / best; // Nm
  }

  ratio(gear) {
    const T = this.T;
    if (gear > 0) return T.gearRatios[gear - 1];
    if (gear < 0) return T.reverseRatio;
    return 0;
  }

  // engine rpm the wheels would turn the engine at in a gear
  wheelRpm(gear, speed = this.speed) {
    const dir = gear < 0 ? -1 : 1;
    return Math.max(0, (dir * speed) / this.T.wheelRadius * RPM_PER_RAD_S * this.ratio(gear) * this.T.finalDrive);
  }

  // returns false if the shift is refused
  shiftUp() {
    if (this.gear >= this.T.gearRatios.length) return false;
    this.gear += 1;
    if (this.gear > 1) this.shiftTimer = this.T.shiftTime;
    return true;
  }

  shiftDown() {
    if (this.gear <= -1) return false;
    if (this.gear === 0 && this.speed > 2) return false; // no reverse while rolling forwards
    // protect the engine from a downshift past the limiter
    if (this.gear > 1 && this.wheelRpm(this.gear - 1) > this.T.redline + 300) return false;
    this.gear -= 1;
    if (this.gear > 0) this.shiftTimer = this.T.shiftTime;
    return true;
  }

  setDamage(d) {
    this.damage = { engine: d.engine || 0, suspension: d.suspension || 0, body: d.body || 0 };
  }

  // Called after a physics step in which the chassis hit something.
  // Severity comes from the sudden change of velocity in that step (contact forces of rigid bodies are not meaningful).
  // dir: world direction of the contact force
  applyImpact(dir) {
    if (this.impactStep === this.stepCount) return 0; // once per step
    this.impactStep = this.stepCount;
    const v = this.body.linvel(), p = this.velBefore || v;
    const dv = Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z);
    const sev = (dv - 3) / 22;
    if (sev <= 0) return 0;
    const q = this.body.rotation();
    const f = rotate(q, { x: 1, y: 0, z: 0 }), r = rotate(q, { x: 0, y: 0, z: 1 }), u = rotate(q, { x: 0, y: 1, z: 0 });
    const ax = Math.abs(dir.x * f.x + dir.y * f.y + dir.z * f.z);
    const az = Math.abs(dir.x * r.x + dir.y * r.y + dir.z * r.z);
    const ay = Math.abs(dir.x * u.x + dir.y * u.y + dir.z * u.z);
    const sum = ax + ay + az || 1;
    const d = this.damage;
    // frontal hits hurt the engine, side hits the suspension, everything the body
    d.engine = Math.min(1, d.engine + sev * 0.9 * (ax / sum));
    d.suspension = Math.min(1, d.suspension + sev * 0.9 * (az / sum) + sev * 0.25 * (ay / sum));
    d.body = Math.min(1, d.body + sev * 0.8);
    this.lastImpact = sev;
    return sev;
  }

  place(x, y, z, yaw) {
    const b = this.body;
    b.setTranslation({ x, y, z }, true);
    b.setRotation({ w: Math.cos(yaw / 2), x: 0, y: Math.sin(yaw / 2), z: 0 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.gear = 1;
    this.shiftTimer = 0;
    this.rpm = T_IDLE;
  }

  // input: { throttle 0..1, brake 0..1, steer -1..1 (+ = left), handbrake bool }
  // surfaceAt(x, z) -> { grip, rolling, kind }
  step(dt, input, surfaceAt) {
    const T = this.T;
    const dmg = this.damage;
    const vc = this.vc, b = this.body;
    this.stepCount = (this.stepCount || 0) + 1;
    this.velBefore = b.linvel();
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
    // a damaged suspension pulls to one side
    const pull = this.pull * 0.05 * dmg.suspension;
    vc.setWheelSteering(0, this.steer + pull);
    vc.setWheelSteering(1, this.steer + pull);

    // gearbox: in automatic mode it chooses the gear itself, and the brake pedal reverses at a standstill
    let pedal = input.throttle, braking = input.brake;
    if (!this.manual) {
      if (this.gear === 0) this.gear = 1;
      if (this.gear > 0 && abs < 1 && input.brake > 0 && input.throttle === 0) this.gear = -1;
      else if (this.gear < 0 && input.throttle > 0 && speed > -1) this.gear = 1;
      if (this.gear < 0) { pedal = input.brake; braking = input.throttle; }
      if (this.gear > 0 && this.shiftTimer <= 0 && !this.airborne) {
        if (this.wheelRpm(this.gear) > T.upshiftRpm && this.gear < T.gearRatios.length) this.shiftUp();
        else if (this.gear > 1 && this.wheelRpm(this.gear) < T.downshiftRpm && this.wheelRpm(this.gear - 1) < T.upshiftRpm - 400) this.shiftDown();
      }
    }
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);

    // engine speed: wheels through the gearbox, a slipping clutch when pulling away, free revving in neutral or in the air
    let engineRpm;
    if (this.gear === 0) engineRpm = T.idleRpm + pedal * (T.redline - T.idleRpm);
    else {
      const launch = T.idleRpm + pedal * (Math.abs(this.gear) === 1 ? 3200 : 1200);
      engineRpm = Math.max(this.wheelRpm(this.gear), launch);
      if (this.airborne && pedal > 0) engineRpm = Math.max(engineRpm, this.rpm + 9000 * dt);
    }
    this.limiter = engineRpm >= T.redline;
    engineRpm = Math.min(engineRpm, T.redline + 150);

    // drive & brakes
    let drive = 0, brake = 0;
    if (this.gear !== 0 && pedal > 0 && this.shiftTimer <= 0 && !this.limiter) {
      const torque = torqueShape(engineRpm) * this.peakTorque * pedal * (1 - 0.5 * dmg.engine);
      drive = Math.min(T.maxDriveForce, (torque * this.ratio(this.gear) * T.finalDrive * DRIVETRAIN_EFFICIENCY) / T.wheelRadius);
      if (this.gear < 0) drive = speed < -T.maxReverse ? 0 : -drive;
    }
    this.driveForce = drive;
    if (braking > 0) brake = T.brakeImpulse * braking;
    // engine braking grows with rpm when the throttle is closed
    if (drive === 0 && brake === 0) brake = this.gear === 0 ? 1 : T.engineBrake * (0.4 + (1.6 * engineRpm) / T.redline);

    const q = b.rotation();
    const t = b.translation();
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const share = front ? T.frontDriveShare : 1 - T.frontDriveShare;
      let f = drive * share * 0.5;
      let br = brake;
      let grip = (front ? T.frontGrip : T.rearGrip) * (1 - 0.28 * dmg.suspension);
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

    // displayed / audible rpm follows the engine quickly; the limiter makes it bounce
    const shown = this.limiter ? T.redline - Math.random() * 450 : engineRpm;
    this.rpm += (shown - this.rpm) * Math.min(1, dt * 18);
    this.throttle = pedal;
  }

  forward() { return rotate(this.body.rotation(), { x: 1, y: 0, z: 0 }); }
  up() { return rotate(this.body.rotation(), { x: 0, y: 1, z: 0 }); }
}

export { rotate };
