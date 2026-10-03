# Ground-support candidate (not a deployment request)

Based on public beta04d96dd, which already preserves the contact-expansion history.
DEV contactCandidate/compare paths enable the existing12-species candidate; public
main and Pages remain unchanged. No artist rootY table is applied.

Measure the alpha>128 bottom55-source-pixel band of leg PNGs, not the bottom of the
entire sprite (tail/wing). Store convex contours; transform them with the same final
matrices as drawing and hit regions, including script movement and region reaction.
The deepest of the two actual feet is the support sample. This is geometric support,
not a gait/contact-force model; a lifted other foot is not forced to the floor.

Only Pachycephalosaurus/Pteranodon/Carnotaurus receive candidate support correction,
only onGround and y0, excluding hidden-body flight, sink, held/down/victory and v3 rigs.
Fighter correction state advances at most2 game pixels per fixed frame, bounded50.
Common pose matrices and stage receive the same Y offset before all hurt/weapon disks.
At an abrupt pose change, the applied offset is clamped so old correction never makes
the new frame worse than uncorrected. That safety clamp and air transitions can reset
offset; it is NOT proof that all visual transitions are continuous.

Actual engine scan:3 species x3 moves x2 directions x with/without real leg-projectile
hit at frame12 x150 frames=5400 samples. Ground only, no-hit results below are game px,
mean absolute foot offset includes preparation/recovery/rest within the150frame window.

| Species/move | mean before -> after | max before -> after |
|---|---:|---:|
| Carno light |2.10 ->0.74|16.59 ->15.31|
| Carno heavy |2.61 ->0.47|15.16 ->11.04|
| Carno special |6.56 ->0.92|15.47 ->11.17|
| Pachy light |0.89 ->0.15|9.66 ->5.84|
| Pachy heavy |2.35 ->0.85|20.97 ->18.97|
| Pachy special |6.97 ->4.74|47.54 ->45.54|
| Ptera light |2.38 ->1.09|20.23 ->19.66|
| Ptera heavy |1.76 ->0.44|15.91 ->13.91|
| Ptera special |0.41 ->0|0.94 ->0|

Before/after all aerial y and transformed foot contours match exactly. Do NOT apply
artist's pachy+81/+113 or ptera flight root offsets: these include intentional air poses.
v3 support solver is untouched. Source points are converted by runtime spriteScale and
full affine matrices; numbers above are not2048x1536 source-pixel claims.

Residual blockers for accepting this correction: Pachy special f46 first-ground sample
still sinks45.54px; Ptera light f7 floats19.66px; Carno light f9 floats15.31px.
Do not publish this as complete planting. Rate limiting alone cannot both cancel an
abrupt authored pose and guarantee a continuous body transition. A narrowly scoped
landing/pose interpolation pass and normal-speed visual review remain necessary.
Walking gait and other species aren't certified by this attack scan.

437 tests pass, production build passes.18new tests cover both facings/all9moves,
bounded state, air unchanged, common hurt/weapon translation, no worse per-frame
support magnitude, terminal reset. Prior close bite/v3/terminal regressions retained.
Hardware pads/TV/speakers remain NOT TESTED. No3D or main deployment.
