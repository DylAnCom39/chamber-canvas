## Bug

In `src/lib/parliament/layouts.ts`, the Westminster `hbench` (and crossbench) draws the section divider at `startX + (colB - 0.5) * dx`, but `colB` is the column index right after the last seat of the previous section. With `SECTION_GAP_COLS = 1`, the empty column sits at `colB`, so the next section starts at `colB + 1`. The true midpoint between the last seat of section A (at `colB - 1`) and the first seat of section B (at `colB + 1`) is `colB`, not `colB - 0.5`. The divider currently lands a half-seat too close to section A.

## Fix

Place the divider at the midpoint between sections:

`x = startX + (colB + (SECTION_GAP_COLS - 1) / 2) * dx`

With `SECTION_GAP_COLS = 1` this simplifies to `startX + colB * dx`. Apply the same correction to the crossbench's horizontal divider (`y = startY + colB * dy`).

## Files to change

- `src/lib/parliament/layouts.ts` — two one-line fixes in the Westminster divider math (`hbench` + crossbench block).
