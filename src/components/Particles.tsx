/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, Vector3 } from '../store/useGameStore';
import { computeCurl } from '../utils/curlNoise';

const MAX_PARTICLES = 40000;
const PARTICLE_LIFETIME = 3.0; // seconds

export function Particles({ mousePosRef }: { mousePosRef: React.MutableRefObject<THREE.Vector3 | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  const particleTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }, []);

  // Use TypedArrays for better performance and memory layout
  const particleData = useMemo(() => ({
    active: new Uint8Array(MAX_PARTICLES),
    positions: new Float32Array(MAX_PARTICLES * 3),
    velocities: new Float32Array(MAX_PARTICLES * 3),
    colors: new Float32Array(MAX_PARTICLES * 3),
    baseColors: new Float32Array(MAX_PARTICLES * 3),
    life: new Float32Array(MAX_PARTICLES),
  }), []);

  // Scratchpad variables to avoid GC
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const scratchVel = useMemo(() => new THREE.Vector3(), []);
  const scratchPos = useMemo(() => new THREE.Vector3(), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);
  const scratchQuat = useMemo(() => new THREE.Quaternion(), []);
  const scratchCurl = useMemo(() => new THREE.Vector3(), []);
  const scratchDir = useMemo(() => new THREE.Vector3(), []);
  
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const emberColor = useMemo(() => new THREE.Color('#ff3300'), []);
  const whiteColor = useMemo(() => new THREE.Color('#ffffff'), []);

  const spawnIndex = useRef(0);

  const spawnParticle = (pos: THREE.Vector3, colorHex: string) => {
    const idx = spawnIndex.current;
    particleData.active[idx] = 1;
    
    const pIdx = idx * 3;
    particleData.positions[pIdx] = pos.x + (Math.random() - 0.5) * 1.5;
    particleData.positions[pIdx + 1] = pos.y + (Math.random() - 0.5) * 1.5;
    particleData.positions[pIdx + 2] = pos.z + (Math.random() - 0.5) * 1.5;
    
    particleData.velocities[pIdx] = (Math.random() - 0.5) * 2.0;
    particleData.velocities[pIdx + 1] = (Math.random() - 0.5) * 2.0;
    particleData.velocities[pIdx + 2] = (Math.random() - 0.5) * 2.0;
    
    scratchColor.set(colorHex);
    particleData.colors[pIdx] = scratchColor.r;
    particleData.colors[pIdx + 1] = scratchColor.g;
    particleData.colors[pIdx + 2] = scratchColor.b;
    
    particleData.baseColors[pIdx] = scratchColor.r;
    particleData.baseColors[pIdx + 1] = scratchColor.g;
    particleData.baseColors[pIdx + 2] = scratchColor.b;
    
    particleData.life[idx] = PARTICLE_LIFETIME;

    spawnIndex.current = (idx + 1) % MAX_PARTICLES;
  };

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Get current frame state directly from store to avoid re-renders
    const gameState = useGameStore.getState();
    const myColor = gameState.myColor;
    const players = gameState.players;
    const forceFieldsArr = Object.values(gameState.forceFields);

    // Spawn my particles
    if (mousePosRef.current && myColor) {
      for (let i = 0; i < 80; i++) {
        spawnParticle(mousePosRef.current, myColor);
      }
    }

    // Spawn other players' particles
    for (const id in players) {
      const player = players[id];
      if (player.position && player.color) {
        scratchPos.set(player.position.x, player.position.y, player.position.z);
        for (let i = 0; i < 40; i++) {
          spawnParticle(scratchPos, player.color);
        }
      }
    }

    const { active, positions, velocities, colors, baseColors, life } = particleData;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (active[i] === 0) {
        dummy.position.set(0, 0, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      life[i] -= delta;
      if (life[i] <= 0) {
        active[i] = 0;
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const pIdx = i * 3;
      const px = positions[pIdx];
      const py = positions[pIdx + 1];
      const pz = positions[pIdx + 2];
      
      let vx = velocities[pIdx];
      let vy = velocities[pIdx + 1];
      let vz = velocities[pIdx + 2];

      // Apply curl noise (using specialized target vector)
      computeCurl(px * 0.3, py * 0.3, pz * 0.3, scratchCurl);
      vx += scratchCurl.x * delta * 5.0;
      vy += scratchCurl.y * delta * 5.0;
      vz += scratchCurl.z * delta * 5.0;

      // Apply force fields
      for (let j = 0; j < forceFieldsArr.length; j++) {
        const force = forceFieldsArr[j];
        const dx = force.position.x - px;
        const dy = force.position.y - py;
        const dz = force.position.z - pz;
        const distSq = dx * dx + dy * dy + dz * dz;
        
        if (distSq > 0.1 && distSq < 400) {
          const invDist = 1 / Math.sqrt(distSq);
          const strength = (100.0 / distSq) * delta;
          const factor = (force.type === 'attractor' ? strength : -strength) * invDist;
          
          vx += dx * factor;
          vy += dy * factor;
          vz += dz * factor;

          if (force.type === 'attractor' && distSq < 10) {
            // Tint base color slightly
            baseColors[pIdx] = THREE.MathUtils.lerp(baseColors[pIdx], whiteColor.r, 0.05);
            baseColors[pIdx + 1] = THREE.MathUtils.lerp(baseColors[pIdx + 1], whiteColor.g, 0.05);
            baseColors[pIdx + 2] = THREE.MathUtils.lerp(baseColors[pIdx + 2], whiteColor.b, 0.05);
          }
        }
      }

      // Damping and position update
      vx *= 0.96;
      vy *= 0.96;
      vz *= 0.96;
      
      velocities[pIdx] = vx;
      velocities[pIdx + 1] = vy;
      velocities[pIdx + 2] = vz;
      
      const npx = px + vx * delta;
      const npy = py + vy * delta;
      const npz = pz + vz * delta;
      
      positions[pIdx] = npx;
      positions[pIdx + 1] = npy;
      positions[pIdx + 2] = npz;

      // Color shift based on life
      const lifeRatio = life[i] / PARTICLE_LIFETIME;
      const lerpFactor = Math.pow(1 - lifeRatio, 2);
      
      scratchColor.setRGB(
        THREE.MathUtils.lerp(baseColors[pIdx], emberColor.r, lerpFactor),
        THREE.MathUtils.lerp(baseColors[pIdx + 1], emberColor.g, lerpFactor),
        THREE.MathUtils.lerp(baseColors[pIdx + 2], emberColor.b, lerpFactor)
      );

      // Update instanced mesh
      dummy.position.set(npx, npy, npz);
      
      const speedSq = vx * vx + vy * vy + vz * vz;
      const speed = Math.sqrt(speedSq);
      const scale = lifeRatio * 0.08;
      const stretch = Math.min(4, Math.max(1, speed * 0.1));
      
      dummy.scale.set(scale, scale, scale * stretch);

      if (speed > 0.01) {
        scratchDir.set(vx / speed, vy / speed, vz / speed);
        scratchQuat.setFromUnitVectors(up, scratchDir);
        dummy.quaternion.copy(scratchQuat);
      }

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, scratchColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial 
        map={particleTexture}
        transparent 
        opacity={0.8} 
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
