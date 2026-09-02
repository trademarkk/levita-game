"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import type { RollOutcome } from "@/lib/game";

const COPY: Record<string, { eyebrow: string; title: string; symbol: string }> = {
  treasure: { eyebrow: "Сокровище саванны", title: "Сундук открыт", symbol: "✦" },
  trap: { eyebrow: "Испытание прайда", title: "Новое задание", symbol: "▤" },
  setback: { eyebrow: "Препятствие на тропе", title: "Камнепад!", symbol: "◆" },
  accelerate: { eyebrow: "Золотой ветер", title: "Саванна ускоряет шаг", symbol: "➶" },
  surprise: { eyebrow: "Тайна саванны", title: "Случилось неожиданное", symbol: "?" },
  finish: { eyebrow: "Вершина пути", title: "Победа!", symbol: "♛" },
};

function cinematicDetail(outcome: RollOutcome) {
  if (outcome.cellType === "treasure" && outcome.rewardTitle) {
    const titleAlreadyHasAmount = /\d[\d\s\u00a0\u202f]*\s*₽/.test(outcome.rewardTitle);
    const amount = outcome.rewardValue && !titleAlreadyHasAmount ? ` · ${outcome.rewardValue.toLocaleString("ru-RU")} ₽` : "";
    return `Твой приз — ${outcome.rewardTitle}${amount}`;
  }
  if (outcome.cellType === "finish" && outcome.winnerName) return `Финиш достигнут раньше остальных. Победа в сезоне — ${outcome.winnerName}!`;
  if (outcome.cellType === "trap") {
    const [, ...details] = outcome.effectText.split("\n");
    return details.length ? details.join("\n") : outcome.effectText;
  }
  return outcome.effectText;
}

function cinematicTitle(outcome: RollOutcome) {
  if (outcome.cellType === "finish" && outcome.winnerName) return `Триумф сезона — ${outcome.winnerName}`;
  if (outcome.cellType === "trap") {
    return outcome.effectText.match(/^Задание «(.+?)»/)?.[1] || COPY.trap.title;
  }
  return (COPY[outcome.cellType] || COPY.surprise).title;
}

export function WebglEventCinematic({ outcome, onContinue }: { outcome: RollOutcome; onContinue: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof WebGLRenderingContext === "undefined") return;
    let cancelled = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let cleanup: (() => void) | null = null;

    void Promise.all([
      import("three"),
      import("three/examples/jsm/geometries/RoundedBoxGeometry.js"),
    ]).then(([THREE, { RoundedBoxGeometry }]) => {
      if (cancelled || !mountRef.current) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
      camera.position.set(0, .65, 8.2);
      camera.lookAt(0, .25, 0);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      renderer.domElement.className = "event-webgl-canvas";
      mount.appendChild(renderer.domElement);
      mount.classList.add("webgl-ready");

      scene.add(new THREE.HemisphereLight(0xfff4d3, 0x281c18, 2.8));
      const key = new THREE.DirectionalLight(0xffdda0, 5.4);
      key.position.set(-4, 6, 5);
      key.castShadow = true;
      scene.add(key);
      const rim = new THREE.PointLight(outcome.cellType === "trap" ? 0xb483ff : 0xffa83b, 24, 22, 2);
      rim.position.set(3.5, 2.8, -2.5);
      scene.add(rim);

      const root = new THREE.Group();
      scene.add(root);
      const animated: InstanceType<typeof THREE.Object3D>[] = [];
      const gold = new THREE.MeshPhysicalMaterial({ color: 0xf1bd45, roughness: .2, metalness: .82, clearcoat: 1 });
      const paleGold = new THREE.MeshPhysicalMaterial({ color: 0xffe89a, roughness: .18, metalness: .7, clearcoat: 1 });
      const wood = new THREE.MeshStandardMaterial({ color: 0x6d3418, roughness: .5, metalness: .08 });
      const darkWood = new THREE.MeshStandardMaterial({ color: 0x351b12, roughness: .68 });
      const parchment = new THREE.MeshStandardMaterial({ color: 0xffefbd, roughness: .7, side: THREE.DoubleSide });
      const ink = new THREE.MeshStandardMaterial({ color: 0x7b4d29, roughness: .7 });
      const purple = new THREE.MeshPhysicalMaterial({ color: 0x9f6fc5, roughness: .2, metalness: .32, clearcoat: .8 });

      if (outcome.cellType === "treasure") {
        const chest = new THREE.Group();
        chest.position.y = -.35;
        root.add(chest);
        const base = new THREE.Mesh(new RoundedBoxGeometry(3.35, 1.28, 1.82, 6, .16), wood);
        base.castShadow = true;
        chest.add(base);
        const inner = new THREE.Mesh(new RoundedBoxGeometry(2.84, .86, 1.45, 5, .12), darkWood);
        inner.position.y = .12;
        chest.add(inner);
        for (const x of [-1.34, -.68, 0, .68, 1.34]) {
          const slat = new THREE.Mesh(new RoundedBoxGeometry(.055, 1.08, 1.86, 3, .025), darkWood);
          slat.position.set(x, -.06, 0);
          chest.add(slat);
        }
        for (const x of [-1.15, 0, 1.15]) {
          const band = new THREE.Mesh(new RoundedBoxGeometry(.23, 1.34, 1.9, 4, .045), gold);
          band.position.x = x;
          chest.add(band);
        }
        const lowerRail = new THREE.Mesh(new RoundedBoxGeometry(3.48, .18, 1.92, 4, .05), paleGold);
        lowerRail.position.y = -.57;
        chest.add(lowerRail);
        const lockPlate = new THREE.Mesh(new RoundedBoxGeometry(.58, .7, .16, 5, .06), gold);
        lockPlate.position.set(0, -.02, .98);
        chest.add(lockPlate);
        const lockGem = new THREE.Mesh(new THREE.OctahedronGeometry(.15, 0), new THREE.MeshPhysicalMaterial({ color: 0x65d3cc, emissive: 0x184d4a, emissiveIntensity: 1.4, roughness: .08, metalness: .22 }));
        lockGem.position.set(0, .04, 1.1);
        chest.add(lockGem);

        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, .58, -.78);
        chest.add(lidPivot);
        const lid = new THREE.Mesh(new RoundedBoxGeometry(3.42, .72, 1.88, 7, .22), wood);
        lid.position.set(0, .25, .78);
        lid.castShadow = true;
        lidPivot.add(lid);
        for (const x of [-1.15, 0, 1.15]) {
          const band = new THREE.Mesh(new RoundedBoxGeometry(.24, .78, 1.94, 4, .05), gold);
          band.position.set(x, .25, .78);
          lidPivot.add(band);
        }
        const lidRail = new THREE.Mesh(new RoundedBoxGeometry(3.5, .16, 1.95, 4, .05), paleGold);
        lidRail.position.set(0, -.04, .78);
        lidPivot.add(lidRail);
        lidPivot.userData.lid = true;
        animated.push(lidPivot);

        const glow = new THREE.PointLight(0xffd75b, 0, 8, 2);
        glow.position.set(0, .7, .4);
        chest.add(glow);
        glow.userData.chestGlow = true;
        animated.push(glow);
        for (let index = 0; index < 18; index += 1) {
          const coin = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .055, 28), index % 4 === 0 ? paleGold : gold);
          coin.rotation.x = Math.PI / 2;
          coin.position.set((index % 6 - 2.5) * .4, .12 + Math.floor(index / 6) * .1, .28 + (index % 2) * .2);
          coin.userData.coin = index;
          coin.castShadow = true;
          chest.add(coin);
          animated.push(coin);
        }
      } else if (outcome.cellType === "trap") {
        const scrollRoot = new THREE.Group();
        scrollRoot.position.y = .08;
        root.add(scrollRoot);
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 2.28, 18, 18), parchment);
        sheet.position.z = .08;
        sheet.castShadow = true;
        sheet.userData.sheet = true;
        scrollRoot.add(sheet);
        animated.push(sheet);
        for (const y of [-1.16, 1.16]) {
          const roller = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 3.42, 32), gold);
          roller.rotation.z = Math.PI / 2;
          roller.position.set(0, y, .08);
          roller.userData.rollerY = y;
          scrollRoot.add(roller);
          animated.push(roller);
          for (const x of [-1.83, 1.83]) {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(.25, 24, 18), paleGold);
            cap.position.set(x, y, .08);
            cap.userData.rollerY = y;
            scrollRoot.add(cap);
            animated.push(cap);
          }
        }
        for (let index = 0; index < 5; index += 1) {
          const line = new THREE.Mesh(new RoundedBoxGeometry(1.75 - index * .12, .055, .035, 3, .02), ink);
          line.position.set(-.18 + (index % 2) * .17, .62 - index * .3, .14);
          line.userData.inkLine = index;
          scrollRoot.add(line);
          animated.push(line);
        }
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .09, 40), new THREE.MeshPhysicalMaterial({ color: 0xa83f36, roughness: .34, clearcoat: .5 }));
        seal.rotation.x = Math.PI / 2;
        seal.position.set(.75, -.67, .17);
        seal.userData.seal = true;
        scrollRoot.add(seal);
        animated.push(seal);
        const ribbon = new THREE.Mesh(new RoundedBoxGeometry(.18, .78, .04, 3, .02), new THREE.MeshStandardMaterial({ color: 0x8a2f38, roughness: .45 }));
        ribbon.position.set(.75, -.98, .13);
        ribbon.userData.seal = true;
        scrollRoot.add(ribbon);
        animated.push(ribbon);
      } else if (outcome.cellType === "setback") {
        const ledgeMaterial = new THREE.MeshStandardMaterial({ color: 0x5d5550, roughness: .94, flatShading: true });
        const ledge = new THREE.Mesh(new RoundedBoxGeometry(4.5, .46, 2.1, 3, .12), ledgeMaterial);
        ledge.position.y = -1.02;
        ledge.castShadow = true;
        root.add(ledge);
        const rockColors = [0x68635f, 0x81756b, 0x4d4c4b, 0x9a745d];
        for (let index = 0; index < 9; index += 1) {
          const geometry = new THREE.IcosahedronGeometry(.32 + (index % 4) * .1, 1);
          const positions = geometry.attributes.position;
          for (let vertex = 0; vertex < positions.count; vertex += 1) {
            const factor = .82 + ((vertex * 17 + index * 13) % 23) / 58;
            positions.setXYZ(vertex, positions.getX(vertex) * factor, positions.getY(vertex) * (factor + .08), positions.getZ(vertex) * factor);
          }
          geometry.computeVertexNormals();
          const rock = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: rockColors[index % rockColors.length], roughness: .98, flatShading: true }));
          rock.position.set((index - 4) * .49, 3.1 + (index % 3) * .65, (index % 2) * .38);
          rock.userData.rock = { index, startY: rock.position.y, endY: -.6 + (index % 3) * .12, delay: index * .1 };
          rock.castShadow = true;
          root.add(rock);
          animated.push(rock);
        }
        for (let index = 0; index < 22; index += 1) {
          const dust = new THREE.Mesh(
            new THREE.SphereGeometry(.11 + (index % 4) * .035, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xc8aa83, transparent: true, opacity: .5 }),
          );
          dust.position.set(0, -.72, .4);
          dust.scale.y = .45;
          dust.userData.dust = { index, angle: index * 2.399 };
          root.add(dust);
          animated.push(dust);
        }
      } else if (outcome.cellType === "accelerate") {
        const aqua = new THREE.MeshPhysicalMaterial({ color: 0x77e0d4, roughness: .14, metalness: .22, transparent: true, opacity: .86, emissive: 0x174e4b, emissiveIntensity: .7 });
        for (let index = 0; index < 6; index += 1) {
          const wind = new THREE.Mesh(new THREE.TorusGeometry(.65 + index * .25, .045, 12, 88, Math.PI * 1.65), aqua);
          wind.rotation.x = 1.08;
          wind.rotation.z = index * .62;
          wind.userData.wind = index;
          root.add(wind);
          animated.push(wind);
        }
        if (outcome.effectText.toLowerCase().includes("бросок")) {
          const bonusDie = new THREE.Mesh(new RoundedBoxGeometry(1.18, 1.18, 1.18, 6, .16), gold);
          bonusDie.userData.bonusDie = true;
          bonusDie.castShadow = true;
          root.add(bonusDie);
          animated.push(bonusDie);
        }
      } else if (outcome.cellType === "finish") {
        const crown = new THREE.Group();
        crown.position.y = -.1;
        crown.rotation.x = -.08;
        root.add(crown);
        const velvet = new THREE.MeshPhysicalMaterial({ color: 0x7d2134, roughness: .42, clearcoat: .35, side: THREE.DoubleSide });
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.32, .58, 64, 1, true), gold);
        band.position.y = -.45;
        band.castShadow = true;
        crown.add(band);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.2, .48, 64, 1, true), velvet);
        inner.position.y = -.42;
        crown.add(inner);
        for (const y of [-.72, -.17]) {
          const rail = new THREE.Mesh(new THREE.TorusGeometry(y === -.72 ? 1.31 : 1.19, .09, 18, 80), paleGold);
          rail.rotation.x = Math.PI / 2;
          rail.position.y = y;
          crown.add(rail);
        }
        const pointShape = new THREE.Shape();
        pointShape.moveTo(-.3, 0);
        pointShape.bezierCurveTo(-.24, .28, -.22, .72, 0, 1.18);
        pointShape.bezierCurveTo(.22, .72, .24, .28, .3, 0);
        pointShape.closePath();
        const pointGeometry = new THREE.ExtrudeGeometry(pointShape, { depth: .14, bevelEnabled: true, bevelSegments: 3, bevelSize: .045, bevelThickness: .045 });
        pointGeometry.center();
        const pointHeights = [.86, 1.08, 1.28, 1.08, .86];
        for (let index = 0; index < 5; index += 1) {
          const point = new THREE.Mesh(pointGeometry.clone(), index === 2 ? paleGold : gold);
          point.scale.y = pointHeights[index];
          point.position.set((index - 2) * .55, .38 + Math.abs(index - 2) * -.08, .05 - Math.abs(index - 2) * .06);
          point.castShadow = true;
          crown.add(point);
          const pearl = new THREE.Mesh(new THREE.SphereGeometry(.11 + (index === 2 ? .035 : 0), 20, 16), paleGold);
          pearl.position.set(point.position.x, 1.03 * pointHeights[index] + point.position.y - .15, point.position.z + .1);
          crown.add(pearl);
        }
        const jewelColors = [0x56c6c1, 0xd55358, 0x7b68c7, 0xd55358, 0x56c6c1];
        for (let index = 0; index < 5; index += 1) {
          const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(.16, 0), new THREE.MeshPhysicalMaterial({ color: jewelColors[index], emissive: jewelColors[index], emissiveIntensity: .48, roughness: .08, metalness: .2 }));
          jewel.position.set((index - 2) * .46, -.43, 1.22 - Math.abs(index - 2) * .045);
          jewel.rotation.z = Math.PI / 4;
          crown.add(jewel);
        }
        crown.userData.crown = true;
        animated.push(crown);

        const fireworkColors = [0xffd65e, 0x6ee5d6, 0xf18bc8, 0xff8b5e];
        const origins = [{ x: -2.35, y: 1.35 }, { x: 2.35, y: 1.55 }, { x: 0, y: 2.15 }];
        for (let burst = 0; burst < origins.length; burst += 1) {
          for (let index = 0; index < 22; index += 1) {
            const angle = (index / 22) * Math.PI * 2 + burst * .35;
            const spark = new THREE.Mesh(
              new THREE.SphereGeometry(.035 + (index % 3) * .012, 8, 8),
              new THREE.MeshBasicMaterial({ color: fireworkColors[(index + burst) % fireworkColors.length], transparent: true, opacity: 1 }),
            );
            spark.userData.firework = { burst, index, angle, speed: 1.1 + (index % 5) * .13, origin: origins[burst] };
            root.add(spark);
            animated.push(spark);
          }
        }
      } else {
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18, 3), purple);
        orb.userData.orb = true;
        root.add(orb);
        animated.push(orb);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(1.75, .06, 16, 96), gold);
        halo.rotation.x = .9;
        halo.userData.halo = true;
        root.add(halo);
        animated.push(halo);
      }

      if (outcome.cellType !== "setback" && outcome.cellType !== "finish") {
        const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffdc68 });
        for (let index = 0; index < 30; index += 1) {
          const particle = new THREE.Mesh(new THREE.SphereGeometry(.028 + (index % 3) * .012, 9, 9), particleMaterial);
          particle.userData.particle = index;
          root.add(particle);
          animated.push(particle);
        }
      }

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), new THREE.ShadowMaterial({ color: 0x160f0a, opacity: .28 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.2;
      floor.receiveShadow = true;
      scene.add(floor);
      const started = performance.now();
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

      const render = (time: number) => {
        const elapsed = (time - started) / 1000;
        const enter = Math.min(1, elapsed / .62);
        const eased = 1 - Math.pow(1 - enter, 3);
        root.scale.setScalar(.4 + eased * .6);
        if (outcome.cellType !== "setback") root.rotation.y = Math.sin(elapsed * .65) * .11;
        for (const object of animated) {
          if (object.userData.lid) object.rotation.x = -Math.min(1, Math.max(0, (elapsed - .42) / 1.05)) * 1.48;
          if (object.userData.chestGlow) {
            (object as InstanceType<typeof THREE.PointLight>).intensity = Math.max(0, Math.min(12, (elapsed - .45) * 10));
          }
          if (object.userData.coin != null) {
            const index = Number(object.userData.coin);
            const rise = Math.max(0, Math.min(1, (elapsed - .72 - index * .018) / .75));
            object.position.y += Math.sin(elapsed * 3.1 + index) * .0025;
            object.position.y = Math.max(object.position.y, .12 + Math.floor(index / 6) * .1 + rise * (.42 + index % 3 * .08));
            object.rotation.z += .018 + index % 4 * .003;
          }
          if (object.userData.sheet) {
            const open = Math.max(.04, Math.min(1, (elapsed - .2) / .9));
            object.scale.y = 1 - Math.pow(1 - open, 3);
          }
          if (object.userData.rollerY != null) {
            const open = Math.max(.04, Math.min(1, (elapsed - .2) / .9));
            object.position.y = Number(object.userData.rollerY) * (1 - Math.pow(1 - open, 3));
            object.rotation.x += .01 * Math.sign(Number(object.userData.rollerY));
          }
          if (object.userData.inkLine != null || object.userData.seal) {
            const reveal = Math.max(.01, Math.min(1, (elapsed - .75 - Number(object.userData.inkLine || 0) * .05) / .38));
            object.scale.setScalar(reveal);
          }
          if (object.userData.rock) {
            const data = object.userData.rock as { index: number; startY: number; endY: number; delay: number };
            const fall = Math.max(0, Math.min(1, (elapsed - data.delay) / .72));
            const impact = fall * fall;
            const bounceTime = Math.max(0, elapsed - data.delay - .72);
            const bounce = bounceTime > 0 ? Math.sin(bounceTime * 14) * Math.exp(-bounceTime * 5) * .18 : 0;
            object.position.y = data.startY + (data.endY - data.startY) * impact + bounce;
            object.rotation.x = elapsed * (1.4 + data.index * .08);
            object.rotation.z = elapsed * (.9 + data.index * .06);
          }
          if (object.userData.dust) {
            const data = object.userData.dust as { index: number; angle: number };
            const age = Math.max(0, Math.min(1, (elapsed - .72 - (data.index % 9) * .1) / 1.05));
            const radius = age * (1.1 + data.index % 4 * .14);
            object.position.set(Math.cos(data.angle) * radius, -.72 + Math.sin(data.angle * 1.4) * .14 + age * .32, .35 + Math.sin(data.angle) * radius * .35);
            object.scale.setScalar(Math.max(.01, age * (1 - age) * 3.4));
          }
          if (object.userData.wind != null) {
            const index = Number(object.userData.wind);
            object.rotation.z += .025 + index * .002;
            object.position.y = Math.sin(elapsed * 2.2 + index) * .18;
          }
          if (object.userData.bonusDie) {
            object.rotation.x += .035;
            object.rotation.y += .045;
            object.position.y = Math.sin(elapsed * 2.6) * .2;
          }
          if (object.userData.crown) {
            object.position.y = -.1 + Math.sin(elapsed * 1.8) * .1;
            object.rotation.y = Math.sin(elapsed * .7) * .14;
          }
          if (object.userData.firework) {
            const data = object.userData.firework as { burst: number; index: number; angle: number; speed: number; origin: { x: number; y: number } };
            const local = Math.max(0, (elapsed - .6 - data.burst * .35) % 3.1);
            const travel = Math.min(1, local / 1.35);
            const radius = travel * 1.55 * data.speed;
            object.position.set(
              data.origin.x + Math.cos(data.angle) * radius,
              data.origin.y + Math.sin(data.angle) * radius - travel * travel * .48,
              -.15 + Math.sin(data.angle * 1.8) * .24,
            );
            const fade = local < 1.55 ? Math.max(.04, 1 - travel * .78) : .01;
            object.scale.setScalar(fade);
          }
          if (object.userData.orb) {
            object.rotation.x += .01;
            object.rotation.y += .016;
          }
          if (object.userData.halo) object.rotation.z += .012;
          if (object.userData.particle != null) {
            const index = Number(object.userData.particle);
            const angle = elapsed * (1 + index % 4 * .15) + index * 2.399;
            const radius = 1.48 + (index % 6) * .16;
            object.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.7) * 1.2, Math.sin(angle) * .6);
          }
        }
        renderer.render(scene, camera);
        if (!cancelled) frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
      cleanup = () => {
        cancelAnimationFrame(frame);
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
        mount.classList.remove("webgl-ready");
      };
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      cleanup?.();
      resizeObserver?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [outcome.cellType, outcome.effectText]);

  const copy = COPY[outcome.cellType] || COPY.surprise;
  return (
    <div className={`event-cinematic cinematic-${outcome.cellType}`} role="dialog" aria-modal="true" aria-label={cinematicTitle(outcome)}>
      <div className="event-cinematic-glow" />
      <button className="cinematic-close" onClick={onContinue} aria-label="Продолжить"><X /></button>
      <div className="event-webgl-stage" ref={mountRef}><span className="event-fallback-symbol">{copy.symbol}</span></div>
      <div className="event-cinematic-copy">
        <p>{copy.eyebrow}</p>
        <h3>{cinematicTitle(outcome)}</h3>
        <strong className={outcome.cellType === "trap" ? "cinematic-task-text" : undefined}>{cinematicDetail(outcome)}</strong>
        <button className="cinematic-continue" onClick={onContinue}>Продолжить <ArrowRight /></button>
      </div>
    </div>
  );
}
