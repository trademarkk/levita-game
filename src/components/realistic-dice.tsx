"use client";

import { useEffect, useRef, useState } from "react";

const ROLL_DURATION_MS = 3_900;
const pipPatterns: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function FallbackDie({ value }: { value: number }) {
  const active = new Set(pipPatterns[value]);
  return (
    <span className="dice-webgl-fallback" aria-hidden="true">
      <span className="dice-pips">
        {Array.from({ length: 9 }, (_, index) => <i className={active.has(index) ? "active" : ""} key={index} />)}
      </span>
    </span>
  );
}

export function RealisticDice({ targetValue, phase }: {
  targetValue: number | null;
  phase: "rolling" | "waiting" | "settled";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(targetValue);
  const phaseRef = useRef(phase);
  const startedAtRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => { targetRef.current = targetValue; }, [targetValue]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof WebGLRenderingContext === "undefined") return;
    startedAtRef.current = performance.now();
    let cancelled = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let removeScene: (() => void) | null = null;

    void Promise.all([
      import("three"),
      import("three/examples/jsm/geometries/RoundedBoxGeometry.js"),
    ]).then(([THREE, { RoundedBoxGeometry }]) => {
      if (cancelled || !mountRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(31, 1, .1, 100);
      camera.position.set(4.7, 4.3, 7.4);
      camera.lookAt(0, .05, 0);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.className = "dice-webgl-canvas";
      mountRef.current.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xfff4c9, 0x5b3418, 2.25));
      const keyLight = new THREE.DirectionalLight(0xfff0b5, 4.2);
      keyLight.position.set(-4, 7, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = .1;
      keyLight.shadow.camera.far = 24;
      scene.add(keyLight);
      const rimLight = new THREE.PointLight(0xf3a82d, 16, 18, 2);
      rimLight.position.set(4, 2, -4);
      scene.add(rimLight);

      const dice = new THREE.Group();
      const bodyGeometry = new RoundedBoxGeometry(1.82, 1.82, 1.82, 7, .22);
      const bodyMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffd96b,
        roughness: .24,
        metalness: .08,
        clearcoat: 1,
        clearcoatRoughness: .17,
      });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.castShadow = true;
      body.receiveShadow = true;
      dice.add(body);

      const pipGeometry = new THREE.CircleGeometry(.115, 32);
      const pipMaterial = new THREE.MeshStandardMaterial({ color: 0x3a210d, roughness: .48, metalness: .05 });
      const grid = [-.43, 0, .43];
      const faceDefinitions = [
        { value: 1, normal: new THREE.Vector3(0, 0, 1), rotation: new THREE.Euler(0, 0, 0) },
        { value: 6, normal: new THREE.Vector3(0, 0, -1), rotation: new THREE.Euler(0, Math.PI, 0) },
        { value: 3, normal: new THREE.Vector3(1, 0, 0), rotation: new THREE.Euler(0, Math.PI / 2, 0) },
        { value: 4, normal: new THREE.Vector3(-1, 0, 0), rotation: new THREE.Euler(0, -Math.PI / 2, 0) },
        { value: 2, normal: new THREE.Vector3(0, 1, 0), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) },
        { value: 5, normal: new THREE.Vector3(0, -1, 0), rotation: new THREE.Euler(Math.PI / 2, 0, 0) },
      ];

      for (const face of faceDefinitions) {
        const tangent = new THREE.Vector3(1, 0, 0).applyEuler(face.rotation);
        const bitangent = new THREE.Vector3(0, 1, 0).applyEuler(face.rotation);
        for (const index of pipPatterns[face.value]) {
          const pip = new THREE.Mesh(pipGeometry, pipMaterial);
          pip.rotation.copy(face.rotation);
          pip.position.copy(face.normal).multiplyScalar(.916);
          pip.position.addScaledVector(tangent, grid[index % 3]);
          pip.position.addScaledVector(bitangent, grid[Math.floor(index / 3)] * -1);
          dice.add(pip);
        }
      }

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 8),
        new THREE.ShadowMaterial({ color: 0x29170b, opacity: .34 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.03;
      floor.receiveShadow = true;
      scene.add(floor);
      scene.add(dice);

      const resultNormals: Record<number, InstanceType<typeof THREE.Vector3>> = {
        1: new THREE.Vector3(0, 0, 1),
        2: new THREE.Vector3(0, 1, 0),
        3: new THREE.Vector3(1, 0, 0),
        4: new THREE.Vector3(-1, 0, 0),
        5: new THREE.Vector3(0, -1, 0),
        6: new THREE.Vector3(0, 0, -1),
      };
      const up = new THREE.Vector3(0, 1, 0);
      const settleStart = new THREE.Quaternion();
      const finalQuaternion = new THREE.Quaternion();
      let settleCaptured = false;

      const resize = () => {
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      resize();

      const renderFrame = (now: number) => {
        const elapsed = now - startedAtRef.current;
        const progress = Math.min(1, elapsed / ROLL_DURATION_MS);
        const value = targetRef.current;
        const shouldSettle = value != null && (progress >= .69 || phaseRef.current === "settled");

        if (!shouldSettle) {
          settleCaptured = false;
          const time = elapsed / 1000;
          const slowdown = progress < 1 ? 1 : .18;
          dice.rotation.x = .4 + time * 8.7 * slowdown;
          dice.rotation.y = -.7 + time * 10.9 * slowdown;
          dice.rotation.z = .2 + time * 6.2 * slowdown;
          dice.position.x = Math.sin(time * 4.1) * .34 * (1 - progress * .6);
          dice.position.z = Math.cos(time * 3.5) * .2 * (1 - progress * .6);
          dice.position.y = -.1 + Math.abs(Math.sin(time * 5.4)) * (1.5 * Math.max(.2, 1 - progress * .62));
        } else {
          if (!settleCaptured) {
            settleStart.copy(dice.quaternion);
            settleCaptured = true;
          }
          const settleProgress = phaseRef.current === "settled"
            ? 1
            : Math.min(1, Math.max(0, (progress - .69) / .31));
          const eased = 1 - Math.pow(1 - settleProgress, 4);
          finalQuaternion.setFromUnitVectors(resultNormals[value], up);
          finalQuaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(up, value * .37));
          dice.quaternion.slerpQuaternions(settleStart, finalQuaternion, eased);
          dice.position.x *= 1 - eased;
          dice.position.z *= 1 - eased;
          dice.position.y = -.1 + Math.abs(Math.sin(settleProgress * Math.PI * 2.5)) * .32 * (1 - eased);
        }

        renderer.render(scene, camera);
        if (!cancelled) frame = window.requestAnimationFrame(renderFrame);
      };
      frame = window.requestAnimationFrame(renderFrame);
      setReady(true);

      removeScene = () => {
        window.cancelAnimationFrame(frame);
        resizeObserver?.disconnect();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => setReady(false));

    return () => {
      cancelled = true;
      removeScene?.();
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(frame);
      setReady(false);
    };
  }, []);

  return (
    <div className="realistic-dice" ref={mountRef} aria-hidden="true">
      {!ready && <FallbackDie value={targetValue || 1} />}
    </div>
  );
}
