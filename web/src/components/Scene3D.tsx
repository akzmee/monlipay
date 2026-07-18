"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, Octahedron, Torus, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

/**
 * Floating crystal-like shapes that slowly rotate and drift.
 * Uses Monad purple color palette.
 */
function FloatingShape({
  position,
  scale = 1,
  shape = "ico",
  color = "#836EF9",
  distortSpeed = 1,
}: {
  position: [number, number, number];
  scale?: number;
  shape?: "ico" | "octa" | "torus";
  color?: string;
  distortSpeed?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      // Gentle rotation
      ref.current.rotation.x = state.clock.elapsedTime * 0.15;
      ref.current.rotation.y = state.clock.elapsedTime * 0.1;
    }
  });

  const material = (
    <MeshDistortMaterial
      color={color}
      roughness={0.2}
      metalness={0.8}
      distort={0.35}
      speed={distortSpeed * 0.8}
      transparent
      opacity={0.85}
    />
  );

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1.2}>
      {shape === "ico" && (
        <Icosahedron ref={ref} args={[1, 1]} position={position} scale={scale}>
          {material}
        </Icosahedron>
      )}
      {shape === "octa" && (
        <Octahedron ref={ref} args={[1, 0]} position={position} scale={scale}>
          {material}
        </Octahedron>
      )}
      {shape === "torus" && (
        <Torus ref={ref} args={[0.8, 0.3, 16, 32]} position={position} scale={scale}>
          {material}
        </Torus>
      )}
    </Float>
  );
}

/**
 * Particle field — small dots floating in 3D space.
 */
function ParticleField({ count = 80 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 18;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.03;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#836EF9"
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/**
 * The main 3D scene with floating geometric shapes.
 */
function SceneContent() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} color="#a78bfa" />
      <pointLight position={[-5, -3, -2]} intensity={0.8} color="#836EF9" />
      <pointLight position={[3, -2, 3]} intensity={0.5} color="#c084fc" />

      {/* Floating shapes — arranged to frame the hero text */}
      <FloatingShape position={[-4.5, 1.5, -1]} scale={1.3} shape="ico" color="#836EF9" distortSpeed={1} />
      <FloatingShape position={[4.5, -0.5, -2]} scale={1.0} shape="octa" color="#a78bfa" distortSpeed={0.7} />
      <FloatingShape position={[3, 2.5, -3]} scale={0.6} shape="torus" color="#c084fc" distortSpeed={1.2} />
      <FloatingShape position={[-3, -2, -1]} scale={0.7} shape="ico" color="#7c3aed" distortSpeed={0.9} />
      <FloatingShape position={[0, 3.5, -4]} scale={0.5} shape="octa" color="#8b5cf6" distortSpeed={1.1} />
      <FloatingShape position={[-5, -1, -3]} scale={0.4} shape="torus" color="#d946ef" distortSpeed={0.8} />

      {/* Particle field */}
      <ParticleField count={100} />
    </>
  );
}

/** Fixed full-screen 3D background, pointer-events none. */
export function Scene3D() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 opacity-70 dark:opacity-40">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
}
