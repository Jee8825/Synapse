// SYNAPSE · Cognition — scene bootstrap for the abstract "mind space".
// Sibling to the factory-floor twin's scene.js, but tuned for an inward, cognitive read rather
// than a shop floor: a dark reflective plate, a drifting starfield / synapse dust, soft cool
// lights, and additive emissive glows that carry the look (we fake bloom with glow sprites so no
// new vendored dependency is needed — the offline/air-gapped story holds). Pure render setup;
// holds no fleet state.

import * as THREE from "three";
import { OrbitControls } from "../../vendor/OrbitControls.js";
import { RoomEnvironment } from "../../vendor/RoomEnvironment.js";
import { COLORS, glowTexture } from "../theme.js";

export function createCogScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap: no visible gain past 2×
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;                          // lift the emissive glows
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  // deeper fog than the floor twin: the mind space should fade to slate, so far towers read as
  // "distant thought" and the central nexus stays the focus.
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.026);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 240);
  camera.position.set(0.5, 8.5, 17);

  // --- lights: cool hemisphere + a soft key + a cyan rim (emissives do the heavy lifting) ---
  scene.add(new THREE.HemisphereLight(0x9fd8e6, 0x0a1622, 0.55));
  const key = new THREE.DirectionalLight(0xeaf7fc, 0.9);
  key.position.set(7, 16, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  key.shadow.camera.left = -18; key.shadow.camera.right = 18;
  key.shadow.camera.top = 18; key.shadow.camera.bottom = -18;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x2bd4ee, 0.5);
  rim.position.set(-9, 6, -11);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x223a48, 0.28));

  // --- reflective dark base plate + faint polar grid (the "cognition floor") ---
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 96),
    new THREE.MeshStandardMaterial({
      color: 0x081420, roughness: 0.55, metalness: 0.5, envMapIntensity: 0.7,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.PolarGridHelper(46, 12, 8, 96, COLORS.gridCenter, COLORS.grid);
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  scene.add(grid);

  // --- drifting "synapse dust": a slow starfield that makes the empty space feel alive ---
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 12 + Math.random() * 42, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.55 + 0.5; // bias above the floor
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: COLORS.cyan, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.5,
    map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(0, 2.6, 0);
  controls.minDistance = 4;
  controls.maxDistance = 70;
  controls.maxPolarAngle = 1.52;
  controls.zoomToCursor = true;
  controls.zoomSpeed = 1.15;
  controls.rotateSpeed = 0.9;
  controls.panSpeed = 0.9;
  controls.keyPanSpeed = 24;
  controls.screenSpacePanning = true;
  controls.listenToKeyEvents(window);
  controls.autoRotate = false;
  controls.update();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // gentle idle drift of the dust — called from the render loop
  function updateAmbient(dt, now) {
    dust.rotation.y += dt * 0.012;
    dust.material.opacity = 0.42 + Math.sin(now * 0.6) * 0.08;
  }

  return { renderer, scene, camera, controls, updateAmbient };
}
