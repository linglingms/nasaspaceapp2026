// Rendered Earth for the orbital part of the opening sequence: NASA Blue Marble
// day imagery, Black Marble night lights, clouds, ocean glint and a ray-marched
// atmosphere. Scene units: Earth radius = 1.
import * as THREE from "three";

const DEG = Math.PI / 180;
// Matches THREE.SphereGeometry's equirectangular UV layout.
export function latLonToVec3(lat, lon, radius = 1) {
  const phi = (lon + 180) * DEG;
  const cosLat = Math.cos(lat * DEG);
  return new THREE.Vector3(-Math.cos(phi) * cosLat * radius, Math.sin(lat * DEG) * radius, Math.sin(phi) * cosLat * radius);
}


// --- shaders ----------------------------------------------------------------
const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform sampler2D cloudMap;
  uniform sampler2D regionWater;
  uniform vec4 regionBounds; // lon min, lat min, lon max, lat max
  uniform vec3 sunDir;
  uniform float cloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
  // Sub-texel ground detail that fades in as the camera descends, so the surface
  // keeps texture below the resolution of the satellite mosaic.
  float groundDetail(vec2 uv) {
    vec2 q = uv * vec2(2.0, 1.0);
    float d = 0.0;
    float scale = 6000.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      vec2 g = q * scale;
      float w = length(fwidth(g));
      d += amp * (vnoise(g) - 0.5) * (1.0 - smoothstep(0.35, 1.2, w));
      scale *= 2.7;
      amp *= 0.8;
    }
    return d;
  }
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float NdL = dot(N, sunDir);
    float daylight = smoothstep(-0.10, 0.22, NdL);
    float twilight = smoothstep(-0.25, 0.0, NdL) * (1.0 - smoothstep(0.0, 0.35, NdL));

    vec3 albedo = pow(texture2D(dayMap, vUv).rgb, vec3(1.12)) * 1.08;
    float water = texture2D(waterMap, vUv).r;
    // Sharper coastline for the Pacific Northwest (Puget Sound, Strait of Juan de Fuca).
    vec2 lonLat = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
    vec2 ruv = (lonLat - regionBounds.xy) / (regionBounds.zw - regionBounds.xy);
    if (all(greaterThan(ruv, vec2(0.0))) && all(lessThan(ruv, vec2(1.0)))) {
      float sharp = texture2D(regionWater, vec2(ruv.x, 1.0 - ruv.y)).r;
      vec2 edge = min(ruv, 1.0 - ruv);
      float inside = smoothstep(0.0, 0.08, min(edge.x, edge.y));
      float newWater = mix(water, sharp, inside);
      vec3 sea = vec3(0.012, 0.035, 0.07);
      vec3 shore = vec3(0.07, 0.09, 0.05);
      albedo = mix(albedo, sea, max(newWater - water, 0.0));
      albedo = mix(albedo, shore, max(water - newWater, 0.0));
      water = newWater;
    }
    albedo *= 1.0 + groundDetail(vUv) * 0.9 * (1.0 - water);
    // Cloud shadow, offset a little toward the sun.
    float shadow = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0) + sunDir.xz * 0.0015).r;

    vec3 sunColor = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.45, NdL));
    float lambert = max(NdL, 0.0);
    vec3 color = albedo * sunColor * (lambert * 1.85) * (1.0 - 0.45 * shadow);
    color += albedo * 0.012; // faint earthshine

    // Ocean glint: tight specular plus a broad sheen.
    vec3 H = normalize(sunDir + V);
    float NdH = max(dot(N, H), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    float glint = pow(NdH, 180.0) * 5.0 + pow(NdH, 18.0) * 0.18;
    color += water * glint * (0.4 + fres) * sunColor * daylight * (1.0 - 0.8 * shadow);
    color = mix(color, color * vec3(0.78, 0.86, 1.0), water * 0.35);

    // City lights on the night side, warm and slightly bloomed.
    vec3 lights = texture2D(nightMap, vUv).rgb;
    lights = pow(lights, vec3(1.6)) * vec3(1.0, 0.72, 0.42) * 2.2;
    color += lights * (1.0 - daylight) * (1.0 - 0.6 * shadow);

    // Warm band along the terminator.
    color += albedo * vec3(0.9, 0.35, 0.12) * twilight * 0.06;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const cloudFragment = /* glsl */ `
  uniform sampler2D cloudMap;
  uniform vec4 regionBounds;
  uniform vec3 sunDir;
  uniform float cloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    float NdL = dot(N, sunDir);
    float c = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
    c = smoothstep(0.08, 0.95, c);
    // A clear morning over Washington so the coastline reads from orbit.
    vec2 lonLat = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
    vec2 ruv = (lonLat - regionBounds.xy) / (regionBounds.zw - regionBounds.xy);
    vec2 edge = min(ruv, 1.0 - ruv);
    c *= 1.0 - 0.85 * smoothstep(0.0, 0.15, min(edge.x, edge.y));
    vec3 sunColor = mix(vec3(1.0, 0.5, 0.28), vec3(1.0, 0.98, 0.95), smoothstep(0.0, 0.4, NdL));
    float light = smoothstep(-0.18, 0.5, NdL);
    vec3 color = sunColor * (0.06 + 2.1 * max(NdL, 0.0)) * light + vec3(0.004, 0.006, 0.01);
    gl_FragColor = vec4(color, c * mix(0.55, 0.92, light));
  }
`;

// Single-scattering atmosphere (Rayleigh + Mie), ray-marched per pixel.
const atmosphereVertex = /* glsl */ `
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform float sunIntensity;
  varying vec3 vPosW;
  const float PI = 3.14159265;
  const float R_PLANET = 6371e3;
  const float R_ATMOS = 6471e3;
  const vec3 K_RLH = vec3(5.5e-6, 13.0e-6, 22.4e-6);
  const float K_MIE = 21e-6;
  const float SH_RLH = 8e3;
  const float SH_MIE = 1.2e3;
  const float G = 0.758;
  const int STEPS_I = 12;
  const int STEPS_J = 5;

  vec2 raySphere(vec3 r0, vec3 rd, float sr) {
    float a = dot(rd, rd);
    float b = 2.0 * dot(rd, r0);
    float c = dot(r0, r0) - sr * sr;
    float d = b * b - 4.0 * a * c;
    if (d < 0.0) return vec2(1e5, -1e5);
    return vec2((-b - sqrt(d)) / (2.0 * a), (-b + sqrt(d)) / (2.0 * a));
  }

  void main() {
    float scale = R_PLANET; // scene units: planet radius = 1
    vec3 r0 = cameraPosition * scale;
    vec3 rd = normalize(vPosW - cameraPosition);
    vec2 p = raySphere(r0, rd, R_ATMOS);
    if (p.x > p.y) discard;
    p.x = max(p.x, 0.0);
    vec2 g = raySphere(r0, rd, R_PLANET);
    bool hitsGround = g.x < g.y && g.x > 0.0;
    if (hitsGround) p.y = min(p.y, g.x);
    float stepI = (p.y - p.x) / float(STEPS_I);
    float tI = p.x;
    vec3 totalRlh = vec3(0.0);
    vec3 totalMie = vec3(0.0);
    float odRlhI = 0.0;
    float odMieI = 0.0;
    float mu = dot(rd, sunDir);
    float mumu = mu * mu;
    float gg = G * G;
    float pRlh = 3.0 / (16.0 * PI) * (1.0 + mumu);
    float pMie = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * G, 1.5) * (2.0 + gg));
    for (int i = 0; i < STEPS_I; i++) {
      vec3 pI = r0 + rd * (tI + stepI * 0.5);
      float hI = length(pI) - R_PLANET;
      float odStepRlh = exp(-hI / SH_RLH) * stepI;
      float odStepMie = exp(-hI / SH_MIE) * stepI;
      odRlhI += odStepRlh;
      odMieI += odStepMie;
      float stepJ = raySphere(pI, sunDir, R_ATMOS).y / float(STEPS_J);
      float tJ = 0.0;
      float odRlhJ = 0.0;
      float odMieJ = 0.0;
      vec2 sp = raySphere(pI, sunDir, R_PLANET);
      bool lit = !(sp.x > 0.0 && sp.x < sp.y);
      for (int j = 0; j < STEPS_J; j++) {
        vec3 pJ = pI + sunDir * (tJ + stepJ * 0.5);
        float hJ = length(pJ) - R_PLANET;
        odRlhJ += exp(-hJ / SH_RLH) * stepJ;
        odMieJ += exp(-hJ / SH_MIE) * stepJ;
        tJ += stepJ;
      }
      vec3 attn = exp(-(K_MIE * (odMieI + odMieJ) + K_RLH * (odRlhI + odRlhJ)));
      float shadowed = lit ? 1.0 : 0.0;
      totalRlh += odStepRlh * attn * shadowed;
      totalMie += odStepMie * attn * shadowed;
      tI += stepI;
    }
    vec3 color = sunIntensity * (pRlh * K_RLH * totalRlh + pMie * K_MIE * totalMie);
    // Keep the ground readable: less haze where the ray ends on the surface.
    if (hitsGround) color *= 0.55;
    gl_FragColor = vec4(color, 1.0);
  }
`;


function makeStars() {
  const count = 5000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions.set([s * Math.cos(a) * 400, u * 400, s * Math.sin(a) * 400], i * 3);
    const warm = Math.random();
    const b = Math.pow(Math.random(), 6) * 0.9 + 0.08;
    colors.set([b * (0.8 + 0.2 * warm), b * 0.88, b * (1.0 - 0.2 * warm)], i * 3);
    sizes[i] = 0.6 + Math.pow(Math.random(), 8) * 2.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vColor; uniform float pixelRatio;
      void main() { vColor = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pixelRatio; }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor * a, 1.0); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  return new THREE.Points(geometry, material);
}

function makeSunSprite() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.05, "rgba(255,250,235,1)");
  g.addColorStop(0.14, "rgba(255,220,170,0.3)");
  g.addColorStop(0.4, "rgba(255,190,130,0.04)");
  g.addColorStop(0.7, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(6, 5.6, 5) });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(60);
  return sprite;
}


export function createEarth({ dayMap, nightMap, waterMap, cloudMap, regionWater, sunDir }) {
  const group = new THREE.Group();
  const regionBounds = new THREE.Vector4(-127, 45, -116, 50);
  cloudMap.wrapS = THREE.RepeatWrapping;
  const shared = { sunDir: { value: sunDir }, cloudShift: { value: 0 } };
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 256, 160),
    new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        waterMap: { value: waterMap },
        cloudMap: { value: cloudMap },
        regionWater: { value: regionWater },
        regionBounds: { value: regionBounds },
      },
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
    }),
  );
  group.add(earth);
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.0018, 256, 160),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, cloudMap: { value: cloudMap }, regionBounds: { value: regionBounds } },
      vertexShader: earthVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
    }),
  );
  group.add(clouds);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(6471 / 6371, 160, 120),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: shared.sunDir, sunIntensity: { value: 15 } },
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  atmosphere.renderOrder = 2;
  group.add(atmosphere);
  const stars = makeStars();
  group.add(stars);
  const sun = makeSunSprite();
  sun.position.copy(sunDir).multiplyScalar(300);
  group.add(sun);
  return { group, shared, stars, sun, earth, clouds, atmosphere };
}
