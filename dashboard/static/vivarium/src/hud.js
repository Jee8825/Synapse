// SYNAPSE · Vivarium — HUD: scenario selector, transport, ticker, beats, systemic banner.
// Pure DOM rendering driven by the controller (main.js); holds no playback state of its own.

const TAG = { teach: "TEACH", learn: "LEARN", alarm: "ALARM", escal: "ESCAL", stale: "STALE", recover: "REJOIN", reject: "REJECT", degraded: "1-PATH" };
const TRANSIENT = new Set(Object.keys(TAG));
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function createHud(handlers) {
  $("play").onclick = () => handlers.onPlayToggle();
  $("scrub").oninput = (e) => handlers.onScrub(+e.target.value);
  $("speed").onchange = (e) => handlers.onSpeed(+e.target.value);

  return {
    setScenarios(list, current) {
      const tabs = $("scenario-tabs");
      tabs.innerHTML = "";
      list.forEach((s) => {
        const b = document.createElement("button");
        b.textContent = s.name.replace(/_/g, " ");
        b.dataset.name = s.name;
        if (s.name === current) b.classList.add("active");
        b.onclick = () => handlers.onSelectScenario(s.name);
        tabs.appendChild(b);
      });
    },

    setActiveScenario(name) {
      [...document.querySelectorAll("#scenario-tabs button")]
        .forEach((b) => b.classList.toggle("active", b.dataset.name === name));
    },

    setNarrative(t) { $("narrative").textContent = t; },

    setTransport({ tick, maxTick, playing, act }) {
      const s = $("scrub");
      s.max = maxTick; s.value = tick;
      $("tickno").textContent = `t=${tick}`;
      $("act").textContent = act;
      $("play").textContent = playing ? "⏸" : "▶";
    },

    renderBeats(beats, maxTick) {
      const map = new Map();  // merge beats sharing a tick so labels don't collide
      for (const b of beats) map.set(b.tick, map.has(b.tick) ? `${map.get(b.tick)} · ${b.label}` : b.label);
      $("beats").innerHTML = [...map.entries()].map(([t, label]) =>
        `<span class="beat" style="left:${maxTick ? (t / maxTick) * 100 : 0}%">${esc(label)}</span>`
      ).join("");
    },

    renderTicker(events, t) {
      const items = events.filter((e) => TRANSIENT.has(e.kind) && e.t <= t).slice(-16);
      $("ticker").innerHTML = items.map((e) => {
        const now = e.t === t ? " now" : "";
        return `<li class="${now}"><span class="tag ${e.kind}">[${TAG[e.kind]}]</span>`
          + `<span class="who">t=${e.t} ${e.node || ""}</span> ${esc(e.detail || "")}</li>`;
      }).join("");
      const ul = $("ticker");
      ul.scrollTop = ul.scrollHeight;
    },

    setAlarm(fleet) {
      const el = $("alarm");
      if (fleet && fleet.active) {
        el.classList.remove("hidden");
        el.innerHTML = "⚠ SYSTEMIC BATCH DEFECT DETECTED"
          + `<div class="sub">${esc(fleet.detail || "")} — caught fleet-wide; single-node monitoring is blind to this.</div>`;
      } else {
        el.classList.add("hidden");
      }
    },
  };
}
