// Entry: password screen, then the mobile gate (phones/tablets never download the 3D world), then the desktop app.
import './ui/styles.css';
import { passGate } from './ui/gate.js';
import { isMobileDevice, showMobileGate } from './ui/mobileGate.js';

passGate().then(() => {
  if (isMobileDevice()) showMobileGate();
  else import('./game/app.js');
});
