# Impact timing review1 (not deployed)

Baseline remote/main04d96dd and public bundle verified2026-10-11: asset version
b4e5e65f7b31,18approved terminal PNG hashes match, contact path inactive. Branch is
based directly on main; ca3f023 ground correction is NOT included. Its three defects
(Pachy special f46, Ptera light f7, Carno light f9) remain separate.

Review surface contact-lab.html in DEV: left can select public rules/original art OR
existing contact candidate; right adds impactTiming. This separates previous contact
work from new timing. Both are playable with the same keyboard/pad inputs. Sound is
right-only toggle; effects/shake are always off. No new screen-shake effect.

## Measured frames (60Hz)

Full HP, target walks toward attacker for first8frames, initial roots500/1040.
`real` counts simulation calls from input; `move` excludes stop and may branch for grabs.

| Technique | public damage move frames | contact / impact frames | stop contact -> impact | total damage |
|---|---|---|---|---|
| T-rex light |6,12|9,21 /9,21|4,6 ->4,4|11|
| T-rex held heavy |41,49,57,65,73,81; throw94|same|3each ->2each; throw0 unchanged|20|
| Trike charge |16|16 /16|9 ->6|28 scaled|
| Anky club heavy |14|14 /14|8 ->7|20 scaled|

Light public real hit6/16 vs contact9/25; impact9/25. Target actionable recovery after
last light damage20 ->18frames. Heavy hold contact release real112 ->106; actionable
84frames after throw unchanged. Charge recovery136 ->133 after hit; club86 ->85.
Light stun14 and push40/80 unchanged. Launch vx/vy charge-700/-1150, club520/-760;
held throw520/-620 unchanged in this mirrored-facing fixture. No damage/stun extension.

Damage-frame recoil: previous react() added spring velocity but hitstop froze value0,
delaying visible response until thaw. Candidate starts a bounded1(light)/2(heavy/special)
reaction offset on the same damage frame (max3), then uses the existing damped spring.
Held bites don't add this independent offset. Guard stop capped3; held ticks capped2.

Input presses were discarded before readInput during hitstop. Candidate stores latest
attack press, executes once at the first actionable frame (expires after120 non-stop
frames, clears at terminal), no auto-repeat. This is an explicit buffer behavior change.

## Audio evidence

Hit event and play request occur in the same update (<3ms in initial captures).
HTMLAudio `playing` follows request by about8–32ms in headlessChrome; this is browser
scheduling, NOT physical speaker onset. Existing light source measured mean-54.0dB,
peak-34.4dB; heavy mean-10.9dB/peak0.0dB. Review-only light copy gain+24dB measures
mean-30.4dB/peak-10.8dB after encoding. Original file and default mapping unchanged.
SFX voice pool prewarmed before play. Browser audio stream captured into sound-on video;
no fabricated timestamp track. Guard remains separate sound, miss emits no hit sound.

## Verification and limits

37new tests cover both sides/hit/miss/guard/wall, heavy grab release, unchanged damage
and hit counts, stop tiers, buffered single press, newer-input priority, reset, repeated
input followed by recovery. Full456 tests
and production build pass. Normal-speed full-HP recordings contain moving2P approach
and retreat, first public comparison then contact-only baseline, each sound off/on.
This is scripted movement, not an expert adversarial balance playtest. Contact points
are rig-circle evidence, NOT per-pixel contact certification. Some roots miss at walls;
we retain misses rather than enlarge whole-body boxes. No permanent-stun proof for all
possible player sequences; repeated-hit protection remains existing behavior.
Two virtual pads passed movement, simultaneous attack, jump, crouch guard, and Start
pause in the review surface. Hardware pads/TV/speakers NOT TESTED; reviewer owns
feel/contact verdict.
