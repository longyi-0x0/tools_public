// VR sky: the volumetric cloud layer baked into a cube render target.
//
// Why not reuse sky.js? That version renders into a screen-sized offscreen target and turns
// a *screen UV* into a world ray via uInvVP. Neither half survives XR: the camera becomes an
// ArrayCamera with no single projectionMatrixInverse, and there is no "the screen" to invert
// from once three owns two eye framebuffers.
//
// So the same cloud march runs here against a world-space direction instead, into a cube
// render target. The scene then samples that cube from a background dome. The win is that
// the expensive march scales with (cube size × refresh interval), not with two full eye
// framebuffers at 90 Hz — a 256² cube refreshed every 3rd frame costs a small fraction of
// what a single 1280×720 march costs, and the layer is soft enough that the resolution loss
// does not read.
//
// Requires WebGL2 (HalfFloat cube target). The caller flips `visible` on with the session.

import * as THREE from 'three';
import { GLSL_NOISE } from '../noise.js';
import { U, pick, GLSL_CLOUD_FIELD, GLSL_LIGHT, GLSL_SKY } from '../uniforms.js';
import { GLSL_FOG, FOG_UNIFORMS } from '../fog.js';

/* ----------------------------------------------------------------- the cloud march */

// Lifted from sky.js with the ray source swapped: `skyRadiance()` now takes a direction
// instead of reading vUv, and the march is factored out so the dome shader stays readable.
const GLSL_CLOUD_MARCH = /* glsl */ `
  #ifndef STEPS
  #define STEPS 40
  #endif
  #ifndef LSTEPS
  #define LSTEPS 5
  #endif

  float starField(vec3 rd){
    if (uStars <= 0.001) return 0.0;
    vec2 sph = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0))) * 190.0;
    vec2 i = floor(sph), f = fract(sph);
    vec4 r = nvalRaw(i);
    if (r.r < 0.955) return 0.0;
    float d = length(f - vec2(r.g, r.b));
    float tw = 0.55 + 0.45 * sin(uTime * 2.1 + r.g * 71.0);
    return smoothstep(0.36, 0.0, d) * tw * smoothstep(0.0, 0.25, rd.y);
  }

  float heightNorm(vec3 p){ return (p.y - uCloudBase) / uCloudThick; }

  float profileOf(float hN){
    return smoothstep(0.0, 0.17, hN) * (1.0 - smoothstep(0.55, 1.0, hN));
  }

  // altitude shear: gives the flat field a believable 3D lean
  vec2 shear(vec3 p, float hN){ return p.xz + uWindDir * (hN * 130.0); }

  float cloudDensityFrom(vec3 p, float hN, float cov){
    float prof = profileOf(hN);
    float det = fbm3(shear(p, hN) * uCloudFreq * 7.5 + vec2(hN * 4.3) + uCloudWind * 3.1);
    return clamp((cov * prof - det * 0.26) / 0.74, 0.0, 1.0) * uCloudDensity;
  }

  // cheap density for the light march: coverage only, no erosion
  float cloudDensityCheap(vec3 p){
    float hN = heightNorm(p);
    if (hN < 0.0 || hN > 1.0) return 0.0;
    float prof = profileOf(hN);
    if (prof < 0.004) return 0.0;
    return cloudCover(shear(p, hN)) * prof * 0.82 * uCloudDensity;
  }

  float lightMarch(vec3 p){
    float tau = 0.0;
    float ls = 18.0;
    vec3 q = p;
    for (int i = 0; i < LSTEPS; i++){
      q += uSunDir * ls;
      tau += cloudDensityCheap(q) * ls;
      ls *= 1.9;
    }
    return exp(-tau * 0.030 * uCloudAbsorb);
  }

  // Returns rgb = cloud radiance (premultiplied), a = transmittance. Linear HDR.
  vec4 marchClouds(vec3 rd, vec2 jitterSeed){
    vec3 sky = skyGradient(rd);
    float mu = clamp(dot(rd, uSunDir), -1.0, 1.0);

    // stars + moon/sun disc
    sky += vec3(0.9, 0.94, 1.0) * starField(rd) * uStars * 1.6;
    float disc = smoothstep(0.99955, 0.99982, mu);
    float mottle = mix(1.0, 0.72 + 0.5 * vnoise(rd.xz * 420.0), uStars);
    sky += uSunColor * disc * mottle * (2.6 + 6.0 * (1.0 - uStars)) * step(0.0, uSunDir.y + 0.06);

    vec4 acc = vec4(0.0);
    float trans = 1.0;
    if (rd.y > 0.006 && uCloudDensity > 0.001) {
      float t0 = (uCloudBase - uCamPos.y) / rd.y;
      float t1 = (uCloudBase + uCloudThick - uCamPos.y) / rd.y;
      float tStart = max(min(t0, t1), 0.0);
      float tEnd = min(max(t0, t1), 26000.0);
      if (tEnd > tStart) {
        float span = tEnd - tStart;
        float stepLen = span / float(STEPS);
        float jitter = nvalRaw(jitterSeed).b;
        float t = tStart + stepLen * jitter;

        float phase = mix(hg(mu, 0.74), hg(mu, -0.22), 0.36) * 12.0 + 0.28;
        vec3 ambTop = mix(uAmbSky, uSkyTop, 0.35) * 1.15;
        vec3 ambBot = mix(uAmbSky * 0.55, uSkyHaze * 0.5, 0.5);

        for (int i = 0; i < STEPS; i++){
          if (trans < 0.02) break;
          vec3 p = uCamPos + rd * t;
          float hNorm = heightNorm(p);
          // empty-space skipping: one cheap coverage tap decides if this step is worth it
          float cov = (hNorm < 0.0 || hNorm > 1.0) ? 0.0 : cloudCover(shear(p, hNorm));
          if (cov < 0.012) { t += stepLen * 1.85; continue; }
          float dens = cloudDensityFrom(p, hNorm, cov);
          if (dens > 0.004) {
            float hN = clamp(hNorm, 0.0, 1.0);
            float lt = lightMarch(p);
            float powder = 1.0 - exp(-dens * 5.0);
            vec3 lum = uSunColor * uSunIntensity * (lt * phase * (0.35 + 0.75 * powder)) * 1.35
                     + mix(ambBot, ambTop, hN) * (0.55 + 0.45 * powder);
            lum *= mix(1.0, mix(0.45, 0.95, hN), uRain);
            float a = 1.0 - exp(-dens * stepLen * 0.115 * uCloudAbsorb);
            // aerial perspective: distant deck thins out *and* sinks into the haze
            float fade = 1.0 - exp(-t * 0.00019);
            a *= 1.0 - 0.85 * fade;
            lum = mix(lum, uSkyHaze * (0.9 + 0.5 * uSunIntensity * 0.2), fade * 0.85);
            acc.rgb += lum * a * trans;
            trans *= 1.0 - a;
          }
          t += stepLen;
        }
      }
    }

    // horizon: clouds cannot cover the ground half of the dome
    float horizon = smoothstep(-0.02, 0.10, rd.y);
    float cloudA = (1.0 - trans) * horizon;
    vec3 col = sky * (1.0 - cloudA) + acc.rgb * horizon;
    return vec4(col, trans);
  }
`;

/* ---------------------------------------------------------------------- shaders */

const DOME_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const DOME_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;

  uniform vec3 uCamPos;
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uStars;
  uniform float uRain;

  ${GLSL_NOISE}
  ${GLSL_LIGHT}
  ${GLSL_SKY}
  ${GLSL_CLOUD_FIELD}
  ${GLSL_CLOUD_MARCH}

  void main(){
    // world-space ray: the dome is re-centred on the camera each bake, so this is the
    // direction the eye is looking, not a screen-space reconstruction
    vec3 rd = normalize(vWorldPos - uCamPos);
    gl_FragColor = marchClouds(rd, gl_FragCoord.xy * 1.37);
  }
`;

const BG_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BG_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;

  uniform samplerCube uSkyCube;
  uniform vec3 uBgCamPos;

  ${GLSL_NOISE}
  ${GLSL_FOG}

  void main(){
    vec3 rd = normalize(vWorldPos - uBgCamPos);
    vec3 col = textureCube(uSkyCube, rd).rgb;

    // Haze only bites near the horizon (isSky = 1.0 tapers it), and the sky is at infinity,
    // so use the same representative distance the 2D composite uses for sky pixels.
    vec3 skyPoint = uBgCamPos + rd * 9000.0;
    col = applySceneFog(col, skyPoint, 1.0);
    col = vrToneMap(col);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------------ class */

export class VRSky {
  /**
   * @param {object} [opts]
   * @param {number} [opts.cubeSize] cube face resolution — the dominant cost knob
   * @param {number} [opts.steps] main cloud march steps
   * @param {number} [opts.lsteps] light march steps
   * @param {number} [opts.interval] refresh the cube every N frames (clouds drift slowly)
   * @param {number} [opts.radius] background dome radius — must stay inside WORLD.far
   */
  constructor(opts = {}) {
    this.cubeSize = opts.cubeSize || 256;
    this.steps = opts.steps || 14;
    this.lsteps = opts.lsteps || 2;
    this.interval = opts.interval || 3;
    this.ready = false;

    this.cubeRT = new THREE.WebGLCubeRenderTarget(this.cubeSize, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });

    this.cubeCam = new THREE.CubeCamera(1, 20000, this.cubeRT);

    // --- pass 1: bake the cloud march into the cube
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: pick('noise', 'light', 'sky', 'cloudField', 'time', {
        uCamPos: U.uCamPos,
        uWindDir: U.uWindDir,
        uRain: U.uRain,
      }),
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      defines: { STEPS: this.steps, LSTEPS: this.lsteps },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 24, 16), this.domeMat);
    this.dome.frustumCulled = false;
    this.domeScene = new THREE.Scene();
    this.domeScene.add(this.dome);

    // --- pass 2: the dome the eye actually sees, sampling that cube
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: {
        uSkyCube: { value: this.cubeRT.texture },
        uBgCamPos: { value: new THREE.Vector3() },
        uNoiseTex: U.uNoiseTex,
        ...FOG_UNIFORMS,
      },
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      defines: { VR_FOG: 1 },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.bg = new THREE.Mesh(new THREE.SphereGeometry(opts.radius || 3000, 32, 20), this.bgMat);
    this.bg.frustumCulled = false;
    this.bg.renderOrder = -1000;   // background first, depth-test only
    this.bg.visible = false;
  }

  /** Re-tune the march. Cheap: only a define change, recompiled on next bake. */
  setSteps(steps, lsteps) {    let dirty = false;
    if (steps !== undefined && steps !== this.steps) {
      this.steps = steps;
      this.domeMat.defines.STEPS = steps;
      dirty = true;
    }
    if (lsteps !== undefined && lsteps !== this.lsteps) {
      this.lsteps = lsteps;
      this.domeMat.defines.LSTEPS = lsteps;
      dirty = true;
    }
    if (dirty) {
      this.domeMat.needsUpdate = true;
      this.ready = false;
    }
  }

  /**
   * Compile both shaders up front.
   *
   * Worth doing before the session starts rather than lazily: a shader link that lands on
   * the first XR frame shows up as a visible hitch in both eyes, and hitches are one of the
   * more reliable ways to make someone motion-sick. Also serves as the compile check for
   * these shaders, which otherwise never build on a machine without a headset.
   */
  warmup(renderer) {
    const tmpScene = new THREE.Scene();
    const tmpCam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

    // the dome's own material, against the cube camera it will actually be baked with
    renderer.compile(this.domeScene, this.cubeCam);

    // the visible dome, against a normal camera
    tmpScene.add(this.bg);
    renderer.compile(tmpScene, tmpCam);
    tmpScene.remove(this.bg);

    return renderer.info.programs ? renderer.info.programs.length : 0;
  }

  /**
   * Re-centre the dome on the viewer and, on the refresh interval, re-bake the cube.
   * Call once per XR frame.
   */
  update(renderer, camPos, frame) {
    if (!this.bg.visible) return;

    this.bg.position.copy(camPos);
    this.bg.updateMatrixWorld(true);
    this.bgMat.uniforms.uBgCamPos.value.copy(camPos);

    if (this.ready && (frame % this.interval) !== 0) return;

    this.dome.position.copy(camPos);
    this.dome.updateMatrixWorld(true);
    this.cubeCam.position.copy(camPos);
    this.cubeCam.updateMatrixWorld(true);

    // three's renderer swaps in the XR ArrayCamera and the eye framebuffer whenever
    // `xr.enabled && xr.isPresenting`, which would hijack this offscreen bake. Suspending
    // the flag for the duration is the standard way to render offscreen mid-session.
    const prevXr = renderer.xr.enabled;
    const prevTarget = renderer.getRenderTarget();
    renderer.xr.enabled = false;
    this.cubeCam.update(renderer, this.domeScene);
    renderer.xr.enabled = prevXr;
    renderer.setRenderTarget(prevTarget);

    this.ready = true;
  }

  /** Hide the dome (e.g. back to the 2D path, which composites the sky itself). */
  setVisible(v) {
    this.bg.visible = !!v;
  }

  dispose() {
    this.dome.geometry.dispose();
    this.bg.geometry.dispose();
    this.domeMat.dispose();
    this.bgMat.dispose();
    this.cubeRT.dispose();
  }
}
