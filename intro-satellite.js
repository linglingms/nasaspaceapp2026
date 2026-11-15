// A generic Earth-observation satellite (not a model of any specific spacecraft),
// built from primitives with physically based materials. Units: metres.
// Nadir (toward Earth) is -Y, flight direction is -Z.
import * as THREE from "three";

function canvasTexture(width, height, draw, srgb = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Crinkled multi-layer insulation: overlapping soft facets.
function foilBump() {
  const texture = canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 900; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 10 + rand() * 46;
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        const v = Math.floor(70 + rand() * 120);
        g.addColorStop(0, `rgba(${v},${v},${v},0)`);
        g.addColorStop(0.5, `rgba(${v},${v},${v},0.55)`);
        g.addColorStop(1, `rgba(${255 - v},${255 - v},${255 - v},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x + (rand() - 0.5) * r * 2, y + (rand() - 0.5) * r * 2);
        for (let k = 0; k < 4; k++) ctx.lineTo(x + (rand() - 0.5) * r * 2, y + (rand() - 0.5) * r * 2);
        ctx.closePath();
        ctx.fill();
      }
    },
    false,
  );
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function solarCells() {
  return canvasTexture(2048, 512, (ctx, w, h) => {
    ctx.fillStyle = "#c9ccd1";
    ctx.fillRect(0, 0, w, h);
    const cols = 32;
    const rows = 8;
    const gap = 5;
    const cw = w / cols;
    const ch = h / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const v = 18 + Math.floor(Math.random() * 10);
        ctx.fillStyle = `rgb(${v}, ${v + 10}, ${v + 46})`;
        ctx.fillRect(c * cw + gap, r * ch + gap, cw - gap * 2, ch - gap * 2);
        ctx.strokeStyle = "rgba(160, 175, 210, 0.22)";
        ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(c * cw + gap + (k * (cw - gap * 2)) / 4, r * ch + gap);
          ctx.lineTo(c * cw + gap + (k * (cw - gap * 2)) / 4, r * ch + ch - gap);
          ctx.stroke();
        }
      }
    }
  });
}

export function createSatellite() {
  const group = new THREE.Group();
  const bump = foilBump();

  const gold = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.92, 0.56, 0.16),
    metalness: 1,
    roughness: 0.28,
    bumpMap: bump,
    bumpScale: 2.2,
  });
  const silverFoil = new THREE.MeshPhysicalMaterial({ color: 0xd8dadd, metalness: 1, roughness: 0.22, bumpMap: bump, bumpScale: 1.6 });
  const whitePaint = new THREE.MeshPhysicalMaterial({ color: 0xa9aaa6, metalness: 0, roughness: 0.6 });
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x2a2d31, metalness: 0.8, roughness: 0.4 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x060607, metalness: 0, roughness: 0.9 });
  const cells = solarCells();
  const panelFront = new THREE.MeshPhysicalMaterial({
    map: cells,
    metalness: 0.35,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const panelBack = new THREE.MeshPhysicalMaterial({ color: 0xbfc3c8, metalness: 0.2, roughness: 0.5 });

  const add = (geometry, material, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // Main bus wrapped in gold foil, silver-foil end panels.
  add(new THREE.BoxGeometry(2.0, 1.7, 3.2, 1, 1, 1), gold, 0, 0, 0);
  add(new THREE.BoxGeometry(2.02, 1.4, 0.04), silverFoil, 0, 0, -1.62);
  // Instrument deck on the nadir face.
  add(new THREE.BoxGeometry(1.7, 0.45, 2.2), whitePaint, 0, -1.07, 0.1);
  const scanner = add(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 48), silverFoil, 0, -1.25, -0.55);
  scanner.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.5, 0.06, 0.32), black, 0, -1.72, -0.55); // scan aperture
  add(new THREE.BoxGeometry(0.7, 0.5, 0.6), gold, 0.45, -1.35, 0.75);
  add(new THREE.BoxGeometry(0.42, 0.36, 0.5), whitePaint, -0.5, -1.33, 0.7);
  // Radiators.
  add(new THREE.BoxGeometry(0.05, 1.3, 2.6), whitePaint, -1.03, 0.05, 0.1);
  // Star trackers.
  const tracker = add(new THREE.CylinderGeometry(0.11, 0.14, 0.32, 24), darkMetal, -0.6, 1.0, -1.1);
  tracker.rotation.x = -0.5;
  const tracker2 = add(new THREE.CylinderGeometry(0.11, 0.14, 0.32, 24), darkMetal, -0.25, 1.0, -1.25);
  tracker2.rotation.x = -0.5;

  // Solar wing on a boom (+X), tilted toward the sun.
  const wing = new THREE.Group();
  wing.position.set(1.0, 0.25, 0.2);
  group.add(wing);
  const boom = add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 16), darkMetal, 0.8, 0, 0, wing);
  boom.rotation.z = Math.PI / 2;
  const panel = new THREE.Group();
  panel.position.set(1.6, 0, 0);
  wing.add(panel);
  const front = add(new THREE.PlaneGeometry(8.2, 2.5), panelFront, 4.1, 0.021, 0, panel);
  front.rotation.x = -Math.PI / 2;
  const back = add(new THREE.BoxGeometry(8.2, 0.04, 2.5), panelBack, 4.1, 0, 0, panel);
  back.renderOrder = -1;
  add(new THREE.BoxGeometry(8.24, 0.06, 0.05), darkMetal, 4.1, 0, 1.27, panel);
  add(new THREE.BoxGeometry(8.24, 0.06, 0.05), darkMetal, 4.1, 0, -1.27, panel);
  panel.rotation.x = 0.35;

  // High-gain antenna on a mast (anti-nadir, aft).
  const mast = add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12), darkMetal, -0.4, 1.3, 1.2);
  mast.rotation.x = 0.3;
  const dishProfile = [];
  for (let i = 0; i <= 16; i++) {
    const r = (i / 16) * 0.55;
    dishProfile.push(new THREE.Vector2(r, r * r * 0.9));
  }
  const dish = add(new THREE.LatheGeometry(dishProfile, 48), whitePaint, -0.4, 1.85, 1.38);
  dish.material = whitePaint.clone();
  dish.material.side = THREE.DoubleSide;
  dish.rotation.x = -0.9;

  return { group, wing: panel };
}

// Image-based light for the satellite: black space above, bright Earth below.
export function createOrbitEnvironment(renderer, sunDir) {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#000000");
  sky.addColorStop(0.46, "#06070a");
  sky.addColorStop(0.5, "#c9a27a");
  sky.addColorStop(0.53, "#5b7fae");
  sky.addColorStop(0.62, "#24406a");
  sky.addColorStop(1, "#0d1a2e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  // Sun hot spot.
  const u = 0.5 + Math.atan2(sunDir.x, -sunDir.z) / (2 * Math.PI);
  const v = 0.5 - Math.asin(sunDir.y) / Math.PI;
  const g = ctx.createRadialGradient(u * width, v * height, 0, u * width, v * height, 40);
  g.addColorStop(0, "rgba(255,250,240,1)");
  g.addColorStop(1, "rgba(255,240,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return env;
}
