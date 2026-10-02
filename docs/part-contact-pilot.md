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

Chrome checks cover all six probes, both real light attacks, mirror, fake two-pad
movement, simultaneous light, jump, crouch guard and Start pause. Physical controllers,
TV/speakers and human game feel are NOT TESTED. Existing art still has visible cutout
seams; artist revision is not merged. Static victory/down presentation is intentionally
not expanded in this pilot. This is an engineering review candidate, not art/QA approval.
