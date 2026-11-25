// Dust clouds thrown up by the wheels.
import * as THREE from 'three';

const MAX = 1400;

export class Dust {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX).fill(1);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.tint = new Float32Array(MAX * 3);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 tint;
        uniform float scale;
        varying float vAlpha; varying vec3 vTint; varying float vDepth;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * scale / -mv.z;
          vAlpha = alpha; vTint = tint; vDepth = -mv.z;
        }`,
      fragmentShader: `
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        varying float vAlpha; varying vec3 vTint; varying float vDepth;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          if (d > 1.0) discard;
          float a = vAlpha * (1.0 - d) * (1.0 - d);
          float f = smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(mix(vTint, fogColor, f), a);
        }`,
    });
    this.material = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, amount, color) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx + (Math.random() - 0.5) * 2;
    this.vel[i * 3 + 1] = vy + Math.random() * 1.5;
    this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * 2;
    const life = 1.2 + Math.random() * 1.6 * amount;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = 0.6;
    this.tint[i * 3] = color.r; this.tint[i * 3 + 1] = color.g; this.tint[i * 3 + 2] = color.b;
    this.strength = amount;
  }

  update(dt, fog, height) {
    this.material.uniforms.scale.value = height * 0.9;
    if (fog) {
      // the shader writes display colours directly, so convert the linear fog colour
      this.material.uniforms.fogColor.value.copy(fog.color).convertLinearToSRGB();
      this.material.uniforms.fogNear.value = fog.near;
      this.material.uniforms.fogFar.value = fog.far;
    }
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.25 * dt; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = 0.8 + t * 5.5;
      this.alpha[i] = Math.max(0, 0.42 * Math.min(1, t * 6) * (1 - t));
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.tint.needsUpdate = true;
  }
}
