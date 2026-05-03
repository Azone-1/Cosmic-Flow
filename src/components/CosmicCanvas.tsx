/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { Particles } from './Particles';
import { ForceFields } from './ForceFields';
import { OtherPlayers, LocalCursor } from './OtherPlayers';

function SceneInteraction({ mousePosRef }: { mousePosRef: React.MutableRefObject<THREE.Vector3 | null> }) {
  const sendCursor = useGameStore((state) => state.sendCursor);
  const addForce = useGameStore((state) => state.addForce);
  const { camera, gl } = useThree();

  useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const updateMousePos = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, target);
      mousePosRef.current = target;
      return target;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const pos = updateMousePos(e.clientX, e.clientY);
      sendCursor({ x: pos.x, y: pos.y, z: pos.z });
    };

    const handlePointerDown = (e: PointerEvent) => {
      window.focus(); // Ensure window has focus for keyboard events
      // Only trigger on left click or touch
      if (e.button === 0 || e.pointerType === 'touch') {
        const pos = updateMousePos(e.clientX, e.clientY);
        addForce({ x: pos.x, y: pos.y, z: pos.z }, 'attractor');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (mousePosRef.current) {
          addForce({ x: mousePosRef.current.x, y: mousePosRef.current.y, z: mousePosRef.current.z }, 'repulsor');
        }
      }
    };

    const handleContextMenu = (e: Event) => e.preventDefault();

    // Attach to window to catch everything, even if scaled or outside canvas
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [camera, gl, addForce, sendCursor, mousePosRef]);

  return null;
}

function RotatingStars() {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.02;
      groupRef.current.rotation.x += delta * 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
    </group>
  );
}

export function CosmicCanvas() {
  const mousePosRef = useRef<THREE.Vector3 | null>(null);

  return (
    <div className="w-full h-full absolute inset-0 bg-black">
      <Canvas camera={{ position: [0, 0, 20], fov: 60 }}>
        <color attach="background" args={['#050510']} />
        
        <ambientLight intensity={0.2} />
        
        <RotatingStars />
        
        <Particles mousePosRef={mousePosRef} />
        <ForceFields />
        <OtherPlayers />
        <LocalCursor mousePosRef={mousePosRef} />
        
        <SceneInteraction mousePosRef={mousePosRef} />
        
        <EffectComposer>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
