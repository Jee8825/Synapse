// SYNAPSE · Vivarium — robot-tended machining cell (illustrative).
//
// Infeed conveyor → 6-axis arm → outfeed conveyor, with a looping pick-and-place. The arm FACES
// the conveyor line and works in one vertical plane (yaw=0): it reaches DOWN onto the infeed belt,
// the claw closes on the part, lifts it straight up, transfers across, lowers onto the outfeed,
// and releases — then the part rides away. The claw is kept pointing straight down by deriving the
// wrist angle (shoulder+elbow+wrist = π), so it always grips from above the belt, never "yanks".
//
// HONESTY: this motion is COSMETIC ("the line is running") — NOT replayed from the L1–L4 log, like
// the data-flow pulses. Flagged "illustrative" in the legend. CNC node states stay log-driven.

import * as THREE from "three";
import { createConveyor } from "./conveyor.js";
import { createRobotArm } from "./robotArm.js";

// --- TUNE: arm poses as (shoulder, elbow) — wrist is derived for a straight-down claw ---------
const WRIST_OFF = 0.0;
const wristFor = (s, e) => Math.PI - s - e + WRIST_OFF;
const pose = (s, e) => ({ yaw: 0, shoulder: s, elbow: e, wrist: wristFor(s, e) });
// (shoulder,elbow) solved in-browser so the claw lands on each belt end; pick/place mirror
// (elbow sign flips) and the derived wrist keeps the claw pointing straight down at both.
const POSE = {
  home: pose(0.2, 0.55),        // raised neutral, claw down, leaning toward the infeed
  pick: pose(1.05, 0.2),        // extended reach down onto the infeed belt end
  lift: pose(-0.25, 0.58),      // straight up, part raised over the cell
  placeHigh: pose(-0.45, -0.22),// raised over the outfeed
  place: pose(-1.05, -0.2),     // extended reach down onto the outfeed belt end
};
// choreography phases (seconds)
const PHASES = [
  { name: "infeed", dur: 2.4 },
  { name: "reach", dur: 1.0 },
  { name: "grab", dur: 0.5 },
  { name: "lift", dur: 1.0 },
  { name: "transfer", dur: 1.2 },
  { name: "lower", dur: 1.0 },
  { name: "release", dur: 0.45 },
  { name: "outfeed", dur: 2.4 },
];
const CONV = { length: 4.2, width: 1.0, topY: 0.95 };
const CONV_X = 4.0; // each conveyor's centre offset from the arm base in X (near ends at ±1.9)
const PART_Y = 0.09; // part half-height above the roller surface

const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const lerpPose = (a, b, k) => ({
  yaw: lerp(a.yaw, b.yaw, k), shoulder: lerp(a.shoulder, b.shoulder, k),
  elbow: lerp(a.elbow, b.elbow, k), wrist: lerp(a.wrist, b.wrist, k),
});

// a small machined part: a flanged steel plate with a bored hub (reads as "CNC-cut shape")
function makeWorkpiece() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.07, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xaebcc7, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.2 }),
  );
  plate.castShadow = true; g.add(plate);
  const hub = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.032, 12, 24),
    new THREE.MeshStandardMaterial({ color: 0x0e7490, emissive: 0x22d3ee, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.7 }),
  );
  hub.rotation.x = Math.PI / 2; hub.position.y = 0.05; hub.castShadow = true; g.add(hub);
  return g;
}

export function createRobotCell(scene, { position = [0, 0, 6], rotationY = 0 } = {}) {
  const group = new THREE.Group();
  group.name = "robot-cell";
  group.position.set(...position); group.rotation.y = rotationY; scene.add(group);

  const arm = createRobotArm();
  group.add(arm.group);
  const infeed = createConveyor(CONV);
  infeed.group.position.set(-CONV_X, 0, 0); group.add(infeed.group);
  const outfeed = createConveyor(CONV);
  outfeed.group.position.set(CONV_X, 0, 0); group.add(outfeed.group);

  const part = makeWorkpiece();
  scene.add(part); // child of scene so its WORLD position can be driven directly

  // world point on a conveyor at travel param t (local X runs from -length/2 to +length/2).
  // infeed sits on -X so its near-arm end is t=1 (+X end); outfeed sits on +X so its near-arm
  // end is t=0 (-X end). The part enters the infeed far end (t=0) and rides toward the arm (t=1).
  const _v = new THREE.Vector3();
  const convWorld = (conv, t) => {
    _v.set(conv.xAt(t), conv.topY + PART_Y, 0);
    return conv.group.localToWorld(_v.clone());
  };
  const pickPt = () => convWorld(infeed, 1);   // infeed end nearest the arm
  const placePt = () => convWorld(outfeed, 0); // outfeed end nearest the arm
  const onTip = () => { arm.tipWorld(_v); _v.y -= 0.16; part.position.copy(_v); };

  let phaseI = 0, tAcc = 0;
  const setPhase = (i) => { phaseI = i % PHASES.length; tAcc = 0; };

  function update(dt) {
    infeed.spin(dt, 3.0);
    outfeed.spin(dt, 3.0);

    const ph = PHASES[phaseI];
    tAcc += dt;
    const k = Math.min(1, tAcc / ph.dur), e = ease(k);

    switch (ph.name) {
      case "infeed":
        arm.setPose(POSE.home); arm.gripper(1); part.visible = true; part.rotation.y = 0;
        part.position.copy(convWorld(infeed, e)); break;
      case "reach": // descend toward the part on the belt, claw open
        arm.setPose(lerpPose(POSE.home, POSE.pick, e)); arm.gripper(1);
        part.position.copy(pickPt()); break;
      case "grab": // claw closes on the part
        arm.setPose(POSE.pick); arm.gripper(1 - e);
        part.position.copy(pickPt()); break;
      case "lift": // straight up, part now follows the claw
        arm.setPose(lerpPose(POSE.pick, POSE.lift, e)); arm.gripper(0); onTip(); break;
      case "transfer": // carry across to above the outfeed
        arm.setPose(lerpPose(POSE.lift, POSE.placeHigh, e)); arm.gripper(0); onTip();
        part.rotation.y = lerp(0, Math.PI / 2, e); break;
      case "lower": // descend onto the outfeed belt
        arm.setPose(lerpPose(POSE.placeHigh, POSE.place, e)); arm.gripper(0); onTip();
        part.rotation.y = Math.PI / 2; break;
      case "release": // open claw, part settles on the belt
        arm.setPose(POSE.place); arm.gripper(e);
        part.position.copy(placePt()); part.rotation.y = Math.PI / 2; break;
      case "outfeed": // part rides away; arm returns home
        arm.setPose(lerpPose(POSE.place, POSE.home, e)); arm.gripper(1);
        part.position.copy(convWorld(outfeed, e)); part.rotation.y = Math.PI / 2; break;
    }
    if (k >= 1) setPhase(phaseI + 1);
  }

  return { group, arm, infeed, outfeed, part, update, POSE };
}
