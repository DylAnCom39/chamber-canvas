import type { Party, SeatPos, Section, WestminsterSide } from "./types";

const SEAT_R = 1; // unit radius
const SPACING = 2.4; // center-to-center spacing (in unit radii)

/** Order parties by their position in the parties list, but only those whose seats > 0. */
function expandPartySeats(parties: Party[]): { partyId: string }[] {
  const out: { partyId: string }[] = [];
  for (const p of parties) {
    for (let i = 0; i < p.seats; i++) out.push({ partyId: p.id });
  }
  return out;
}

/* ---------------- HEMICYCLE / HORSESHOE (arc-based) ---------------- */

interface ArcOpts {
  startAngle: number; // radians
  endAngle: number;
  innerRadius: number; // in spacing units
}

function arcSeatPositions(total: number, opts: ArcOpts): SeatPos[] & { _radii?: number[] } {
  if (total === 0) return [] as SeatPos[];
  const arcSpan = Math.abs(opts.endAngle - opts.startAngle);

  // Find smallest # of rows that fits all seats
  for (let rows = 1; rows < 200; rows++) {
    const positions: { angle: number; r: number; row: number }[] = [];
    for (let i = 0; i < rows; i++) {
      const r = opts.innerRadius + i; // each row 1 spacing-unit out
      const arcLen = arcSpan * r;
      // # of seats that fit on this arc (centers separated by 1 spacing-unit along arc)
      const k = Math.max(1, Math.floor(arcLen) + 1);
      for (let j = 0; j < k; j++) {
        const t = k === 1 ? 0.5 : j / (k - 1);
        const angle = opts.startAngle + (opts.endAngle - opts.startAngle) * t;
        positions.push({ angle, r, row: i });
      }
    }
    if (positions.length >= total) {
      // Sort by angular progression (start -> end), then inner row first → "column by column"
      const dir = Math.sign(opts.endAngle - opts.startAngle) || 1;
      positions.sort((a, b) => dir * (a.angle - b.angle) || a.r - b.r);
      return positions.slice(0, total).map((p) => ({
        x: p.r * SPACING * Math.cos(p.angle),
        y: -p.r * SPACING * Math.sin(p.angle),
        partyId: "",
      }));
    }
  }
  return [];
}

function assignSeats(seatPositions: SeatPos[], parties: Party[], sections: Section[]): SeatPos[] {
  const flat = expandPartySeats(parties);
  const partyToSection = new Map<string, string>();
  for (const sec of sections) {
    for (const pid of sec.partyIds) partyToSection.set(pid, sec.id);
  }
  return seatPositions.map((s, i) => ({
    ...s,
    partyId: flat[i]?.partyId ?? "",
    sectionId: flat[i] ? partyToSection.get(flat[i].partyId) : undefined,
  }));
}

export function hemicycleLayout(parties: Party[], sections: Section[]) {
  const total = parties.reduce((a, p) => a + p.seats, 0);
  const innerRadius = Math.max(3, Math.ceil(Math.sqrt(total) * 0.6));
  // angle: start left (π), end right (0). x=r cos, y=-r sin → seats above x-axis.
  const seats = assignSeats(
    arcSeatPositions(total, { startAngle: Math.PI, endAngle: 0, innerRadius }),
    parties,
    sections,
  );
  return { seats, kind: "hemicycle" as const };
}

export function horseshoeLayout(parties: Party[], sections: Section[]) {
  const total = parties.reduce((a, p) => a + p.seats, 0);
  const innerRadius = Math.max(3, Math.ceil(Math.sqrt(total) * 0.55));
  // 270° arc, opening at the top: start at -45° (315°) sweeping clockwise via bottom to 225°.
  // Use angles measured math-style (counter-clockwise from +x). Open top means we exclude angles around π/2.
  // start = -π/4 (lower-right opening), going through -π/2, -π, -3π/2 ... easier: start = π + π/4, end = -π/4 going negative.
  const start = (5 * Math.PI) / 4; // 225°
  const end = -Math.PI / 4; // -45° (i.e. 315°)
  const seats = assignSeats(
    arcSeatPositions(total, { startAngle: start, endAngle: end, innerRadius }),
    parties,
    sections,
  );
  return { seats, kind: "horseshoe" as const };
}

/* ---------------- WESTMINSTER ---------------- */

/**
 * Westminster: two facing benches (opposition left, government right) plus a
 * crossbench block at the top connecting them. Each side is a rectangular grid
 * filled column-by-column.
 */
export function westminsterLayout(parties: Party[], sections: Section[]) {
  const sides: WestminsterSide[] = ["opposition", "government", "crossbench"];
  const seats: SeatPos[] = [];

  const partyToSection = new Map<string, string>();
  for (const sec of sections) {
    for (const pid of sec.partyIds) partyToSection.set(pid, sec.id);
  }

  // Pick a common row count for opp/gov so benches are visually balanced.
  const oppTotal = parties.filter((p) => p.side === "opposition").reduce((a, p) => a + p.seats, 0);
  const govTotal = parties.filter((p) => p.side === "government").reduce((a, p) => a + p.seats, 0);
  const crossTotal = parties.filter((p) => p.side === "crossbench").reduce((a, p) => a + p.seats, 0);

  // rows for facing benches: aim for benches that look like long rows (rows < cols).
  const benchRows = Math.max(2, Math.ceil(Math.sqrt(Math.max(oppTotal, govTotal) / 4)));
  // crossbench: a wide horizontal bench, similar row count or smaller
  const crossRows = Math.max(2, Math.ceil(Math.sqrt(crossTotal / 6)));

  const dx = SPACING;
  const dy = SPACING;
  const aisle = SPACING * 2.5; // gap between benches

  // Helper: produce column-by-column seat positions for a rectangular bench.
  function benchSeats(side: WestminsterSide, rows: number, originX: number, originY: number, dirX: 1 | -1, dirY: 1 | -1) {
    const sideParties = parties.filter((p) => p.side === side);
    const flat = expandPartySeats(sideParties);
    const cols = Math.ceil(flat.length / rows);
    const positions: SeatPos[] = [];
    let i = 0;
    for (let c = 0; c < cols && i < flat.length; c++) {
      for (let r = 0; r < rows && i < flat.length; r++) {
        positions.push({
          x: originX + dirX * c * dx,
          y: originY + dirY * r * dy,
          partyId: flat[i].partyId,
          sectionId: partyToSection.get(flat[i].partyId),
        });
        i++;
      }
    }
    return { positions, cols };
  }

  // Opposition on the left: extend leftward from -aisle/2
  const opp = benchSeats("opposition", benchRows, -aisle / 2, 0, -1, 1);
  // Government on the right: extend rightward from +aisle/2
  const gov = benchSeats("government", benchRows, aisle / 2, 0, 1, 1);
  // Crossbench at the top, centered horizontally, above the benches.
  // Compute width of bench area to center crossbench similarly.
  const crossParties = parties.filter((p) => p.side === "crossbench");
  const crossFlat = expandPartySeats(crossParties);
  // For crossbench, fill column-by-column going left→right; width spans across both benches' extent.
  const crossCols = Math.ceil(crossFlat.length / Math.max(1, crossRows));
  const crossWidth = Math.max(0, crossCols - 1) * dx;
  const crossOriginX = -crossWidth / 2;
  const crossOriginY = -(benchRows + 1) * dy - SPACING * 0.5;
  let ci = 0;
  const crossPositions: SeatPos[] = [];
  for (let c = 0; c < crossCols && ci < crossFlat.length; c++) {
    for (let r = 0; r < crossRows && ci < crossFlat.length; r++) {
      crossPositions.push({
        x: crossOriginX + c * dx,
        y: crossOriginY - r * dy,
        partyId: crossFlat[ci].partyId,
        sectionId: partyToSection.get(crossFlat[ci].partyId),
      });
      ci++;
    }
  }

  seats.push(...opp.positions, ...gov.positions, ...crossPositions);
  // Used by renderer to draw section brackets
  return {
    seats,
    kind: "westminster" as const,
    meta: {
      benchRows,
      crossRows,
      opp,
      gov,
      cross: { positions: crossPositions, cols: crossCols, originX: crossOriginX, originY: crossOriginY },
      aisle,
      dx,
      dy,
    },
  };
}

export function computeLayout(layout: "hemicycle" | "horseshoe" | "westminster", parties: Party[], sections: Section[]) {
  if (layout === "hemicycle") return hemicycleLayout(parties, sections);
  if (layout === "horseshoe") return horseshoeLayout(parties, sections);
  return westminsterLayout(parties, sections);
}

export const SEAT_RADIUS = SEAT_R;
export const SEAT_SPACING = SPACING;
