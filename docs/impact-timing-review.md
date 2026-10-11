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
attack press, executes once at the first actionable frame within the first8 non-stop
frames after thaw; expires before frame9 consumption, including time held. Additional
hitstop pauses age but never renews it. Only a new press replaces/renews it. Clears at
terminal and round reset; no auto-repeat. Eight is a review criterion, not final balance.

## Audio evidence

Hit event and play request occur in the same update (<3ms in initial captures).
HTMLAudio `playing` follows request by about8–32ms in headlessChrome; this is browser
scheduling, NOT physical speaker onset. Existing light source measured mean-54.0dB,
peak-34.4dB; heavy mean-10.9dB/peak0.0dB. Review-only light copy gain+24dB measures
mean-30.4dB/peak-10.8dB after encoding. Original file and default mapping unchanged.
SFX voice pool prewarmed before play. Browser audio stream captured into sound-on video;
no fabricated timestamp track. Guard remains separate sound, miss emits no hit sound.

## Verification and limits

45new combat tests cover both sides/hit/miss/guard/wall, heavy grab release, unchanged damage
and hit counts, stop tiers, buffered single press, newer-input priority, reset, repeated
input followed by recovery, frame8/9 boundary, long stun/hold expiry, additional stop,
latest replacement and held buttons. One audio gain/pool regression added. Full465 tests
and production build pass. Normal-speed full-HP recordings contain moving2P approach
and retreat, first public comparison then contact-only baseline, each sound off/on.
This is scripted movement, not an expert adversarial balance playtest. Contact points
are rig-circle evidence, NOT per-pixel contact certification. Some roots miss at walls;
we retain misses rather than enlarge whole-body boxes. No permanent-stun proof for all
possible player sequences; repeated-hit protection remains existing behavior.
Two virtual pads passed movement, simultaneous attack, jump, crouch guard, and Start
pause in the review surface. Hardware pads/TV/speakers NOT TESTED; reviewer owns
feel/contact verdict.

## Review2 paired measurement

Identical integrated contact assets, root500/1040, input0 attack, target walks left
frames0–7; no public-art comparison in this table. All numbers are simulation frames
from the input (frame0). Recoil = first nonzero spring pose (not pixel certification).
Stop-end = post-step counter becomes0; pose advances on the following step.

| Move | Damage contact / review | First recoil | Stop-end | Actionable recovery |
|---|---|---|---|---|
| T-rex light |9,25 /9,25|14 /9|13,31 /13,29|45 /43|
| Trike special |16 /16|26 /16|25 /22|152 /149|
| Anky heavy |14 /14|23 /14|22 /21|100 /99|
| T-rex held heavy |41,52,63,74,85,96,112 /41,51,61,71,81,91,106|45 /44|44,55,66,77,88,99,112 /43,53,63,73,83,93,106|196 /190|

Held heavy deliberately excludes the immediate independent recoil offset to preserve
attachment. Total damage is unchanged; shorter held stops explain later hit differences.

### Audio overlap follow-up

OfflineAudioContext decoded actual MP3s and summed three voices at0/100/200ms and at
the identical start time, both channels. At old volume0.8, heavy100ms burst reached
+5.22dBFS (4426 samples >=1); block simultaneous triplet reached+0.31dBFS. This is a
digital mix test, not a recorded speaker observation. Review-only impacts now use
gain0.25; default public gain stays1. At maximum master volume1, light/heavy/block
100ms bursts peak-22.88/-4.88/-18.13dBFS; aligned triplets-13.34/-2.55/-9.79dBFS,
all zero over-range samples. This proves the tested triplets only, not arbitrary mixed
BGM/other SFX or speaker output. Existing per-id three-voice pool remains in place.
Actual Match events: standing guard2 guard sounds, hit2 light sounds, miss0 impact
sounds. Crouching at the earlier fixture avoided the bite entirely, so absence of a
sound there was a miss, not proof of a guard; standing-guard regression now asserts2.
Right-only audio still cannot establish a left/right preference. Earlier videos predate
this review gain; use the live preview for the updated audio level.
