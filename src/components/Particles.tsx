/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, Vector3 } from '../store/useGameStore';
import { computeCurl } from '../utils/curlNoise';

const MAX_PARTICLES = 25000;
const PARTICLE_LIFETIME = 3.0; // seconds

interface Particle {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  baseColor: THREE.Color;
  life: number;
}

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

  // Initialize instanceColor
  React.useEffect(() => {
    if (meshRef.current) {
      const color = new THREE.Color();
      for (let i = 0; i < MAX_PARTICLES; i++) {
        meshRef.current.setColorAt(i, color);
      }
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, []);

  const myColor = useGameStore((state) => state.myColor);
  const players = useGameStore((state) => state.players);
  const forceFields = useGameStore((state) => state.forceFields);

  const particles = useMemo(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      arr.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        baseColor: new THREE.Color(),
        life: 0,
      });
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const spawnIndex = useRef(0);

  const spawnParticle = (pos: THREE.Vector3, colorHex: string) => {
    const p = particles[spawnIndex.current];
    p.active = true;
    p.position.copy(pos);
    // Add some random spread
    p.position.x += (Math.random() - 0.5) * 1.5;
    p.position.y += (Math.random() - 0.5) * 1.5;
    p.position.z += (Math.random() - 0.5) * 1.5;
    
    p.velocity.set(
      (Math.random() - 0.5) * 2.0,
      (Math.random() - 0.5) * 2.0,
      (Math.random() - 0.5) * 2.0
    );
    p.color.set(colorHex);
    p.baseColor.set(colorHex);
    p.life = PARTICLE_LIFETIME;

    spawnIndex.current = (spawnIndex.current + 1) % MAX_PARTICLES;
  };

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Spawn my particles
    if (mousePosRef.current && myColor) {
      // Spawn a few per frame
      for (let i = 0; i < 80; i++) {
        spawnParticle(mousePosRef.current, myColor);
      }
    }

    // Spawn other players' particles
    Object.values(players).forEach(player => {
      if (player.position && player.color) {
        const pPos = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
        for (let i = 0; i < 40; i++) {
          spawnParticle(pPos, player.color);
        }
      }
    });

    const forces = Object.values(forceFields);
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    const emberColor = new THREE.Color('#ff3300');
    const whiteColor = new THREE.Color('#ffffff');

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) {
        dummy.position.set(0, 0, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      p.life -= delta;
      if (p.life <= 0) {
        p.active = false;
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Apply curl noise
      const curl = computeCurl(p.position.x * 0.3, p.position.y * 0.3, p.position.z * 0.3);
      p.velocity.add(curl.multiplyScalar(delta * 5.0));

      // Apply force fields
      for (const force of forces) {
        const fPos = new THREE.Vector3(force.position.x, force.position.y, force.position.z);
        const dir = new THREE.Vector3().subVectors(fPos, p.position);
        const distSq = dir.lengthSq();
        
        // Avoid division by zero and extreme forces
        if (distSq > 0.1 && distSq < 400) {
          dir.normalize();
          const strength = 100.0 / distSq;
          if (force.type === 'attractor') {
            p.velocity.add(dir.multiplyScalar(strength * delta));
            // Tint particle if close to attractor
            if (distSq < 10) {
               p.baseColor.lerp(whiteColor, 0.05); // permanently tint a bit
            }
          } else {
            p.velocity.sub(dir.multiplyScalar(strength * delta));
          }
        }
      }

      // Damping
      p.velocity.multiplyScalar(0.96);
      p.position.addScaledVector(p.velocity, delta);

      // Color shift based on life
      const lifeRatio = p.life / PARTICLE_LIFETIME;
      p.color.copy(p.baseColor);
      p.color.lerp(emberColor, Math.pow(1 - lifeRatio, 2));

      // Update instanced mesh
      dummy.position.copy(p.position);
      
      const speed = p.velocity.length();
      // Scale down as life decreases, base size is larger for soft blending
      const scale = (p.life / PARTICLE_LIFETIME) * 0.08;
      // Stretch along velocity, clamp to prevent extreme distortion
      const stretch = Math.min(4, Math.max(1, speed * 0.1));
      
      dummy.scale.set(scale, scale, scale * stretch);

      // Orient along velocity
      if (speed > 0.01) {
        const dir = p.velocity.clone().normalize();
        quaternion.setFromUnitVectors(up, dir);
        dummy.quaternion.copy(quaternion);
      }

      dummy.updateMatrix();

      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, p.color);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]}>
      <sphereGeometry args={[1, 16, 16]} />
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
