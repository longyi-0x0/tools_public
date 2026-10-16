// Shared aerial-perspective fog.
//
// The 2D path applies this inside the post-processing composite pass (`postfx.js`), where it
// has a reconstructed world position and a full-screen depth buffer. WebXR gives us neither:
// three.js owns the eye framebuffers during an XR session, so a custom full-screen pass over
// both eyes is not possible. The VR path therefore applies the *identical* maths inside each
// scene material, using the `vWorld` varying they already carry.
//
// Namespace note: every uniform below is prefixed `uFog*` and aliased onto the very same
// uniform *objects* held in `U`. That avoids double-declaration against GLSL_LIGHT /
// GLSL_WIND / GLSL_CLOUD_FIELD, and costs nothing per frame — no copying, no syncing.

import { U } from './uniforms.js';

export const GLSL_FOG = /* glsl */ `
  uniform vec3 uFogColor;
  uniform vec3 uMistColor;
  uniform float uFogDensity;
  uniform float uFogHeight;
  uniform float uFogGround;
  uniform float uFogScale;
  uniform float uFogMix;
  uniform float uFogTime;
  uniform vec2 uFogWind;
  uniform vec3 uFogCamPos;
  uniform vec3 uFogSunDir;
  uniform vec3 uFogSunColor;
  uniform float uFogSunIntensity;
  uniform float uFogFlash;

  // col: linear HDR colour so far. wpos: world position of this fragment.
  // isSky: 1.0 for the dome, where haze is tempered so the horizon does not go milky.
  vec3 applySceneFog(vec3 col, vec3 wpos, float isSky){
    vec3 toCam = wpos - uFogCamPos;
    float dist = min(length(toCam), 30000.0);
    vec3 rd = dist > 1e-5 ? toCam / dist : vec3(0.0, 1.0, 0.0);

    // ---------- exponential height fog, integrated analytically along the ray
    float H = max(uFogHeight, 2.0);
    float dens = uFogDensity * uFogScale * 0.0021;
    float ry = rd.y;
    float camRel = min(exp(-uFogCamPos.y / H), 3.0);
    float fogAmt;
    if (abs(ry) < 1e-2) fogAmt = dens * camRel * dist;
    else fogAmt = dens * (H / ry) * camRel * (1.0 - exp(clamp(-ry * dist / H, -40.0, 40.0)));
    fogAmt = clamp(fogAmt, 0.0, 60.0);

    // ---------- ground mist: a low, wispy layer that pools in the hollows
    float Hm = 9.0;
    float mistRef = clamp(exp(-(uFogCamPos.y - 6.0) / Hm), 0.0, 2.6);
    float mdens = uFogGround * uFogScale * 0.0016;
    float mistAmt;
    if (abs(ry) < 1e-2) mistAmt = mdens * mistRef * dist;
    else mistAmt = mdens * (Hm / ry) * mistRef * (1.0 - exp(clamp(-ry * dist / Hm, -40.0, 40.0)));
    mistAmt = clamp(mistAmt, 0.0, 60.0);
    vec3 mp = uFogCamPos + rd * min(dist, 240.0) * 0.5;
    float wisp = fbm2(mp.xz * 0.0075 + uFogWind * 3.0 + vec2(uFogTime * 0.011, -uFogTime * 0.008));
    mistAmt *= 0.35 + 1.45 * wisp;

    float total = clamp(fogAmt + mistAmt, 0.0, 60.0);
    float f = 1.0 - exp(-total);

    float mu = clamp(dot(rd, uFogSunDir), 0.0, 1.0);
    vec3 fogCol = mix(uFogColor, uMistColor, clamp(mistAmt / max(total, 1e-4), 0.0, 1.0));
    // forward scattering: the haze lights up around the sun
    fogCol = mix(fogCol, uFogSunColor * (0.9 + 0.5 * uFogSunIntensity), pow(mu, 5.0) * 0.55);
    fogCol *= 0.75 + 0.5 * uFogSunIntensity * 0.5;
    fogCol += uFogSunColor * uFogFlash * 0.5;

    float fw = isSky > 0.5 ? f * 0.45 * smoothstep(0.22, -0.05, rd.y) : f;
    return mix(col, fogCol, clamp(fw, 0.0, 1.0) * uFogMix);
  }

  // ---------- tone map ------------------------------------------------------
  // WebXR leaves no full-screen pass, so the grade happens right here instead. This is the
  // same ACES fit the 2D composite uses (postfx.js FINAL_FRAG), minus the three effects that
  // are actively harmful in a headset: vignette and film grain cause binocular rivalry when
  // the eyes disagree, and chromatic aberration fights the lens's own.
  uniform float uToneExposure;
  uniform float uToneSat;

  vec3 vrAces(vec3 x){
    const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    x = IN * x;
    vec3 a = x * (x + 0.0245786) - 0.000090537;
    vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
    return clamp(OUT * (a / b), 0.0, 1.0);
  }

  vec3 vrToSRGB(vec3 c){
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055, step(0.0031308, c));
  }

  vec3 vrToneMap(vec3 c){
    vec3 t = vrAces(max(c, vec3(0.0)) * uToneExposure);
    float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
    return vrToSRGB(clamp(mix(vec3(l), t, uToneSat), 0.0, 1.0));
  }
`;

/**
 * Uniform map for the fog chunk. Everything except the three fog-only entries aliases an
 * existing uniform object from `U`, so the weather system keeps driving both paths at once.
 */
export const FOG_UNIFORMS = {
  uFogColor: U.uFogColor,
  uMistColor: U.uMistColor,
  uFogDensity: U.uFogDensity,
  uFogHeight: U.uFogHeight,
  uFogGround: U.uFogGround,
  uFogScale: { value: 1 },
  uFogMix: { value: 0 },
  uFogTime: U.uTime,
  uFogWind: U.uCloudWind,
  uFogCamPos: U.uCamPos,
  uFogSunDir: U.uSunDir,
  uFogSunColor: U.uSunColor,
  uFogSunIntensity: U.uSunIntensity,
  uFogFlash: U.uFlash,
  uToneExposure: { value: 1.0 },
  uToneSat: { value: 1.1 },
};

/**
 * Flip scene-side fog on or off across a set of materials.
 *
 * The fog branch is compiled behind `#ifdef VR_FOG`, so the 2D path never pays for it and
 * never double-applies haze on top of the composite pass.
 *
 * @param {THREE.Material[]} materials materials carrying a `defines` object
 * @param {boolean} on
 */
export function setSceneFog(materials, on) {
  for (const m of materials) {
    if (!m || !m.defines) continue;
    const want = on ? 1 : undefined;
    if (m.defines.VR_FOG === want) continue;
    if (on) m.defines.VR_FOG = 1;
    else delete m.defines.VR_FOG;
    m.needsUpdate = true;
  }
  for (const m of materials) {
    if (m && m.uniforms && m.uniforms.uFogMix) m.uniforms.uFogMix.value = on ? 1 : 0;
  }
}
