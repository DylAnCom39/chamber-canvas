import { forwardRef, useMemo, type ReactElement } from "react";
import type { Party, ParliamentConfig, SeatPos } from "@/lib/parliament/types";
import { computeLayout } from "@/lib/parliament/layouts";

interface Props {
  config: ParliamentConfig;
}

const SEAT_R = 1;

function bbox(seats: SeatPos[]) {
  if (seats.length === 0) return { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of seats) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  return { minX, maxX, minY, maxY };
}

function partyMap(parties: Party[]) {
  return new Map(parties.map((p) => [p.id, p]));
}

export const ParliamentGraph = forwardRef<SVGSVGElement, Props>(({ config }, ref) => {
  const { layout, parties, sections, title, showDividers } = config;
  const result = useMemo(() => computeLayout(layout, parties, sections), [layout, parties, sections]);
  const seats = result.seats;
  const dividers = showDividers ? result.dividers : [];
  const pmap = partyMap(parties);

  const bb = bbox(seats);
  const padX = 6;
  const padTop = title ? 8 : 4;
  const padBottom = 4;
  const vbX = bb.minX - padX;
  const vbW = bb.maxX - bb.minX + padX * 2;
  const vbH = bb.maxY - bb.minY + padTop + padBottom;
  const vbY = bb.minY - padTop;

  // ----- Divider lines (hard, straight section separators) -----
  const dividerEls = dividers.map((d, i) => {
    const pts = d.points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polyline
        key={`div-${i}`}
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.35}
        strokeLinecap="round"
        opacity={0.85}
      />
    );
  });

  // ----- Seat circles -----
  const seatEls = seats.map((s, i) => {
    const p = pmap.get(s.partyId);
    if (!p) return null;
    return (
      <circle
        key={i}
        cx={s.x}
        cy={s.y}
        r={SEAT_R}
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={p.strokeWidth}
      />
    );
  });

  // ----- Legend -----
  // Group parties by section (preserving section order); collect unassigned parties.
  const assignedIds = new Set<string>();
  const groups: { title: string | null; parties: Party[] }[] = [];
  for (const sec of sections) {
    const secParties = sec.partyIds
      .map((id) => pmap.get(id))
      .filter((p): p is Party => !!p);
    if (secParties.length === 0) continue;
    secParties.forEach((p) => assignedIds.add(p.id));
    groups.push({ title: sec.name, parties: secParties });
  }
  const unassigned = parties.filter((p) => !assignedIds.has(p.id));
  if (unassigned.length > 0) {
    groups.push({ title: groups.length > 0 ? "Other" : null, parties: unassigned });
  }

  const legendItemH = 3;
  const legendTitleH = 3.2;
  const legendGroupGap = 1;
  const legendStartY = bb.maxY + padBottom + 2;

  const legendEls: ReactElement[] = [];
  let cursorY = legendStartY;
  const legendX = vbX + 1;
  groups.forEach((g, gi) => {
    if (g.title) {
      legendEls.push(
        <text
          key={`g-${gi}-title`}
          x={legendX}
          y={cursorY + 2}
          fontSize={2}
          fontWeight={700}
          fill="currentColor"
        >
          {g.title}
        </text>,
      );
      cursorY += legendTitleH;
    }
    g.parties.forEach((p) => {
      legendEls.push(
        <g key={`g-${gi}-${p.id}`}>
          <circle cx={legendX + 1} cy={cursorY + 1} r={1} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} />
          <text x={legendX + 3} y={cursorY + 1.6} fontSize={1.7} fill="currentColor">
            {p.name} ({p.seats})
          </text>
        </g>,
      );
      cursorY += legendItemH;
    });
    if (gi < groups.length - 1) cursorY += legendGroupGap;
  });
  const legendH = cursorY - legendStartY + 2;

  const titleH = title ? 4 : 0;
  const totalH = titleH + vbH + legendH;
  const finalVbY = vbY - titleH;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vbX} ${finalVbY} ${vbW} ${totalH}`}
      className="w-full h-full text-foreground"
      style={{ maxHeight: "70vh" }}
    >
      {title && (
        <text
          x={vbX + vbW / 2}
          y={finalVbY + 3}
          fontSize={3}
          fontWeight={600}
          textAnchor="middle"
          fill="currentColor"
        >
          {title}
        </text>
      )}
      
      {dividerEls}
      {seatEls}
      {legendEls}
    </svg>
  );
});

ParliamentGraph.displayName = "ParliamentGraph";
