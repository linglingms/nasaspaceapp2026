// Procedural Palouse landscape: rolling loess hills, contour-strip fields whose
// crops change through the season, low sun with terrain shadows, valley mist,
// physically based sky. Units are metres; +Y is up.
import * as THREE from "three";

const NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = r * p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }
  // Palouse loess hills: smooth domes ~60-120 m high, 600-900 m apart (in hill units).
  float hillHeight(vec2 p) {
    vec2 q = p / 1000.0;
    q += 0.45 * vec2(fbm(q * 0.6 + 3.1), fbm(q * 0.6 + 9.7));
    float h = fbm(q);
    h = smoothstep(0.18, 0.86, h);
    float broad = fbm(p / 4200.0 + 2.0);
    return h * 130.0 + broad * 60.0 + fbm(p / 90.0) * 1.6;
  }

  // A stylised relief model of the Pacific Northwest. One metre of the scene is
  // MAP_KM kilometres of real ground, with heights exaggerated; the featured field
  // sits in the Palouse. regionMap: r = water, g = elevation, b = unused
  // relief (lon -135..-105, lat 36..58). Beyond it, the globe's coarse water mask.
  uniform sampler2D regionMap;
  uniform sampler2D overlayMap; // r = borders (Washington brightest), g = farmland, b = rivers
  uniform sampler2D forestMap;  // wet forest west of the Cascade crest and on interior ranges
  uniform sampler2D waterMap;
  uniform vec4 mapXform; // featured field x, z; its longitude, latitude
  const float MAP_KM = 0.9;
  const float HILL_SCALE = 14.0; // farmland hills and fields are this much finer
  const vec4 REGION = vec4(-135.0, 36.0, -105.0, 58.0);
  vec2 globeUV(vec2 ll) { return vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0); }
  vec2 lonLat(vec2 p) {
    float lon = mapXform.z + (p.x - mapXform.x) * MAP_KM / (111.32 * cos(radians(mapXform.w)));
    float lat = mapXform.w - (p.y - mapXform.y) * MAP_KM / 110.57;
    return vec2(lon, lat);
  }
  vec2 boundsUV(vec2 ll, vec4 b) { return (ll - b.xy) / (b.zw - b.xy); }
  float insideRegion(vec2 uv) { vec2 e = min(uv, 1.0 - uv); return smoothstep(0.0, 0.03, min(e.x, e.y)); }
  // Coarser relief of the rest of the continent, so the model has no edge in view.
  uniform sampler2D wideMap;
  const vec4 WIDE = vec4(-170.0, 10.0, -60.0, 75.0);
  vec3 regionAt(vec2 p) {
    vec2 ll = lonLat(p);
    vec2 uv = boundsUV(ll, REGION);
    vec3 r = texture2D(regionMap, clamp(uv, 0.0, 1.0)).rgb;
    float globeWater = smoothstep(0.3, 0.7, texture2D(waterMap, globeUV(ll)).r);
    vec2 wuv = boundsUV(ll, WIDE);
    vec3 w = texture2D(wideMap, clamp(wuv, 0.0, 1.0)).rgb;
    // Lakes the elevation data leaves out (it only knows the sea).
    w.r = max(w.r, globeWater * smoothstep(0.12, 0.2, w.g));
    w.b = 0.0;
    vec3 far = mix(vec3(globeWater, 0.0, 0.0), w, insideRegion(wuv));
    return mix(far, r, insideRegion(uv));
  }
  float landOf(float water) { return 1.0 - smoothstep(0.35, 0.65, water); }
  float farmAt(vec2 p) {
    vec2 uv = boundsUV(lonLat(p), REGION);
    return smoothstep(0.3, 0.7, texture2D(overlayMap, clamp(uv, 0.0, 1.0)).g) * insideRegion(uv);
  }
  // Real elevation (AWS Terrain Tiles: SRTM, USGS NED, GMTED), stored as sqrt(km / 4.4).
  float elevKm(vec3 m) { return m.g * m.g * 4.4; }
  const float EXAG = 9.0;
  float terrainHeight(vec2 p) {
    vec3 m = regionAt(p);
    float land = landOf(m.r);
    float ek = elevKm(m);
    // Rolling loess hills underfoot, crisp ridges on the ranges.
    float hills = hillHeight(p * HILL_SCALE) / HILL_SCALE;
    float rough = smoothstep(0.6, 2.0, ek);
    float ridges = 1.0 - abs(2.0 * fbm(p / 12.0 + 5.0) - 1.0);
    return mix(0.6, 1.2 + ek / MAP_KM * EXAG + hills * 0.15 + rough * ridges * 2.5, land);
  }
`;

const terrainVertex = /* glsl */ `
  ${NOISE}
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.y = terrainHeight(world.xz);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const terrainFragment = /* glsl */ `
  ${NOISE}
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 skyColor;
  uniform vec3 fogColorSun;
  uniform vec3 fogColorAway;
  uniform float season;      // 0..1 base point in the crop year
  uniform float seasonAhead; // how far fields behind the scan line have advanced
  uniform float scanX;       // position of the satellite's scan line along scanAxis
  uniform vec2 scanAxis;
  uniform float scanOn;      // 0..1 visibility of the scan line
  uniform float cloudTime;
  uniform float highlight;   // 0..1 outline of the featured field
  uniform vec2 featured;     // a point inside the featured field
  uniform sampler2D heightTex;
  uniform float heightExtent;
  varying vec3 vWorld;
  // Pre-baked height (25 m texels) for the expensive shadow and occlusion lookups.
  float coarseHeight(vec2 p) { return texture2D(heightTex, p / heightExtent + 0.5).r; }

  // Field layout: warped Voronoi parcels, split into contour strips on some hills.
  vec3 fieldCell(vec2 p) {
    vec2 w = p + 300.0 * vec2(fbm(p / 1100.0 + 4.0), fbm(p / 1100.0 + 8.0));
    vec2 g = w / 640.0;
    vec2 i = floor(g);
    vec2 f = fract(g);
    float d1 = 8.0;
    float d2 = 8.0;
    vec2 id = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 c = o + 0.15 + 0.7 * hash22(i + o);
        float d = length(c - f);
        if (d < d1) { d2 = d1; d1 = d; id = i + o; }
        else if (d < d2) { d2 = d; }
      }
    }
    return vec3(id, d2 - d1);
  }

  // Crop colours through the year. kind: 0 winter wheat, 1 spring wheat, 2 pulse, 3 canola, 4 fallow.
  vec3 cropColor(float kind, float s, float rows, float n) {
    vec3 soil = mix(vec3(0.26, 0.17, 0.11), vec3(0.36, 0.25, 0.16), n);
    vec3 stubble = mix(vec3(0.72, 0.60, 0.40), vec3(0.80, 0.69, 0.47), n) * (0.9 + 0.1 * rows);
    vec3 young = vec3(0.26, 0.50, 0.14);
    vec3 green = vec3(0.16, 0.40, 0.10);
    vec3 gold = mix(vec3(0.82, 0.60, 0.22), vec3(0.90, 0.72, 0.32), n);
    s = fract(s);
    if (kind < 0.5) {
      vec3 c = mix(young, green, smoothstep(0.0, 0.25, s));
      c = mix(c, vec3(0.55, 0.55, 0.22), smoothstep(0.30, 0.42, s));
      c = mix(c, gold, smoothstep(0.40, 0.52, s));
      c = mix(c, stubble, smoothstep(0.60, 0.64, s));
      c = mix(c, soil, smoothstep(0.80, 0.86, s));
      c = mix(c, young * 0.8 + soil * 0.2, smoothstep(0.92, 1.0, s));
      return c;
    }
    if (kind < 1.5) {
      vec3 c = mix(soil, young, smoothstep(0.12, 0.25, s));
      c = mix(c, green, smoothstep(0.25, 0.35, s));
      c = mix(c, gold, smoothstep(0.45, 0.6, s));
      c = mix(c, stubble, smoothstep(0.68, 0.72, s));
      c = mix(c, soil, smoothstep(0.88, 0.95, s));
      return c;
    }
    if (kind < 2.5) {
      vec3 pulse = vec3(0.36, 0.50, 0.24);
      vec3 c = mix(soil, pulse * 0.8, smoothstep(0.15, 0.3, s));
      c = mix(c, pulse, smoothstep(0.3, 0.4, s));
      c = mix(c, vec3(0.62, 0.56, 0.36), smoothstep(0.48, 0.58, s));
      c = mix(c, stubble * 0.92, smoothstep(0.62, 0.66, s));
      c = mix(c, soil, smoothstep(0.85, 0.92, s));
      return c;
    }
    if (kind < 3.5) {
      vec3 c = mix(young, green, smoothstep(0.05, 0.2, s));
      c = mix(c, vec3(0.93, 0.80, 0.16), smoothstep(0.26, 0.32, s));
      c = mix(c, green * 1.05, smoothstep(0.40, 0.46, s));
      c = mix(c, vec3(0.55, 0.50, 0.30), smoothstep(0.52, 0.6, s));
      c = mix(c, stubble * 0.9, smoothstep(0.64, 0.68, s));
      c = mix(c, soil, smoothstep(0.85, 0.9, s));
      return c;
    }
    return mix(soil, stubble * 0.85, 0.35 + 0.25 * n);
  }

  float shadowMarch(vec3 p) {
    float res = 1.0;
    float t = 20.0;
    for (int i = 0; i < 22; i++) {
      vec3 q = p + sunDir * t;
      float h = q.y - coarseHeight(q.xz);
      res = min(res, 6.0 * h / t);
      if (res < 0.0) break;
      t += max(14.0, t * 0.18);
    }
    return clamp(res, 0.0, 1.0);
  }

  void main() {
    vec2 p = vWorld.xz;
    float e = 1.5;
    float h = terrainHeight(p);
    vec3 region = regionAt(p);
    vec2 ll = lonLat(p);
    vec2 ruv = boundsUV(ll, REGION);
    vec3 overlay = texture2D(overlayMap, clamp(ruv, 0.0, 1.0)).rgb * insideRegion(ruv);
    float river = smoothstep(0.25, 0.6, overlay.b);
    float land = landOf(region.r) * (1.0 - river);
    // Fields, rows and hills are laid out in finer "hill units".
    vec2 pw = p;
    p = pw * HILL_SCALE;
    float hq = hillHeight(p);
    vec3 N = normalize(vec3(terrainHeight(pw - vec2(e, 0.0)) - terrainHeight(pw + vec2(e, 0.0)), 2.0 * e,
                            terrainHeight(pw - vec2(0.0, e)) - terrainHeight(pw + vec2(0.0, e))));

    vec3 cell = fieldCell(p);
    float strip = floor((hq + 6.0 * fbm(p / 300.0)) / 24.0);
    float split = step(0.3, hash12(cell.xy + 3.7));
    vec2 fid = cell.xy + split * vec2(strip * 13.1, strip * 7.7);
    float kindR = hash12(fid + 1.3);
    float kind = kindR < 0.38 ? 0.0 : kindR < 0.55 ? 1.0 : kindR < 0.78 ? 2.0 : kindR < 0.86 ? 3.0 : 4.0;
    float phase = (hash12(fid + 5.1) - 0.5) * 0.08;

    // Rows follow the contours.
    vec2 grad = vec2(N.x, N.z);
    vec2 along = normalize(vec2(-grad.y, grad.x) + 1e-4);
    float rowsCoord = hq / 0.9 + dot(p, vec2(0.013, 0.021));
    float rowW = fwidth(rowsCoord);
    float rows = mix(0.5 + 0.5 * sin(rowsCoord * 6.2831), 0.5, smoothstep(0.25, 0.9, rowW));

    // Fields behind the scan line have moved ahead in the year.
    float sp = dot(pw, scanAxis);
    float scanned = smoothstep(scanX - 6.0, scanX + 6.0, sp);
    float s = season + phase + seasonAhead * scanned;
    float n = fbm(p / 60.0);
    vec3 albedo = cropColor(kind, s, rows, n);
    // Harvest stripes from combines on stubble.
    float stubbleAmt = smoothstep(0.6, 0.66, fract(s)) * (1.0 - smoothstep(0.82, 0.86, fract(s))) * step(kind, 2.5);
    float pass = 0.5 + 0.5 * sin((hq / 0.9 + dot(p, vec2(0.013, 0.021))) * 6.2831 / 7.0);
    albedo *= 1.0 + stubbleAmt * (pass - 0.5) * 0.18;
    // Field edges: thin grassy margin.
    float edge = 1.0 - smoothstep(0.0, 0.035, cell.z);
    albedo = mix(albedo, vec3(0.34, 0.36, 0.20), edge * 0.7);
    // Crop density mottling and combed streaks along the contours.
    float streak = vnoise(vec2(hq / 2.2, dot(p, along) / 40.0));
    albedo *= 0.92 + 0.1 * fbm(p / 45.0) + 0.05 * streak;
    // Sprayer tramlines every ~20 rows: the fine contour stripes seen from the air.
    float tramCoord = rowsCoord / 22.0;
    float tramW = fwidth(tramCoord);
    float tram = 1.0 - smoothstep(0.88 - tramW, 0.94 + tramW, abs(fract(tramCoord) - 0.5) * 2.0);
    float growing = 1.0 - stubbleAmt;
    albedo *= mix(1.0, 0.86, (1.0 - tram) * growing * (1.0 - smoothstep(0.15, 0.5, tramW)));
    // Fine soil and crop variation, faded out where it would alias.
    float fineW = fwidth(p.x) / 6.0;
    albedo *= 1.0 + (vnoise(p / 6.0) - 0.5) * 0.14 * (1.0 - smoothstep(0.2, 0.8, fineW));

    // Land cover: crop patchwork in the real farm country (the Palouse and Columbia
    // Plateau, Willamette Valley, Snake River Plain...), dark conifer forest west of
    // the Cascade crest and on the ranges, sage steppe elsewhere, snow on the volcanoes.
    vec2 warp = (vec2(fbm(pw / 60.0 + 1.7), fbm(pw / 60.0 + 6.1)) - 0.5) * 0.012;
    float farm = smoothstep(0.35, 0.65, texture2D(overlayMap, clamp(ruv + warp, 0.0, 1.0)).g) * insideRegion(ruv);
    float wet = smoothstep(0.35, 0.65, texture2D(forestMap, clamp(ruv + warp * 1.4, 0.0, 1.0)).r) * insideRegion(ruv);
    float nn = fbm(pw / 18.0);
    // Golden grass in the low basins, grey-green sage on the uplands.
    float ekS = elevKm(region);
    vec3 steppe = mix(vec3(0.58, 0.49, 0.31), vec3(0.42, 0.43, 0.33), smoothstep(0.4, 1.4, ekS + 0.4 * (nn - 0.5)));
    steppe *= 0.88 + 0.24 * fbm(pw / 5.0);
    vec3 forest = mix(vec3(0.05, 0.12, 0.06), vec3(0.10, 0.18, 0.08), nn) * (0.8 + 0.4 * fbm(pw / 3.0));
    float ek = elevKm(region);
    float lat = ll.y;
    float snowLine = mix(3.0, 2.0, smoothstep(40.0, 49.0, lat));
    float ekN = ek + 0.3 * (fbm(pw / 5.0) - 0.5);
    // Conifers on the northern ranges and high plateaus; open ground on the Montana plains.
    float north = smoothstep(43.0, 45.5, lat);
    float plains = smoothstep(-113.5, -112.5, ll.x);
    float mtnForest = smoothstep(0.75, 1.15, ekN + 0.3 * plains * -2.0) * north + smoothstep(1.6, 2.0, ekN) * (1.0 - north) * 0.7;
    float treeline = 1.0 - smoothstep(snowLine - 0.55, snowLine - 0.15, ekN);
    float forestAmt = clamp(max(wet, mtnForest), 0.0, 1.0) * treeline * (1.0 - farm);
    // Outside the main farm country the patchwork gives way to dry steppe.
    albedo = mix(mix(albedo, steppe, 0.7), albedo, farm);
    albedo = mix(albedo, forest, forestAmt);
    vec3 rock = vec3(0.32, 0.30, 0.28) * (0.8 + 0.4 * fbm(pw / 2.0));
    albedo = mix(albedo, rock, (1.0 - treeline) * (1.0 - farm));
    float snow = smoothstep(snowLine, snowLine + 0.3, ekN + 0.4 * max(N.y - 0.8, 0.0));
    albedo = mix(albedo, vec3(0.9, 0.92, 0.95), clamp(snow, 0.0, 1.0));

    // Lighting: low sun, soft terrain shadows, sky fill.
    float NdL = max(dot(N, sunDir), 0.0);
    float sh = NdL > 0.0 ? shadowMarch(vWorld + N * 0.5) : 0.0;
    float cloud = smoothstep(0.58, 0.8, fbm(pw / 900.0 + vec2(cloudTime * 0.6, cloudTime * 0.15)));
    sh *= 1.0 - 0.3 * cloud;
    // Wheat sheen toward the sun (forward scattering through the canopy).
    vec3 V = normalize(cameraPosition - vWorld);
    float sheen = pow(max(dot(-V, sunDir), 0.0), 6.0) * (kind < 1.5 || kind > 2.5 ? 0.35 : 0.12) * sh;
    float occl = clamp(0.55 + (h - coarseHeight(pw + vec2(40.0, 0.0)) * 0.25 - coarseHeight(pw - vec2(40.0, 0.0)) * 0.25
                     - coarseHeight(pw + vec2(0.0, 40.0)) * 0.25 - coarseHeight(pw - vec2(0.0, 40.0)) * 0.25) / 12.0 + 0.45, 0.45, 1.0);
    vec3 color = albedo * (sunColor * NdL * sh * 3.6 + skyColor * (0.18 + 0.14 * N.y) * occl);
    color += albedo * sunColor * sheen;

    // Water: deep Pacific, sounds and rivers, with sky reflection and sun glint.
    if (land < 0.999) {
      vec3 Vw = normalize(cameraPosition - vWorld);
      float fres = 0.04 + 0.96 * pow(1.0 - max(Vw.y, 0.0), 5.0);
      vec3 deep = vec3(0.01, 0.045, 0.1);
      vec3 shallow = vec3(0.03, 0.1, 0.14);
      float nearShore = max(smoothstep(0.75, 0.4, region.r), river);
      vec3 wcol = mix(deep, shallow, nearShore) * (skyColor * 0.9 + sunColor * 0.25);
      vec3 Hs = normalize(sunDir + Vw);
      float spec = pow(max(Hs.y, 0.0), 300.0) * 6.0 + pow(max(Hs.y, 0.0), 30.0) * 0.12;
      wcol = mix(wcol, skyColor * 0.8, fres * 0.6) + sunColor * spec;
      color = mix(wcol, color, land);
    }
    // Washington's border, drawn faintly as on a relief model.
    // State and national borders, drawn faintly as on a relief model; Washington's
    // are the brightest.
    float border = smoothstep(0.15, 0.5, overlay.r);
    float waBorder = smoothstep(0.6, 0.9, overlay.r);
    color = mix(color, vec3(1.0, 0.97, 0.9), border * mix(0.3, mix(0.75, 0.95, highlight), waBorder) * land);

    // Scan line: a thin band of light across the ground.
    float sd = abs(sp - scanX);
    color += vec3(0.85, 0.95, 1.0) * scanOn * (exp(-sd * sd / 18.0) * 2.4 + exp(-sd / 120.0) * 0.08);

    // The featured farm: a block of Palouse fields around the focus, outlined.
    vec2 fd = pw - featured;
    float fr = length(fd) + 16.0 * (fbm(pw / 18.0 + 2.0) - 0.5);
    float isFeatured = 1.0 - smoothstep(-0.5, 0.5, (fr - 36.0) / max(fwidth(fr), 1e-4));
    float ring = 1.0 - smoothstep(0.5, 1.5, abs(fr - 36.0) / max(fwidth(fr), 1e-4));
    // Washington stays lit; the rest of the map dims, so the field reads as being there.
    float waFill = texture2D(forestMap, clamp(ruv, 0.0, 1.0)).g * insideRegion(ruv);
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(color, mix(vec3(lum), color, mix(0.45, 1.0, waFill)) * mix(0.55, 1.1, waFill), highlight);
    // Its outline, a constant ~1.5 px on screen.
    float waLine = 1.0 - smoothstep(0.6, 1.6, abs(waFill - 0.5) / max(fwidth(waFill), 1e-4));
    color = mix(color, vec3(1.0, 0.96, 0.86), waLine * highlight * 0.9);
    color = mix(color, color * vec3(1.5, 1.38, 0.95) + vec3(0.045, 0.035, 0.0), isFeatured * highlight);
    color = mix(color, vec3(1.0, 0.98, 0.92), ring * highlight);

    // Aerial perspective and valley mist.
    float dist = length(cameraPosition - vWorld);
    vec3 vdir = normalize(vWorld - cameraPosition);
    float toSun = pow(max(dot(normalize(vec3(vdir.x, 0.0, vdir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 3.0);
    vec3 fogC = mix(fogColorAway, fogColorSun, toSun);
    vec3 mistC = mix(vec3(0.85, 0.82, 0.8), fogColorSun, 0.5 + 0.5 * toSun);
    float fog = (1.0 - exp(-dist / 14000.0)) * 0.9;
    float mist = exp(-max(vWorld.y - 4.0, 0.0) / 4.0) * (1.0 - exp(-dist / 3000.0)) * 0.25 * smoothstep(0.35, 0.7, fbm(pw / 300.0 + cloudTime * 0.2));
    color = mix(color, mistC, clamp(mist, 0.0, 1.0));
    color = mix(color, fogC, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(color, 1.0);
  }
`;

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform float cloudTime;
  varying vec3 vDir;
  const float PI = 3.14159265;
  const float R_PLANET = 6371e3;
  const float R_ATMOS = 6471e3;
  const vec3 K_RLH = vec3(5.5e-6, 13.0e-6, 22.4e-6);
  const float K_MIE = 21e-6;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.02 + 7.3; a *= 0.5; } return v; }
  vec2 rsi(vec3 r0, vec3 rd, float sr) {
    float b = 2.0 * dot(rd, r0); float c = dot(r0, r0) - sr * sr; float d = b * b - 4.0 * c;
    if (d < 0.0) return vec2(1e5, -1e5);
    return vec2((-b - sqrt(d)) / 2.0, (-b + sqrt(d)) / 2.0);
  }
  vec3 atmosphere(vec3 rd, vec3 r0) {
    vec2 p = rsi(r0, rd, R_ATMOS);
    p.y = min(p.y, rsi(r0, rd, R_PLANET).x > 0.0 ? rsi(r0, rd, R_PLANET).x : p.y);
    float st = (p.y - max(p.x, 0.0)) / 16.0;
    float t = max(p.x, 0.0);
    vec3 tr = vec3(0.0); vec3 tm = vec3(0.0); float odr = 0.0; float odm = 0.0;
    float mu = dot(rd, sunDir); float g = 0.76;
    float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    float pm = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (mu * mu + 1.0)) / (pow(1.0 + g * g - 2.0 * mu * g, 1.5) * (2.0 + g * g));
    for (int i = 0; i < 16; i++) {
      vec3 pi = r0 + rd * (t + st * 0.5);
      float hi = length(pi) - R_PLANET;
      float dr = exp(-hi / 8e3) * st; float dm = exp(-hi / 1.2e3) * st;
      odr += dr; odm += dm;
      float sj = rsi(pi, sunDir, R_ATMOS).y / 8.0; float tj = 0.0; float odrj = 0.0; float odmj = 0.0;
      for (int j = 0; j < 8; j++) {
        vec3 pj = pi + sunDir * (tj + sj * 0.5); float hj = length(pj) - R_PLANET;
        odrj += exp(-hj / 8e3) * sj; odmj += exp(-hj / 1.2e3) * sj; tj += sj;
      }
      vec3 at = exp(-(K_MIE * (odm + odmj) + K_RLH * (odr + odrj)));
      tr += dr * at; tm += dm * at; t += st;
    }
    return 22.0 * (pr * K_RLH * tr + pm * K_MIE * tm);
  }
  void main() {
    vec3 rd = normalize(vDir);
    vec3 r0 = vec3(0.0, R_PLANET + 900.0, 0.0);
    vec3 col = atmosphere(rd, r0);
    // Sun disc.
    float sd = dot(rd, sunDir);
    col += vec3(1.0, 0.85, 0.6) * smoothstep(0.99985, 0.99995, sd) * 40.0;
    // Thin high cloud streaks lit from below by the low sun.
    if (rd.y > 0.0) {
      vec2 uv = rd.xz / (rd.y + 0.08) * 1.4 + vec2(cloudTime * 0.05, 0.0);
      float c = smoothstep(0.55, 0.85, fbm(uv * vec2(1.0, 3.2)));
      vec3 lit = mix(vec3(1.0, 0.62, 0.42), vec3(1.0, 0.9, 0.82), smoothstep(0.0, 0.3, sunDir.y)) * (0.7 + 1.6 * pow(max(sd, 0.0), 6.0));
      col = mix(col, lit * 0.9, c * 0.55 * smoothstep(0.0, 0.12, rd.y));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const bakeFragment = /* glsl */ `
  ${NOISE}
  uniform float heightExtent;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(terrainHeight((vUv - 0.5) * heightExtent), 0.0, 0.0, 1.0); }
`;

// Light curtain where the satellite's scan line meets the ground.
const curtainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const curtainFragment = /* glsl */ `
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    float fadeUp = pow(1.0 - vUv.y, 7.0);
    float edges = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
    gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * fadeUp * edges * opacity * 0.22, 1.0);
  }
`;

// Spread a unit plane over +-half metres, with vertices packed near the focus.
function denseNear(geometry, half, focus) {
  const position = geometry.attributes.position;
  const warp = (u) => Math.sign(u) * (0.2 * Math.abs(u) + 0.8 * Math.abs(u) ** 3) * half;
  for (let i = 0; i < position.count; i++) {
    position.setX(i, warp(position.getX(i)) + focus.x * 0.6);
    position.setZ(i, warp(position.getZ(i)) + focus.y * 0.6);
  }
  position.needsUpdate = true;
  return geometry;
}

export function createPalouse(renderer, { regionMap, wideMap, overlayMap, forestMap, waterMap, featured, featuredLonLat }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 2, 60000);

  const sunDir = new THREE.Vector3();
  const uniforms = {
    sunDir: { value: sunDir },
    sunColor: { value: new THREE.Color(1.0, 0.78, 0.55) },
    skyColor: { value: new THREE.Color(0.33, 0.42, 0.58) },
    fogColorSun: { value: new THREE.Color(1.0, 0.78, 0.58) },
    fogColorAway: { value: new THREE.Color(0.56, 0.64, 0.78) },
    season: { value: 0.2 },
    seasonAhead: { value: 0 },
    scanX: { value: -1e5 },
    scanAxis: { value: new THREE.Vector2(0, 1) },
    scanOn: { value: 0 },
    cloudTime: { value: 0 },
    highlight: { value: 0 },
    featured: { value: new THREE.Vector2(0, 0) },
    heightTex: { value: null },
    heightExtent: { value: 26000 },
    regionMap: { value: regionMap },
    wideMap: { value: wideMap },
    overlayMap: { value: overlayMap },
    forestMap: { value: forestMap },
    waterMap: { value: waterMap },
    mapXform: { value: new THREE.Vector4(featured.x, featured.y, featuredLonLat[0], featuredLonLat[1]) },
  };
  uniforms.featured.value.copy(featured);
  for (const texture of [regionMap, wideMap, overlayMap, forestMap]) {
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }

  // Bake the height field once.
  const bakeTarget = new THREE.WebGLRenderTarget(1024, 1024, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  {
    const bakeScene = new THREE.Scene();
    const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          heightExtent: uniforms.heightExtent,
          regionMap: uniforms.regionMap,
          wideMap: uniforms.wideMap,
          waterMap: uniforms.waterMap,
          overlayMap: uniforms.overlayMap,
          mapXform: uniforms.mapXform,
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: bakeFragment,
      }),
    );
    bakeScene.add(quad);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(bakeTarget);
    renderer.render(bakeScene, bakeCam);
    renderer.setRenderTarget(previous);
    quad.geometry.dispose();
    quad.material.dispose();
  }
  uniforms.heightTex.value = bakeTarget.texture;

  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(16000, 1600),
    new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      vertexShader: curtainVertex,
      fragmentShader: curtainFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  curtain.geometry.translate(0, 800, 0);
  curtain.frustumCulled = false;
  scene.add(curtain);

  const terrain = new THREE.Mesh(
    denseNear(new THREE.PlaneGeometry(2, 2, 720, 720).rotateX(-Math.PI / 2), 13000, featured),
    new THREE.ShaderMaterial({ uniforms, vertexShader: terrainVertex, fragmentShader: terrainFragment, extensions: { derivatives: true } }),
  );
  terrain.frustumCulled = false;
  scene.add(terrain);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: uniforms.sunDir, cloudTime: uniforms.cloudTime },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.scale.setScalar(50000);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  function setSun(elevationDeg, azimuthDeg) {
    const el = (elevationDeg * Math.PI) / 180;
    const az = (azimuthDeg * Math.PI) / 180;
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    const warm = THREE.MathUtils.clamp(elevationDeg / 25, 0, 1);
    uniforms.sunColor.value.setRGB(1.0, 0.62 + 0.3 * warm, 0.38 + 0.45 * warm);
    uniforms.fogColorSun.value.setRGB(1.0, 0.72 + 0.15 * warm, 0.52 + 0.3 * warm);
  }
  setSun(7, 95);

  // Height on the CPU for camera placement (same formula as the shader).
  function hash12(x, y) {
    let p3x = (x * 0.1031) % 1;
    let p3y = (y * 0.1031) % 1;
    let p3z = (x * 0.1031) % 1;
    p3x = p3x < 0 ? p3x + 1 : p3x;
    p3y = p3y < 0 ? p3y + 1 : p3y;
    p3z = p3z < 0 ? p3z + 1 : p3z;
    const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
    p3x += d;
    p3y += d;
    p3z += d;
    const v = ((p3x + p3y) * p3z) % 1;
    return v < 0 ? v + 1 : v;
  }
  function vnoise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = hash12(ix, iy);
    const b = hash12(ix + 1, iy);
    const c = hash12(ix, iy + 1);
    const d = hash12(ix + 1, iy + 1);
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  }
  function fbm(x, y) {
    let v = 0;
    let a = 0.5;
    for (let i = 0; i < 5; i++) {
      v += a * vnoise(x, y);
      const nx = (0.8 * x + 0.6 * y) * 2.03 + 17.1;
      const ny = (-0.6 * x + 0.8 * y) * 2.03 + 17.1;
      x = nx;
      y = ny;
      a *= 0.5;
    }
    return v;
  }
  function hillHeight(x, z) {
    let qx = x / 1000;
    let qz = z / 1000;
    const wx = fbm(qx * 0.6 + 3.1, qz * 0.6 + 3.1);
    const wz = fbm(qx * 0.6 + 9.7, qz * 0.6 + 9.7);
    qx += 0.45 * wx;
    qz += 0.45 * wz;
    let h = fbm(qx, qz);
    const t = Math.min(1, Math.max(0, (h - 0.18) / (0.86 - 0.18)));
    h = t * t * (3 - 2 * t);
    const broad = fbm(x / 4200 + 2, z / 4200 + 2);
    return h * 130 + broad * 60 + fbm(x / 90, z / 90) * 1.6;
  }
  // Read the relief map once for camera placement.
  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = regionMap.image.width;
  mapCanvas.height = regionMap.image.height;
  const mapCtx = mapCanvas.getContext("2d", { willReadFrequently: true });
  mapCtx.drawImage(regionMap.image, 0, 0);
  const mapData = mapCtx.getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;
  const MAP_KM = 0.9;
  const HILL_SCALE = 14;
  function regionAt(x, z) {
    const [lonF, latF] = featuredLonLat;
    const lon = lonF + ((x - featured.x) * MAP_KM) / (111.32 * Math.cos((latF * Math.PI) / 180));
    const lat = latF - ((z - featured.y) * MAP_KM) / 110.57;
    const u = Math.min(1, Math.max(0, (lon + 135) / 30));
    const v = Math.min(1, Math.max(0, (lat - 36) / 22));
    // Bilinear, so the camera glides smoothly over the relief.
    const fx = u * (mapCanvas.width - 1);
    const fy = (1 - v) * (mapCanvas.height - 1);
    const x0 = Math.min(mapCanvas.width - 2, Math.floor(fx));
    const y0 = Math.min(mapCanvas.height - 2, Math.floor(fy));
    const ax = fx - x0;
    const ay = fy - y0;
    const out = [0, 0, 0];
    for (const [dx, dy, wgt] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]]) {
      const i = ((y0 + dy) * mapCanvas.width + x0 + dx) * 4;
      for (let c = 0; c < 3; c++) out[c] += (mapData[i + c] / 255) * wgt;
    }
    return out;
  }
  function heightAt(x, z) {
    const [water, elev] = regionAt(x, z);
    const land = 1 - Math.min(1, Math.max(0, (water - 0.35) / 0.3));
    const ek = elev * elev * 4.4;
    const hills = hillHeight(x * HILL_SCALE, z * HILL_SCALE) / HILL_SCALE;
    const r = Math.min(1, Math.max(0, (ek - 0.6) / 1.4));
    const rough = r * r * (3 - 2 * r);
    const ridges = 1 - Math.abs(2 * fbm(x / 12 + 5, z / 12 + 5) - 1);
    return 0.6 + (0.6 + (ek / MAP_KM) * 9 + hills * 0.15 + rough * ridges * 2.5) * land;
  }

  function setScan(position, visibility) {
    uniforms.scanX.value = position;
    uniforms.scanOn.value = visibility;
    // The scan axis is +Z, so the curtain stands on z = position.
    curtain.position.set(0, 0, position);
    curtain.material.uniforms.opacity.value = visibility;
  }

  function dispose() {
    bakeTarget.dispose();
    terrain.geometry.dispose();
    terrain.material.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    curtain.geometry.dispose();
    curtain.material.dispose();
  }

  return { scene, camera, uniforms, setSun, setScan, heightAt, dispose };
}
