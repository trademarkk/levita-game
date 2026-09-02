"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Trophy } from "lucide-react";
import { achievementKindLabel } from "@/lib/achievement-catalog";
import { AchievementGlyph } from "@/components/achievement-emblem";
import type { AchievementView } from "@/lib/types";

function AchievementMedallion({ achievement }: { achievement: AchievementView }) {
  const mountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof WebGLRenderingContext === "undefined") return;
    let cancelled = false;
    let frame = 0;
    let cleanup: (() => void) | null = null;
    void import("three").then((THREE) => {
      if (cancelled || !mountRef.current) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, .1, 50);
      camera.position.set(0, .15, 7);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.setSize(mount.clientWidth || 260, mount.clientHeight || 260, false);
      renderer.domElement.className = "achievement-webgl-canvas";
      mount.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xfff5cd, 0x342014, 2.7));
      const light = new THREE.PointLight(0xffbe42, 28, 18, 2);
      light.position.set(-2, 3, 4);
      scene.add(light);

      const group = new THREE.Group();
      scene.add(group);
      const color = new THREE.Color(achievement.color);
      const goldMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf2c35e, metalness: .9, roughness: .17, clearcoat: 1 });
      const enamelMaterial = new THREE.MeshPhysicalMaterial({ color, metalness: .48, roughness: .18, clearcoat: 1, clearcoatRoughness: .12 });
      const shieldShape = new THREE.Shape();
      shieldShape.moveTo(0, 1.48);
      shieldShape.bezierCurveTo(.44, 1.33, .85, 1.18, 1.16, .89);
      shieldShape.lineTo(1.04, -.42);
      shieldShape.bezierCurveTo(.91, -1.02, .5, -1.43, 0, -1.7);
      shieldShape.bezierCurveTo(-.5, -1.43, -.91, -1.02, -1.04, -.42);
      shieldShape.lineTo(-1.16, .89);
      shieldShape.bezierCurveTo(-.85, 1.18, -.44, 1.33, 0, 1.48);
      const shieldGeometry = new THREE.ExtrudeGeometry(shieldShape, {
        depth: .22,
        bevelEnabled: true,
        bevelSegments: 4,
        bevelSize: .08,
        bevelThickness: .08,
      });
      shieldGeometry.center();
      const shieldBorder = new THREE.Mesh(shieldGeometry, goldMaterial);
      shieldBorder.scale.set(1.12, 1.12, 1);
      shieldBorder.position.z = -.04;
      group.add(shieldBorder);
      const shield = new THREE.Mesh(shieldGeometry.clone(), enamelMaterial);
      shield.position.z = .18;
      group.add(shield);
      const innerFrame = new THREE.Mesh(
        new THREE.TorusGeometry(.73, .035, 12, 64),
        new THREE.MeshBasicMaterial({ color: 0xffefab }),
      );
      innerFrame.scale.y = 1.1;
      innerFrame.position.z = .42;
      group.add(innerFrame);

      for (const side of [-1, 1]) {
        for (let index = 0; index < 6; index += 1) {
          const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .3, 4, 8), goldMaterial);
          const angle = -.78 + index * .29;
          leaf.position.set(side * (1.28 + Math.cos(angle) * .24), -.33 + index * .34, .05);
          leaf.rotation.z = side * (-.45 + index * .11);
          leaf.scale.set(1, 1 + index * .025, .75);
          group.add(leaf);
        }
      }
      if (achievement.kind === "chapter") {
        for (let index = 0; index < 5; index += 1) {
          const point = new THREE.Mesh(new THREE.ConeGeometry(.15, .58 - Math.abs(2 - index) * .045, 5), goldMaterial);
          point.position.set((index - 2) * .3, 1.76, .1);
          group.add(point);
        }
      }
      const particles: InstanceType<typeof THREE.Mesh>[] = [];
      const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffe37e });
      for (let index = 0; index < 34; index += 1) {
        const particle = new THREE.Mesh(new THREE.SphereGeometry(.026 + (index % 3) * .012, 8, 8), particleMaterial);
        group.add(particle);
        particles.push(particle);
      }
      const started = performance.now();
      const render = (now: number) => {
        const elapsed = (now - started) / 1000;
        const pop = Math.min(1, elapsed / .7);
        const elastic = 1 - Math.pow(2, -8 * pop) * Math.cos(pop * Math.PI * 3.5);
        group.scale.setScalar(Math.max(.01, elastic));
        group.rotation.y = Math.sin(elapsed * .8) * .17;
        group.rotation.z = Math.sin(elapsed * .55) * .025;
        particles.forEach((particle, index) => {
          const angle = index * 2.399 + elapsed * (.55 + index % 4 * .08);
          const radius = 1.65 + (index % 5) * .13;
          particle.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.6) * 1.55, Math.sin(angle) * .45);
          const pulse = .7 + Math.sin(elapsed * 4 + index) * .3;
          particle.scale.setScalar(pulse);
        });
        renderer.render(scene, camera);
        if (!cancelled) frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
      cleanup = () => {
        cancelAnimationFrame(frame);
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
    }).catch(() => undefined);
    return () => { cancelled = true; cleanup?.(); cancelAnimationFrame(frame); };
  }, [achievement.color, achievement.kind]);

  return (
    <div className="achievement-medallion" ref={mountRef}>
      <span className="achievement-medallion-glyph"><AchievementGlyph achievement={achievement} /></span>
      <b>{achievement.kind === "chapter" ? "НАГРАДА ГЛАВЫ" : "ЛИЧНЫЙ ТИТУЛ"}</b>
    </div>
  );
}

export function AchievementCelebration({
  achievement,
  current,
  total,
  onContinue,
  onOpenJourney,
}: {
  achievement: AchievementView;
  current: number;
  total: number;
  onContinue: () => void;
  onOpenJourney: () => void;
}) {
  return (
    <div className="achievement-celebration" role="dialog" aria-modal="true" aria-label={`Открыт титул ${achievement.title}`}>
      <article className={`achievement-popup tier-${achievement.cosmeticTier}`}>
        <div className="achievement-rays" />
        <AchievementMedallion achievement={achievement} />
        <div className="achievement-popup-copy">
          <p className="eyebrow"><Trophy /> Открыт новый титул</p>
          <span className="achievement-rank">{achievementKindLabel(achievement.kind)}</span>
          <h2>{achievement.title}</h2>
          <p>{achievement.story}</p>
          {total > 1 && <small>Открытие {current + 1} из {total}</small>}
        </div>
        <div className="achievement-actions">
          <button className="outline-button" onClick={onOpenJourney}>Посмотреть все титулы</button>
          <button className="primary-button" onClick={onContinue}>
            {current + 1 < total ? "Следующий титул" : "Продолжить"} <ArrowRight />
          </button>
        </div>
      </article>
    </div>
  );
}
