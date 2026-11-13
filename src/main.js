// PLACEHOLDER entry: free-fly viewer of the world. Replaced by the Gameplay builder.
import * as THREE from 'three';
import { createWorld } from './world/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 5000);
camera.position.set(-150, 1.7, -20);
const world = await createWorld({ renderer, scene, camera, settings: { quality: 'high', googleTilesKey: null } });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); world.setSize(innerWidth, innerHeight); });
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => { const dt = clock.getDelta(); world.update(dt, camera); world.render(null, null); });
