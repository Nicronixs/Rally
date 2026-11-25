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
};

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
