// Hinsdale Central builder: the original school, neighbourhood context, stadium/fields and props.
import { buildSchool, buildHouses } from '../../world/buildings.js';
import { buildLandmarks } from '../../world/landmarks.js';
import { buildProps } from '../../world/props.js';

export function build(ctx, progress = () => {}) {
  progress(0.48, 'Building school');
  buildSchool(ctx);
  progress(0.56, 'Building neighbourhood');
  buildHouses(ctx);
  progress(0.62, 'Building stadium and fields');
  buildLandmarks(ctx);
  progress(0.7, 'Placing vehicles and props');
  buildProps(ctx);
}
