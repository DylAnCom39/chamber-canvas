## Goal

Make section dividers in the hemicycle and horseshoe layouts read as clean, hard straight lines between groups of seats, rather than the current "skip a couple of slots" gaps that can look ragged.

## Current behaviour

In `src/lib/parliament/layouts.ts`, sections are separated by inserting `SECTION_GAP = 2` blank seat slots into the flat seat list before placement. Because seat counts per row differ, those blank slots fall at slightly different radial angles in each row, so the resulting gap looks like a soft staircase instead of a crisp line.

## Proposed approach

1. Stop using "blank seat slots" for separation. Instead, compute section boundaries as **angular cuts** that are identical for every row.
   - Hemicycle: pick angles in the range π → 0 where one section ends and the next begins. Every row uses the same angle boundaries, so the empty wedge between sections is a perfectly straight radial line from the inner row to the outer row.
   - Horseshoe: do the same along the U's parameter (left arm 0..1, arc 1..2, right arm 2..3). Every row cuts at the same parameter, giving straight horizontal gaps on the arms and straight radial gaps on the curved base.

2. Allocate seats per section proportionally to that section's total seats, then within each section fill rows inner-to-outer (or by even radial distribution) using the existing `place()`/key sorting.

3. Render an optional thin divider line in the SVG along each cut for extra visual clarity (toggleable, default on). This guarantees the "hard straight line" look even when the gap itself is narrow.

4. Add a configurable **gap width** (in seat-spacing units) on the parliament config so the user can tune how wide the empty wedge is. Default to something visibly clean (e.g. 1.5 seat widths of angular space).

5. Westminster is unchanged — sections there are already physically grouped on rectangular benches.

## Technical details

- Replace `flattenWithSections` for arc layouts with a per-section allocator:
  - Compute `totalSeats` and each section's share of the arc's total parameter length (minus the fixed gap budget).
  - For each row, derive that row's seat count per section by proportional allocation against the section's angular span on that row.
  - Place seats with the existing `place(j, n)` math, but offset `t` so it falls inside the section's `[tStart, tEnd]` window.
- Update `placeArc` to accept pre-bucketed section assignments instead of a flat item list.
- In `ParliamentGraph.tsx`, draw a 1px divider `<line>` (color: `hsl(var(--border))` or current text color) at each boundary angle, spanning from inner row radius to outer row radius. Make this controlled by a new `showDividers` boolean on the config.
- Extend `ParliamentConfig` with `sectionGap: number` (units of seat spacing) and `showDividers: boolean`, plus controls in `ControlsPanel.tsx` (slider + switch) under the Sections card.

## Files to change

- `src/lib/parliament/layouts.ts` — new section-aware arc allocator, divider boundary export.
- `src/components/ParliamentGraph.tsx` — render divider lines from boundaries.
- `src/lib/parliament/types.ts` — add `sectionGap`, `showDividers` to `ParliamentConfig`.
- `src/components/ControlsPanel.tsx` — UI for the two new options.
- `src/routes/index.tsx` — initialise the two new config fields.

## Open question

Do you want the divider rendered as a visible line, just a clean empty gap, or both (line + gap)?
