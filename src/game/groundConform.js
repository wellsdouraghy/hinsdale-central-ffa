// Bodies on terrain slopes: a character lying on the ground (death fall, finisher victim) is tilted onto the slope under
// it, so it neither floats over the downhill side nor sinks into the uphill side. Only on terrain campuses
// (world.terrain); on flat campuses every caller keeps its plain `rotation.y = yaw` path.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _tilt = new THREE.Quaternion(), _yaw = new THREE.Quaternion(), _id = new THREE.Quaternion();
let world = null;

/** The world the game plays in (set by Game). */
export function setConformWorld(w) { world = w; }
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

/** Death fall progress -> how much a body lies down (character.js falls over ~0.1-0.8 s after die()). */
export function lieWeight(secondsSinceDeath) {
  const k = Math.max(0, Math.min(1, (secondsSinceDeath - 0.1) / 0.7));
  return k * k * (3 - 2 * k);
}
