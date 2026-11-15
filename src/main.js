// Entry: mobile gate first (phones/tablets never download the 3D world), then the desktop app.
import './ui/styles.css';
import { isMobileDevice, showMobileGate } from './ui/mobileGate.js';

if (isMobileDevice()) {
  showMobileGate();
} else {
  import('./game/app.js');
}
