// SYNAPSE · Vivarium — fleet-scale floor (50 CNCs) rendered with InstancedMesh.
//
// The rendering crux (CLAUDE.md addendum 2026-06-27): 50 full 222-part CAD machines is ~15.7M
// tris / thousands of draw calls = unrenderable. So the fleet is drawn as INSTANCED low-poly
// proxies — one merged body geometry, one status disc, one spindle — three InstancedMeshes total
// (a handful of draw calls for all 50). Per-instance `instanceColor` on the status disc + beacon
// carries each node's REAL state colour from the replayed fold; per-instance matrices spin the
// spindles. Phase 3 will swap the proxy body for a decimated CAD instance + a hero-cell upgrade.
//
// Still render-only: every colour is the folded state the L1–L4 nodes decided (twin RENDERS, never
// COMPUTES). The floor zones (spine, cutting, QC, cell pads, robot nubs) are cosmetic dressing,
// flagged illustrative — exactly like the 3-node robot cell.

import * as THREE from "three";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";
import { COLORS, STATE_COLOR, situationColor, glowTexture } from "./theme.js";
import {
  fleetRoster, cellRoster, cellCenter, CELL_COLS, CELL_ROWS, CELL_DX, CELL_DZ, MACH_DX,
  GRID_HALF_X, GRID_HALF_Z, SPINE_Z, CUT_X, SHIP_X,
} from "./floorLayout.js";

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _v = new THREE.Vector3();
const _v0 = new THREE.Vector3();
const _pt = new THREE.Vector3();   // scratch for FX spawn positions (spawned outside the update loop)
const _one = new THREE.Vector3(1, 1, 1);
const _tiny = new THREE.Vector3(1e-4, 1e-4, 1e-4);   // scale used to hide an instance (hero-cell swap)

// one low-poly CNC proxy: bed base + upright column + overhead gantry beam (merged -> 1 geometry)
function bodyGeometry() {
  const parts = [
    new THREE.BoxGeometry(1.7, 0.5, 1.5).translate(0, 0.25, 0),          // bed / base
    new THREE.BoxGeometry(1.7, 0.28, 1.5).translate(0, 0.62, 0),         // table plate
    new THREE.BoxGeometry(0.34, 1.7, 0.34).translate(-0.55, 1.35, -0.5), // left column
    new THREE.BoxGeometry(0.34, 1.7, 0.34).translate(0.55, 1.35, -0.5),  // right column
    new THREE.BoxGeometry(1.5, 0.32, 0.4).translate(0, 2.1, -0.5),       // gantry beam
    new THREE.BoxGeometry(0.42, 0.5, 0.42).translate(0, 1.75, -0.2),     // carriage head
  ];
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

const materials = {
  body: new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.5, metalness: 0.85 }),
  // real-CAD instanced body: brushed steel matching the 3-node CAD frame (cadBody.js MAT.frame)
  cadBody: new THREE.MeshStandardMaterial({ color: 0x9fb6c6, roughness: 0.5, metalness: 0.5, envMapIntensity: 1.1 }),
  spindle: new THREE.MeshStandardMaterial({ color: 0xcfe8f0, roughness: 0.3, metalness: 0.9, emissive: 0x0e7490, emissiveIntensity: 0.25 }),
  // status disc + beacon are UNLIT so the state colour stays vivid from the elevated fleet camera
  status: new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 }),
  beacon: new THREE.MeshBasicMaterial({ toneMapped: false }),
  // halo colour comes from per-instance instanceColor (situationColor) so the fault FLAVOUR reads
  // on the floor (orange new-pattern · violet born-wise · red unknown) — material colour is white.
  halo: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.85 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x13212e, roughness: 0.92, metalness: 0.08 }),
  spine: new THREE.MeshStandardMaterial({ color: 0x2a3742, roughness: 0.55, metalness: 0.6 }),
  roller: new THREE.MeshStandardMaterial({ color: COLORS.steelDark, roughness: 0.4, metalness: 0.8 }),
  zone: new THREE.MeshStandardMaterial({ color: COLORS.cyanDim, emissive: COLORS.cyan, emissiveIntensity: 0.28, roughness: 0.6 }),
  robot: new THREE.MeshStandardMaterial({ color: COLORS.stale, emissive: COLORS.stale, emissiveIntensity: 0.12, roughness: 0.5, metalness: 0.4 }),
};

export function createFleetFloor(scene, { n = 50, cad = null } = {}) {
  const group = new THREE.Group();
  group.name = "fleetFloor";
  const roster = fleetRoster(n);
  const idToIndex = new Map(roster.map((r) => [r.id, r.index]));

  // --- floor zones (static dressing) ---------------------------------------------------
  buildFloorZones(group);

  // --- instanced fleet bodies + spindles ------------------------------------------------
  // Prefer the REAL CNC 3018 CAD (the SAME model the 3-node batch_defect rig renders), merged +
  // decimated so all 50 share ONE InstancedMesh — the full 222-part model × 50 ≈ 16 M tris is
  // unrenderable, so cadBody.buildFleet() drops sub-30 mm fasteners and keeps the spindle as a
  // separate axis-centred group each instance can spin/stop (P4). Falls back to the low-poly
  // procedural proxy if the glb is missing, so the air-gapped demo never hard-fails.
  const fleetCad = cad && cad.buildFleet ? cad.buildFleet({ bodyMinSize: 30 }) : null;
  const usingCad = !!(fleetCad && fleetCad.bodyGeo);
  const bodyGeo = usingCad ? fleetCad.bodyGeo : bodyGeometry();
  const bodies = new THREE.InstancedMesh(bodyGeo, usingCad ? materials.cadBody : materials.body, n);
  bodies.name = "fleetBodies";
  bodies.castShadow = true;   // P6: grounded shadows for all 50 (2.7 ms baseline leaves ample headroom)
  bodies.receiveShadow = true;

  // spindle: the CAD spindle group (re-centred on its axis) when present, else a proxy cylinder.
  // spindleOff = the spindle's offset from the machine origin: CAD (x,0,z) · proxy (0,1.55,-0.2).
  const spindleGeo = usingCad && fleetCad.spindleGeo
    ? fleetCad.spindleGeo
    : new THREE.CylinderGeometry(0.09, 0.09, 0.55, 10).translate(0, -0.27, 0);
  const spindleOff = usingCad && fleetCad.spindleGeo ? fleetCad.spindleOffset : new THREE.Vector3(0, 1.55, -0.2);
  const spindles = new THREE.InstancedMesh(spindleGeo, materials.spindle, n);
  spindles.castShadow = true;

  const discGeo = new THREE.CircleGeometry(1.35, 24).rotateX(-Math.PI / 2);
  const discs = new THREE.InstancedMesh(discGeo, materials.status, n);

  const beaconGeo = new THREE.SphereGeometry(0.16, 12, 12);
  const beacons = new THREE.InstancedMesh(beaconGeo, materials.beacon, n);

  // fault halo: a red floor ring shown ONLY on a machine with a CONFIRMED fault. why: a node that
  // diverged is UNKNOWN for just the escalation tick, then returns to CONFIDENT with confirmed_fault
  // still true (it recognizes its own signature). The three-state disc colour alone would lose that
  // outlier after one tick, so this second, honest channel keeps the fleet-flagged machine visible.
  const haloGeo = new THREE.RingGeometry(1.5, 1.9, 28).rotateX(-Math.PI / 2);
  const halos = new THREE.InstancedMesh(haloGeo, materials.halo, n);
  const haloShown = new Uint8Array(n);

  const spindleBase = [];  // per-instance spindle instance anchor (spin axis) — CAD offset or proxy
  const fxAnchor = [];     // elevated per-machine anchor for gossip FX + labels (above the machine)
  for (const r of roster) {
    // body: identity rotation at the roster position
    _m.compose(_v.set(r.x, 0, r.z), _q.identity(), _one);
    bodies.setMatrixAt(r.index, _m);
    // status disc flat on the floor under the machine
    _m.compose(_v.set(r.x, 0.03, r.z), _q.identity(), _one);
    discs.setMatrixAt(r.index, _m);
    // beacon on top of the column
    _m.compose(_v.set(r.x, 2.5, r.z - 0.5), _q.identity(), _one);
    beacons.setMatrixAt(r.index, _m);
    spindleBase[r.index] = new THREE.Vector3(r.x + spindleOff.x, spindleOff.y, r.z + spindleOff.z);
    fxAnchor[r.index] = new THREE.Vector3(r.x, 2.3, r.z);
    _m.compose(spindleBase[r.index], _q.identity(), _one);
    spindles.setMatrixAt(r.index, _m);
    // halo starts hidden (scaled to ~0 in the XZ plane)
    _m.compose(_v.set(r.x, 0.05, r.z), _q.identity(), _v0.set(0.001, 1, 0.001));
    halos.setMatrixAt(r.index, _m);
    // initial state colour = CONFIDENT
    discs.setColorAt(r.index, _c.setHex(STATE_COLOR.CONFIDENT));
    beacons.setColorAt(r.index, _c.setHex(STATE_COLOR.CONFIDENT));
    halos.setColorAt(r.index, _c.setHex(COLORS.unknown));  // recoloured per fault flavour on show
  }
  bodies.instanceMatrix.needsUpdate = true;
  spindles.instanceMatrix.needsUpdate = true;
  discs.instanceMatrix.needsUpdate = true;
  beacons.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  discs.instanceColor.needsUpdate = true;
  beacons.instanceColor.needsUpdate = true;
  halos.instanceColor.needsUpdate = true;
  group.add(bodies, spindles, discs, beacons, halos);
  scene.add(group);

  // per-instance render state (shake drives spindle spin/jitter, from the REAL fold — no fake #)
  const shake = new Float32Array(n);
  const stateOf = new Array(n).fill("CONFIDENT");
  // machine-stop parity: a confirmed-fault machine spins DOWN + parks (motion eases 1→0). spinAngle
  // is ACCUMULATED (not now*rate) so scaling the rate by the eased motion can't jump the angle back.
  const motion = new Float32Array(n).fill(1);
  const halted = new Uint8Array(n);
  const spinAngle = new Float32Array(n);
  const hiddenArr = new Uint8Array(n); // 1 = instance replaced by the full-CAD hero (see setHidden)
  let highlight = -1; // hovered/selected instance for a subtle emphasis

  function shakeLevel(ns) {
    if (ns.state === "UNKNOWN") return 1.0;
    if (ns.state === "STALE") return 0.4;
    return ns.confirmed_fault ? 0.5 : (1 - Math.max(0, Math.min(1, ns.self_trust))) * 0.6;
  }

  /** Snap every instance to the folded per-node state (fault-flavour disc + halo + shake + halt). */
  function applyStates(nodes) {
    for (const r of roster) {
      const ns = nodes[r.id];
      if (!ns) continue;
      // situationColor (not raw STATE_COLOR) so the 3 fault flavours read apart on the floor exactly
      // as on the 3-node rig: orange new-pattern · violet born-wise · red unknown · amber stale · teal.
      const col = situationColor(ns);
      discs.setColorAt(r.index, _c.setHex(col));
      beacons.setColorAt(r.index, _c.setHex(col));
      halos.setColorAt(r.index, _c.setHex(col));   // halo carries the same flavour colour
      shake[r.index] = shakeLevel(ns);
      stateOf[r.index] = ns.state;
      halted[r.index] = ns.confirmed_fault ? 1 : 0;  // machine-stop: spindle spins down (see update)
      // fault halo tracks confirmed_fault (persists past the one-tick UNKNOWN escalation)
      const flag = ns.confirmed_fault ? 1 : 0;
      if (flag !== haloShown[r.index]) {
        haloShown[r.index] = flag;
        const s = flag ? 1 : 0.001;
        _m.compose(_v.set(r.x, 0.05, r.z), _q.identity(), _v0.set(s, 1, s));
        halos.setMatrixAt(r.index, _m);
        halos.instanceMatrix.needsUpdate = true;
      }
    }
    discs.instanceColor.needsUpdate = true;
    beacons.instanceColor.needsUpdate = true;
    halos.instanceColor.needsUpdate = true;
  }

  /** Continuous animation: spindle spin + lateral jitter scaled by folded shake, × machine-stop. */
  function update(dt, now) {
    for (let i = 0; i < n; i++) {
      if (hiddenArr[i]) {   // this machine is shown as the full-CAD hero — park its instanced spindle
        _m.compose(spindleBase[i], _q.identity(), _tiny);
        spindles.setMatrixAt(i, _m);
        continue;
      }
      const sh = shake[i];
      const b = spindleBase[i];
      // machine-stop: ease motion 1→0 when halted so the spindle visibly spins DOWN + parks (× mo),
      // then accumulate the angle (never now*rate) so the easing can't wind it backwards.
      motion[i] += ((halted[i] ? 0 : 1) - motion[i]) * Math.min(1, dt * 2.4);
      const mo = motion[i];
      spinAngle[i] += dt * (2.4 + sh * 8) * mo;
      const jx = sh > 0.01 ? Math.sin(now * 41 + i) * 0.02 * sh * mo : 0;
      const jz = sh > 0.01 ? Math.cos(now * 33 + i) * 0.02 * sh * mo : 0;
      _euler.set(0, spinAngle[i], 0);
      _q.setFromEuler(_euler);
      _m.compose(_v.set(b.x + jx, b.y, b.z + jz), _q, _one);
      spindles.setMatrixAt(i, _m);
    }
    spindles.instanceMatrix.needsUpdate = true;
    // discs breathe; the fault halo pulses harder so the flagged machine reads at a glance
    const pulse = 0.72 + Math.sin(now * 3.4) * 0.28;
    discs.material.opacity = 0.55 + pulse * 0.35;
    materials.halo.opacity = 0.5 + Math.abs(Math.sin(now * 3.0)) * 0.5;
    updateFx(dt);
  }

  // --- gossip FX (fleet parity): teacher broadcast shockwaves + per-learn arcs + absorb pops -----
  // Pooled + capped; every spawn is triggered by a REAL logged gossip beat (main.js fireTransients).
  // At 50-scale the arcs are short-lived fading lines (not persistent tubes) so a whole batch teach
  // reads as a spreading mesh without thousands of draw calls; the shockwave carries the broadcast.
  const MAX_BURST = 48, MAX_ARC = 130;
  const bursts = [];   // { sp, from, to, dur, t }
  const gArcs = [];    // { line, mat, geo, dur, t }

  function fxSprite(color, scale) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.scale.setScalar(scale);
    return sp;
  }
  function burstAt(pos, color, { from = 0.6, to = 3.4, dur = 0.7 } = {}) {
    if (bursts.length >= MAX_BURST) return;
    const sp = fxSprite(color, from);
    sp.position.copy(pos); group.add(sp);
    bursts.push({ sp, from, to, dur, t: 0 });
  }
  /** teacher publishes -> an expanding shockwave over its machine (logged 'teach') */
  function broadcast(id) {
    const i = idToIndex.get(id); if (i == null) return;
    const b = fxAnchor[i];
    burstAt(_pt.set(b.x, b.y + 0.2, b.z), COLORS.cyan, { to: 3.8, dur: 0.8 });
  }
  /** a signature packet arcs teacher -> peer + the peer arms (logged 'learn' / GOSSIP_RECEIVE) */
  function gossipArc(fromId, toId, born) {
    const a = idToIndex.get(fromId), c = idToIndex.get(toId);
    if (a == null || c == null) return;
    const pa = fxAnchor[a], pb = fxAnchor[c];
    if (gArcs.length < MAX_ARC) {
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      mid.y += pa.distanceTo(pb) * 0.16 + 1.4;   // arch up so arcs read as peer links, not floor lines
      const curve = new THREE.QuadraticBezierCurve3(
        pa.clone().setY(pa.y + 0.2), mid, pb.clone().setY(pb.y + 0.2));
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(18));
      const mat = new THREE.LineBasicMaterial({ color: born ? COLORS.cyan : COLORS.confident,
        transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geo, mat); group.add(line);
      gArcs.push({ line, mat, geo, dur: 0.85, t: 0 });
    }
    burstAt(_pt.set(pb.x, pb.y + 0.35, pb.z), born ? COLORS.cyan : COLORS.confident, { from: 0.4, to: 1.7, dur: 0.5 });
  }
  /** systemic batch-defect: red shockwaves over the contributing machines (logged 'alarm' peers) */
  function alarmPulse(ids) {
    for (const id of ids || []) {
      const i = idToIndex.get(id); if (i == null) continue;
      const b = fxAnchor[i];
      burstAt(_pt.set(b.x, b.y, b.z), COLORS.unknown, { to: 3.0, dur: 0.7 });
    }
  }
  function updateFx(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const r = bursts[i];
      r.t += dt / r.dur;
      const e = Math.min(1, r.t);
      r.sp.scale.setScalar(r.from + (r.to - r.from) * e);
      r.sp.material.opacity = (1 - e) * 0.8;
      if (r.t >= 1) { group.remove(r.sp); r.sp.material.dispose(); bursts.splice(i, 1); }
    }
    for (let i = gArcs.length - 1; i >= 0; i--) {
      const a = gArcs[i];
      a.t += dt / a.dur;
      a.mat.opacity = 0.85 * (1 - a.t);
      if (a.t >= 1) { group.remove(a.line); a.mat.dispose(); a.geo.dispose(); gArcs.splice(i, 1); }
    }
  }
  function clearFx() {
    for (const r of bursts) { group.remove(r.sp); r.sp.material.dispose(); }
    for (const a of gArcs) { group.remove(a.line); a.mat.dispose(); a.geo.dispose(); }
    bursts.length = 0; gArcs.length = 0;
  }

  const setVisible = (v) => (group.visible = v);

  // picking: raycast the body InstancedMesh -> instanceId -> node id
  function pick(raycaster) {
    const hit = raycaster.intersectObject(bodies, false)[0];
    return hit && hit.instanceId != null ? roster[hit.instanceId].id : null;
  }
  function nodeWorldPos(id) {
    const i = idToIndex.get(id);
    return i == null ? null : fxAnchor[i].clone();
  }
  function setHighlight(id) { highlight = id == null ? -1 : (idToIndex.get(id) ?? -1); }

  // hero-cell swap: hide this machine's instanced body + spindle so a full-CAD hero can stand in its
  // place (main.js). The disc/halo/beacon stay (they still read state under the hero).
  function setHidden(id, hidden) {
    const i = idToIndex.get(id); if (i == null) return;
    hiddenArr[i] = hidden ? 1 : 0;
    const r = roster[i];
    _m.compose(_v.set(r.x, 0, r.z), _q.identity(), hidden ? _tiny : _one);
    bodies.setMatrixAt(i, _m);
    bodies.instanceMatrix.needsUpdate = true;
    // spindle is re-hidden/re-shown by the update loop via hiddenArr
  }
  function machineBasePos(id) {
    const i = idToIndex.get(id);
    return i == null ? null : { x: roster[i].x, z: roster[i].z };
  }

  return { group, roster, applyStates, update, setVisible, pick, nodeWorldPos, setHighlight,
    broadcast, gossipArc, alarmPulse, clearFx, setHidden, machineBasePos, pickTargets: [bodies] };
}

// ---- static floor dressing: cell pads, robot nubs, conveyor spine, cutting/QC zones -------
function buildFloorZones(group) {
  const box = (w, h, d, mat, x, y, z, cast = false, rec = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = rec; group.add(m); return m;
  };

  // 25 cell pads (the real instanced robot arm + conveyors that tend each cell live in fleetCells.js)
  for (const { cell, x, z } of cellRoster()) {
    const pad = box(2 * MACH_DX + 2.2, 0.04, 2.6, materials.pad, x, 0.012, z, false, true);
    pad.name = `cellpad-${cell}`;
  }

  // conveyor spine along X (in front of the grid) with a run of rollers
  const spineLen = (SHIP_X - CUT_X);
  box(spineLen, 0.5, 1.1, materials.spine, (CUT_X + SHIP_X) / 2, 0.5, SPINE_Z, true, true);
  const rollerGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.0, 10);
  const nRollers = Math.floor(spineLen / 0.55);
  const rollers = new THREE.InstancedMesh(rollerGeo, materials.roller, nRollers);
  for (let i = 0; i < nRollers; i++) {
    _euler.set(Math.PI / 2, 0, 0); _q.setFromEuler(_euler);
    _m.compose(_v.set(CUT_X + 0.4 + i * 0.55, 0.82, SPINE_Z), _q, _one);
    rollers.setMatrixAt(i, _m);
  }
  rollers.instanceMatrix.needsUpdate = true;
  group.add(rollers);

  // cutting zone (feeds blanks) + QC/ship zone (receives finished parts) as emissive floor pads
  box(3.4, 0.05, 3.4, materials.zone, CUT_X, 0.02, SPINE_Z, false, false);
  box(1.6, 1.4, 2.4, materials.spine, CUT_X, 0.7, SPINE_Z, true); // bandsaw block
  box(3.4, 0.05, 3.4, materials.zone, SHIP_X, 0.02, SPINE_Z, false, false);
  box(1.4, 1.0, 2.0, materials.spine, SHIP_X, 0.5, SPINE_Z, true); // QC gate block
}
