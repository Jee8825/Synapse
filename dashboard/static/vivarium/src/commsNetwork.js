// SYNAPSE · Vivarium — redundant comms network (PRP · IEC 62439-3 + a 1oo2D comparator).
//
// The industrial line the fleet runs on: every published signature crosses TWO media-diverse paths
// — a wired backbone (path A) and a per-batch wireless router (path B) — and an INDEPENDENT
// comparator on EVERY node (a co-MCU, off the main compute) cross-checks the two copies before
// anything enters L3. Agree → accept once; disagree → REJECT the tampered copy (anti-poisoning
// gate); only one arrives → accept degraded. The real logic lives in synapse/l4_gossip/redundancy.py
// and is exercised for real in the `comms_integrity` scenario; this module is its VISUAL twin.
//
// HONESTY split — two clearly different things, flagged apart in the legend:
//   • Per-node VALIDATOR status (3-node rig) is LOG-DRIVEN: a badge lights magenta only on a real
//     logged CHANNEL_REJECT (folded `channel` field) — never fabricated.
//   • The fleet-floor TOPOLOGY (5 batch routers + wired HSR ring backbone + per-node validator
//     chips) is the network ARCHITECTURE, illustrative dressing like the robot cell — the fleet50_*
//     logs don't carry channel events, so nothing here invents a per-event decision on the floor.

import * as THREE from "three";
import { COLORS, glowTexture } from "./theme.js";
import { fleetRoster, batchRoster } from "./floorLayout.js";

const STATUS_COLOR = { ok: COLORS.wireA, degraded: COLORS.stale, reject: COLORS.integrity };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function glowSprite(color, scale, opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.setScalar(scale);
  return sp;
}

// =============================================================================================
// 3-NODE per-node validator badge (the co-MCU comparator). LOG-DRIVEN: magenta only on a real
// CHANNEL_REJECT. Sits at each machine's front corner; two "feed" pins (path A + path B) enter it.
// =============================================================================================
export function createNodeValidators(scene, points) {
  const group = new THREE.Group();
  group.name = "nodeValidators";
  const dark = new THREE.MeshStandardMaterial({ color: COLORS.steelDark, roughness: 0.5, metalness: 0.8 });
  const rigs = {};

  for (const id in points) {
    const [x, , z] = points[id];
    const g = new THREE.Group();
    g.position.set(x + 1.15, 0, z + 1.0);

    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 10), dark)).position.y = 0.21;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a36, roughness: 0.45, metalness: 0.6,
      emissive: COLORS.wireA, emissiveIntensity: 0.08 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.26), bodyMat);
    body.position.y = 0.5; g.add(body);

    // two diverse "feed" pins into the top: path A (wired) + path B (wireless) — 1oo2D inputs
    for (const [dx, col] of [[-0.09, COLORS.wireA], [0.09, COLORS.wireB]]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
      pin.position.set(dx, 0.72, 0); pin.rotation.z = dx < 0 ? 0.32 : -0.32; g.add(pin);
    }

    // status LED (unlit) + additive glow — the comparator verdict at a glance
    const ledMat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.ok, toneMapped: false });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), ledMat);
    led.position.y = 0.66; g.add(led);
    const glow = glowSprite(STATUS_COLOR.ok, 0.55, 0.0);
    glow.position.y = 0.66; g.add(glow);

    group.add(g);
    rigs[id] = { g, led, glow, status: "ok", pulse: 0 };
  }
  scene.add(group);

  function setStatus(id, status) {
    const r = rigs[id];
    if (!r) return;
    r.status = status;
    const c = STATUS_COLOR[status] ?? STATUS_COLOR.ok;
    r.led.material.color.setHex(c);
    r.glow.material.color.setHex(c);
  }
  function flagReject(id) { if (rigs[id]) rigs[id].pulse = 1; }  // hard flash on a fresh reject
  function setVisible(v) { group.visible = v; }

  function update(dt, now) {
    for (const id in rigs) {
      const r = rigs[id];
      r.pulse = Math.max(0, r.pulse - dt * 1.4);
      const alert = r.status !== "ok";
      // ok LEDs breathe softly; a flagged (reject/degraded) LED blinks hard, harder right after
      const blink = alert ? 0.5 + 0.5 * Math.sin(now * 11) : 0.5 + 0.5 * Math.sin(now * 2.4);
      const base = alert ? 0.5 : 0.18;
      r.glow.material.opacity = base * blink + r.pulse * 0.9;
      r.glow.scale.setScalar(0.5 + (alert ? 0.25 : 0.0) + r.pulse * 0.9);
      r.led.scale.setScalar(1 + r.pulse * 0.6 + (alert ? blink * 0.15 : 0));
    }
  }

  return { group, setStatus, flagReject, setVisible, update };
}

// =============================================================================================
// FLEET-FLOOR comms topology (illustrative architecture): 5 batch wireless routers (path B) + a
// wired HSR ring backbone (path A) linking them + a per-node validator chip on all 50 machines.
// =============================================================================================
export function createFleetComms(scene, { n = 50 } = {}) {
  const group = new THREE.Group();
  group.name = "fleetComms";
  const batches = batchRoster();
  const roster = fleetRoster(n);

  const darkMat = new THREE.MeshStandardMaterial({ color: COLORS.steelDark, roughness: 0.5, metalness: 0.82 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x22323f, roughness: 0.4, metalness: 0.7,
    emissive: COLORS.wireB, emissiveIntensity: 0.14 });
  const dishMat = new THREE.MeshBasicMaterial({ color: COLORS.wireB, toneMapped: false });

  // ---- 5 wireless routers (path B), one per batch, off the −X edge ----
  const radios = [];  // { sprite, phase } expanding radio-wave rings
  const ROUTER_Y = 2.2;
  batches.forEach((b, i) => {
    const rg = new THREE.Group();
    rg.position.set(b.rx, 0, b.rz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, ROUTER_Y, 12), darkMat);
    pole.position.y = ROUTER_Y / 2; rg.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.12, 16), darkMat);
    foot.position.y = 0.06; rg.add(foot);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.42), housingMat);
    housing.position.y = ROUTER_Y + 0.1; rg.add(housing);
    // antenna rods
    for (const dx of [-0.16, 0, 0.16]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 6), darkMat);
      ant.position.set(dx, ROUTER_Y + 0.55, 0); rg.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), dishMat);
      tip.position.set(dx, ROUTER_Y + 0.78, 0); rg.add(tip);
    }
    const beacon = glowSprite(COLORS.wireB, 0.5, 0.5);
    beacon.position.set(0, ROUTER_Y + 0.1, 0); rg.add(beacon);
    // two concentric radio-wave rings (wireless path B "broadcasting")
    for (let k = 0; k < 2; k++) {
      const ring = glowSprite(COLORS.wireB, 0.6, 0.0);
      ring.position.set(0, ROUTER_Y + 0.1, 0.35); rg.add(ring);
      radios.push({ sprite: ring, phase: k * 0.5 + i * 0.13 });
    }
    group.add(rg);
  });

  // ---- wired HSR ring backbone (path A): a closed racetrack loop beside the routers ----
  const rz0 = batches[0].rz, rz1 = batches[batches.length - 1].rz, rx = batches[0].rx;
  const RAIL = 0.85, Y = 0.7;
  const loopPts = [
    new THREE.Vector3(rx + RAIL, Y, rz0 - 1.0), new THREE.Vector3(rx + RAIL, Y, rz1 + 1.0),
    new THREE.Vector3(rx - RAIL, Y, rz1 + 1.0), new THREE.Vector3(rx - RAIL, Y, rz0 - 1.0),
  ];
  const ringCurve = new THREE.CatmullRomCurve3(loopPts, true, "catmullrom", 0.2);
  const ringMesh = new THREE.Mesh(
    new THREE.TubeGeometry(ringCurve, 120, 0.05, 8, true),
    new THREE.MeshStandardMaterial({ color: COLORS.wireA, emissive: COLORS.wireA, emissiveIntensity: 0.5,
      roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.85 }));
  group.add(ringMesh);
  // short drop links from each router to the ring (reads as "router tapped into the backbone")
  batches.forEach((b) => {
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, ROUTER_Y - Y, 6),
      new THREE.MeshBasicMaterial({ color: COLORS.wireA, transparent: true, opacity: 0.5 }));
    drop.position.set(b.rx - RAIL, (ROUTER_Y + Y) / 2 - 0.4, b.rz); group.add(drop);
  });
  // PRP sends the SAME frame both directions around the ring → two counter-travelling pulses
  const ringPulses = [glowSprite(COLORS.wireA, 0.7, 0.9), glowSprite(COLORS.wireA, 0.7, 0.9)];
  ringPulses.forEach((p) => group.add(p));

  // ---- per-node validator chips on all 50 machines (instanced; static illustrative) ----
  const chipGeo = new THREE.BoxGeometry(0.24, 0.18, 0.18);
  const chips = new THREE.InstancedMesh(chipGeo, darkMat, n);
  const ledGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const ledMat = new THREE.MeshBasicMaterial({ color: COLORS.wireA, toneMapped: false, transparent: true });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, n);
  for (const r of roster) {
    _m.compose(_v.set(r.x + 0.85, 0.42, r.z + 0.78), _q.identity(), _one);
    chips.setMatrixAt(r.index, _m);
    _m.compose(_v.set(r.x + 0.85, 0.56, r.z + 0.78), _q.identity(), _one);
    leds.setMatrixAt(r.index, _m);
  }
  chips.instanceMatrix.needsUpdate = true;
  leds.instanceMatrix.needsUpdate = true;
  group.add(chips, leds);

  scene.add(group);
  group.visible = false;

  function setVisible(v) { group.visible = v; }

  function update(dt, now) {
    if (!group.visible) return;
    // wireless radio rings expand + fade, looping
    for (const r of radios) {
      const p = (now * 0.6 + r.phase) % 1;
      r.sprite.scale.setScalar(0.5 + p * 2.6);
      r.sprite.material.opacity = (1 - p) * 0.5;
    }
    // two PRP frames chase opposite ways around the wired ring
    const u = (now * 0.14) % 1;
    ringPulses[0].position.copy(ringCurve.getPointAt(u));
    ringPulses[1].position.copy(ringCurve.getPointAt((1 - u) % 1));
    const rp = 0.5 + 0.5 * Math.sin(now * 4);
    ringPulses.forEach((p) => (p.material.opacity = 0.6 + rp * 0.4));
    // validator LEDs breathe softly (all healthy on the floor)
    ledMat.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now * 2.2));
  }

  return { group, setVisible, update };
}
