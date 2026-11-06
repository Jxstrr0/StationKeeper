// Sparks at a failed module: a few points flying out from one spot and fading, drawn by the GPU from a time uniform.
// One geometry and one material are shared by every emitter, so a failure costs one draw call and no per-frame work
// beyond a visibility toggle.
import * as THREE from 'three';

const COUNT = 14;

let shared: { geometry: THREE.BufferGeometry; material: THREE.ShaderMaterial } | null = null;

function build(): { geometry: THREE.BufferGeometry; material: THREE.ShaderMaterial } {
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    // Mostly outward (+Y in the emitter's frame), in a wide cone.
    const a = Math.random() * Math.PI * 2;
    const c = 0.25 + Math.random() * 0.75;
    const s = Math.sqrt(1 - c * c);
    seed.set([Math.cos(a) * s, c, Math.sin(a) * s, Math.random()], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float uTime;
      varying float vLife;
      void main() {
        float life = fract(uTime * 1.6 + seed.w);
        vLife = life;
        vec3 p = seed.xyz * (life * (1.2 + seed.w * 1.4));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(240.0 / -mv.z, 2.0, 6.0) * (1.0 - life * 0.6);
      }`,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.1, length(d)) * (1.0 - vLife);
        gl_FragColor = vec4(mix(vec3(1.0, 0.95, 0.75), vec3(1.0, 0.45, 0.12), vLife) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { geometry, material };
}

/** A new emitter: spray along its local +Y. Starts hidden. */
export function makeSparks(): THREE.Points {
  shared ??= build();
  const p = new THREE.Points(shared.geometry, shared.material);
  p.name = 'sparks';
  p.visible = false;
  p.raycast = () => {};
  return p;
}

/** Advance every emitter's sparks; call once a frame. */
export function setSparkTime(t: number): void {
  if (shared) shared.material.uniforms.uTime!.value = t;
}
