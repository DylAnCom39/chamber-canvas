import type { Party, SeatPos, Section, WestminsterSide } from "./types";

const SEAT_R = 1;
const SPACING = 2.4; // center-to-center distance in SVG units

interface FlatItem {
  partyId?: string; // undefined = blank gap
  sectionId?: string;
}

/**
 * Order parties by their first containing section, inserting empty gap slots
 * between sections so they are physically separated in the diagram.
 * `gap` is the number of blank slots inserted per section boundary — pass the
 * row count for arc layouts so a full radial slice is removed (no touching seats).
 */
function flattenWithSections(parties: Party[], sections: Section[], gap: number): FlatItem[] {
  const items: FlatItem[] = [];
  const used = new Set<string>();
  const relevant = sections.filter((s) =>
    s.partyIds.some((id) => parties.some((p) => p.id === id && p.seats > 0)),
  );

  relevant.forEach((sec, idx) => {
    if (idx > 0) for (let g = 0; g < gap; g++) items.push({});
    sec.partyIds.forEach((pid) => {
      const p = parties.find((x) => x.id === pid);
      if (!p || used.has(pid)) return;
      used.add(pid);
      for (let i = 0; i < p.seats; i++) items.push({ partyId: pid, sectionId: sec.id });
    });
  });

  const rest = parties.filter((p) => !used.has(p.id) && p.seats > 0);
  if (rest.length > 0 && relevant.length > 0) {
    for (let g = 0; g < gap; g++) items.push({});
  }
  rest.forEach((p) => {
    for (let i = 0; i < p.seats; i++) items.push({ partyId: p.id });
  });
  return items;
}

/** Allocate `total` units across rows proportional to capacity. */
function allocate(total: number, caps: number[]): number[] {
  const sum = caps.reduce((a, b) => a + b, 0);
  if (sum === 0) return caps.map(() => 0);
  const alloc = caps.map((c) => Math.min(c, Math.floor((total * c) / sum)));
  let diff = total - alloc.reduce((a, b) => a + b, 0);
  // distribute remaining seats outward then inward
  let i = caps.length - 1;
  let safety = 10000;
  while (diff > 0 && safety-- > 0) {
    if (alloc[i] < caps[i]) {
      alloc[i]++;
      diff--;
    }
    i = (i - 1 + caps.length) % caps.length;
  }
  return alloc;
}

/* ---------------- HEMICYCLE ---------------- */

interface RowPlan {
  /** seats placed in this row */
  n: number;
  /** path placement function: returns (x,y,key) for seat j of n. Key aligns radially across rows. */
  place: (j: number, n: number) => { x: number; y: number; key: number };
}

function buildHemicycleRows(total: number): RowPlan[] {
  // Find smallest R such that capacity ≥ total.
  let R = 1;
  while (R < 200) {
    const r0 = R;
    const caps: number[] = [];
    for (let i = 0; i < R; i++) {
      const r = r0 + i;
      caps.push(Math.floor(Math.PI * r) + 1);
    }
    if (caps.reduce((a, b) => a + b, 0) >= total) {
      const alloc = allocate(total, caps);
      return alloc.map((n, i) => {
        const r = (r0 + i) * SPACING;
        return {
          n,
          place: (j, k) => {
            const t = k === 1 ? 0.5 : j / (k - 1);
            const angle = Math.PI - t * Math.PI; // π → 0
            return { x: r * Math.cos(angle), y: -r * Math.sin(angle), key: t };
          },
        };
      });
    }
    R++;
  }
  return [];
}

/* ---------------- HORSESHOE (U with curved base) ---------------- */

/**
 * U-shape: two straight vertical arms joined by a semicircular curved base.
 * Section gaps form straight horizontal lines on the arms and radial lines on the curve
 * because the key is segment-aware: arm key tracks y, arc key tracks angle.
 */
function buildHorseshoeRows(total: number): RowPlan[] {
  let R = 1;
  while (R < 200) {
    const r0 = R;
    const H = r0 + R; // straight arm length (in spacing units)
    const caps: number[] = [];
    for (let i = 0; i < R; i++) {
      const halfWidth = r0 + i;
      const len = 2 * H + Math.PI * halfWidth;
      caps.push(Math.floor(len) + 1);
    }
    if (caps.reduce((a, b) => a + b, 0) >= total) {
      const alloc = allocate(total, caps);
      return alloc.map((n, i) => {
        const halfWidth = (r0 + i) * SPACING;
        const topY = -H * SPACING;
        const armLen = -topY;
        const arcLen = Math.PI * halfWidth;
        const totalLen = 2 * armLen + arcLen;
        return {
          n,
          place: (j, k) => {
            const t = k === 1 ? 0.5 : j / (k - 1);
            const s = t * totalLen;
            if (s <= armLen) {
              const u = s / armLen; // 0..1
              return { x: -halfWidth, y: topY + s, key: u };
            }
            const s2 = s - armLen;
            if (s2 <= arcLen) {
              const u = s2 / arcLen;
              const a = Math.PI - u * Math.PI;
              return { x: halfWidth * Math.cos(a), y: halfWidth * Math.sin(a), key: 1 + u };
            }
            const s3 = s2 - arcLen;
            const u = s3 / armLen;
            return { x: halfWidth, y: -s3, key: 2 + u };
          },
        };
      });
    }
    R++;
  }
  return [];
}

/** Generic placer — assigns items to positions sorted by their alignment key, then row. */
function placeArc(items: FlatItem[], rows: RowPlan[]): SeatPos[] {
  type P = { x: number; y: number; key: number; row: number };
  const positions: P[] = [];
  rows.forEach((row, rIdx) => {
    for (let j = 0; j < row.n; j++) {
      const { x, y, key } = row.place(j, row.n);
      positions.push({ x, y, key, row: rIdx });
    }
  });
  positions.sort((a, b) => a.key - b.key || a.row - b.row);

  const out: SeatPos[] = [];
  positions.forEach((p, idx) => {
    const item = items[idx];
    if (!item || !item.partyId) return;
    out.push({ x: p.x, y: p.y, partyId: item.partyId, sectionId: item.sectionId });
  });
  return out;
}

export function hemicycleLayout(parties: Party[], sections: Section[]) {
  const items = flattenWithSections(parties, sections);
  const rows = buildHemicycleRows(items.length);
  return { seats: placeArc(items, rows), kind: "hemicycle" as const };
}

export function horseshoeLayout(parties: Party[], sections: Section[]) {
  const items = flattenWithSections(parties, sections);
  const rows = buildHorseshoeRows(items.length);
  return { seats: placeArc(items, rows), kind: "horseshoe" as const };
}

/* ---------------- WESTMINSTER ---------------- */

export function westminsterLayout(parties: Party[], sections: Section[]) {
  const seats: SeatPos[] = [];
  const dx = SPACING;
  const dy = SPACING;
  const aisle = SPACING * 2.5;

  function sideItems(side: WestminsterSide): FlatItem[] {
    const sideParties = parties.filter((p) => p.side === side);
    const sideSections = sections.filter((s) => s.side === side);
    return flattenWithSections(sideParties, sideSections);
  }

  const oppItems = sideItems("opposition");
  const govItems = sideItems("government");
  const crossItems = sideItems("crossbench");

  const benchRows = Math.max(2, Math.ceil(Math.sqrt(Math.max(oppItems.length, govItems.length) / 4)));
  const crossRows = Math.max(2, Math.ceil(Math.sqrt(crossItems.length / 6)));

  function bench(items: FlatItem[], rows: number, originX: number, originY: number, dirX: 1 | -1) {
    const cols = Math.max(1, Math.ceil(items.length / rows));
    let i = 0;
    for (let c = 0; c < cols && i < items.length; c++) {
      for (let r = 0; r < rows && i < items.length; r++) {
        const item = items[i++];
        if (!item.partyId) continue;
        seats.push({
          x: originX + dirX * c * dx,
          y: originY + r * dy,
          partyId: item.partyId,
          sectionId: item.sectionId,
        });
      }
    }
    return cols;
  }

  bench(oppItems, benchRows, -aisle / 2, 0, -1);
  bench(govItems, benchRows, aisle / 2, 0, 1);

  // Crossbench centered above the benches.
  const crossCols = Math.max(1, Math.ceil(crossItems.length / crossRows));
  const crossWidth = (crossCols - 1) * dx;
  const crossOriginX = -crossWidth / 2;
  const crossOriginY = -(benchRows + 1) * dy - SPACING * 0.5;
  let ci = 0;
  for (let c = 0; c < crossCols && ci < crossItems.length; c++) {
    for (let r = 0; r < crossRows && ci < crossItems.length; r++) {
      const item = crossItems[ci++];
      if (!item.partyId) continue;
      seats.push({
        x: crossOriginX + c * dx,
        y: crossOriginY - r * dy,
        partyId: item.partyId,
        sectionId: item.sectionId,
      });
    }
  }

  return { seats, kind: "westminster" as const };
}

export function computeLayout(
  layout: "hemicycle" | "horseshoe" | "westminster",
  parties: Party[],
  sections: Section[],
) {
  if (layout === "hemicycle") return hemicycleLayout(parties, sections);
  if (layout === "horseshoe") return horseshoeLayout(parties, sections);
  return westminsterLayout(parties, sections);
}

export const SEAT_RADIUS = SEAT_R;
export const SEAT_SPACING = SPACING;
