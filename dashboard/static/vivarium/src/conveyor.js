// SYNAPSE · Vivarium — procedural heavy-duty motorized roller conveyor.
//
// Detailed roller conveyor: C-channel side frames with a top lip, closely-spaced rollers with dark
// axle hubs at each end, side guard rails, braced legs on foot plates, and an amber drive motor at
// the head. Built along local +X (travel direction); position/rotate the returned group to place.
// Swap-ready stand-in for the user's SolidWorks conveyor CAD (.SLDPRT — closed format). Roller spin
// + payload travel are cosmetic ("line is running"), flagged illustrative — not from the L1–L4 log.

import * as THREE from "three";

const MAT = {
  frame: new THREE.MeshStandardMaterial({ color: 0x33424e, roughness: 0.5, metalness: 0.75, envMapIntensity: 1.0 }),
  lip: new THREE.MeshStandardMaterial({ color: 0x475866, roughness: 0.45, metalness: 0.8 }),
  roller: new THREE.MeshStandardMaterial({ color: 0xc2cdd6, roughness: 0.3, metalness: 0.95, envMapIntensity: 1.25 }),
  hub: new THREE.MeshStandardMaterial({ color: 0x20282f, roughness: 0.6, metalness: 0.5 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x222d36, roughness: 0.6, metalness: 0.5 }),
  motor: new THREE.MeshStandardMaterial({ color: 0xd98a17, roughness: 0.5, metalness: 0.4, emissive: 0xd98a17, emissiveIntensity: 0.12 }),
};

export function createConveyor({ length = 4.2, width = 1.0, topY = 0.95, rollerGap = 0.26 } = {}) {
  const group = new THREE.Group();
  group.name = "conveyor";
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = shadow; m.receiveShadow = shadow; group.add(m); return m;
  };

  // C-channel side frames + top lip + guard rail, at ±width/2
  const webGeo = new THREE.BoxGeometry(length, 0.18, 0.05);
  const lipGeo = new THREE.BoxGeometry(length, 0.05, 0.11);
  const guardGeo = new THREE.BoxGeometry(length, 0.07, 0.04);
  for (const sz of [width / 2, -width / 2]) {
    add(webGeo, MAT.frame, 0, topY + 0.02, sz);            // web
    add(lipGeo, MAT.lip, 0, topY + 0.1, sz - Math.sign(sz) * 0.03); // inward top lip
    add(guardGeo, MAT.lip, 0, topY + 0.26, sz);            // raised side guard
    add(new THREE.BoxGeometry(0.05, 0.2, 0.05), MAT.frame, length / 2 - 0.05, topY + 0.24, sz, 0, 0, 0); // guard post (head)
    add(new THREE.BoxGeometry(0.05, 0.2, 0.05), MAT.frame, -length / 2 + 0.05, topY + 0.24, sz);          // guard post (tail)
  }

  // rollers (axis along Z) with dark axle hubs at each end
  const rollerGeo = new THREE.CylinderGeometry(0.075, 0.075, width - 0.08, 12);
  rollerGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10); hubGeo.rotateX(Math.PI / 2);
  const rollers = [];
  const n = Math.max(2, Math.floor(length / rollerGap));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + rollerGap * (i + 0.5);
    const r = add(rollerGeo, MAT.roller, x, topY, 0);
    rollers.push(r);
    add(hubGeo, MAT.hub, x, topY, width / 2 - 0.03, 0, 0, 0, false);
    add(hubGeo, MAT.hub, x, topY, -width / 2 + 0.03, 0, 0, 0, false);
  }

  // braced legs on foot plates (A-frame look)
  const legGeo = new THREE.BoxGeometry(0.09, topY, 0.09);
  const footGeo = new THREE.BoxGeometry(0.26, 0.04, 0.26);
  for (const lx of [-length / 2 + 0.4, length / 2 - 0.4]) {
    for (const lz of [width / 2 - 0.06, -width / 2 + 0.06]) {
      add(legGeo, MAT.leg, lx, topY / 2, lz);
      add(footGeo, MAT.leg, lx, 0.02, lz);
    }
    add(new THREE.BoxGeometry(0.07, 0.07, width - 0.06), MAT.leg, lx, 0.22, 0); // bottom cross-brace
    add(new THREE.BoxGeometry(0.06, 0.5, 0.06), MAT.leg, lx, topY * 0.5, 0, 0.6, 0, 0); // diagonal brace
  }

  // amber drive motor + gearbox at the head end
  add(new THREE.BoxGeometry(0.34, 0.3, 0.24), MAT.motor, length / 2 - 0.1, topY - 0.18, width / 2 + 0.14);
  add(new THREE.BoxGeometry(0.18, 0.22, 0.18), MAT.leg, length / 2 - 0.1, topY - 0.04, width / 2 + 0.12);

  return {
    group, rollers, topY, length,
    xAt: (t) => -length / 2 + THREE.MathUtils.clamp(t, 0, 1) * length,
    spin: (dt, speed) => { for (const r of rollers) r.rotation.z += dt * speed; },
  };
}
