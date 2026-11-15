// Opening sequence (5 s), rendered in WebGL:
//   1. Orbital sunrise over the Pacific Northwest; an Earth-observation satellite
//      passes with its scan beam on.
//   2. The camera dives along the beam through the cloud deck.
//   3. Low over the Palouse at dawn, the scan line sweeps the hills and every field
//      it crosses moves ahead through the crop year.
//   4. The camera rises over the patchwork, one field's rotation is traced, and the
//      page's question lands before handing off to the site.
// Plays once per session, skippable, skipped for reduced motion, abandoned if the
// assets are slow. ?intro forces it; ?introcapture exposes a frame-exact renderer.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createEarth, latLonToVec3 } from "./intro-earth.js";
import { createSatellite, createOrbitEnvironment } from "./intro-satellite.js";
import { createPalouse } from "./intro-palouse.js";

const DURATION = 8.0;
const FINISH = 7.45;
const PALOUSE_SUN = [13, 19]; // sun elevation over the Palouse, degrees
const SAT_YAW = -2.0; // heading of the satellite in its local frame
const SAT_PATH = [-6, 8]; // metres travelled along its orbit while in view
const SAT_TRACK = 0.8; // how much the camera pans to follow it // hand off to the page (0.6 s fade)
const overlay = document.getElementById("intro");
const captureMode = new URLSearchParams(location.search).has("introcapture");

let finished = false;
let cleanup = () => {};

if (overlay && document.documentElement.classList.contains("intro-active")) {
  runIntro().catch((error) => {
    console.info("Intro skipped.", error);
    finish(true);
  });
}

function finish(immediate = false) {
  if (finished) return;
  finished = true;
  try {
    sessionStorage.setItem("tc-intro-seen", "1");
  } catch (error) {
    /* storage unavailable */
  }
  const done = () => {
    cleanup();
    overlay.remove();
    document.documentElement.classList.remove("intro-active");
  };
  if (immediate) {
    done();
    return;
  }
  overlay.classList.add("intro-leaving");
  setTimeout(done, 650);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);

function loadTexture(loader, url, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Intro assets timed out")), ms))]);
}

// Final pass in display space: cloud whiteout for the dive, vignette, grain, fade.
const lensShader = {
  uniforms: {
    tDiffuse: { value: null },
    aspect: { value: 16 / 9 },
    cloud: { value: 0 },
    cloudTime: { value: 0 },
    fade: { value: 1 },
    seed: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float aspect; uniform float cloud; uniform float cloudTime; uniform float fade; uniform float seed;
    varying vec2 vUv;
    float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
    float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (cloud > 0.001) {
        // Flying through a cloud deck: layers rushing outward from the centre.
        vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
        float r = length(d);
        vec2 dir = d / max(r, 1e-3);
        float z = cloudTime * 2.4;
        float layer = 0.0;
        for (int i = 0; i < 3; i++) {
          float k = float(i);
          float zz = fract(z + k / 3.0);
          float scale = mix(3.0, 0.4, zz);
          vec2 q = d * scale + k * 4.1;
          float dens = smoothstep(0.35, 0.75, fbm(q * 2.2));
          layer += dens * sin(zz * 3.14159);
        }
        float density = clamp(cloud * (0.3 + 0.85 * layer) + cloud * cloud * 0.3, 0.0, 1.0);
        vec3 lit = mix(vec3(0.98, 0.86, 0.74), vec3(1.0, 0.97, 0.93), layer * 0.5);
        c = mix(c, lit, density);
      }
      float v = smoothstep(1.25, 0.32, length((vUv - 0.5) * vec2(1.0, 0.85)) * 1.42);
      c *= mix(0.6, 1.0, v);
      c += (h(vUv * 1000.0 + seed) - 0.5) * 0.02;
      gl_FragColor = vec4(c * fade, 1.0);
    }`,
};

function blurShader(direction) {
  return {
    uniforms: { tDiffuse: { value: null }, dir: { value: direction }, amount: { value: 0.6 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 dir; uniform float amount; varying vec2 vUv;
      void main() { vec4 c = vec4(0.0); float w = 0.0;
        for (int i = -8; i <= 8; i++) { float k = exp(-float(i * i) / 24.0); c += texture2D(tDiffuse, vUv + dir * float(i) * amount) * k; w += k; }
        gl_FragColor = c / w; }`,
  };
}

// A thin scan beam from the satellite's aperture toward the ground.
function makeBeam() {
  const geometry = new THREE.CylinderGeometry(0.02, 9, 260, 32, 1, true);
  geometry.translate(0, -130, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vView;
      void main() { vY = -position.y / 260.0; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float opacity; varying float vY; varying vec3 vN; varying vec3 vView;
      void main() { float rim = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0), 1.5); float fall = pow(clamp(1.0 - vY, 0.0, 1.0), 2.0) * smoothstep(0.0, 0.02, vY);
        gl_FragColor = vec4(vec3(0.7, 0.88, 1.0) * (0.25 + rim) * fall * opacity * 0.3, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, -1.72, -0.55);
  return mesh;
}

async function runIntro() {
  const canvas = overlay.querySelector("canvas");
  const title = overlay.querySelector(".intro-title");
  const rotation = overlay.querySelector(".intro-rotation");
  overlay.querySelector(".intro-skip").addEventListener("click", () => finish());
  const onKey = (event) => {
    if (["Escape", "Enter", " "].includes(event.key)) finish();
  };
  window.addEventListener("keydown", onKey);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: captureMode });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const loader = new THREE.TextureLoader();
  const [dayMap, nightMap, waterMap, cloudMap, regionWater, reliefMap, overlayMap, forestMap, wideMap] = await withTimeout(
    Promise.all([
      loadTexture(loader, "assets/intro/earth-day.jpg", true),
      loadTexture(loader, "assets/intro/earth-night.jpg", true),
      loadTexture(loader, "assets/intro/earth-water.jpg", false),
      loadTexture(loader, "assets/intro/earth-clouds.jpg", false),
      loadTexture(loader, "assets/intro/pnw-water.png", false),
      loadTexture(loader, "assets/intro/pnw-relief.png", false),
      loadTexture(loader, "assets/intro/pnw-overlay.png", false),
      loadTexture(loader, "assets/intro/pnw-forest.png", false),
      loadTexture(loader, "assets/intro/pnw-wide.png", false),
    ]),
    captureMode ? 60000 : 6000,
  );
  if (finished) return;

  const aspect = () => window.innerWidth / window.innerHeight;

  // ---- Orbit: geometry of the pass ----------------------------------------------
  const satLat = 45.4;
  const satLon = -122.6;
  const altitude = 0.11; // ~700 km, in Earth radii
  const up = latLonToVec3(satLat, satLon).normalize();
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  const heading = 70 * THREE.MathUtils.DEG2RAD;
  const forward = north.clone().multiplyScalar(Math.cos(heading)).add(east.clone().multiplyScalar(Math.sin(heading))).normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, forward.clone().negate());
  const basisInverse = basis.clone().invert();
  const basisQuat = new THREE.Quaternion().setFromRotationMatrix(basis);
  const sunDirOrbit = new THREE.Vector3();
  function orbitSun(elevationDeg) {
    const el = elevationDeg * THREE.MathUtils.DEG2RAD;
    const az = 64 * THREE.MathUtils.DEG2RAD;
    sunDirOrbit
      .copy(north)
      .multiplyScalar(Math.cos(az) * Math.cos(el))
      .add(east.clone().multiplyScalar(Math.sin(az) * Math.cos(el)))
      .add(up.clone().multiplyScalar(Math.sin(el)))
      .normalize();
  }
  orbitSun(-23.5);

  const earth = createEarth({ dayMap, nightMap, waterMap, cloudMap, regionWater, sunDir: sunDirOrbit });
  earth.stars.material.uniforms.pixelRatio.value = pixelRatio;
  const earthScene = new THREE.Scene();
  earthScene.add(earth.group);
  const earthCam = new THREE.PerspectiveCamera(40, aspect(), 1e-6, 1000);

  const satScene = new THREE.Scene();
  const satellite = createSatellite();
  satellite.group.rotation.y = SAT_YAW;
  // The satellite's own flight direction (model -Z) in the local orbit frame.
  const satForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), SAT_YAW);
  satScene.add(satellite.group);
  const beam = makeBeam();
  satellite.group.add(beam);
  satScene.environment = createOrbitEnvironment(renderer, new THREE.Vector3(0, 0.1, -1).normalize());
  satScene.environmentIntensity = 0.16;
  const key = new THREE.DirectionalLight(0xffe2c0, 10);
  satScene.add(key);
  const satCam = new THREE.PerspectiveCamera(40, aspect(), 0.05, 400);

  // ---- Palouse --------------------------------------------------------------------
  // The field sits near Pullman, in the Palouse of south-eastern Washington.
  const featured = new THREE.Vector2(440, -1207);
  const palouse = createPalouse(renderer, { regionMap: reliefMap, wideMap, overlayMap, forestMap, waterMap, featured, featuredLonLat: [-118.2, 47.0] });
  palouse.camera.aspect = aspect();

  // ---- Post-processing chains -----------------------------------------------------
  const lensUniforms = THREE.UniformsUtils.clone(lensShader.uniforms);
  const makeLens = () => {
    const pass = new ShaderPass({ ...lensShader, uniforms: lensUniforms });
    pass.uniforms = lensUniforms;
    pass.material.uniforms = lensUniforms;
    return pass;
  };

  const orbitComposer = new EffectComposer(renderer);
  orbitComposer.addPass(new RenderPass(earthScene, earthCam));
  const blurH = new ShaderPass(blurShader(new THREE.Vector2(1 / window.innerWidth, 0)));
  const blurV = new ShaderPass(blurShader(new THREE.Vector2(0, 1 / window.innerHeight)));
  orbitComposer.addPass(blurH);
  orbitComposer.addPass(blurV);
  const satPass = new RenderPass(satScene, satCam);
  satPass.clear = false;
  satPass.clearDepth = true;
  orbitComposer.addPass(satPass);
  orbitComposer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.6, 0.85));
  orbitComposer.addPass(new OutputPass());
  orbitComposer.addPass(makeLens());

  const palouseComposer = new EffectComposer(renderer);
  palouseComposer.addPass(new RenderPass(palouse.scene, palouse.camera));
  palouseComposer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.35, 0.6, 0.9));
  palouseComposer.addPass(new OutputPass());
  palouseComposer.addPass(makeLens());

  const composers = [orbitComposer, palouseComposer];
  const onResize = () => {
    const a = aspect();
    for (const cam of [earthCam, satCam, palouse.camera]) {
      cam.aspect = a;
      cam.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    for (const composer of composers) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(window.innerWidth, window.innerHeight);
    }
    blurH.uniforms.dir.value.set(1 / window.innerWidth, 0);
    blurV.uniforms.dir.value.set(0, 1 / window.innerHeight);
    lensUniforms.aspect.value = a;
  };
  window.addEventListener("resize", onResize);
  onResize();

  // ---- Shots -------------------------------------------------------------------------
  // One continuous camera: it starts beside the satellite, follows the scan beam
  // down through the atmosphere and the cloud deck, and levels out low over the
  // Palouse. Altitude falls on a log scale so the descent feels evenly paced.
  const satCamFrom = new THREE.Vector3(9.0, 2.6, 23.5);
  const satCamTo = new THREE.Vector3(6.6, 2.0, 16.5);
  const satLookStart = new THREE.Vector3(-3, -9, -40);
  const satLookEnd = new THREE.Vector3(-2, -18, -40);
  const tmpLook = new THREE.Vector3();
  const sunLocal = new THREE.Vector3();
  const EARTH_M = 6371000;
  const ORBIT_ALT_M = altitude * EARTH_M;
  const LOW_ALT_M = 430;
  const HANDOVER_ALT_M = 9000;
  const DESCENT = [2.2, 5.5];
  const logAlt = (t) => Math.exp(mix(Math.log(ORBIT_ALT_M), Math.log(LOW_ALT_M), inOut(span(t, DESCENT[0], DESCENT[1]))));
  let handover = DESCENT[0];
  for (let lo = DESCENT[0], hi = DESCENT[1], i = 0; i < 40; i++) {
    handover = (lo + hi) / 2;
    if (logAlt(handover) > HANDOVER_ALT_M) lo = handover;
    else hi = handover;
  }

  // Ground point of the Palouse scene (near Pullman) and its local frame.
  const palouseUp = latLonToVec3(46.73, -117.18).normalize();
  const palouseEast = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), palouseUp).normalize();
  const palouseNorth = new THREE.Vector3().crossVectors(palouseUp, palouseEast).normalize();
  const yawRad = 20 * THREE.MathUtils.DEG2RAD;
  const palouseAhead = palouseNorth.clone().multiplyScalar(Math.cos(yawRad)).addScaledVector(palouseEast, Math.sin(yawRad));
  const satGround = up.clone();
  const satPosition = up.clone().multiplyScalar(1 + altitude);

  // Sun: orbital sunrise first, then a time-lapse morning so the Palouse is lit at
  // ~9 degrees when the cloud deck opens.
  const elevationAtPalouse = (elSat) => {
    orbitSun(elSat);
    return Math.asin(sunDirOrbit.dot(palouseUp)) * THREE.MathUtils.RAD2DEG;
  };
  let sunAtHandover = -22.6;
  for (let lo = -22.6, hi = 40, i = 0; i < 40; i++) {
    sunAtHandover = (lo + hi) / 2;
    if (elevationAtPalouse(sunAtHandover) < PALOUSE_SUN[0]) lo = sunAtHandover;
    else hi = sunAtHandover;
  }

  const rig = new THREE.PerspectiveCamera(); // a camera, so lookAt aims its -Z axis
  const qOrbit = new THREE.Quaternion();
  const qDown = new THREE.Quaternion();
  const basisQuatInverse = basisQuat.clone().invert();
  const groundDir = new THREE.Vector3();
  const offsetEarth = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function renderOrbit(t) {
    const drift = inOut(span(t, 0, DESCENT[0] + 0.4));
    const leave = smooth(span(t, 1.7, 3.0));
    const travel = smooth(span(t, DESCENT[0] + 0.15, handover + 0.1));
    const fov = mix(40, 44, smooth(span(t, 1.8, 3.4)));

    // Orientation while beside the satellite.
    satCam.position.lerpVectors(satCamFrom, satCamTo, drift);
    // The satellite flies along its orbit past the camera; the camera pans with it.
    satellite.group.position.copy(satForward).multiplyScalar(mix(SAT_PATH[0], SAT_PATH[1], span(t, 0, DESCENT[0] + 0.8)));
    satellite.wing.rotation.x = 0.35 + 0.08 * Math.sin(t * 0.9);
    tmpLook.lerpVectors(satLookStart, satLookEnd, drift).addScaledVector(satellite.group.position, SAT_TRACK);
    satCam.up.set(0, 1, 0);
    satCam.lookAt(tmpLook);
    qOrbit.copy(basisQuat).multiply(satCam.quaternion);

    // Position along the descent, in Earth radii.
    const altM = logAlt(t);
    groundDir.copy(satGround).lerp(palouseUp, travel).normalize();
    earthCam.position.copy(groundDir).multiplyScalar(1 + altM / EARTH_M);

    // Orientation toward the Palouse, ending almost straight down.
    lookTarget.copy(palouseUp).addScaledVector(palouseAhead, (HANDOVER_ALT_M * 0.09) / EARTH_M);
    rig.position.copy(earthCam.position);
    rig.up.copy(palouseAhead).lerp(up, 1 - travel).normalize();
    rig.lookAt(lookTarget);
    qDown.copy(rig.quaternion);
    earthCam.quaternion.slerpQuaternions(qOrbit, qDown, leave);
    earthCam.fov = fov;
    earthCam.near = Math.max(1e-7, (altM / EARTH_M) * 0.2);
    earthCam.updateProjectionMatrix();

    // The satellite stays where it is; the camera moves away from it.
    offsetEarth.copy(earthCam.position).sub(satPosition).multiplyScalar(EARTH_M);
    offsetEarth.applyQuaternion(basisQuatInverse);
    satCam.position.lerpVectors(satCamFrom, satCamTo, drift).add(offsetEarth);
    satCam.quaternion.copy(basisQuatInverse).multiply(earthCam.quaternion);
    satCam.fov = fov;
    satCam.updateProjectionMatrix();
    satPass.enabled = offsetEarth.length() < 3000;

    // Sun: orbital sunrise, then a time-lapse morning during the descent.
    const sunEl = t < DESCENT[0]
      ? mix(-24.6, -22.6, outCubic(span(t, 0, DESCENT[0])))
      : mix(-22.6, sunAtHandover, inOut(span(t, DESCENT[0], DESCENT[0] + 0.8)));
    orbitSun(sunEl);
    earth.sun.position.copy(sunDirOrbit).multiplyScalar(300);
    sunLocal.copy(sunDirOrbit).applyMatrix4(basisInverse).normalize();
    key.position.copy(sunLocal).multiplyScalar(50);
    earth.shared.cloudShift.value = t * 0.0012;
    // Less in-scattered haze once the camera is inside the atmosphere.
    earth.atmosphere.material.uniforms.sunIntensity.value = mix(4, 15, smooth(span(altM, 60000, 700000)));
    beam.material.uniforms.opacity.value = smooth(span(t, 0.35, 0.9)) * (1 - smooth(span(t, 1.9, 2.5)));

    // Depth of field only while the satellite is the subject.
    const dof = 1 - smooth(span(t, 1.8, 2.8));
    blurH.uniforms.amount.value = 0.6 * dof;
    blurV.uniforms.amount.value = 0.6 * dof;
    blurH.enabled = blurV.enabled = dof > 0.01;

    renderer.toneMappingExposure = mix(1.1, 1.55, smooth(span(t, DESCENT[0], DESCENT[0] + 1.0)));
    orbitComposer.render();
  }

  // Palouse camera.
  const topDown = { x: 330, z: 260, pitch: -86 };
  const lowStart = { x: 120, z: 900, alt: LOW_ALT_M, yaw: 20, pitch: -23 };
  const lowEnd = { x: 40, z: -150, alt: 340, yaw: 20, pitch: -18 };
  function placePalouseCamera(state) {
    const ground = palouse.heightAt(state.x, state.z);
    const cam = palouse.camera;
    cam.position.set(state.x, ground + state.alt, state.z);
    const y = state.yaw * THREE.MathUtils.DEG2RAD;
    const p = state.pitch * THREE.MathUtils.DEG2RAD;
    // Looking almost straight down, "up" on screen is the heading.
    const overhead = smooth(span(-state.pitch, 55, 85));
    cam.up.set(Math.sin(y) * overhead, 1 - overhead, -Math.cos(y) * overhead).normalize();
    cam.lookAt(
      state.x + Math.sin(y) * Math.cos(p) * 1000,
      ground + state.alt + Math.sin(p) * 1000,
      state.z - Math.cos(y) * Math.cos(p) * 1000,
    );
  }
  const high = { x: 0, z: 0, alt: 900, yaw: 20, pitch: -35 };
  const lerpState = (a, b, k) => ({
    x: mix(a.x, b.x, k),
    z: mix(a.z, b.z, k),
    alt: mix(a.alt, b.alt, k),
    yaw: mix(a.yaw, b.yaw, k),
    pitch: mix(a.pitch, b.pitch, k),
  });
  const projected = new THREE.Vector3();
  const GLIDE = [DESCENT[1], 6.7];
  const RISE = [6.35, 7.15];
  const SCAN = [5.05, 6.7];

  function renderPalouse(t) {
    const local = span(t, handover, DURATION);
    let state;
    if (t < DESCENT[1]) {
      const altM = logAlt(t);
      const k = (Math.log(HANDOVER_ALT_M) - Math.log(altM)) / (Math.log(HANDOVER_ALT_M) - Math.log(LOW_ALT_M));
      const pull = smooth(clamp01(k));
      state = {
        x: mix(topDown.x, lowStart.x, pull),
        z: mix(topDown.z, lowStart.z, pull),
        alt: altM,
        yaw: 20,
        pitch: mix(topDown.pitch, lowStart.pitch, Math.pow(pull, 1.4)),
      };
    } else {
      state = lerpState(lowStart, lowEnd, smooth(span(t, GLIDE[0], GLIDE[1])));
    }
    state = lerpState(state, high, inOut(span(t, RISE[0], RISE[1])));
    placePalouseCamera(state);
    palouse.camera.fov = mix(44, 39, smooth(span(t, DESCENT[1] - 0.4, GLIDE[1])));
    palouse.camera.updateProjectionMatrix();

    // Time-lapse morning: the sun climbs while the scan line sweeps away from us.
    palouse.setSun(mix(PALOUSE_SUN[0], PALOUSE_SUN[1], local), 95);
    const sweep = span(t, SCAN[0], SCAN[1]);
    palouse.setScan(mix(700, -4600, inOut(sweep)), smooth(span(t, SCAN[0] - 0.05, SCAN[0] + 0.2)) * (1 - smooth(span(t, SCAN[1] - 0.05, SCAN[1] + 0.3))));
    palouse.uniforms.season.value = mix(0.2, 0.24, local);
    palouse.uniforms.seasonAhead.value = 0.2;
    palouse.uniforms.cloudTime.value = t * 0.6;
    palouse.uniforms.highlight.value = smooth(span(t, RISE[1] - 0.45, RISE[1] - 0.05));

    const rise = inOut(span(t, RISE[0], RISE[1]));
    renderer.toneMappingExposure = mix(0.82, 0.62, rise);
    palouseComposer.render();

    // Labels.
    const titleIn = outCubic(span(t, RISE[1] - 0.4, RISE[1]));
    title.style.opacity = String(titleIn);
    title.style.transform = `translateY(${(1 - titleIn) * 14}px)`;
    const rotIn = outCubic(span(t, RISE[1] - 0.3, RISE[1] + 0.05));
    projected.set(featured.x, palouse.heightAt(featured.x, featured.y) + 10, featured.y).project(palouse.camera);
    rotation.style.opacity = String(rotIn);
    rotation.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
    rotation.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
  }

  // Cloud deck: thickens as the camera reaches it, peaks at the handover, then
  // breaks open over the hills.
  function cloudDeck(t) {
    const bump = (at, before, after) => (t < at ? smooth(span(t, at - before, at)) : 1 - smooth(span(t, at, at + after)));
    return bump(handover, 0.4, 0.5);
  }

  function renderAt(t) {
    lensUniforms.seed.value = (t * 37) % 100;
    lensUniforms.cloud.value = cloudDeck(t) * 0.86;
    lensUniforms.cloudTime.value = t;
    lensUniforms.fade.value = outCubic(span(t, 0, 0.55));
    if (t < handover) renderOrbit(t);
    else renderPalouse(t);
  }

  cleanup = () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKey);
    renderer.setAnimationLoop(null);
    palouse.dispose();
    for (const composer of composers) composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  // Compile shaders up front so the first frames do not stall.
  renderAt(0.0);
  renderAt(handover + 0.01);
  renderer.compile(palouse.scene, palouse.camera);

  overlay.classList.add("intro-ready");
  if (captureMode) {
    window.__intro = { renderAt, duration: DURATION, ready: true };
    return;
  }

  window.__introStarted = true;
  const start = performance.now();
  let last = start;
  let slowFrames = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const t = (now - start) / 1000;
    // Drop resolution step by step if the device cannot keep up.
    if (now - last > 40 && t > 0.2) slowFrames += 1;
    last = now;
    if (slowFrames > 5 && pixelRatio > 0.6) {
      slowFrames = 0;
      pixelRatio = Math.max(0.6, pixelRatio * 0.75);
      renderer.setPixelRatio(pixelRatio);
      onResize();
    }
    renderAt(Math.min(t, DURATION));
    if (t >= FINISH) finish();
  });
}
