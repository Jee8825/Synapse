// SYNAPSE · Vivarium — projected HTML labels.
// Crisp monospace text that tracks 3D anchors: each frame we project an anchor's world position
// to screen space and translate a DOM node onto it. why: HTML labels stay pixel-sharp at any
// zoom (unlike sprite/texture text) and reuse the HUD's CSS, keeping the technical labels
// (exact sensor/algorithm names, brief §8) legible.

import * as THREE from "three";

export function createLabels(container) {
  const items = [];   // { anchor: Object3D, el: HTMLElement }
  const _v = new THREE.Vector3();

  function add(anchor, text, cls = "") {
    const el = document.createElement("div");
    el.className = "vlabel" + (cls ? " " + cls : "");
    el.textContent = text;
    container.appendChild(el);
    const item = { anchor, el, enabled: true }; // enabled=false -> hidden (used for de-crowding)
    items.push(item);
    return item;
  }

  function update(camera, w, h) {
    for (const it of items) {
      if (!it.enabled) { if (it.el.style.display !== "none") it.el.style.display = "none"; continue; }
      it.anchor.getWorldPosition(_v);
      _v.project(camera);
      // hide labels behind the camera or off the viewport edges
      if (_v.z > 1 || _v.x < -1.05 || _v.x > 1.05 || _v.y < -1.05 || _v.y > 1.05) {
        if (it.el.style.display !== "none") it.el.style.display = "none";
        continue;
      }
      if (it.el.style.display === "none") it.el.style.display = "";
      const x = (_v.x * 0.5 + 0.5) * w;
      const y = (-_v.y * 0.5 + 0.5) * h;
      it.el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
  }

  function clear() {
    for (const it of items) it.el.remove();
    items.length = 0;
  }

  return { add, update, clear };
}
