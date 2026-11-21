// Bodies on terrain slopes: a character lying on the ground (death fall, finisher victim) is tilted onto the slope under
// it, so it neither floats over the downhill side nor sinks into the uphill side. Only on terrain campuses
// (world.terrain); on flat campuses every caller keeps its plain `rotation.y = yaw` path.
import * as THREE from 'three';
import { setCharacterGround } from '../visuals/character.js';

const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _tilt = new THREE.Quaternion(), _yaw = new THREE.Quaternion(), _id = new THREE.Quaternion();
let world = null;

/** The world the game plays in (set by Game). */
export function setConformWorld(w) {
  world = w;
  setCharacterGround(w?.terrain && w.groundY ? (x, z) => w.groundY(x, z) : null);   // feet planted on the slope
}

const _ray = new THREE.Raycaster(); _ray.firstHitOnly = true;
/** Nearest hit against the world's collision meshes (fences included), or null. */
export function castWorld(origin, dir, far) {
  if (!world?.collisionMeshes) return null;
  _ray.set(origin, dir); _ray.near = 0; _ray.far = far;
  return _ray.intersectObjects(world.collisionMeshes, false)[0] || null;
}
const _o = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
/** Height of the floor under a point (a little above it counts, e.g. a step), or -Infinity when nothing is below. */
export function floorBelow(p) {
  const h = castWorld(_o.set(p.x, p.y + 0.3, p.z), DOWN, 80);
  let y = h ? h.point.y : -Infinity;
  if (world?.terrain) y = Math.max(y, groundAt(p.x, p.z));
  return y;
}
/** True on terrain campuses. */
export function terrainActive() { return !!world?.terrain; }
export function groundAt(x, z) { return world?.groundY ? world.groundY(x, z) : 0; }

/** Tilt (quaternion, up -> ground normal at x, z) scaled by weight 0..1. */
export function slopeTilt(x, z, weight, out = new THREE.Quaternion()) {
  const t = world?.terrain; if (!t || weight <= 0) return out.identity();
  t.normalAt(x, z, _n);
  _tilt.setFromUnitVectors(UP, _n);
  return out.copy(_id).slerp(_tilt, Math.min(1, weight));
}

/** Sets o.quaternion = slope tilt (weighted) * yaw. The origin of `o` must be at the feet, on the ground. */
export function conformToGround(o, yaw, weight) {
  slopeTilt(o.position.x, o.position.z, weight, o.quaternion);
  o.quaternion.multiply(_yaw.setFromAxisAngle(UP, yaw));
}

/** Death fall progress -> how much a body lies down (character.js topples, accelerating, over ~0.08-0.68 s after die()). */
export function lieWeight(secondsSinceDeath) {
  const k = Math.max(0, Math.min(1, (secondsSinceDeath - 0.08) / 0.6));
  return k * k;
}
