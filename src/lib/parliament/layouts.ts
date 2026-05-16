import type { Party, SeatPos, Section, WestminsterSide } from "./types";

const SEAT_R = 1;
const SPACING = 2.4;

export interface DividerLine {
  points: { x: number; y: number }[];
}

export interface ArcLayoutResult {
  seats: SeatPos[];
  kind: "hemicycle" | "horseshoe";
  dividers: DividerLine[];
}

export interface WestmLayoutResult {
  seats: SeatPos[];
  kind: "westminster";
  dividers: DividerLine[];
}

interface Group {
  sectionId?: string;
  seats: { partyId: string; sectionId?: string }[];
}

/** Build ordered seat groups: one per non-empty section, plus a trailing group for unsectioned parties. */
function buildGroups(parties: Party[], sections: Section[]): Group[] {
  const groups: Group[] = [];
  const used = new Set<string>();
  const relevant = sections.filter((s) =>
    s.partyIds.some((id) => parties.some((p) => p.id === id && p.seats > 0)),
  );
  for (const sec of relevant) {
    const seats: Group["seats"] = [];
    for (const pid of sec.partyIds) {
      const p = parties.find((x) => x.id === pid);
      if (!p || used.has(pid)) continue;
      used.add(pid);
      for (let i = 0; i < p.seats; i++) seats.push({ partyId: pid, sectionId: sec.id });
    }
    if (seats.length > 0) groups.push({ sectionId: sec.id, seats });
  }
  const restSeats: Group["seats"] = [];
  for (const p of parties) {
    if (used.has(p.id)) continue;
    for (let i = 0; i < p.seats; i++) restSeats.push({ partyId: p.id });
  }
  if (restSeats.length > 0) groups.push({ seats: restSeats });
  return groups;
}

/** Allocate `total` units across rows proportional to capacity. */
function allocate(total: number, caps: number[]): number[] {
  const sum = caps.reduce((a, b) => a + b, 0);
  if (sum === 0) return caps.map(() => 0);
  const alloc = caps.map((c) => Math.min(c, Math.floor((total * c) / sum)));
  let diff = total - alloc.reduce((a, b) => a + b, 0);
  let i = caps.length - 1;
  let safety = 100000;
  while (diff > 0 && safety-- > 0) {
    if (alloc[i] < caps[i]) {
      alloc[i]++;
      diff--;
    }
    i = (i - 1 + caps.length) % caps.length;
  }
  return alloc;
}

interface Row {
  /** Arc length of this row (used for capacity). */
  length: number;
  /** Place a point at parameter u in [0,1] along the row's path. */
  place: (u: number) => { x: number; y: number };
}

function buildHemicycleRows(R: number): Row[] {
  const r0 = R;
  const rows: Row[] = [];
  for (let i = 0; i < R; i++) {
    const r = (r0 + i) * SPACING;
    rows.push({
      length: Math.PI * r,
      place: (u) => {
        const a = Math.PI - u * Math.PI;
        return { x: r * Math.cos(a), y: -r * Math.sin(a) };
      },
    });
  }
  return rows;
}

function buildHorseshoeRows(R: number): Row[] {
  const r0 = R;
  const H = r0 + R;
  const rows: Row[] = [];
  for (let i = 0; i < R; i++) {
    const halfWidth = (r0 + i) * SPACING;
    const armLen = H * SPACING;
    const arcLen = Math.PI * halfWidth;
    const total = 2 * armLen + arcLen;
    rows.push({
      length: total,
      place: (u) => {
        const s = u * total;
        if (s <= armLen) return { x: -halfWidth, y: -armLen + s };
        const s2 = s - armLen;
        if (s2 <= arcLen) {
          const t = s2 / arcLen;
          const a = Math.PI - t * Math.PI;
          return { x: halfWidth * Math.cos(a), y: halfWidth * Math.sin(a) };
        }
        const s3 = s2 - arcLen;
        return { x: halfWidth, y: -s3 };
      },
    });
  }
  return rows;
}

/**
 * Place groups along arc-style rows so section boundaries are at the SAME
 * normalized parameter u across every row. That guarantees boundary lines
 * are perfectly straight (radial in hemicycle / on the horseshoe arc, and
 * horizontal on the horseshoe arms).
 */
function arcLayout(
  parties: Party[],
  sections: Section[],
  buildRows: (R: number) => Row[],
  kind: "hemicycle" | "horseshoe",
): ArcLayoutResult {
  const groups = buildGroups(parties, sections);
  const total = groups.reduce((a, g) => a + g.seats.length, 0);
  if (total === 0) return { seats: [], kind, dividers: [] };

  const numGaps = Math.max(0, groups.length - 1);
  // Gap width as a fraction of normalized u. Tuned to look like a clean break
  // ~1.5 seat widths on the outer row.
  const GAP_U_BASE = 0.04;

  for (let R = 1; R < 300; R++) {
    const rows = buildRows(R);
    // Use outer row to set gapU so it matches a visible gap there.
    const outer = rows[rows.length - 1];
    const gapU = Math.min(0.15, (1.5 * SPACING) / outer.length);
    void GAP_U_BASE;
    const usefulU = Math.max(0, 1 - gapU * numGaps);
    if (usefulU <= 0) continue;

    // Capacity check: sum across rows of seats fit into useful arc.
    const totalCapacity = rows.reduce(
      (a, r) => a + Math.floor((r.length * usefulU) / SPACING) + 1,
      0,
    );
    if (totalCapacity < total) continue;

    const weights = groups.map((g) => g.seats.length / total);
    const seats: SeatPos[] = [];

    // For each group: build a shared slot grid spanning the group's u-window,
    // sort slots by angle (inner→outer at the same angle), then have parties
    // claim consecutive slots in that order.
    for (let g = 0; g < groups.length; g++) {
      const w = weights[g];
      let uStart = 0;
      for (let gg = 0; gg < g; gg++) uStart += weights[gg] * usefulU + gapU;
      const span = w * usefulU;
      const groupTotal = groups[g].seats.length;

      // Per-row capacity inside this group's window.
      const caps = rows.map((r) => Math.max(0, Math.floor((r.length * span) / SPACING)));
      // If a row's capacity is 0 but we still need seats, allow 1 (small windows).
      for (let i = 0; i < caps.length; i++) if (caps[i] === 0) caps[i] = 1;
      const alloc = allocate(groupTotal, caps);

      // Build slot list: each row evenly spaces its allocated seats across the window.
      const slots: { x: number; y: number; u: number; row: number }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const n = alloc[i];
        if (n === 0) continue;
        for (let k = 0; k < n; k++) {
          const u = uStart + ((k + 0.5) / n) * span;
          const pt = rows[i].place(u);
          slots.push({ x: pt.x, y: pt.y, u, row: i });
        }
      }
      // Sort by angle (u), then inner→outer at the same angle.
      slots.sort((a, b) => (a.u - b.u) || (a.row - b.row));

      // Assign each slot in order to the next seat in the group's queue
      // (queue is already party-ordered, so each party gets a contiguous block).
      const queue = groups[g].seats;
      for (let s = 0; s < slots.length && s < queue.length; s++) {
        const slot = slots[s];
        const item = queue[s];
        seats.push({ x: slot.x, y: slot.y, partyId: item.partyId, sectionId: item.sectionId });
      }
    }

    // Boundary divider polylines: at each gap midpoint, span all rows.
    const dividers: DividerLine[] = [];
    for (let g = 1; g < groups.length; g++) {
      let uStart = 0;
      for (let gg = 0; gg < g; gg++) uStart += weights[gg] * usefulU + gapU;
      const uBoundary = uStart - gapU / 2;
      // Inner boundary: just inside the innermost row; outer: just past outermost.
      const points: { x: number; y: number }[] = [];
      // Extend a bit inward (0.6 spacing) and outward (0.6 spacing) for visual reach.
      const inner = rows[0].place(uBoundary);
      const outer = rows[rows.length - 1].place(uBoundary);
      // Compute direction from inner to outer for extension.
      const dx = outer.x - inner.x;
      const dy = outer.y - inner.y;
      const len = Math.hypot(dx, dy) || 1;
      const ext = SPACING * 0.6;
      points.push({ x: inner.x - (dx / len) * ext, y: inner.y - (dy / len) * ext });
      points.push({ x: outer.x + (dx / len) * ext, y: outer.y + (dy / len) * ext });
      dividers.push({ points });
    }

    return { seats, kind, dividers };
  }
  return { seats: [], kind, dividers: [] };
}

export function hemicycleLayout(parties: Party[], sections: Section[]): ArcLayoutResult {
  return arcLayout(parties, sections, buildHemicycleRows, "hemicycle");
}

export function horseshoeLayout(parties: Party[], sections: Section[]): ArcLayoutResult {
  return arcLayout(parties, sections, buildHorseshoeRows, "horseshoe");
}

/* ---------------- WESTMINSTER ---------------- */

export function westminsterLayout(parties: Party[], sections: Section[]): WestmLayoutResult {
  const seats: SeatPos[] = [];
  const dividers: DividerLine[] = [];
  const dx = SPACING;
  const dy = SPACING;
  const aisle = SPACING * 2.5;
  const SECTION_GAP_COLS = 1;

  function sideGroups(side: WestminsterSide): Group[] {
    const sideParties = parties.filter((p) => p.side === side);
    const sideSections = sections.filter((s) => s.side === side);
    return buildGroups(sideParties, sideSections);
  }

  const oppGroups = sideGroups("opposition");
  const govGroups = sideGroups("government");
  const crossGroups = sideGroups("crossbench");

  const oppCount = oppGroups.reduce((a, g) => a + g.seats.length, 0);
  const govCount = govGroups.reduce((a, g) => a + g.seats.length, 0);
  const crossCount = crossGroups.reduce((a, g) => a + g.seats.length, 0);

  const benchRows = Math.max(2, Math.ceil(Math.sqrt(Math.max(oppCount, govCount) / 4)));
  const crossRows = Math.max(2, Math.ceil(Math.sqrt(crossCount / 6)));

  // Vertical chamber: opposition on top growing upward, government on bottom
  // growing downward, both facing each other across a horizontal aisle.
  // Crossbench sits to the right with a vertical bench (rows extend rightward).

  function totalCols(groups: Group[], rows: number) {
    return (
      groups.reduce((a, g) => a + Math.max(1, Math.ceil(g.seats.length / rows)), 0) +
      Math.max(0, groups.length - 1) * SECTION_GAP_COLS
    );
  }

  // Horizontal bench (gov / opp). Columns run along X (centered), rows stack
  // along Y away from the aisle.
  function hbench(groups: Group[], rows: number, originY: number, dirY: 1 | -1) {
    const cols = totalCols(groups, rows);
    const startX = -((cols - 1) * dx) / 2;
    let colCursor = 0;
    const groupBoundaries: number[] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      if (gi > 0) {
        groupBoundaries.push(colCursor);
        colCursor += SECTION_GAP_COLS;
      }
      const g = groups[gi];
      const gcols = Math.max(1, Math.ceil(g.seats.length / rows));
      let i = 0;
      for (let c = 0; c < gcols && i < g.seats.length; c++) {
        for (let r = 0; r < rows && i < g.seats.length; r++) {
          const item = g.seats[i++];
          seats.push({
            x: startX + (colCursor + c) * dx,
            y: originY + dirY * r * dy,
            partyId: item.partyId,
            sectionId: item.sectionId,
          });
        }
      }
      colCursor += gcols;
    }
    for (const colB of groupBoundaries) {
      const x = startX + (colB - 0.5) * dx;
      const y0 = originY - dirY * dy * 0.5;
      const y1 = originY + dirY * (rows - 1 + 0.5) * dy;
      const ymin = Math.min(y0, y1);
      const ymax = Math.max(y0, y1);
      dividers.push({ points: [{ x, y: ymin }, { x, y: ymax }] });
    }
  }

  hbench(oppGroups, benchRows, -aisle / 2, -1);
  hbench(govGroups, benchRows, aisle / 2, 1);

  // Crossbench: vertical bench on the right. Bench length runs along Y
  // (centered), rows extend rightward along X.
  if (crossCount > 0) {
    const cols = totalCols(crossGroups, crossRows);
    const startY = -((cols - 1) * dy) / 2;
    // Place to the right of the widest horizontal bench.
    const hCols = Math.max(totalCols(oppGroups, benchRows), totalCols(govGroups, benchRows), 1);
    const originX = ((hCols - 1) * dx) / 2 + aisle;
    let colCursor = 0;
    const groupBoundaries: number[] = [];
    for (let gi = 0; gi < crossGroups.length; gi++) {
      if (gi > 0) {
        groupBoundaries.push(colCursor);
        colCursor += SECTION_GAP_COLS;
      }
      const g = crossGroups[gi];
      const gcols = Math.max(1, Math.ceil(g.seats.length / crossRows));
      let i = 0;
      for (let c = 0; c < gcols && i < g.seats.length; c++) {
        for (let r = 0; r < crossRows && i < g.seats.length; r++) {
          const item = g.seats[i++];
          seats.push({
            x: originX + r * dx,
            y: startY + (colCursor + c) * dy,
            partyId: item.partyId,
            sectionId: item.sectionId,
          });
        }
      }
      colCursor += gcols;
    }
    for (const colB of groupBoundaries) {
      const y = startY + (colB - 0.5) * dy;
      const x0 = originX - dx * 0.5;
      const x1 = originX + (crossRows - 1 + 0.5) * dx;
      dividers.push({ points: [{ x: x0, y }, { x: x1, y }] });
    }
  }

  return { seats, kind: "westminster", dividers };
}

export function computeLayout(
  layout: "hemicycle" | "horseshoe" | "westminster",
  parties: Party[],
  sections: Section[],
): ArcLayoutResult | WestmLayoutResult {
  if (layout === "hemicycle") return hemicycleLayout(parties, sections);
  if (layout === "horseshoe") return horseshoeLayout(parties, sections);
  return westminsterLayout(parties, sections);
}

export const SEAT_RADIUS = SEAT_R;
export const SEAT_SPACING = SPACING;
