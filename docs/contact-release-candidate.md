# Contact release candidate (not deployed)

Open the comparison's “본판 반영 후보” link, or `/?contactCandidate=1` on the preview.
Normal URLs keep main-game behavior. Candidate uses the real Title/Mode/CharacterSelect/
StageSelect/VS/Battle/Result scenes, not the comparison harness. Rematch retains loaded
assets and candidate rules. Terminal KO/victory art uses the existing renderer again.

## Close T-rex bite

Replayed pre-fix first-close frame9 at root gaps250/300/450: mouth disks did not overlap
target hurt anatomy. The attacking mouth had already passed the target's head; this
was not solved by enlarging a body box. During opening the attacker now retracts by
`540-gap` for gaps<520, reaching the existing insertion pose by light f8/heavy f16.
Victim positions, mouth radius and forehead exclusion are unchanged. Recovery returns
to the starting root; no instantaneous target acquisition snap.

Both facings at250/300/450/540 hit with light11/heavy20;700 misses. Existing forehead-only
rejection and capture discontinuity tests still pass. This does not promise automatic
homing against every moving target or solve every wall-bound position.

## Missing Triceratops support pivots

Only `nearleg_back-` and `farleg_front-` change. Bake convex contours of alpha>128 opaque
leg pixels using `scripts/contact_feet.py`. Transform the contour through the current
base pose, find its ground baseline, solve a pivot on that baseline so rigid hit rotation
preserves the contour's bottom. No angle reduction, body lowering, or PNG edits.

Validation: idle, light f8, heavy f17, special f24; both facings; leg reaction +/-4.375
and +/-7 (1.6x stress). Exact opaque contour delta is0, and browser raster alpha>128
bottom delta is0px for all32 missing-direction cases. Previous maximum extra sinking
6.17/4.29 game px is removed for those fixtures. Other supplied pivots are unchanged;
all-feet/all-animation-perfect-grounding is NOT claimed. Hip seam appearance still needs
visual review because a foot-preserving rigid rotation can move the upper joint.

## Real game flow

Development Chrome automation uses actual keyboard events and advances Game's normal
fixed-step loop. All12 species: title -> 2-player mode -> grid pick -> stage -> loaded VS
-> fight -> two actual attack KOs -> Result -> confirm rematch. HP, round number, selected
species and candidate flag reset/retain as expected; movement and pause/resume checked.
To keep this a lifecycle test, defender HP=1 and starting distance are fixtures; it is NOT
a full-health balance playthrough. No forced result scene or phase. JS/HTTP errors0.
The diagnostic Game handle is DEV-only and stripped from production.

Production build has the candidate route and comparison link. Hardware controllers,
TV and speakers remain NOT TESTED. Deployment approval and3D remain outside this change.
