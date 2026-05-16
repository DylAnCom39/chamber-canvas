## Changes

### 1. Column-by-column seat ordering in hemicycle / horseshoe

Today `arcLayout` walks groups → rows → seats, so within a group it fills the innermost row first, then the next, then the next. Visually that reads as "row by row". When no sections are defined, the entire diagram is one group, so a single party's seats fan out one ring at a time and parties end up stacked in concentric bands.

Fix: switch the placement order to walk **columns first**. A "column" is a radial wedge that crosses every row at the same normalized `u`. For each group:
- Compute per-row allocations as today (proportional to row capacity).
- Determine the number of columns = the max allocation across rows in that group.
- Iterate column index `k` from 0 to columns-1, and for each column, place one seat in every row that still has capacity at that column index, going inner row → outer row.
- Seats are pulled from the group's queue in that column-major order.

Result: the first seats of a party fill the first wedge across all rows, then the next wedge, etc. — matching how parliament diagrams normally read.

Alignment within a group: place each row's seats cell-centered against the group's column count (not the row's own count) so columns line up radially.

### 2. Westminster: government and opposition face vertically

Currently opposition is placed left of the aisle and government right (`-aisle/2` / `+aisle/2` with `dirX` ±1). Crossbench sits above.

Change to vertical facing:
- **Opposition** above the aisle (rows grow upward).
- **Government** below the aisle (rows grow downward).
- **Crossbench** moves to the side (right of the chamber) so it doesn't collide.
- The aisle becomes a horizontal gap between the two facing benches.

Implementation: rewrite the `bench()` helper to take an axis. Rows extend along Y (vertical stacking of bench rows) and columns extend along X. Opposition uses `originY = -aisle/2` growing up (`dirY = -1`); government uses `originY = +aisle/2` growing down (`dirY = +1`). Both share the same X axis so they face each other across a horizontal aisle. Section dividers become horizontal lines between column groups (still perpendicular to the bench length). Crossbench is repositioned to the right with vertical rows.

### 3. Divider visibility toggle

- Add `showDividers: boolean` to `ParliamentConfig` in `src/lib/parliament/types.ts` (default `true`).
- Initialize it in `src/routes/index.tsx`.
- Add a `Switch` in `ControlsPanel.tsx` under the Sections card labeled "Show section dividers".
- In `ParliamentGraph.tsx`, only render `dividerEls` when `config.showDividers` is true.

## Files to change

- `src/lib/parliament/layouts.ts` — column-major placement in `arcLayout`; vertical Westminster bench layout.
- `src/lib/parliament/types.ts` — add `showDividers`.
- `src/routes/index.tsx` — default `showDividers: true`.
- `src/components/ControlsPanel.tsx` — add toggle.
- `src/components/ParliamentGraph.tsx` — gate divider rendering on `showDividers`.

## Open question

For Westminster facing vertically: should crossbench move to the **right side** of the chamber (vertical rows next to gov/opp) or stay above/below the aisle line? I'm proposing right side to keep the gov/opp facing axis clean — confirm or override.
