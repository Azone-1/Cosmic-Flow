/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { createNoise3D } from 'simplex-noise';
import * as THREE from 'three';

const noise3D = createNoise3D();

function computeCurl(x: number, y: number, z: number, target: THREE.Vector3): void {
  const eps = 0.001;

  const n0 = noise3D(x, y, z);
  const nx = noise3D(x + eps, y, z);
  const ny = noise3D(x, y + eps, z);
  const nz = noise3D(x, y, z + eps);

  const dfdy = (ny - n0) / eps;
  const dfdz = (nz - n0) / eps;
  const dfdx = (nx - n0) / eps;

  target.x = dfdy - dfdz;
  target.y = dfdz - dfdx;
  target.z = dfdx - dfdy;

  target.normalize();
}

export { computeCurl };
