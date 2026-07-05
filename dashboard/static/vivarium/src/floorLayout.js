// SYNAPSE · Vivarium — factory-floor layout (pure geometry, no Three.js state).
//
// The render-side twin of synapse/scenarios/fleet.py's roster: 50 CNCs (M00..M49) paired into
// 25 robot-tended cells (2 machines per cell, cell_of(M{2c})=cell_of(M{2c+1})=c). Here we place
// those same cells on a shop floor: a 5x5 cell grid flanking a central conveyor spine, a cutting
// zone that feeds blanks in at one end, and a QC/ship zone at the other — the lights-out cellular
// layout the fleet50 scenarios are authored against (CLAUDE.md addendum 2026-06-27).
//
// Nothing here reads the event log; it only decides WHERE each machine stands. State/colour/gossip
// come from the replayed fold, exactly as in 3-node mode — the twin still RENDERS, never COMPUTES.

export const CELL_COLS = 5;
export const CELL_ROWS = 5;                 // 5 x 5 = 25 cells
export const CELL_DX = 6.6;                 // cell-centre spacing along X (columns)
export const CELL_DZ = 5.2;                 // cell-centre spacing along Z (rows)
export const MACH_DX = 1.65;               // the 2 machines in a cell sit +/- this along X
export const CELL_SIZE = 2;                 // machines per cell (matches fleet.CELL_SIZE)

// derived floor extents (used to size zones / camera framing)
export const GRID_HALF_X = ((CELL_COLS - 1) / 2) * CELL_DX + MACH_DX; // ~14.85
export const GRID_HALF_Z = ((CELL_ROWS - 1) / 2) * CELL_DZ;          // ~10.4
export const SPINE_Z = GRID_HALF_Z + 3.2;   // conveyor spine runs along X, in front of the grid
export const CUT_X = -GRID_HALF_X - 3.6;    // cutting zone (feeds blanks) at the -X end of the spine
export const SHIP_X = GRID_HALF_X + 3.6;    // QC / ship zone at the +X end

export const fleetNodeIds = (n = 50) => Array.from({ length: n }, (_, i) => `M${String(i).padStart(2, "0")}`);
export const cellOf = (nodeId) => Math.floor(Number(nodeId.slice(1)) / CELL_SIZE);

/** Centre of cell `c` on the floor (XZ plane, y=0). Cells are laid out column-major within a row. */
export function cellCenter(c) {
  const col = c % CELL_COLS;
  const row = Math.floor(c / CELL_COLS);
  return {
    x: (col - (CELL_COLS - 1) / 2) * CELL_DX,
    z: (row - (CELL_ROWS - 1) / 2) * CELL_DZ,
  };
}

/** World position of one machine: its cell centre + a left/right slot for the 2 machines. */
export function machinePos(nodeId) {
  const idx = Number(nodeId.slice(1));
  const c = Math.floor(idx / CELL_SIZE);
  const slot = idx % CELL_SIZE;                 // 0 -> left, 1 -> right
  const { x, z } = cellCenter(c);
  return { x: x + (slot === 0 ? -MACH_DX : MACH_DX), z, cell: c, slot };
}

/** The full ordered roster: [{ id, index, cell, slot, x, z }]. Index === InstancedMesh instanceId. */
export function fleetRoster(n = 50) {
  return fleetNodeIds(n).map((id, index) => {
    const p = machinePos(id);
    return { id, index, cell: p.cell, slot: p.slot, x: p.x, z: p.z };
  });
}

/** Per-cell centres (for cell pads / robot placement / labels). */
export function cellRoster(nCells = CELL_COLS * CELL_ROWS) {
  return Array.from({ length: nCells }, (_, c) => ({ cell: c, ...cellCenter(c) }));
}

// --- network batching (mirrors the industrial-line comms plan) -------------------------------
// 50 machines = 5 network batches × 10 nodes. The 25 cells split 5-per-batch, and because cells
// are laid out row-major (cellCenter: col = c%5, row = c/5), each batch === one grid ROW: batch b
// holds cells [5b .. 5b+4] (10 machines). One wireless router serves each batch (path B); the wired
// HSR ring backbone links the batch routers (path A). See src/commsNetwork.js.
export const BATCH_COUNT = CELL_ROWS;               // 5 batches, one per grid row
export const CELLS_PER_BATCH = CELL_COLS;           // 5 cells (= 10 CNCs) per batch
export const batchOf = (cell) => Math.floor(cell / CELLS_PER_BATCH);

/** Centre of a batch (row): mid-row X, the row's Z. The router sits just behind this (see anchor). */
export function batchCenter(b) {
  return { x: 0, z: (b - (CELL_ROWS - 1) / 2) * CELL_DZ };
}

/** Router anchor for batch b — off the −X edge (clear of the leftmost cells' conveyors, which reach
 *  ~GRID_HALF_X+2), so the wired HSR ring loops down the machines' side without overlapping them. */
export function routerAnchor(b) {
  return { x: -GRID_HALF_X - 5.0, z: (b - (CELL_ROWS - 1) / 2) * CELL_DZ };
}

/** [{ batch, x, z (centre), rx, rz (router) }] for all 5 batches. */
export function batchRoster(nBatches = BATCH_COUNT) {
  return Array.from({ length: nBatches }, (_, b) => {
    const c = batchCenter(b), r = routerAnchor(b);
    return { batch: b, x: c.x, z: c.z, rx: r.x, rz: r.z };
  });
}
