# 2D part-contact pilot

Scope: tyrannosaurus / triceratops only. The regular game remains legacy by default.
Open `contact-lab.html` (or `?contactLab=1`) for the side-by-side playable comparison.
Use the same keyboard/gamepad controls as the main game. Swap/mirror/reset, hit-region
overlays and repeatable head/torso/leg/tail probes are available. Probes are explicitly
labelled test projectiles, not new moves; damage and reaction go through `Match`.

## Design

- `contactPose()` returns part-local-to-world matrices for both rendering and combat.
  It uses fixed simulation time, facing, script transforms and bounded reaction offsets.
  The pilot does not apply a second render-only emotion transform or swap to a static
  hit sprite. Hit regions are hand-fitted circles inside solid anatomy, not the padded
  part-image rectangles. These are approximations, not per-pixel collision.
- Jaw/upper mouth and horn circles are the two species' melee attack regions. Existing
  script active windows and per-hit `landed` sets stay authoritative. No new tail
  attack is invented; tail is a hurt region. Roar projectiles spawn at the mouth.
- Whole-body/swept AABBs only reject candidates. Circle sweeps use relative motion
  and first time of impact; rectangular projectiles use a rounded-rectangle sweep.
  Facing changes reset history rather than sweeping an instant mirror across the arena.
- Contact records hold point, part, anatomical region, horizontal direction and time
  of impact. Damage multipliers are unchanged. Head, torso, leg and tail excite distinct
  critically damped-style springs. Springs never generate damage or root impulses.
- Reaction offsets clamp at head 12 degrees, torso 16 pixels, leg 7 degrees, tail 10
  degrees. Combined scripted head/jaw/leg/tail angles have additional limits. Neck
  attachment inherits the same parent matrix. Grounded one-piece legs bend affinely
  between their attached hip and planted endpoint: no free ragdoll or fabricated knee.
- Pushbox width is 42% of display height, independent of the wide head/tail silhouette.
  Wall residual separation transfers to the free fighter. Pilot step-in teleport is
  disabled; existing physical knockback remains. Grab carry anchors to jaw/horn contact.

## Review surface

Both panels receive the same input, but positions/results may diverge after different
collision outcomes. Cosmetic effects, hit brightness, trails, stars, camera shake,
cut-ins and audio are off. Damaging roar projectiles remain visible as gameplay objects.
The debug overlay can be hidden to judge contact without circles.

The supplied video shows 2 species x 3 probe regions, followed by real light attacks
and a mirrored attack. Probes use the real projectile hit resolution with 10 damage;
they demonstrate regional contact independently of the current move heights.

## Validation and limits

Run `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`.
The pilot tests cover mirror transforms, neck continuity, planted feet, spring limits
and settling, no extra damage, earliest single contact, fast sweeps, projectile corner
misses, wall separation, both species' actual light attacks and anatomical hits through
the Match damage path. Existing InputManager fake-pad regression tests remain enabled.

## Follow-up visual audit (2026-10-02)

`contactAudit.ts` is a deterministic capture harness (`?contactAudit=1`). Neck/foot
crops render at source-art pixel scale, with no camera tracking of reacting joints.
Each regional hit runs through Match's test projectile path, followed by 150 frames
of no input; it is explicitly separate from actual move footage. Both diagnostic and
unmarked versions are captured. The measured six regional trials settled all spring
values/velocities to zero by 120 frames. Raster foot sampling (alpha >128, every four
frames) found the bottom opaque pixel at ground-1, not below ground. This is sampled
evidence, not a universal pixel-level guarantee of every animation.

Confirmed fixes: two triceratops weapon centers were in transparent pixels (nearest
opaque art 42 and 23 source pixels away). Centers now lie on opaque horn/beak pixels,
and radii are narrower. Throw-behind also contained a legacy root teleport after
part-anchored carry; pilot throws now launch from the held position and retain the
contact metadata. Existing art is unchanged.

Recorded light/heavy hit vs miss starting gaps (both directions): T-rex 630/660 and
660/690; triceratops 620/650 and 540/570. These are root gaps, not visible tip distances.
Triceratops charge at 320 hits, 300 misses because active frames begin after the close
target has passed the horn; this is documented existing active-window behavior, not
silently retuned. T-rex roar has no grounded distance-only miss within the arena in
the sweep (300..1250 at 10px increments); far starts clamp to arena bounds and the
projectile still reaches. Its video is labelled maximum-distance hit, NOT a miss.
Therefore the requested six-move distance-only hit/miss evidence is not fully met.
Art seam quality and human visual acceptance remain reviewer-owned.

## Separate mouth-v2 pilot

`contact-lab.html?mouthV2=1` opts into the complete new T-rex PNG+rig set only.
Normal comparison and main game keep the approved old assets, including old jaw pivot.
No old painted head is overlaid on the v2 set. Jaw pivot comes from the new rig;
weapon stage points use that part matrix, so the new pivot automatically changes their
trajectory. `mouthOpenMax` clamps the negative opening angle to -26 degrees.
The existing recursive transform resolver already computes parents independently of
draw order; new tests explicitly cover the three back layers and inheritance for
head -12/0/+12 combined with jaw 0/-13/-26. Capture checks cover both facings (18 poses).
The artist's all-six-species zero-new-holes claim is NOT adopted: the master's noted
therizinosaurus 5171->5178 discrepancy remains the artist's follow-up. Only T-rex is loaded.

## Charge startup fix (2026-10-02)

Pilot-only `chargePilot.ts` inserts `xr:0` on the existing frame16 root key. Previously
the first explicit xr key was `xr:1` at frame40, so the sampler interpolated from an
implicit zero at frame0: frame15 had already consumed 37.5% of dashDistance. Global
passThrough also disabled body separation during startup. Together this let the horn
pass the close target before the active window.

Now frame0..16 uses xr=0, frame17..40 interpolates to the SAME xr=1 endpoint. The x
windup keys (-20/-10/-30), pose keys, active16..40, base damage26, reach900, total92
and all frame40+ root positions remain unchanged. Pass-through begins at activation;
startup uses normal pilot push separation. The source moves.json is unchanged and
the correction applies only with partContacts=true to triceratops_special. T-rex roar,
default game, and artwork are untouched.

Regression: both directions at root gaps180/250/280/300/310/320/600/1000; no damage
or root crossing before16, one damage event, true current-pose overlap at activation
for close cases. Damage is 28 HP after the existing triceratops species multiplier.
The unclamped range fixture scans1200..1900 in10px steps; last hit1590/first miss1600,
also matched against original script. Normal arena clamps prevent this root distance,
so the range video explicitly labels the no-wall fixture, not normal gameplay.

## Approved v3 integration and bite readability

The default contact comparison now loads `parts/integrated-v3` for both species,
without replacing the main game's assets. The v3 archive contains triceratops only;
T-rex comes from the artist-specified `trex/` in the hit-range v1 archive, including
backing and mouth-v2 once. The v1 archive's triceratops is NOT loaded.

Triceratops reactions rotate each leg around its directional `hitPivot`, transformed
by the complete base-pose matrix first. The mirrored facing reverses world rotation.
These final matrices drive both drawing and hurt regions. No body-lowering substitute
or affine planted-foot bend is applied to this v3 rig. The delivered table omits two
negative-sign pivots; those fall back to the supplied positive endpoint for that leg.
This is an explicit limitation, not a claim of zero foot pixel error.

Pilot T-rex light: open at4, insert through8, close/damage9..11; reopen15, insert20,
close/damage21..23; recover by36, total38. Damage remains5+6. Heavy: open10..16,
capture17..22, close to-6, head oscillates +/-8 through the existing six damage events,
release94. Held point is stored in target-part local coordinates with initial mouth
offset, so acquisition does not recenter the entire target. The old success jump to30
is disabled for this bite to avoid a discontinuity. Heavy total remains20 (14+6).
Only the small region between upper/lower mouth landmarks can acquire a bite; the
forehead circle and stale sweep are not used. Mouth clamps after composition at-26.

Tests use both directions: light/heavy normal hit at540 root gap, miss at700, exact
total damage, no acquisition position jump, forehead-only rejection, inherited back
layers, transformed directional foot anchors, and v3's approved close charge. The
comparison's left pane retains legacy combat logic with the same newly approved art;
it is not a byte-for-byte historical screenshot of the old art. Normal game defaults,
T-rex roar, inputs and art for the other ten species are unchanged.

Chrome checks cover all six probes, both real light attacks, mirror, fake two-pad
movement, simultaneous light, jump, crouch guard and Start pause. Physical controllers,
TV/speakers and human game feel are NOT TESTED. Existing art still has visible cutout
seams; artist revision is not merged. Static victory/down presentation is intentionally
not expanded in this pilot. This is an engineering review candidate, not art/QA approval.
