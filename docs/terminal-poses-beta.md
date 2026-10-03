# Terminal pose beta audit — approved art connected

Approved integration: all12 down PNGs from reaction ZIP, four victory PNGs (brachio/spino/
carno/dilo) from fix6, and trex/trike victory from winfix. Files are copied byte-for-byte;
the SHA256 manifest is `terminal-art-manifest.json`. Rig paths/usability/alpha boxes/feet
are measured from those exact PNGs. All24 terminal slots now have usable art; fallback
labels are removed. Content-based asset version changes with PNG and rig content.
The original audit below records the diagnosed BEFORE state, not a remaining art blocker.

Source diagnosis (current approved assets): Brachiosaurus victory alpha reaches y=0;
T-rex, Spinosaurus and Triceratops also reach the top source edge. Camera fitting cannot
restore missing source pixels. These four temporarily use the intact master at normal
aspect ratio. This is not a replacement victory artwork approval.

Only T-rex has a usable down pose. The other11 rig entries are unusable and several PNGs
contain only small fragments. They must NOT be blindly enabled. The previous fallback
squashed a living master while frozen at an airborne y. Artist inspection/replacement
is in parallel. Until replacement, a normal-ratio master with “다운 포즈 교체 대기” is
explicitly displayed. It is still NOT acceptable beta down art; do not ship this state.

Engine changes:
- Round end clears held links, bite anchor, script scale/rotation, ghosts, recoil,
  velocity, guard, dash, stun and buffered controls. Both actors switch terminal state.
- Gravity continues during roundOver; match/result transition waits for landing.
- Dedicated terminal rendering avoids normal emotion/bob/squash transforms, fits uniformly
  to arena horizontal margins and top headroom and grounds at pose alpha-box bottom.
- Pteranodon keeps its supplied airborne-looking victory artwork; physical root settles.
- Normal combat and prior close-bite/support-pivot fixes remain unchanged.

Verification:
-73 new tests:12 species x2 loser/player sides x ground/air/hold scenarios, plus all-species
 uniform layout tests at both walls. Full suite407/407; production build passed.
-72 browser terminal fixtures land at y0/vy0, clear attachment and script visuals. KO fixture
 starts with depleted health and specified airborne/hold state; this isolates round transition,
 not end-to-end capture/damage. Video explicitly begins after the damage fixture.
-12-species actual keyboard select->battle->two attack KOs->result->rematch rerun passes
 (HP1 lifecycle fixture). No JS/HTTP errors. Physical controller/TV/speaker NOT TESTED.
-Two12-row sheets show both outcomes. The missing-art labels are intentional; automated
 state checks do not certify expression quality. Artist source corrections must be integrated
 and terminal evidence regenerated before the beta verdict.

Original art blockers above are resolved by approved PNG integration. Remaining: reviewer
visual acceptance and production deployment approval. No full-art rebuild or balance gate added.
