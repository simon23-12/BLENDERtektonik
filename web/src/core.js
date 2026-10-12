// LMG TECH · gemeinsamer Viewer für Blender → Three.js-Animationen.
// Lädt ein glTF (Bewegung aus Blender gebacken) plus timeline.json und stellt
// Kamera, Hotspots, Info-Panel, Phasenkarte, Zeitleiste und Zoom bereit.
// Projektspezifisches kommt über die Hooks in `cfg` (siehe createViewer).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const $ = (id) => document.getElementById(id);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const de = (x, d = 0) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
// 0 → 1 over [a, b], smoothstepped
export const ramp = (t, a, b) => smooth((t - a) / (b - a));

const COARSE = matchMedia('(pointer: coarse)').matches;
export const LOW = COARSE || Math.min(innerWidth, innerHeight) < 600;
export const isPhone = () => innerWidth <= 820 || innerHeight <= 500;

/**
 * cfg:
 *   model, timeline            URLs
 *   content                    { ANNOTATIONS, GROUPS, PHASES }
 *   bg, fog, exposure, envIntensity, fov, near, far, minDistance, maxDistance
 *   gtao: {radius, thickness, ...}, bloom: [strength, radius, threshold]
 *   lights(ctx)                → { key } (key = shadow-casting DirectionalLight)
 *   unit                       metres per scene unit (scale bar); number or fn(ctx)
 *   home(ctx)                  → { target: Vector3, offset: Vector3 }
 *   followGoal(ctx, t, out)    camera target while "Folgen" is on
 *   phaseView(ctx, key)        → { dir: Vector3, dist } camera move when a phase starts (Folgen on)
 *   onSetup(ctx, gltf), onUpdate(ctx, dt), onFrame(ctx, dt), onUI(ctx)
 *   resolve(ctx, spec, out, t) custom marker/focus specs (return true/false, or undefined → default)
 *   liveText(ctx, kind, t)     HTML for the dashed live box in the info panel
 *   material(ctx, mesh)        tweak imported materials
 */
export function createViewer(cfg) {
  const { ANNOTATIONS, GROUPS, PHASES } = cfg.content;
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio, LOW ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = cfg.exposure ?? 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const BG = new THREE.Color(cfg.bg ?? '#050d16');
  const scene = new THREE.Scene();
  scene.background = BG;
  if (cfg.fog) scene.fog = new THREE.FogExp2(BG, cfg.fog);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = cfg.envIntensity ?? 0.4;

  const camera = new THREE.PerspectiveCamera(cfg.fov ?? 38, innerWidth / innerHeight, cfg.near ?? 0.1, cfg.far ?? 2000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomToCursor = !COARSE;
  controls.zoomSpeed = 1.1;
  controls.minDistance = cfg.minDistance ?? 1;
  controls.maxDistance = cfg.maxDistance ?? 500;
  controls.screenSpacePanning = true;

  // post-processing
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: LOW ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 1, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16, ...(cfg.gtao || {}) });
  gtao.blendIntensity = cfg.gtaoBlend ?? 0.75;
  gtao.enabled = !LOW;
  composer.addPass(gtao);
  const [bs, br, bt] = cfg.bloom || [0.25, 0.5, 0.92];
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), bs, br, bt);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const state = {
    t: 0, duration: 10, playing: true, speed: 1,
    follow: true, labels: !isPhone(), phases: [], selected: null, flight: null, zoomGoal: null, sliderActive: false,
    phaseIndex: -1, suspended: false, wrapDip: cfg.wrapDip ?? true,
  };
  const nodes = {};
  const byId = (id) => ANNOTATIONS.find((a) => a.id === id);
  const ctx = {
    THREE, renderer, scene, camera, controls, composer, gtao, bloom, state, nodes, cfg, LOW, isPhone, byId,
    TL: null, mixer: null, root: null, lights: null, annMeshes: new Map(),
    select, focusOn, resetView, setChip, setFollow, worldPos, resolve, jumpTo, togglePlay,
  };
  ctx.lights = cfg.lights ? cfg.lights(ctx) : defaultLights(scene);

  // ---------------------------------------------------------------- load
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const timelineP = fetch(cfg.timeline).then((r) => r.json());
  loader.load(
    cfg.model,
    async (gltf) => {
      try {
        setup(gltf, await timelineP);
      } catch (err) {
        console.error(err);
        $('loadPct').textContent = 'Fehler: ' + err.message;
        return;
      }
      $('loadBar').style.width = '100%';
      $('loader').classList.add('done');
    },
    (e) => {
      if (e.total) {
        const p = Math.round((e.loaded / e.total) * 100);
        $('loadBar').style.width = p + '%';
        $('loadPct').textContent = p + ' %';
      }
    },
    (err) => { $('loadPct').textContent = 'Fehler beim Laden: ' + err.message; },
  );

  const pickables = [];
  function setup(gltf, tl) {
    ctx.TL = tl;
    state.duration = tl.duration;
    state.phases = tl.phases;
    const root = (ctx.root = gltf.scene);
    scene.add(root);
    root.traverse((o) => {
      if (o.name) nodes[o.name] = o;
    });
    // annotation lookup: the nearest named ancestor that matches an annotation's `parts`
    const partRes = ANNOTATIONS.map((a) => (a.parts || []).map((p) => new RegExp(p)));
    const annFor = (o) => {
      for (let p = o; p && p !== root; p = p.parent) {
        for (let i = 0; i < ANNOTATIONS.length; i++) if (partRes[i].some((re) => re.test(p.name))) return ANNOTATIONS[i];
      }
      return null;
    };
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = !/NOSHADOW|Glass|Water|Glow/.test(o.name);
      o.receiveShadow = true;
      if (!o.geometry.boundsTree) o.geometry.computeBoundsTree();
      const a = annFor(o);
      o.userData.ann = a;
      if (a) {
        o.material = o.material.clone();
        o.userData.baseEmissive = o.material.emissive ? o.material.emissive.clone() : null;
        if (!ctx.annMeshes.has(a)) ctx.annMeshes.set(a, []);
        ctx.annMeshes.get(a).push(o);
      }
      if (cfg.material) cfg.material(ctx, o);
      if (!o.userData.noPick) pickables.push(o);
    });
    const mixer = (ctx.mixer = new THREE.AnimationMixer(root));
    for (const clip of gltf.animations) mixer.clipAction(clip).play();

    if (cfg.onSetup) cfg.onSetup(ctx, gltf);
    buildUI();
    mixer.setTime(0);
    if (cfg.onUpdate) cfg.onUpdate(ctx, 0);
    root.updateMatrixWorld(true);
    measureViewOffset();
    Object.assign(viewShift, viewShiftGoal);

    // intro: fly in from further away
    computeHome();
    followPoint.copy(followGoal(new THREE.Vector3()));
    lastFollow.copy(followPoint);
    controls.target.copy(followPoint);
    const pv = cfg.phaseView && state.phases.length ? cfg.phaseView(ctx, state.phases[0].key) : null;
    const dir = pv && pv.dir ? pv.dir.clone().normalize() : state.homeOffset.clone().normalize();
    const dist = pv && pv.dist ? pv.dist : state.homeOffset.length();
    camera.position.copy(followPoint).addScaledVector(dir, dist * 2.2);
    state.zoomGoal = dist;
  }

  // ---------------------------------------------------------------- spec resolution
  const _w = new THREE.Vector3();
  function worldPos(name, out = new THREE.Vector3(), local = null) {
    const n = nodes[name];
    if (!n) return null;
    if (local) return n.localToWorld(out.fromArray(local));
    return n.getWorldPosition(out);
  }
  // world position for a marker / focus spec; false if it should not be shown right now
  function resolve(spec, out, t, force = false) {
    if (!force && spec.from != null && t < spec.from) return false;
    if (!force && spec.to != null && t >= spec.to) return false;
    if (cfg.resolve) {
      const r = cfg.resolve(ctx, spec, out, t, force);
      if (r !== undefined) return r;
    }
    const name = spec.anchor || spec.node;
    if (!name) return false;
    return !!worldPos(name, out, spec.local || null);
  }

  // ---------------------------------------------------------------- camera
  function computeHome() {
    const h = cfg.home(ctx);
    state.homeTarget = h.target.clone();
    state.homeOffset = h.offset.clone();
  }
  const viewShift = { x: 0, y: 0 }, viewShiftGoal = { x: 0, y: 0 };
  function measureViewOffset() {
    const W = innerWidth, H = innerHeight;
    const infoOpen = document.body.classList.contains('info-open');
    viewShiftGoal.x = viewShiftGoal.y = 0;
    if (isPhone() && H > W) {
      const topEl = $('tally') || document.querySelector('.brand');
      const top = topEl.getBoundingClientRect().bottom;
      const bottom = (infoOpen ? $('info') : $('phase')).getBoundingClientRect().top;
      if (bottom > top) viewShiftGoal.y = clamp(H / 2 - (top + bottom) / 2, 0, H * 0.22);
    } else if (infoOpen) {
      const left = $('info').getBoundingClientRect().left;
      if (left > W * 0.4) viewShiftGoal.x = clamp((W - left) / 2, 0, W * 0.25);
    }
  }
  function applyViewOffset(dt) {
    const k = 1 - Math.exp(-dt * 5);
    viewShift.x += (viewShiftGoal.x - viewShift.x) * k;
    viewShift.y += (viewShiftGoal.y - viewShift.y) * k;
    if (Math.abs(viewShift.x) > 0.5 || Math.abs(viewShift.y) > 0.5) camera.setViewOffset(innerWidth, innerHeight, viewShift.x, viewShift.y, innerWidth, innerHeight);
    else if (camera.view) camera.clearViewOffset();
  }
  const remeasure = () => { measureViewOffset(); setTimeout(measureViewOffset, 450); };

  const followPoint = new THREE.Vector3();
  const lastFollow = new THREE.Vector3();
  function followGoal(out) {
    const a = state.selected;
    if (a && a.focus && a.focus.moving) {
      resolve(a.focus, out, state.t, true);
      return out;
    }
    if (cfg.followGoal) return cfg.followGoal(ctx, state.t, out);
    return out.copy(state.homeTarget);
  }

  const currentDist = () => camera.position.distanceTo(controls.target);
  const LOG_MIN = Math.log(controls.minDistance), LOG_MAX = Math.log(controls.maxDistance);
  const sliderToDist = (v) => Math.exp(LOG_MAX - (v / 1000) * (LOG_MAX - LOG_MIN));
  const distToSlider = (d) => ((LOG_MAX - Math.log(d)) / (LOG_MAX - LOG_MIN)) * 1000;

  function focusOn(a) {
    if (!a.focus) return;
    state.flight = { fromTarget: controls.target.clone(), fromDist: currentDist(), toDist: a.focus.distance, spec: a.focus, t: 0, dur: 1.6, dir: a.focus.dir ? new THREE.Vector3().fromArray(a.focus.dir).normalize() : null };
    state.zoomGoal = null;
  }
  function flyTo(toT, toP, dur = 1.4) {
    state.zoomGoal = null;           // a pending zoom (e.g. from the intro) must not undo the flight
    state.flight = { reset: true, fromT: controls.target.clone(), fromP: camera.position.clone(), toT, toP, t: 0, dur };
  }
  function resetView() {
    select(null);
    computeHome();
    state.zoomGoal = null;
    if (!state.follow) setFollow(true);
    const toT = followGoal(new THREE.Vector3());
    followPoint.copy(toT);
    lastFollow.copy(toT);
    flyTo(toT, toT.clone().add(state.homeOffset));
  }
  // automatic camera move at the start of a phase (only while "Folgen" is on)
  function phaseCamera(key) {
    if (!state.follow || !cfg.phaseView || state.selected) return;
    const v = cfg.phaseView(ctx, key);
    if (!v) return;
    const toT = followGoal(new THREE.Vector3());
    followPoint.copy(toT);
    lastFollow.copy(toT);
    const dir = v.dir ? v.dir.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
    flyTo(toT, toT.clone().addScaledVector(dir, v.dist ?? currentDist()), v.dur ?? 2.2);
  }

  // ---------------------------------------------------------------- UI
  const hotspots = [];
  function buildUI() {
    const list = $('partList');
    let n = 0;
    GROUPS.forEach((g) => {
      if (g.label) list.insertAdjacentHTML('beforeend', `<li class="grp">${g.label}</li>`);
      for (const id of g.ids) {
        const a = byId(id);
        a.no = ++n;
        const li = document.createElement('li');
        li.innerHTML = `<button data-id="${a.id}"><span class="n">${String(a.no).padStart(2, '0')}</span><span class="dot" style="background:${a.color}"></span><span>${a.title}</span></button>`;
        li.firstChild.addEventListener('click', () => {
          select(a.id, true);
          if (isPhone()) setIndexOpen(false);
        });
        list.appendChild(li);
      }
    });
    $('partCount').textContent = `· ${n}`;
    $('indexToggle').addEventListener('click', () => setIndexOpen($('index').classList.contains('collapsed')));
    if (innerWidth < 1100 || innerHeight < 760) setIndexOpen(false);

    const host = $('hotspots');
    for (const a of ANNOTATIONS) {
      (a.markers || []).forEach((m) => {
        const el = document.createElement('button');
        el.className = 'hs gone';
        el.style.setProperty('--c', a.color);
        el.setAttribute('aria-label', m.label || a.title);
        el.innerHTML = `<span class="ring">${a.no}</span><span class="lbl">${m.label || a.title}</span>`;
        el.addEventListener('click', (ev) => { ev.stopPropagation(); select(a.id); });
        host.appendChild(el);
        hotspots.push({ a, m, el, occluded: false, pos: new THREE.Vector3() });
      });
    }
    $('hotspots').classList.toggle('hide-labels', !state.labels);
    setChip('labels', state.labels);

    const ticks = $('ticks');
    state.phases.forEach((p, i) => {
      const x = (p.from / state.duration) * 100;
      const mid = ((p.from + p.to) / 2 / state.duration) * 100;
      ticks.insertAdjacentHTML('beforeend', `<i style="left:${x}%"></i><span style="left:${mid}%">${i + 1}</span>`);
    });
    $('phaseTrack').innerHTML = state.phases.map((p) => `<i style="--w:${(p.to - p.from).toFixed(2)}"><b></b></i>`).join('');

    $('play').addEventListener('click', togglePlay);
    $('speed').addEventListener('change', (e) => { state.speed = parseFloat(e.target.value); });
    const scrub = $('scrub');
    scrub.addEventListener('input', () => { state.t = (scrub.value / 10000) * state.duration * 0.9999; });
    $('follow').addEventListener('click', () => setFollow(!state.follow));
    $('labels').addEventListener('click', () => {
      state.labels = !state.labels;
      setChip('labels', state.labels);
      $('hotspots').classList.toggle('hide-labels', !state.labels);
    });
    $('reset').addEventListener('click', () => { resetView(); setOptsOpen(false); });
    $('optsBtn').addEventListener('click', (e) => { e.stopPropagation(); setOptsOpen(!$('controls').classList.contains('opts-open')); });
    document.addEventListener('pointerdown', (e) => {
      if ($('controls').classList.contains('opts-open') && !$('controls').contains(e.target)) setOptsOpen(false);
    });

    $('infoClose').addEventListener('click', () => select(null));
    $('infoFocus').addEventListener('click', () => state.selected && focusOn(state.selected));
    const order = [...ANNOTATIONS].filter((a) => a.no).sort((x, y) => x.no - y.no);
    const cycle = (d) => {
      const i = state.selected ? order.indexOf(state.selected) : -1;
      select(order[(i + d + order.length) % order.length].id, true);
    };
    $('infoPrev').addEventListener('click', () => cycle(-1));
    $('infoNext').addEventListener('click', () => cycle(1));
    swipeToClose($('info'), () => select(null));

    $('phasePrev').addEventListener('click', (e) => { e.stopPropagation(); jumpPhase(-1); });
    $('phaseNext').addEventListener('click', (e) => { e.stopPropagation(); jumpPhase(1); });
    $('phase').addEventListener('click', () => { if (isPhone()) { $('phase').classList.toggle('expanded'); remeasure(); } });

    const slider = $('zoomSlider');
    slider.addEventListener('input', () => { state.zoomGoal = sliderToDist(+slider.value); state.sliderActive = true; });
    slider.addEventListener('change', () => { state.sliderActive = false; });
    $('zoomIn').addEventListener('click', () => { state.zoomGoal = clamp(currentDist() / 1.6, controls.minDistance, controls.maxDistance); });
    $('zoomOut').addEventListener('click', () => { state.zoomGoal = clamp(currentDist() * 1.6, controls.minDistance, controls.maxDistance); });

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.key === 'Escape') select(null);
      if (e.key === 'ArrowRight') jumpPhase(1);
      if (e.key === 'ArrowLeft') jumpPhase(-1);
      if (e.key === '+' || e.key === '=') $('zoomIn').click();
      if (e.key === '-') $('zoomOut').click();
    });
  }

  function setChip(id, on) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', String(on));
  }
  function setFollow(on) {
    state.follow = on;
    setChip('follow', on);
    if (on) {
      followPoint.copy(followGoal(new THREE.Vector3()));
      lastFollow.copy(followPoint);
    }
  }
  function setIndexOpen(open) {
    $('index').classList.toggle('collapsed', !open);
    $('indexToggle').setAttribute('aria-expanded', String(open));
  }
  function setOptsOpen(open) {
    $('controls').classList.toggle('opts-open', open);
    $('optsBtn').setAttribute('aria-expanded', String(open));
  }
  function togglePlay(force) {
    state.playing = typeof force === 'boolean' ? force : !state.playing;
    $('play').classList.toggle('paused', !state.playing);
    $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Abspielen');
  }
  function phaseIndex(t) {
    const i = state.phases.findIndex((p) => t >= p.from && t < p.to);
    return i < 0 ? state.phases.length - 1 : i;
  }
  function jumpPhase(d) {
    const cur = phaseIndex(state.t);
    const p = state.phases[cur];
    const target = d < 0 && state.t - p.from > 1.2 ? cur : clamp(cur + d, 0, state.phases.length - 1);
    jumpTo(state.phases[target].from + 0.02);
  }
  function jumpTo(t) { state.t = clamp(t, 0, state.duration * 0.9999); }

  function swipeToClose(el, onClose) {
    let y0 = null;
    el.addEventListener('touchstart', (e) => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (y0 == null || !isPhone()) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) el.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      el.style.transform = '';
      if (isPhone() && dy > 70) onClose();
      y0 = null;
    });
  }

  function select(id, fly = false) {
    const a = id ? byId(id) : null;
    state.selected = a;
    document.querySelectorAll('#partList button').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    hotspots.forEach((h) => h.el.classList.toggle('active', h.a === a));
    const info = $('info');
    document.body.classList.toggle('info-open', !!a);
    remeasure();
    if (!a) {
      info.classList.remove('open');
      info.setAttribute('aria-hidden', 'true');
      return;
    }
    info.style.setProperty('--c', a.color);
    $('infoKicker').textContent = a.kicker;
    $('infoTitle').textContent = a.title;
    $('infoText').textContent = a.text;
    $('infoFacts').innerHTML = (a.facts || []).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('infoLive').hidden = !a.live;
    $('infoFocus').hidden = !a.focus;
    info.classList.add('open');
    info.setAttribute('aria-hidden', 'false');
    info.scrollTop = 0;
    if (fly) focusOn(a);
  }

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const ndc = new THREE.Vector2();
  const visibleHit = (hits) => hits.find((h) => isShown(h.object));
  function isShown(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return Math.abs(o.matrixWorld.determinant()) > 1e-12 && !(o.material && o.material.opacity < 0.15 && o.material.transparent);
  }
  function pick(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.firstHitOnly = false;
    const h = visibleHit(raycaster.intersectObjects(pickables, false));
    return h ? h.object.userData.ann : null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !ctx.TL) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 500) {
      const a = pick(e.clientX, e.clientY);
      select(a ? a.id : null);
      if (isPhone()) setIndexOpen(false);
    }
    down = null;
  });
  let hoverReq = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !ctx.TL || e.buttons) { $('hoverTip').classList.remove('on'); return; }
    if (hoverReq) return;
    hoverReq = requestAnimationFrame(() => {
      hoverReq = null;
      const a = pick(e.clientX, e.clientY);
      const tip = $('hoverTip');
      canvas.style.cursor = a ? 'pointer' : 'grab';
      if (a) {
        tip.textContent = a.title;
        tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`;
        tip.classList.add('on');
      } else tip.classList.remove('on');
    });
  });
  canvas.addEventListener('pointerleave', () => $('hoverTip').classList.remove('on'));

  // ---------------------------------------------------------------- per-frame UI
  function updateUI() {
    const t = state.t;
    const i = phaseIndex(t);
    if (i !== state.phaseIndex) {
      const first = state.phaseIndex < 0;
      state.phaseIndex = i;
      const key = state.phases[i].key;
      const c = PHASES[key];
      const h3 = $('phaseTitle');
      h3.textContent = c.title;
      h3.classList.remove('swap'); void h3.offsetWidth; h3.classList.add('swap');
      $('phaseText').textContent = c.text;
      $('phaseNo').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(state.phases.length).padStart(2, '0');
      if (!first) phaseCamera(key);
    }
    const bars = $('phaseTrack').children;
    state.phases.forEach((p, k) => {
      const v = t >= p.to ? 100 : t <= p.from ? 0 : ((t - p.from) / (p.to - p.from)) * 100;
      bars[k].style.setProperty('--p', v.toFixed(1) + '%');
    });
    const a = state.selected;
    if (a && a.live && cfg.liveText) $('infoLive').innerHTML = cfg.liveText(ctx, a.live, t);
    if (cfg.onUI) cfg.onUI(ctx);
  }

  const _p = new THREE.Vector3();
  const _v = new THREE.Vector3();
  let occlusionClock = 0;
  function updateHotspots(dt) {
    occlusionClock += dt;
    const doOcc = occlusionClock > 0.15;
    if (doOcc) occlusionClock = 0;
    const w = innerWidth, h = innerHeight, t = state.t;
    for (const hs of hotspots) {
      hs.visible = false;
      if (!resolve(hs.m, hs.pos, t)) { hs.el.classList.add('gone'); continue; }
      _p.copy(hs.pos).project(camera);
      if (_p.z > 1 || Math.abs(_p.x) > 1.2 || Math.abs(_p.y) > 1.2) { hs.el.classList.add('gone'); continue; }
      hs.el.classList.remove('gone');
      hs.sx = ((_p.x + 1) / 2) * w;
      hs.sy = ((1 - _p.y) / 2) * h;
      hs.depth = _p.z;
      hs.visible = true;
      hs.el.style.transform = `translate(${hs.sx}px, ${hs.sy}px)`;
      if (doOcc) {
        const dir = _v.copy(hs.pos).sub(camera.position);
        const dist = dir.length();
        raycaster.set(camera.position, dir.normalize());
        raycaster.far = dist - (hs.m.pad ?? 0.05 * dist);
        raycaster.firstHitOnly = false;
        const hit = visibleHit(raycaster.intersectObjects(pickables, false));
        raycaster.far = Infinity;
        hs.occluded = !!hit && hit.object.userData.ann !== hs.a;
        hs.el.classList.toggle('occluded', hs.occluded);
      }
    }
    const vis = hotspots.filter((x) => x.visible).sort((p, q) => (q.a === state.selected) - (p.a === state.selected) || (p.occluded - q.occluded) || p.depth - q.depth);
    const rings = vis.map((x) => (x.occluded ? [0, 0, 0, 0] : [x.sx - 14, x.sy - 14, x.sx + 14, x.sy + 14]));
    const placed = [];
    for (const x of vis) {
      if (!x.lw) x.lw = x.el.querySelector('.lbl').offsetWidth || 90;
      const b = [x.sx + 12, x.sy - 13, x.sx + 20 + x.lw, x.sy + 13];
      const hit = (o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
      const clash = placed.some(hit) || rings.some((o, i) => vis[i] !== x && hit(o));
      x.el.classList.toggle('nolabel', clash);
      if (!clash) placed.push(b);
    }
  }

  // highlight the selected annotation's meshes with a soft pulsing glow
  const _c = new THREE.Color();
  let lastSel = null;
  function updateHighlight(now) {
    const a = state.selected;
    if (lastSel && lastSel !== a) for (const m of ctx.annMeshes.get(lastSel) || []) if (m.userData.baseEmissive) m.material.emissive.copy(m.userData.baseEmissive);
    lastSel = a;
    if (!a) return;
    const k = 0.16 + 0.1 * Math.sin(now * 0.004);
    _c.set(a.color);
    for (const m of ctx.annMeshes.get(a) || []) if (m.userData.baseEmissive) m.material.emissive.copy(m.userData.baseEmissive).lerp(_c, k);
  }

  const NICE = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6];
  const fmtLen = (m) => (m < 0.01 ? `${de(m * 1000)} mm` : m < 1 ? `${de(m * 100)} cm` : m < 1000 ? `${de(m)} m` : `${de(m / 1000)} km`);
  function updateScale() {
    const d = currentDist();
    const uPerPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / innerHeight;
    const mPerPx = uPerPx * (typeof cfg.unit === 'function' ? cfg.unit(ctx) : cfg.unit ?? 1);
    const maxPx = isPhone() ? 90 : 130;
    let L = NICE[0];
    for (const n of NICE) if (n / mPerPx <= maxPx) L = n;
    $('scaleBar').style.width = (L / mPerPx).toFixed(1) + 'px';
    $('scaleLabel').textContent = cfg.formatLength ? cfg.formatLength(L) : fmtLen(L);
    if (!state.sliderActive) $('zoomSlider').value = distToSlider(d);
  }

  // ---------------------------------------------------------------- loop
  let lastNow = performance.now();
  let fpsAcc = 0, fpsFrames = 0, degrade = 0;
  function frame(now = performance.now()) {
    requestAnimationFrame(frame);
    const dt = clamp((now - lastNow) / 1000, 0, 0.1);
    lastNow = now;
    if (state.suspended) return;
    if (!ctx.TL) { renderer.render(scene, camera); return; }
    tick(dt);
  }
  // debugging: advance the simulation by `sec` seconds without waiting for animation frames
  ctx.advance = (sec, step = 1 / 30) => { for (let s = 0; s < sec; s += step) tick(step, s + step < sec); };
  function tick(dt, skipRender = false) {

    if (state.playing) state.t = (state.t + dt * state.speed) % state.duration;
    ctx.mixer.setTime(state.t);
    if (cfg.onUpdate) cfg.onUpdate(ctx, dt);
    ctx.root.updateMatrixWorld(true);

    if (state.wrapDip) {
      const edge = Math.min(state.t, state.duration - state.t);
      $('dip').style.opacity = state.playing ? ((1 - smooth(edge / 0.45)) * 0.9).toFixed(3) : 0;
    }

    if (state.follow && !state.flight?.reset) {
      followPoint.lerp(followGoal(_v), 1 - Math.exp(-dt * 1.4));
      const delta = _p.copy(followPoint).sub(lastFollow);
      camera.position.add(delta);
      controls.target.add(delta);
    }
    lastFollow.copy(followPoint);

    const f = state.flight;
    if (f) {
      f.t += dt / f.dur;
      const k = easeInOut(clamp(f.t, 0, 1));
      if (f.reset) {
        controls.target.lerpVectors(f.fromT, f.toT, k);
        camera.position.lerpVectors(f.fromP, f.toP, k);
      } else {
        const live = new THREE.Vector3();
        resolve(f.spec, live, state.t, true);
        const cur = camera.position.clone().sub(controls.target).normalize();
        const dir = f.dir ? cur.lerp(f.dir, k).normalize() : cur;
        controls.target.lerpVectors(f.fromTarget, live, k);
        const d = Math.exp(Math.log(f.fromDist) + (Math.log(f.toDist) - Math.log(f.fromDist)) * k);
        camera.position.copy(controls.target).addScaledVector(dir, d);
        if (state.follow) { followPoint.copy(controls.target); lastFollow.copy(followPoint); }
      }
      if (f.t >= 1) state.flight = null;
    } else if (state.zoomGoal) {
      const d = currentDist();
      const nd = Math.exp(Math.log(d) + (Math.log(state.zoomGoal) - Math.log(d)) * (1 - Math.exp(-dt * 6)));
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, nd);
      if (Math.abs(nd - state.zoomGoal) / state.zoomGoal < 0.002) state.zoomGoal = null;
    }
    controls.update();
    applyViewOffset(dt);

    if (cfg.onFrame) cfg.onFrame(ctx, dt);
    updateHighlight(performance.now());
    updateUI();
    updateHotspots(dt);
    updateScale();
    const sc = $('scrub');
    if (document.activeElement !== sc) sc.value = (state.t / state.duration) * 10000;
    sc.style.setProperty('--p', ((state.t / state.duration) * 100).toFixed(2) + '%');

    if (skipRender) return;
    composer.render(dt);

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 3) {
      const fps = fpsFrames / fpsAcc;
      fpsAcc = 0; fpsFrames = 0;
      if (fps < 28 && degrade < 3) {
        degrade++;
        if (degrade === 1) gtao.enabled = false;
        if (degrade === 2) { pixelRatio = Math.min(pixelRatio, 1.0); renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight); }
        if (degrade === 3) { bloom.enabled = false; renderer.shadowMap.enabled = false; if (ctx.lights.key) ctx.lights.key.castShadow = false; }
      }
    }
  }
  frame();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    for (const hs of hotspots) hs.lw = 0;
    if (camera.view) camera.setViewOffset(innerWidth, innerHeight, viewShift.x, viewShift.y, innerWidth, innerHeight);
    remeasure();
  });

  return ctx;
}

function defaultLights(scene) {
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x0a1220, 0.6));
  const key = new THREE.DirectionalLight(0xfff1df, 2.2);
  key.position.set(30, 60, 40);
  key.castShadow = true;
  scene.add(key, key.target);
  return { key };
}

// soft round sprite texture (for particles)
export function dotTexture(inner = 0.4) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(inner, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
