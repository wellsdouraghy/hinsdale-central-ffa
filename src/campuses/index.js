// Campus registry (see CAMPUSES.md). One active campus at a time; shared modules read its values through the
// mutable objects they export (SAT, PLAY_BOUNDS, TEAM_NAMES...), updated in place through onCampusChange().
import hinsdale from './hinsdale/campus.js';
import marin from './marin/campus.js';
import hamilton from './hamilton/campus.js';
import branson from './branson/campus.js';
import earlofmarch from './earlofmarch/campus.js';
import terraintest from './terraintest.js';

// Campuses still in review are only listed on the local dev server or with ?preview (until they pass QA).
const IN_REVIEW = new Set(['earlofmarch']);
const PREVIEW = import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('preview'));
export const CAMPUSES = [hinsdale, marin, hamilton, branson, earlofmarch].filter((c) => PREVIEW || !IN_REVIEW.has(c.id));
export const DEFAULT_CAMPUS = 'hinsdale';

// Dev-only campuses: reachable by id (?campus=terraintest, ?terrainTest=1, a host's room), never listed in the picker.
const HIDDEN = [terraintest];

export function getCampus(id) {
  return CAMPUSES.find((c) => c.id === id) || HIDDEN.find((c) => c.id === id) || CAMPUSES.find((c) => c.id === DEFAULT_CAMPUS);
}

let active = getCampus(DEFAULT_CAMPUS);
const listeners = new Set();

export function activeCampus() { return active; }

/** Switches the active campus and notifies listeners (branding, constants). Returns true if it changed. */
export function setActiveCampus(id) {
  const c = getCampus(id);
  if (c === active) return false;
  active = c;
  for (const fn of listeners) fn(c);
  return true;
}

/** fn(campus) now and on every change. */
export function onCampusChange(fn) {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}
