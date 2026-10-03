# 12-species contact review build

Development expansion only; main defaults and all approved PNGs/moves.json remain unchanged.
The comparison selector supports all 12 species, using integrated-v3 only for the original
two species and each other species' existing `partsPath`. Both panels use the same art.

## Contact and reaction

- `scripts/contact_profiles.py` bakes conservative interior disks from PNG alpha (>=220),
  4px sampling, 5px inset, max12 disks per part. Requires Pillow/numpy/scipy only for regeneration.
  Runtime needs no image readback. These are an approximation, not pixel-perfect collision.
- `contactProfiles.ts` selects actual striking anatomy per technique: hands/claws, feet,
  horns/head, tail or neck. The final render matrices also position all hurt/weapon disks.
- Existing damped region reactions apply to all species. Authored attack joint rotations
  are preserved rather than clipped to the original two species' limits. Brachiosaurus retains
  its approved split-neck limits. Negative sx uses positive geometric radii.
- Ground-only quake hits retain their authored area and jump evasion. Projectiles retain
  authored origins and use the existing swept rectangle-vs-body-region narrow phase.
- Pteranodon flying replacement and Dilophosaurus crest are drawn again in the contact path.
  Flying hurt/weapon disks use the replacement image's stage transform, not invisible idle legs.
  Instant facing/sx flips and topology replacements are not swept as physical travel.

## Local corrections

Only review-mode height keys change through `expandedPilotMove`; hits, grab windows, event
damage, total duration, inputs and source move data are unchanged:

- Spinosaurus special: emergence f41 y0, peak f46 y-80. Old anatomy stayed above grounded targets.
- Pachycephalosaurus special: impact f46 y0, rebound f50 y-35 (previous -333.45/-368.55).
- Pteranodon special: f26 y-90 (previous -200), bringing drawn talons into contact.

## Verification (2026-10-02)

54 new tests: 12 species x3 moves x2 facings x5 gaps (250/450/540/650/850), off-path misses,
authored event/damage upper bounds, all move frames finite, mirrored region reactions,
144 ordered species-pair narrow-phase checks, flight replacement, quake jump evasion,
counter success branch and immutable source scripts. The 144-pair check is geometric,
NOT a full match balance/playtest of every pairing. In-engine move scans use Triceratops
as defender, including a mirror match. At least one tested distance hits for every move.
Full suite317/317 and production build passed at this checkpoint.

Browser production build: added10 species x3 moves actually simulated and recorded at
normal speed, both harness and selectable comparison routes loaded, no JS/HTTP errors.
Virtual2-pad regression passed. Physical pads/TV/speakers NOT TESTED. Visual acceptance
and all-species gameplay balance belong to reviewer/QA, not the test count.

## Triceratops missing pivots: measured, not declared fixed

Missing keys are `nearleg_back-` and `farleg_front-`. Opposite-sign fallback is still used.
Measured alpha>128 opaque contour bottoms transformed by exact runtime matrices, against
the SAME authored pose without added leg reaction; idle, light f8, heavy f17, special f24,
both facings, reaction +/-4.375 and +/-7 (1.6x stress). Positive delta means sinking.

| Missing direction | Extra lift range | Max extra sinking | Original-stage equivalent |
| --- | --- | --- | --- |
| nearleg_back- | up to0.78 game px | 6.17 game px (special f24, -7) | -2.05 to+16.17 art px |
| farleg_front- | none in sampled cases | 4.29 game px (special f24, leg reaction+7 -> far leg-4.2) | +5.05 to+11.24 art px |

This does NOT reproduce the artist's <=5 art-pixel claim under all runtime combinations.
No art rewrite or speculative fitted pivot was applied. This remains a local pre-main
grounding issue, not a blocker to developing the other species.

## Remaining limits

- Conservative disk coverage misses some thin edges; not per-pixel and not a final balance pass.
- New species' leg reactions retain authored hip pivots; full planted-foot rigs not invented.
- Flight replacement is one approved image: head/leg contact labels exist, but independent
  head/leg bending during that replacement cannot be shown without new split art. Torso reaction
  still moves it. Existing grab carry script is retained for Pteranodon; not a new attachment rig.
- Contact renderer still doesn't reproduce every main-game down/victory/guard presentation.
- Original T-rex bite has a close root-gap dead zone (250/450 miss,540 hit in fixture); expansion
  does not silently widen its mouth collision or claim every proximity hits.
- Production/main release and3D are not approved by this development handoff.
