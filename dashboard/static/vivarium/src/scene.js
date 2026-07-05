// SYNAPSE · Vivarium — scene bootstrap: renderer, camera, lights, floor/grid, OrbitControls.
// Pure render setup; holds no fleet state.

import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { RoomEnvironment } from "../vendor/RoomEnvironment.js";
import { COLORS } from "./theme.js";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // why: cap pixel ratio at 2 — retina M4 panels can hit 3x, tripling fragment cost for no
  // visible gain at this scene complexity. Keeps the 60fps budget (brief §9).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // filmic tonemapping + soft shadows read far more like real metal than raw linear output
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  // why: exponential fog gives "depth" without a hard far-plane cut; tuned so the 3-node
  // triangle is crisp but a future 50-node fleet fades gracefully into the slate.
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.019);

  // why: a prefiltered environment map gives the brushed-steel bodies real PBR reflections
  // (the single biggest realism lever). RoomEnvironment is procedural — generated once, no asset
  // fetch, so the offline/air-gapped story holds.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  // near-frontal + elevated so A (back), B (left) and C (right) read as a clear triangle.
  camera.position.set(2.5, 13, 20.5);

  // --- lights: cool hemisphere fill + a shadow-casting key + a cool rim ---
  const hemi = new THREE.HemisphereLight(0x9fd8e6, 0x0a1622, 0.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xeaf7fc, 1.25);
  key.position.set(9, 17, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.camera.left = -16; key.shadow.camera.right = 16;
  key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x2bd4ee, 0.4); // cyan back-rim picks out edges
  rim.position.set(-8, 5, -10);
  scene.add(rim);
  // soft frontal fill (no shadow) lifts the shadow side of the machines so detail reads
  const fill = new THREE.DirectionalLight(0xcfeaf4, 0.35);
  fill.position.set(-6, 8, 12);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x223a48, 0.22));

  // --- floor + grid ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    // sealed-concrete sheen: a touch of metalness + env reflection so the floor catches the rig's
    // glow instead of reading as flat matte — a cheap, big fidelity win.
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.72, metalness: 0.28, envMapIntensity: 0.55 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02; // sit just below the grid so z-fighting can't shimmer
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(80, 80, COLORS.gridCenter, COLORS.grid);
  grid.material.transparent = true;
  grid.material.opacity = 0.26;
  scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;         // smooth glide, still snappy
  controls.target.set(0.5, 0.9, -0.3);
  controls.minDistance = 3.2;            // let the user get right up to a machine
  controls.maxDistance = 64;             // and pull way back for the whole bay
  controls.maxPolarAngle = 1.5;          // keep the camera above the floor plane
  controls.zoomToCursor = true;          // dolly toward the pointer — the single biggest "feels natural" win
  controls.zoomSpeed = 1.2;
  controls.rotateSpeed = 0.9;
  controls.panSpeed = 0.9;
  controls.keyPanSpeed = 24;
  controls.screenSpacePanning = true;    // pan in the screen plane (intuitive), not world-XZ
  controls.listenToKeyEvents(window);    // arrow keys pan the view too
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

  // `key` is returned so the controller can widen its shadow frustum for the fleet floor (which is
  // far larger than the 3-node triangle) and tighten it back for the crisp 3-node view (P6).
  return { renderer, scene, camera, controls, key };
}
