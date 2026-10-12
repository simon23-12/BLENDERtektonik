import * as THREE from 'three';
import { createViewer, $, de, ramp, smooth, clamp, LOW, dotTexture } from './core.js';
import { ANNOTATIONS, GROUPS, PHASES } from './content.js';

// Blender (Z up, −Y = Schnittfläche vorne) → three.js (Y up, +Z vorne)
const B = (x, y, z) => new THREE.Vector3(x, z, -y);

let TL;
const opts = { mag: true, water: true, flow: true };
const U = {
  uTago: { value: 6 },
  uMag: { value: 1 },
  uGpts: { value: new Float32Array(80) },
  uN: { value: 0 },
};
const C_NORMAL = new THREE.Color('#e0582b');
const C_REVERSED = new THREE.Color('#f3efe6');
const mats = { glow: [], conv: [], plate: [], water: [] };
let dot;

// ---------------------------------------------------------------- time
const tago = (t) => (t < TL.tGeo0 ? TL.myrSpan : TL.myrSpan * (1 - (t - TL.tGeo0) / (TL.duration - TL.tGeo0)));
const fmtAgo = (a) => (a < 0.04 ? 'heute' : `vor ${de(a, a < 1 ? 2 : 1)} Mio. Jahren`);
const movedKm = (t) => Math.max(0, t - TL.tGeo0) * TL.unitsPerSec * 10;
const isNormal = (birthMyr) => { let f = 0; for (const g of TL.gpts) if (birthMyr > g) f++; return f % 2 === 0; };

const viewer = createViewer({
  model: 'models/tektonik.glb',
  timeline: 'models/timeline.json',
  content: { ANNOTATIONS, GROUPS, PHASES },
  bg: '#050c16',
  fog: 0.0009,
  exposure: 0.85,
  envIntensity: 0.25,
  fov: 34,
  near: 0.5,
  far: 3000,
  minDistance: 3,
  maxDistance: 420,
  unit: (ctx) => (ctx.state.t < 15 ? 6371000 / 30 : 10000),
  gtao: { radius: 3.5, thickness: 4, distanceExponent: 1.6 },
  bloom: [0.28, 0.5, 0.95],

  lights(ctx) {
    const { scene } = ctx;
    scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x2a160c, 0.55));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.9);
    key.position.copy(B(-60, -110, 140));
    key.target.position.copy(B(5, 0, -10));
    key.castShadow = true;
    key.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -120, right: 120, top: 80, bottom: -80, near: 10, far: 450 });
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.2;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x9cc6ff, 0.9);
    fill.position.copy(B(140, -60, 40));
    scene.add(fill);
    // light for the globe (far away from the block)
    const gl = new THREE.DirectionalLight(0xffffff, 1.6);
    gl.position.copy(B(-150, -160, 120));
    gl.target.position.copy(B(-300, 0, 20));
    scene.add(gl, gl.target);
    return { key };
  },

  home() {
    const a = innerWidth / innerHeight;
    const dist = a >= 1.2 ? 200 : a >= 0.8 ? 250 : 330;
    return { target: B(5, 0, -12), offset: new THREE.Vector3(0.5, 0.55, 1).setLength(dist) };
  },

  followGoal(ctx, t, out) {
    const ph = ctx.state.phases.find((p) => t >= p.from && t < p.to)?.key;
    const P = {
      schalen: () => ctx.worldPos('ANCHOR_Globus_Mitte', out),
      lithosphaere: () => ctx.worldPos('ANCHOR_Lith_Globus', out),
      konvektion: () => out.copy(B(0, 0, -18)),
      spreizung: () => out.copy(B(TL.ridges.vorn + 6, -8, -2)),
      subduktion: () => out.copy(B(54, -8, -9)),
      vulkan: () => out.copy(B(62, -12, -2)),
      erdbeben: () => out.copy(B(52, -8, -6)),
      hotspot: () => out.copy(B(-62, -14, -14)),
      transform: () => out.copy(B((TL.ridges.vorn + TL.ridges.hinten) / 2, 0, -1)),
    }[ph];
    return P ? P() : out.copy(B(5, 0, -12));
  },

  phaseView(ctx, key) {
    const V = {
      schalen: [[1, 0.75, 1.05], 105],
      lithosphaere: [[0.2, 0.25, 1], 7.5],
      konvektion: [[0.12, 0.18, 1], 175],
      spreizung: [[0.25, 0.7, 1], 60],
      subduktion: [[0.2, 0.28, 1], 70],
      vulkan: [[0.55, 0.5, 1], 45],
      erdbeben: [[0.35, 0.45, 1], 62],
      hotspot: [[0.12, 0.3, 1], 72],
      transform: [[0.25, 1.5, 0.55], 48],
    }[key];
    return V && { dir: new THREE.Vector3(...V[0]), dist: V[1], dur: key === 'konvektion' ? 3.2 : 2.2 };
  },

  material(ctx, mesh) {
    TL = ctx.TL;
    const m = mesh.material;
    if (!m) return;
    const n = m.name || '';
    if (n.startsWith('Kruste_Ozean')) stripeMaterial(mesh);
    if (/Glow/.test(n) && !/Pfeil/.test(n)) { m.userData.base = m.emissiveIntensity; mats.glow.push(m); }
    if (n.startsWith('Plume')) m.side = THREE.DoubleSide;
    if (n.startsWith('Pfeil_Konvektion')) { m.transparent = true; mats.conv.push(m); mesh.userData.noPick = false; }
    if (n.startsWith('Pfeil_Platte')) { m.transparent = true; mats.plate.push(m); mesh.castShadow = false; }
    if (n.startsWith('Wasser')) {
      Object.assign(m, { transparent: true, opacity: 0.24, depthWrite: false, roughness: 0.3, metalness: 0, envMapIntensity: 0.2 });
      m.color.set('#2b7cc0');
      mesh.renderOrder = 4;
      mesh.userData.noPick = true;
      mesh.castShadow = false;
      mats.water.push(m);
    }
    if (/Gradnetz/.test(mesh.name)) mesh.castShadow = false;
  },

  onSetup(ctx) {
    TL = ctx.TL;
    U.uGpts.value.set(TL.gpts.slice(0, 80));
    U.uN.value = Math.min(80, TL.gpts.length);
    dot = dotTexture(0.35);
    buildConvection(ctx);
    buildQuakes(ctx);
    buildEruption(ctx);
    buildMagmaFlow(ctx);
    for (const [id, key] of [['mag', 'mag'], ['water', 'water'], ['flow', 'flow']]) {
      $(id).addEventListener('click', () => { opts[key] = !opts[key]; ctx.setChip(id, opts[key]); });
    }
  },

  onUpdate(ctx, dt) {
    const t = ctx.state.t;
    U.uTago.value = tago(t);
    U.uMag.value += ((opts.mag ? 1 : 0) - U.uMag.value) * Math.min(1, dt * 5);
    const now = performance.now() / 1000;
    for (const m of mats.glow) m.emissiveIntensity = m.userData.base * (0.85 + 0.15 * Math.sin(now * 2.2));
    const convVis = ramp(t, 15.5, 17.5) * (1 - 0.55 * ramp(t, 24, 26));
    for (const m of mats.conv) { m.opacity = convVis * (opts.flow ? 1 : 0); m.visible = m.opacity > 0.01; }
    for (const m of mats.plate) { m.opacity = 0.6 * ramp(t, 22, 24); m.visible = m.opacity > 0.01; }
    for (const m of mats.water) m.visible = opts.water;
    updateConvection(ctx, dt);
    updateQuakes(ctx, dt);
    updateEruption(ctx, dt);
    updateMagmaFlow(ctx, dt);
  },

  onFrame(ctx) {
    // fade through black when the camera travels from the globe down to the block
    const t = ctx.state.t;
    const d = Math.max(1 - Math.abs(t - 15.25) / 0.9, 0);
    if (d > 0) $('dip').style.opacity = (smooth(d) * 0.95).toFixed(3);
  },

  onUI(ctx) {
    const t = ctx.state.t;
    const a = tago(t);
    $('tTime').textContent = fmtAgo(a);
    $('rTime').textContent = fmtAgo(a);
    $('tQuakes').textContent = String(quakeCount(t));
    $('rMoved').textContent = `${de(movedKm(t))} km`;
    const yearsPerSec = (TL.myrSpan * 1e6) / (TL.duration - TL.tGeo0) * ctx.state.speed;
    $('rSlow').textContent = t < TL.tGeo0 ? '—' : `≈ ${de(yearsPerSec / 1000)} Tsd. Jahre/s`;
  },

  liveText(ctx, kind, t) {
    const a = tago(t);
    if (kind === 'time') return `<b>Erdzeit</b> · ${fmtAgo(a)}<br><b>Jede Platte bewegt</b> · ${de(movedKm(t))} km seit Beginn`;
    if (kind === 'mag') {
      const s = 6 - TL.ridges.vorn;                 // marker distance from the ridge (units)
      const birth = a + s / TL.vHalf_cm_a;
      return `<b>Gestein an der Markierung</b> · ${de(s * 10)} km vom Rücken<br><b>entstanden</b> · vor ${de(birth, 2)} Mio. Jahren, Polung ${isNormal(birth) ? 'normal' : 'umgekehrt'}<br><b>Feld gerade</b> · ${isNormal(a) ? 'normal' : 'umgekehrt'} gepolt`;
    }
    if (kind === 'trench') {
      const s1 = TL.trench - TL.ridges.vorn, s2 = TL.trench - TL.ridges.hinten;
      return `<b>Alter der Platte am Graben</b> · ${de(s1 / TL.vHalf_cm_a, 0)} bzw. ${de(s2 / TL.vHalf_cm_a, 1)} Mio. Jahre<br><b>Weg vom Rücken</b> · ${de(s1 * 10)} km`;
    }
    if (kind === 'quakes') {
      const past = TL.quakes.filter((q) => q.t <= t);
      const last = past[past.length - 1];
      if (!last) return '<b>Noch keine Beben</b> · ab Phase 4';
      const depth = Math.max(0, -last.p[2] * 10);
      return `<b>Beben bisher</b> · ${past.length}<br><b>Letztes</b> · Magnitude ${de(last.m, 1)}, Herdtiefe ≈ ${de(depth)} km`;
    }
    return '';
  },
});

// ---------------------------------------------------------------- magnetic stripes on the oceanic crust
function stripeMaterial(mesh) {
  // distance from the ridge (arc length along the plate path) for every vertex, from the path table in timeline.json
  const tag = mesh.name.replace(/^Kruste_/, '').replace(/_\d+$/, '');
  const info = TL.plates[tag];
  if (!info) return;
  const path = info.path;
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const s = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const bx = v.x, bz = v.y;                 // Blender x, z
    let best = Infinity, bs = 0;
    for (let k = 0; k < path.length - 1; k++) {
      const [x0, z0, s0] = path[k], [x1, z1, s1] = path[k + 1];
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
      const u = Math.max(0, Math.min(1, ((bx - x0) * dx + (bz - z0) * dz) / L2));
      const ex = x0 + u * dx - bx, ez = z0 + u * dz - bz, d = ex * ex + ez * ez;
      if (d < best) { best = d; bs = s0 + u * (s1 - s0); }
    }
    s[i] = bs;
  }
  g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = mesh.material;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uN_C: { value: C_NORMAL }, uR_C: { value: C_REVERSED } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aS;\nvarying float vS;\nvarying float vWy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;\nvWy = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vS; varying float vWy;
        uniform float uTago; uniform float uMag; uniform float uGpts[80]; uniform int uN;
        uniform vec3 uN_C; uniform vec3 uR_C;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float birth = uTago + vS / ${TL_VHALF.toFixed(1)};
        int flips = 0;
        for (int i = 0; i < 80; i++) { if (i >= uN) break; if (birth > uGpts[i]) flips++; }
        vec3 stripe = (flips - (flips / 2) * 2) == 0 ? uN_C : uR_C;
        float fresh = 1.0 - smoothstep(0.0, 1.2, vS);
        diffuseColor.rgb = mix(diffuseColor.rgb, stripe, uMag * 0.85);
        float hot = smoothstep(-7.0, -32.0, vWy);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.09, 0.04), hot * 0.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * fresh * 1.6;`);
  };
  m.customProgramCacheKey = () => 'stripes';
}
const TL_VHALF = 5.0; // units per Myr (5 cm/a = 50 km/Myr = 5 units/Myr)

// ---------------------------------------------------------------- mantle convection (particles on the cut face)
let conv;
function buildConvection(ctx) {
  const N = LOW ? 260 : 520;
  const cells = TL.convection.cells;
  const [za, zb] = TL.convection.z;
  const P = [];
  for (let i = 0; i < N; i++) {
    const c = i % 2;
    P.push({ c, X: Math.random(), Z: Math.random(), sign: c === 0 ? 1 : -1 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 1.5, map: dot, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  conv = { P, geo, mat, cells, za, zb, y: TL.convection.y };
}
const hot = new THREE.Color('#ffd27a'), cold = new THREE.Color('#9a2a12'), _c = new THREE.Color();
function updateConvection(ctx, dt) {
  const t = ctx.state.t;
  const vis = ramp(t, 15.5, 17.5) * (opts.flow ? 1 : 0) * (1 - 0.35 * ramp(t, 24, 26));
  conv.mat.opacity = vis * 0.9;
  if (vis < 0.01) return;
  const k = ctx.state.playing ? dt * ctx.state.speed * 0.09 : 0;
  const pos = conv.geo.attributes.position.array, col = conv.geo.attributes.color.array;
  conv.P.forEach((p, i) => {
    const [xa, xb] = conv.cells[p.c];
    const sx = Math.sin(Math.PI * p.X), cx = Math.cos(Math.PI * p.X), sz = Math.sin(Math.PI * p.Z), cz = Math.cos(Math.PI * p.Z);
    const W = xb - xa, H = conv.zb - conv.za;
    p.X += k * p.sign * Math.PI * sx * cz * (H / W) * 2.2;
    p.Z += -k * p.sign * Math.PI * cx * sz * 2.2;
    const psi = sx * sz;
    if (psi < 0.08 || p.X <= 0.01 || p.X >= 0.99 || p.Z <= 0.01 || p.Z >= 0.99) { p.X = 0.2 + Math.random() * 0.6; p.Z = 0.2 + Math.random() * 0.6; }
    const x = xa + p.X * W, z = conv.za + p.Z * H;
    pos[i * 3] = x; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -conv.y + 0.6;
    const wz = -p.sign * cx * sz;                 // >0 rising
    _c.copy(cold).lerp(hot, clamp(0.5 + 0.9 * wz + 0.25 * (1 - p.Z), 0, 1));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  });
  conv.geo.attributes.position.needsUpdate = true;
  conv.geo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- earthquakes
let qk;
function quakeCount(t) { let n = 0; for (const q of TL.quakes) if (q.t <= t) n++; return n; }
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff';
  x.lineWidth = 7;
  x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.stroke();
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
function buildQuakes(ctx) {
  const ringTex = ringTexture();
  const pool = [];
  for (let i = 0; i < 12; i++) {
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffe08a, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xffd166, transparent: true, depthWrite: false, depthTest: false }));
    const epi = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    epi.rotation.x = -Math.PI / 2;
    flash.renderOrder = ring.renderOrder = 30;
    for (const o of [flash, ring, epi]) { o.visible = false; ctx.scene.add(o); }
    pool.push({ flash, ring, epi });
  }
  // the big one: a seismic wave front (translucent sphere)
  const wave = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  wave.visible = false;
  ctx.scene.add(wave);
  qk = { pool, wave, shake: 0 };
}
const _q = new THREE.Vector3();
function updateQuakes(ctx, dt) {
  const t = ctx.state.t;
  const active = TL.quakes.filter((q) => t >= q.t && t < q.t + (q.k === 'big' ? 5.5 : 1.4 + q.m * 0.15)).slice(-qk.pool.length);
  qk.pool.forEach((p, i) => {
    const q = active[i];
    p.flash.visible = p.ring.visible = p.epi.visible = !!q;
    if (!q) return;
    const age = t - q.t;
    const life = q.k === 'big' ? 5.5 : 1.4 + q.m * 0.15;
    const k = age / life;
    _q.copy(B(...q.p));
    const size = 0.6 + (q.m - 3.5) * 0.9;
    p.flash.position.copy(_q);
    p.flash.scale.setScalar(size * 2.4 * (1 - 0.6 * k) * (1 + 0.3 * Math.sin(age * 40) * (1 - k)));
    p.flash.material.opacity = 1 - smooth(k);
    p.ring.position.copy(_q);
    p.ring.scale.setScalar(size * (1 + (q.k === 'big' ? 6 : 3) * smooth(k)));
    p.ring.material.opacity = 0.7 * (1 - k);
    const surfaceZ = q.p[0] > TL.coast ? 1.0 : 0.05;
    p.epi.visible = q.k !== 'ridge';
    p.epi.position.copy(B(q.p[0], q.p[1], surfaceZ));
    p.epi.scale.setScalar(size * (0.5 + (q.k === 'big' ? 5 : 2) * smooth(k)));
    p.epi.material.opacity = 0.75 * (1 - k);
  });
  const big = TL.quakes.find((q) => q.k === 'big' && t >= q.t && t < q.t + 5.5);
  qk.wave.visible = !!big;
  if (big) {
    const k = (t - big.t) / 5.5;
    qk.wave.position.copy(B(...big.p));
    qk.wave.scale.setScalar(2 + 45 * smooth(k));
    qk.wave.material.opacity = 0.16 * (1 - k);
    // camera shake while the waves pass
    const amp = 0.35 * (1 - smooth(k)) * ctx.state.speed;
    if (ctx.state.playing) ctx.camera.position.add(_q.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp));
  }
}

// ---------------------------------------------------------------- volcanic eruption (ash, bombs, glow)
let er;
function buildEruption(ctx) {
  const N = LOW ? 220 : 420;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 2.2, map: dot, vertexColors: true, transparent: true, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  ctx.scene.add(pts);
  const P = [];
  for (let i = 0; i < N; i++) P.push({ life: -1, lava: i % 5 === 0 });
  const light = new THREE.PointLight(0xff6a1a, 0, 40, 1.5);
  light.position.copy(B(...TL.volcano.top)).add(new THREE.Vector3(0, 1.5, 0));
  ctx.scene.add(light);
  er = { P, geo, mat, light, top: B(...TL.volcano.top) };
}
function eruptionLevel(t) {
  let e = 0;
  for (const [a, b] of TL.volcano.eruptions) e = Math.max(e, ramp(t, a, a + 0.8) * (1 - ramp(t, b - 1.2, b)));
  return e;
}
const ash = new THREE.Color('#8e8a86'), lava = new THREE.Color('#ff7a1a');
function updateEruption(ctx, dt) {
  const t = ctx.state.t;
  const e = eruptionLevel(t);
  er.light.intensity = 120 * e * (0.8 + 0.2 * Math.sin(performance.now() * 0.02));
  const step = ctx.state.playing ? dt * ctx.state.speed : 0;
  const pos = er.geo.attributes.position.array, col = er.geo.attributes.color.array;
  er.P.forEach((p, i) => {
    if (p.life < 0 || p.life > p.max) {
      if (e > 0.05 && Math.random() < e * 0.12) {
        p.life = 0;
        p.max = p.lava ? 1.4 + Math.random() : 3 + Math.random() * 3;
        p.x = er.top.x; p.y = er.top.y; p.z = er.top.z;
        const a = Math.random() * Math.PI * 2;
        const r = p.lava ? 2 + Math.random() * 3 : 0.4 + Math.random() * 1.2;
        p.vx = Math.cos(a) * r; p.vz = Math.sin(a) * r;
        p.vy = p.lava ? 6 + Math.random() * 5 : 4 + Math.random() * 4;
      } else { pos[i * 3 + 1] = -9999; return; }
    }
    p.life += step;
    p.x += p.vx * step; p.z += p.vz * step; p.y += p.vy * step;
    if (p.lava) p.vy -= 9 * step;
    else { p.vy *= 1 - 0.25 * step; p.vx += 0.6 * step; }   // ash drifts with the wind
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    const k = p.life / p.max;
    _c.copy(p.lava ? lava : ash).multiplyScalar(p.lava ? 1.6 * (1 - k) : 0.9 * (1 - k * 0.7));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  });
  er.geo.attributes.position.needsUpdate = true;
  er.geo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- rising magma (slab → chamber → crater, ridge, plume)
let mf;
function buildMagmaFlow(ctx) {
  const v = TL.volcano;
  const paths = [
    { pts: [B(...v.melt), B(v.chamber[0] - 1, v.chamber[1], -6), B(...v.chamber)], from: 34, n: 26, speed: 0.12 },
    { pts: [B(...v.chamber), B(v.top[0], v.top[1], v.top[2] - 1)], from: 43, n: 14, speed: 0.35, erupt: true },
    { pts: [B(TL.hotspot.x, TL.hotspot.y, TL.zBottom + 1), B(TL.hotspot.x, TL.hotspot.y, -10)], from: 15, n: 30, speed: 0.06 },
  ];
  for (const [seg, y] of [['vorn', -10], ['hinten', 10]]) {
    const xr = TL.ridges[seg];
    paths.push({ pts: [B(xr, y, -9), B(xr, y, -2.6)], from: 15, n: 14, speed: 0.18 });
  }
  let N = 0;
  for (const p of paths) N += p.n;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 1.1, map: dot, color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  mf = { paths, geo, mat };
}
const _a = new THREE.Vector3();
function updateMagmaFlow(ctx) {
  const t = ctx.state.t;
  const pos = mf.geo.attributes.position.array;
  let i = 0;
  const e = eruptionLevel(t);
  for (const p of mf.paths) {
    const on = t >= p.from ? 1 : 0;
    for (let k = 0; k < p.n; k++, i++) {
      if (!on || (p.erupt && e < 0.05)) { pos[i * 3 + 1] = -9999; continue; }
      const u = (k / p.n + t * p.speed) % 1;
      const seg = u * (p.pts.length - 1);
      const j = Math.min(Math.floor(seg), p.pts.length - 2);
      _a.lerpVectors(p.pts[j], p.pts[j + 1], seg - j);
      pos[i * 3] = _a.x + Math.sin(k * 3.1 + t) * 0.3; pos[i * 3 + 1] = _a.y; pos[i * 3 + 2] = _a.z + Math.cos(k * 1.7 + t) * 0.3;
    }
  }
  mf.mat.opacity = t >= 15 ? 0.95 : 0;
  mf.geo.attributes.position.needsUpdate = true;
}

window.__tek = viewer;
