import type { Fighter } from './Fighter';
import { applyAffine, multiply, partTransforms, walkPartAngles, type Affine } from '../rendering/partRig';
import { spriteScale } from '../rendering/rig';
import type { Rect } from './types';
import { CONTACT_PROFILES, weaponParts } from './contactProfiles';
import footContours from '../data/contactFeet.json';

export type BodyRegion = 'head' | 'torso' | 'leg' | 'tail';
export interface Circle { x: number; y: number; r: number }
export interface HurtCircle extends Circle { region: BodyRegion; part: string }
export interface Contact { x: number; y: number; region: BodyRegion; part: string; direction: 1 | -1; t: number }
export interface ContactPose {
  matrices: Record<string, Affine>;
  hurt: HurtCircle[];
  weapon: Circle[];
  bounds: Rect;
  mouth: Circle;
  /** Original-stage to world transform, also used by approved replacement art. */
  stage: Affine;
}
export interface Spring { value: number; velocity: number }
export type Reaction = Record<BodyRegion, Spring>;
export const newReaction = (): Reaction => Object.fromEntries(
  ['head', 'torso', 'leg', 'tail'].map(k => [k, { value: 0, velocity: 0 }]),
) as Reaction;
export const REACTION_LIMITS: Record<BodyRegion, number> = { head: 12, torso: 16, leg: 7, tail: 10 };

export function stepReaction(reaction: Reaction, dt: number): void {
  // Fixed/substepped damped springs. Never feed displacement back into damage or root velocity.
  const n = Math.max(1, Math.ceil(Math.min(dt, 0.1) * 120));
  const h = Math.min(dt, 0.1) / n;
  for (const region of Object.keys(reaction) as BodyRegion[]) {
    const s = reaction[region];
    for (let i = 0; i < n; i++) {
      s.velocity += (-190 * s.value - 22 * s.velocity) * h;
      s.value += s.velocity * h;
      const limit = REACTION_LIMITS[region];
      if (Math.abs(s.value) > limit) { s.value = Math.sign(s.value) * limit; s.velocity = 0; }
    }
    if (Math.abs(s.value) < 0.015 && Math.abs(s.velocity) < 0.04) s.value = s.velocity = 0;
  }
}

export function react(f: Fighter, contact: Contact): void {
  f.lastContact = contact;
  const s = f.reaction[contact.region];
  // Art angles are counter-clockwise: incoming force in the facing direction tips the head back.
  const sign = -contact.direction * f.facing;
  s.velocity = Math.max(-220, Math.min(220, s.velocity + sign * (contact.region === 'torso' ? 200 : 150)));
}

export const supportsContact = (f: Fighter): boolean =>
  f.partContacts && !!f.assets.parts && !!f.assets.rig &&
  (['tyrannosaurus', 'triceratops'].includes(f.data.id) || !!CONTACT_PROFILES[f.data.id]);

export const expandedContact = (f: Fighter): boolean => !!CONTACT_PROFILES[f.data.id];

// Hand-fitted interior circles in the original art stage, NOT image bounding rectangles/cap disks.
// Overlap covers solid flesh; narrow horn tips are weapons, not huge rectangular hurt regions.
type LocalCircle = [part: string, region: BodyRegion, x: number, y: number, r: number];
const TREX: LocalCircle[] = [
  ['head', 'head', 1480, 355, 185], ['head', 'head', 1750, 365, 175],
  ['jaw', 'head', 1720, 495, 55],
  ['torso', 'torso', 1030, 785, 205], ['torso', 'torso', 1240, 720, 145],
  ['nearleg', 'leg', 785, 1080, 95], ['nearleg', 'leg', 790, 1210, 60],
  ['farleg', 'leg', 1190, 1100, 85], ['farleg', 'leg', 1230, 1220, 50],
  ['tailbase', 'tail', 665, 795, 95], ['tailtip', 'tail', 350, 745, 55],
];
const TRIKE: LocalCircle[] = [
  ['head', 'head', 1530, 690, 180], ['head', 'head', 1750, 895, 135],
  ['torso', 'torso', 790, 865, 215], ['torso', 'torso', 1100, 820, 210],
  ['nearleg_back', 'leg', 590, 1165, 65], ['farleg_back', 'leg', 825, 1160, 60],
  ['nearleg_front', 'leg', 1070, 1180, 65], ['farleg_front', 'leg', 1370, 1175, 65],
  ['tailbase', 'tail', 515, 970, 65], ['tailtip', 'tail', 220, 1020, 38],
];
const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
const clamp = (v: number, n: number): number => Math.max(-n, Math.min(n, v));

/** Single authoritative pose used by both canvas drawing and collision at simulation time. */
export function contactPose(f: Fighter): ContactPose {
  const rig = f.assets.parts!.rig;
  const master = f.assets.rig!;
  const scale = spriteScale(f.data.displayHeight, master.master.box);
  const expanded = expandedContact(f);
  let angles: Record<string, number> = { ...(f.scriptVisual?.parts ?? {}) };
  if (!f.scriptVisual && f.state === 'walk') {
    const walk = f.assets.parts!.motions.motions.walk;
    if (walk) angles = walkPartAngles(walk, f.poseTime);
  }
  // New species keep authored attack angles: only the added reaction is bounded.
  angles.head = expanded ? (angles.head ?? 0) + f.reaction.head.value : clamp((angles.head ?? 0) + f.reaction.head.value, 28);
  angles.jaw = Math.max(-(rig.mouthOpenMax ?? (expanded ? 30 : 28)), Math.min(0, angles.jaw ?? 0));
  angles.tailbase = expanded ? (angles.tailbase ?? 0) + f.reaction.tail.value : clamp((angles.tailbase ?? 0) + f.reaction.tail.value, 16);
  if (!expanded) angles.tailtip = clamp(angles.tailtip ?? 0, 20);
  if (rig.parts.neck2) {
    const each = clamp(((angles.neck ?? 0) + (angles.neck2 ?? 0)) / 2, 8);
    angles.neck = each; angles.neck2 = each; angles.head = clamp(angles.head, 18);
  }
  for (const name of rig.drawOrder.filter(n => n.includes('leg'))) {
    const value = (angles[name] ?? 0) + f.reaction.leg.value * (name.includes('near') ? 1 : -0.6);
    angles[name] = rig.hitPivot ? (angles[name] ?? 0) : expanded ? value : clamp(value, 12);
  }
  const placed = partTransforms(rig, angles);
  const visual = f.scriptVisual;
  const rot = clamp(visual?.rot ?? (f.state === 'held' ? f.heldRot : 0), Math.PI / 12);
  const sx = visual?.sx ?? 1;
  const sy = (visual?.sy ?? 1) * (f.state === 'crouch' ? 0.78 : 1) * (rig.hitPivot || expanded ? 1 : 1 - Math.abs(f.reaction.leg.value) * 0.012);
  const pivot = -f.data.displayHeight * 0.45;
  const c = Math.cos(rot), s = Math.sin(rot);
  const body = multiply(translate(f.x, f.y + (expanded ? visual?.sink ?? 0 : 0)), multiply([f.facing, 0, 0, 1, 0, 0],
    multiply(translate(-f.reaction.torso.value, pivot), multiply([c * sx, s * sx, -s * sy, c * sy, 0, 0],
      multiply(translate(0, -pivot), [scale, 0, 0, scale, -master.root.x * scale, -master.root.y * scale])))));
  const matrices: Record<string, Affine> = {};
  for (const name of rig.drawOrder) matrices[name] = multiply(body, placed[name]);

  // Grounded leg endpoints stay planted while hips follow the torso. A bounded affine bend
  // replaces rigid leg rotation (this one-piece art has no knee); hip attachment remains exact.
  if (rig.hitPivot) {
    for (const name of rig.drawOrder.filter(n => n.includes('leg'))) {
      const angle = f.reaction.leg.value * (name.includes('near') ? 1 : -0.6);
      const p = rig.parts[name];
      const contour = (footContours as Record<string,number[][]>)[name];
      if (f.data.id === 'triceratops' && angle < 0 && !rig.hitPivot[name+'-'] && contour) {
        matrices[name] = rotateAtSupport(matrices[name], contour, angle * f.facing);
        continue;
      }
      // Sparse author table: a missing sign uses the supplied opposite foot endpoint.
      const foot = rig.hitPivot[name + (angle >= 0 ? '+' : '-')] ?? rig.hitPivot[name + (angle >= 0 ? '-' : '+')];
      if (foot) matrices[name] = rotateAtTransformedPoint(matrices[name], foot.x - p.offsetX, foot.y - p.offsetY, angle * f.facing);
    }
  } else if (!expanded && f.onGround && f.state !== 'held') {
    for (const name of rig.drawOrder.filter(n => n.includes('leg'))) {
      const p = rig.parts[name];
      const m = matrices[name];
      const px = (p.pivotX ?? p.offsetX) - p.offsetX;
      const py = (p.pivotY ?? p.offsetY) - p.offsetY;
      const footX = px, footY = p.height - 5;
      const [x, y] = applyAffine(m, footX, footY);
      const targetX = f.x + f.facing * ((p.offsetX + footX - master.root.x) * scale);
      const targetY = f.y + (p.offsetY + footY - master.root.y) * scale;
      const dy = Math.max(1, footY - py);
      const cx = (targetX - x) / dy, cy = (targetY - y) / dy;
      m[2] += cx; m[3] += cy; m[4] -= cx * py; m[5] -= cy * py;
    }
  }
  const circle = (part: string, x: number, y: number, r: number): Circle => {
    const p = rig.parts[part], m = matrices[part];
    const at = applyAffine(m, x - p.offsetX, y - p.offsetY);
    return { x: at[0], y: at[1], r: r * Math.min(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3])) };
  };
  const flying = expanded && visual?.overlays.some(o => o.hideBody);
  if (flying) matrices.flight = body;
  const local = flying ? CONTACT_PROFILES.pteranodon_flight : CONTACT_PROFILES[f.data.id] ?? (f.data.id === 'tyrannosaurus' ? TREX : TRIKE);
  const hurt = local.map(([part, region, x, y, r]) => {
    if (part === 'flight') { const [wx,wy]=applyAffine(body,x,y); return {x:wx,y:wy,r:r*scale*Math.min(Math.abs(sx),Math.abs(sy)),part,region}; }
    return { ...circle(part, x, y, r), part, region };
  });
  const upper = expanded ? hurt.find(c=>c.region==='head')! : circle('head', 1810, 405, 14);
  const lower = expanded ? upper : circle('jaw', 1810, 430, 14);
  const mouth = { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2, r: Math.max(4, Math.min(12, Math.hypot(upper.x - lower.x, upper.y - lower.y) / 2)) };
  const selected = weaponParts(f.data.id, f.attack?.move.kind);
  const weapon = expanded ? hurt.filter(c=>flying ? c.region===(f.attack?.move.kind==='special'?'leg':'head') : selected.includes(c.part)) : integratedBite(f) ? [mouth] : f.data.id === 'tyrannosaurus'
    ? [circle('jaw', 1845, 490, 65), circle('head', 1880, 385, 60)]
    : [circle('head', 1920, 600, 20), circle('head', 1810, 650, 14), circle('head', 1850, 860, 12)];
  return { matrices, hurt, weapon: weapon.length ? weapon : [mouth], mouth, stage: body, bounds: circleBounds(hurt) };
}

export function integratedBite(f: Fighter): boolean {
  return supportsContact(f) && f.data.id === 'tyrannosaurus' && !!f.assets.parts?.rig.parts.backing && f.attack?.move.kind !== 'special';
}

/** Artist's rest-stage foot coordinate must first pass through the full base pose. */
export function rotateAtTransformedPoint(m: Affine, x: number, y: number, degrees: number): Affine {
  const [px, py] = applyAffine(m, x, y);
  const a = -degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return multiply(translate(px, py), multiply([c, s, -s, c, 0, 0], multiply(translate(-px, -py), m)));
}

/** Missing signed pivots: solve a support pivot on the CURRENT silhouette baseline.
 * A rigid rotation keeps the opaque contour's bottom unchanged, including attack poses.
 * No body lowering, angle reduction, or geometry widening is used.
 */
export function rotateAtSupport(m: Affine, contour: number[][], degrees: number): Affine {
  const a=-degrees*Math.PI/180,s=Math.sin(a),c=Math.cos(a);
  if(Math.abs(s)<1e-8)return m;
  const points=contour.map(([x,y])=>applyAffine(m,x,y));
  const py=Math.max(...points.map(p=>p[1]));
  const rotatedBottom=Math.max(...points.map(([x,y])=>s*x+c*y));
  const px=(rotatedBottom-c*py)/s;
  return multiply(translate(px,py),multiply([c,s,-s,c,0,0],multiply(translate(-px,-py),m)));
}

export function circleBounds(cs: Circle[]): Rect {
  return { left: Math.min(...cs.map(c => c.x - c.r)), right: Math.max(...cs.map(c => c.x + c.r)),
    top: Math.min(...cs.map(c => c.y - c.r)), bottom: Math.max(...cs.map(c => c.y + c.r)) };
}

/** Analytic relative-motion circle sweep: earliest impact, including both fighters moving. */
export function sweepCircle(a0: Circle, a1: Circle, b0: Circle, b1: Circle): number | null {
  const x = a0.x - b0.x, y = a0.y - b0.y;
  const dx = a1.x - a0.x - b1.x + b0.x, dy = a1.y - a0.y - b1.y + b0.y;
  const r = Math.max(a0.r, a1.r) + Math.max(b0.r, b1.r);
  const c = x * x + y * y - r * r;
  if (c <= 0) return 0;
  const aa = dx * dx + dy * dy, bb = 2 * (x * dx + y * dy);
  if (aa < 1e-12) return null;
  const discriminant = bb * bb - 4 * aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}

export function findContact(a: Circle[], b: HurtCircle[], oldA = a, oldB = b, fallback: 1 | -1 = 1): Contact | null {
  let best: Contact | null = null;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const pa = oldA[i] ?? a[i], pb = oldB[j] ?? b[j];
    const t = sweepCircle(pa, a[i], pb, b[j]);
    if (t === null || (best && t >= best.t)) continue;
    const ax = pa.x + (a[i].x - pa.x) * t, ay = pa.y + (a[i].y - pa.y) * t;
    const bx = pb.x + (b[j].x - pb.x) * t, by = pb.y + (b[j].y - pb.y) * t;
    const d = Math.hypot(ax - bx, ay - by) || 1;
    const dx = a[i].x - pa.x - b[j].x + pb.x;
    best = { x: bx + (ax - bx) / d * b[j].r, y: by + (ay - by) / d * b[j].r,
      region: b[j].region, part: b[j].part, direction: Math.abs(dx) > 0.01 ? (dx > 0 ? 1 : -1) : fallback, t };
  }
  return best;
}

/** Projectile rectangles use circle-vs-rect narrow phase, not the whole-body candidate box. */
export function rectContact(box: Rect, hurt: HurtCircle[], direction: 1 | -1): Contact | null {
  for (const h of hurt) {
    const x = Math.max(box.left, Math.min(box.right, h.x));
    const y = Math.max(box.top, Math.min(box.bottom, h.y));
    if ((x - h.x) ** 2 + (y - h.y) ** 2 <= h.r ** 2) return { x, y, region: h.region, part: h.part, direction, t: 1 };
  }
  return null;
}

/** Swept axis-aligned projectile vs moving circular regions (rounded-rectangle Minkowski sum). */
export function sweptRectContact(before: Rect, after: Rect, hurt: HurtCircle[], oldHurt: HurtCircle[], direction: 1 | -1): Contact | null {
  const width = Math.max(before.right - before.left, after.right - after.left) / 2;
  const height = Math.max(before.bottom - before.top, after.bottom - after.top) / 2;
  const ax = (before.left + before.right) / 2, ay = (before.top + before.bottom) / 2;
  const bx = (after.left + after.right) / 2, by = (after.top + after.bottom) / 2;
  const segmentBox = (x: number, y: number, dx: number, dy: number, w: number, h: number): number | null => {
    let lo = 0, hi = 1;
    for (const [p, d, extent] of [[x, dx, w], [y, dy, h]]) {
      if (Math.abs(d) < 1e-10) { if (Math.abs(p) > extent) return null; continue; }
      const u = (-extent - p) / d, v = (extent - p) / d;
      lo = Math.max(lo, Math.min(u, v)); hi = Math.min(hi, Math.max(u, v));
      if (lo > hi) return null;
    }
    return lo;
  };
  let best: Contact | null = null;
  hurt.forEach((c, i) => {
    const old = oldHurt[i] ?? c;
    const x = old.x - ax, y = old.y - ay;
    const dx = c.x - bx - x, dy = c.y - by - y;
    const candidates = [segmentBox(x, y, dx, dy, width + c.r, height), segmentBox(x, y, dx, dy, width, height + c.r)];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const corner = { x: sx * width, y: sy * height, r: c.r };
      candidates.push(sweepCircle({ x, y, r: 0 }, { x: x + dx, y: y + dy, r: 0 }, corner, corner));
    }
    const ts = candidates.filter((t): t is number => t !== null);
    if (!ts.length) return;
    const t = Math.min(...ts);
    if (best && best.t <= t) return;
    const cx = old.x + (c.x - old.x) * t, cy = old.y + (c.y - old.y) * t;
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    best = { x: Math.max(px - width, Math.min(px + width, cx)), y: Math.max(py - height, Math.min(py + height, cy)),
      region: c.region, part: c.part, direction, t };
  });
  return best;
}
