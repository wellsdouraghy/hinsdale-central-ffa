// Entry: mobile gate first (phones/tablets never download the 3D world), intro card, then the desktop app.
import './ui/styles.css';
import { isMobileDevice, showMobileGate } from './ui/mobileGate.js';
import { playIntro } from './ui/intro.js';

if (isMobileDevice()) {
  showMobileGate();
} else {
  const q = new URLSearchParams(location.search);
  if (!q.has('autostart') && !q.has('nointro')) playIntro();
  import('./game/app.js');
}
