// Wear on the hull: grime, scorch and, on a failed module, a faint warm glow along the scorch edges.
//
// Each module gets its own copies of its standard materials (they still share textures and, since the shader patch is
// the same for all, compiled programs). The copies share one set of uniforms per module, so changing a module's wear
// is three number writes. The pattern is a cheap value noise over the module's own coordinates, so every module wears
// differently but nothing moves as the station turns. Clean modules skip the noise behind a uniform branch.
import * as THREE from 'three';

export interface WearUniforms {
  uGrime: { value: number };
  uScorch: { value: number };
  uEmber: { value: number };
}

const VERT_DECL = 'varying vec3 vWearPos;\n';
const FRAG_DECL = /* glsl */ `
uniform float uGrime;
uniform float uScorch;
uniform float uEmber;
varying vec3 vWearPos;
float wearHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wearNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(wearHash(i), wearHash(i + vec3(1, 0, 0)), f.x), mix(wearHash(i + vec3(0, 1, 0)), wearHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(wearHash(i + vec3(0, 0, 1)), wearHash(i + vec3(1, 0, 1)), f.x), mix(wearHash(i + vec3(0, 1, 1)), wearHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

// After the base colour is known: darken in blotches, yellow it a little, burn in a few patches.
const FRAG_COLOUR = /* glsl */ `
float wearScorchN = 0.0;
if (uGrime + uScorch > 0.001) {
  float n1 = wearNoise(vWearPos * 0.8);
  float n2 = wearNoise(vWearPos * 2.3 + 7.1);
  float blot = smoothstep(0.3, 0.8, n1 * 0.65 + n2 * 0.35);
  diffuseColor.rgb *= 1.0 - uGrime * (0.22 + 0.5 * blot);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.86, 0.68), uGrime * 0.8);
  wearScorchN = wearNoise(vWearPos * 0.55 + 3.7) * 0.75 + n2 * 0.25;
  float scorch = uScorch * smoothstep(0.56, 0.68, wearScorchN);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.12, 0.1, 0.09), scorch);
}
`;

// A thin warm rim round the scorch patches, like heat at a split seam.
const FRAG_EMBER = /* glsl */ `
if (uEmber > 0.001) {
  float rim = smoothstep(0.535, 0.56, wearScorchN) * (1.0 - smoothstep(0.565, 0.6, wearScorchN));
  // Only a few of the edges: a broad mask keeps it to a seam or two rather than a web.
  rim *= smoothstep(0.58, 0.72, wearNoise(vWearPos * 0.22 + 11.0));
  totalEmissiveRadiance += vec3(1.0, 0.36, 0.1) * (uEmber * rim * 0.5);
}
`;

function patch(material: THREE.MeshStandardMaterial, uniforms: WearUniforms): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = uniforms.uGrime;
    shader.uniforms.uScorch = uniforms.uScorch;
    shader.uniforms.uEmber = uniforms.uEmber;
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWearPos = position;');
    shader.fragmentShader =
      FRAG_DECL +
      shader.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_COLOUR}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMBER}`);
  };
  material.customProgramCacheKey = () => 'station-wear-1';
}

/**
 * Give every standard material under `root` a wear-patched copy for this module, sharing `uniforms`. Materials in
 * `skip` (lit windows) are left alone. Returns the uniforms to drive.
 */
export function applyWear(root: THREE.Object3D, skip: readonly THREE.Material[]): WearUniforms {
  const uniforms: WearUniforms = { uGrime: { value: 0 }, uScorch: { value: 0 }, uEmber: { value: 0 } };
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m = o.material as THREE.Material;
    if (!(m instanceof THREE.MeshStandardMaterial) || skip.includes(m)) return;
    let copy = copies.get(m);
    if (!copy) {
      copy = m.clone();
      patch(copy, uniforms);
      copies.set(m, copy);
    }
    o.material = copy;
  });
  return uniforms;
}
