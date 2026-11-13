// Client-side Capture the Flag presentation: flag/base objects, flag status, announcements, waypoint data.
// All flag state is host-authoritative; this only mirrors `flag` messages and the welcome snapshot.
import * as THREE from 'three';
import { createFlag, createFlagBase } from '../visuals/flag.js';
import { TEAMS, TEAM_CSS, TEAM_NAMES, otherTeam } from './ctf.js';
import { now as clock } from './authority.js';

export class CtfView {
  constructor(game, snap) {
    this.game = game;
    this.scene = game.scene;
    this.flags = {};
    this.bases = {};
    for (const team of TEAMS) {
      const base = new THREE.Vector3().fromArray(snap.bases[team]);
      this.bases[team] = base;
      const flag = createFlag({ team });
      const stand = createFlagBase({ team });
      stand.object3D.position.copy(base);
      this.scene.add(stand.object3D);
      this.scene.add(flag.object3D);
      this.flags[team] = { flag, stand, state: 'home', carrier: null, pos: base.clone(), retAt: null, carried: false };
    }
    this.score = { red: 0, blue: 0 };
    this.apply(snap);
  }

  apply(snap) {
    for (const team of TEAMS) {
      const s = snap.flags[team], f = this.flags[team];
      f.state = s.state;
      f.carrier = s.carrier;
      f.pos.fromArray(s.pos);
      f.retAt = s.ret != null ? clock() + s.ret : null;
    }
    this.score = { ...snap.score };
  }

  /** Host `flag` event: update state, then announce from the local player's point of view. */
  onFlag(m) {
    this.apply(m);
    const g = this.game;
    const by = m.by != null ? g.roster.get(m.by) : null;
    if (by) {
      if (m.pc != null) by.caps = m.pc;
      if (m.pr != null) by.ret = m.pr;
    }
    const my = g.myTeam;
    const flagTeam = m.team;
    const mine = flagTeam === my;
    const byName = by?.name ?? '';
    const capTeam = otherTeam(flagTeam);
    switch (m.event) {
      case 'take':
        if (m.by === g.localId) g.announce('You have the flag', 'Bring it to your base', TEAM_CSS[flagTeam], 'good');
        else if (mine) g.announce(`${TEAM_NAMES[capTeam]} have your flag`, byName, TEAM_CSS[capTeam], 'bad');
        else g.announce('Your team has the enemy flag', byName, TEAM_CSS[my], 'good');
        break;
      case 'drop':
        g.announce(mine ? 'Your flag was dropped' : 'Enemy flag dropped', mine ? 'Touch it to return it' : 'Grab it before it returns', TEAM_CSS[flagTeam], 'neutral');
        break;
      case 'return':
        g.announce(mine ? 'Your flag was returned' : 'Enemy flag returned', byName, TEAM_CSS[flagTeam], mine ? 'good' : 'bad');
        break;
      case 'autoreturn':
        g.announce(mine ? 'Your flag was returned' : 'Enemy flag returned', 'Returned to base', TEAM_CSS[flagTeam], mine ? 'good' : 'bad');
        break;
      case 'capture':
        g.announce(`${TEAM_NAMES[capTeam]} captured the flag`, `${byName}  ·  ${TEAM_NAMES.red} ${this.score.red} - ${this.score.blue} ${TEAM_NAMES.blue}`, TEAM_CSS[capTeam], capTeam === my ? 'capture' : 'enemyCapture');
        break;
      default: break;
    }
  }

  /** Who carries a flag (player id) or null. */
  carrierOf(team) { return this.flags[team].state === 'carried' ? this.flags[team].carrier : null; }

  /** Current world position of a flag (carrier's position when carried). */
  flagPos(team, out) {
    const f = this.flags[team];
    if (f.state === 'carried') {
      const g = this.game;
      if (f.carrier === g.localId) return out.copy(g.player.position);
      const r = g.remotes.get(f.carrier);
      if (r) return out.copy(r.feet);
    }
    return out.copy(f.pos);
  }

  /** Status text for the HUD. */
  status(team) {
    const f = this.flags[team];
    if (f.state === 'home') return { text: 'Home', kind: 'home' };
    if (f.state === 'carried') return { text: `Taken · ${this.game.nameOf(f.carrier)}`, kind: 'taken' };
    const s = f.retAt ? Math.max(0, Math.ceil(f.retAt - clock())) : 0;
    return { text: `Dropped · ${s}s`, kind: 'dropped' };
  }

  update(dt) {
    const g = this.game;
    for (const team of TEAMS) {
      const f = this.flags[team];
      const o = f.flag.object3D;
      let parent = this.scene, carried = false, visible = true;
      if (f.state === 'carried') {
        if (f.carrier === g.localId) visible = false; // first person: the HUD says you have it
        else {
          const r = g.remotes.get(f.carrier);
          if (r) { parent = r.character.object3D; carried = true; visible = r.alive; }
        }
      }
      if (o.parent !== parent) parent.add(o);
      if (carried !== f.carried) { f.flag.setCarried(carried); f.carried = carried; }
      if (!carried) o.position.copy(f.pos);
      o.visible = visible;
      f.flag.update(dt);
      f.stand.update(dt);
    }
  }

  dispose() {
    for (const team of TEAMS) {
      const f = this.flags[team];
      f.flag.object3D.parent?.remove(f.flag.object3D);
      f.stand.object3D.parent?.remove(f.stand.object3D);
      f.flag.dispose();
      f.stand.dispose();
    }
  }
}
