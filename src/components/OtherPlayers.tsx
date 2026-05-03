/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { Trail } from '@react-three/drei';

function PlayerCursor({ position, color }: { position: THREE.Vector3; color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      // Smoothly interpolate position
      meshRef.current.position.lerp(position, 0.2);
      // Add a fast pulsing effect based on spawn rate
      const scale = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.2;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <Trail
      width={0.5}
      length={20}
      color={new THREE.Color(color)}
      attenuation={(t) => t * t}
    >
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
        {/* Outer glow */}
        <mesh>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </mesh>
    </Trail>
  );
}

export function LocalCursor({ mousePosRef }: { mousePosRef: React.MutableRefObject<THREE.Vector3 | null> }) {
  const myColor = useGameStore((state) => state.myColor);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current && mousePosRef.current) {
      meshRef.current.position.lerp(mousePosRef.current, 0.5);
      const scale = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.2;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  if (!myColor) return null;

  return (
    <Trail
      width={0.5}
      length={20}
      color={new THREE.Color(myColor)}
      attenuation={(t) => t * t}
    >
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshBasicMaterial color={myColor} transparent opacity={0.8} />
        <mesh>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshBasicMaterial color={myColor} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </mesh>
    </Trail>
  );
}

export function OtherPlayers() {
  const players = useGameStore((state) => state.players);

  return (
    <>
      {Object.values(players).map((player) => {
        if (!player.position) return null;
        const pos = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
        return <PlayerCursor key={player.id} position={pos} color={player.color} />;
      })}
    </>
  );
}
