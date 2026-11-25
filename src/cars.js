// Selectable cars: physics overrides on top of TUNING plus livery.
// The body shape is shared; what differs is drive layout, power, weight and balance.

export const CARS = {
  falke: {
    id: 'falke',
    name: 'Falke R4',
    drive: 'Allrad',
    tagline: 'Ausgewogen und schnell – verzeiht viel.',
    tuning: {},
    livery: { color: 0xf2f2f2, stripe: 0x1f5fbf, accent: 0xe0322b, rim: 0xe8e8e8, number: 7 },
  },
  fuchs: {
    id: 'fuchs',
    name: 'Fuchs R2',
    drive: 'Frontantrieb',
    tagline: 'Leicht und wendig, wenig Leistung – schiebt über die Vorderräder.',
    tuning: {
      mass: 1060, inertia: { x: 640, y: 1700, z: 1550 },
      power: 150000, maxDriveForce: 7600, frontDriveShare: 1.0,
      frontGrip: 1.04, rearGrip: 1.02, steerLow: 0.62, yawHold: 1.5,
    },
    livery: { color: 0xff8a1f, stripe: 0xffffff, accent: 0x1b1b1b, rim: 0x2a2a2a, number: 21 },
  },
  bison: {
    id: 'bison',
    name: 'Bison Klassik',
    drive: 'Heckantrieb',
    tagline: 'Viel Kraft auf der Hinterachse – quer ist schneller, aber heikel.',
    tuning: {
      mass: 1180, power: 215000, maxDriveForce: 8600, frontDriveShare: 0.0,
      frontGrip: 1.0, rearGrip: 0.9, yawHold: 1.0, handbrakeGrip: 0.38,
    },
    livery: { color: 0x2f7d3a, stripe: 0xffd400, accent: 0xffffff, rim: 0xd4a72c, number: 3 },
  },
  luchs: {
    id: 'luchs',
    name: 'Luchs Kit Car',
    drive: 'Frontantrieb',
    tagline: 'Drehfreudiger Leichtbau – präzise und bissig auf der Vorderachse.',
    tuning: {
      mass: 1020, inertia: { x: 600, y: 1600, z: 1450 },
      power: 174000, maxDriveForce: 8000, frontDriveShare: 1.0, redline: 8000, upshiftRpm: 7600, finalDrive: 3.8,
      frontGrip: 1.05, rearGrip: 1.03, steerLow: 0.62, yawHold: 1.55,
    },
    livery: { color: 0x1d3557, stripe: 0x9be7ff, accent: 0xffffff, rim: 0xd8d8d8, number: 14 },
  },
  wolf: {
    id: 'wolf',
    name: 'Wolf GT',
    drive: 'Heckantrieb',
    tagline: 'Großer Motor, kurzer Radstand – im Drift unschlagbar schnell.',
    tuning: {
      mass: 1150, power: 258000, maxDriveForce: 10100, frontDriveShare: 0.0, finalDrive: 3.65,
      frontGrip: 1.04, rearGrip: 0.98, yawHold: 1.2, handbrakeGrip: 0.38,
    },
    livery: { color: 0x6b6f76, stripe: 0xff3b30, accent: 0x111111, rim: 0x111111, number: 11 },
  },
  adler: {
    id: 'adler',
    name: 'Adler WRC',
    drive: 'Allrad',
    tagline: 'Modernes Werksauto: Turbo, Allrad und viel mechanischer Grip.',
    tuning: {
      mass: 1200, power: 262000, maxDriveForce: 10800, frontDriveShare: 0.45, finalDrive: 3.6,
      frontGrip: 1.07, rearGrip: 1.05, yawHold: 1.65, downforce: 2.8, damageResist: 0.9,
    },
    livery: { color: 0xffffff, stripe: 0x00a651, accent: 0x003da5, rim: 0xffffff, number: 1 },
  },
  panther: {
    id: 'panther',
    name: 'Panther Gruppe B',
    drive: 'Allrad',
    tagline: 'Wild wie in den Achtzigern: brutale Leistung, kaum zu bändigen.',
    tuning: {
      mass: 1100, inertia: { x: 700, y: 1850, z: 1700 },
      power: 300000, maxDriveForce: 11800, frontDriveShare: 0.35, finalDrive: 3.5, redline: 7800, upshiftRpm: 7400,
      frontGrip: 1.09, rearGrip: 1.05, yawHold: 1.5, drag: 1.0, downforce: 3.0, damageResist: 0.9,
    },
    livery: { color: 0x0b0b0b, stripe: 0xffcc00, accent: 0xe4002b, rim: 0xffcc00, number: 4 },
  },
  drache: {
    id: 'drache',
    name: 'Drache Hybrid',
    drive: 'Allrad',
    tagline: 'Rally1-Prototyp mit Hybrid-Boost – die Spitze des Feldes.',
    tuning: {
      mass: 1180, power: 345000, maxDriveForce: 13000, frontDriveShare: 0.48, finalDrive: 3.4, redline: 8000, upshiftRpm: 7600,
      frontGrip: 1.13, rearGrip: 1.11, yawHold: 1.8, drag: 0.98, downforce: 3.6, damageResist: 0.8,
      brakeImpulse: 195,
    },
    livery: { color: 0x0a2463, stripe: 0x3df2ff, accent: 0xff5e5b, rim: 0x3df2ff, number: 99 },
  },
};

// Stage of the week: only the three base cars (fair leaderboard; the database allows only these).
export const WEEKLY_CARS = ['fuchs', 'bison', 'falke'];
export const weeklyCar = (id) => (WEEKLY_CARS.includes(id) ? id : 'falke');

export function getCar(id) {
  return CARS[id] || CARS.falke;
}

// Displayed key figures for the car selection.
export function carStats(car, base) {
  const t = { ...base, ...car.tuning };
  return {
    power: Math.round(t.power / 1000), // kW
    mass: t.mass,
    drive: car.drive,
  };
}
