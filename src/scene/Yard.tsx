import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COL, BOX } from './palette';
import { PAD_H } from './Ground';
import { hash } from './geo';
import { useView } from '../view';
import type { Layout } from '../data/types';

const MAX_TIER = 5;

interface Stack { x: number; z: number; block: string; noise: number; color: THREE.Color }

function stacksOf(l: Layout): Stack[] {
  const C = l.container;
  const out: Stack[] = [];
  for (const t of l.terminals) for (const b of t.blocks) {
    const bl = b.bays * (C.L + C.gapL), bw = b.rows * (C.W + C.gapW);
    for (let i = 0; i < b.bays; i++) for (let r = 0; r < b.rows; r++) {
      const key = `${b.id}-${i}-${r}`;
      out.push({
        x: b.cx - bl / 2 + (i + 0.5) * (C.L + C.gapL),
        z: b.cz - bw / 2 + (r + 0.5) * (C.W + C.gapW),
        block: b.id,
        noise: hash(key),
        color: new THREE.Color(BOX[Math.floor(hash(key + 'c') * BOX.length)]),
      });
    }
  }
  return out;
}

export function tierOf(occ: number, noise: number) {
  return Math.max(0, Math.min(MAX_TIER, Math.round(occ * MAX_TIER + (noise - 0.5) * 2.2)));
}

// 컨테이너: 블록 장치율만큼 최대 5단으로 쌓는다
export function Containers() {
  const { data, st } = useView();
  const l = data.layout;
  const C = l.container;
  const stacks = useMemo(() => stacksOf(l), [l]);
  const ref = useRef<THREE.InstancedMesh>(null!);
  const max = stacks.length * MAX_TIER;

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const s of stacks) {
      const tiers = tierOf(st.occ[s.block] ?? 0, s.noise);
      for (let k = 0; k < tiers; k++) {
        m.makeTranslation(s.x, PAD_H + (k + 0.5) * C.H, s.z);
        ref.current.setMatrixAt(n, m);
        // 아래 단은 조금 어둡게: 확대했을 때 단 수가 읽히게
        ref.current.setColorAt(n, c.copy(s.color).multiplyScalar(0.8 + 0.05 * k));
        n++;
      }
    }
    ref.current.count = n;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [st, stacks, C]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, max]} frustumCulled={false} castShadow receiveShadow>
      <boxGeometry args={[C.L, C.H * 0.94, C.W]} />
      <meshStandardMaterial roughness={0.75} metalness={0.02} />
    </instancedMesh>
  );
}

// 장치율 바닥 표시(항상): 85% 이상 주황 진하게, 75~85% 주황 옅게
export function OccupancyPads() {
  const { data, st } = useView();
  const l = data.layout;
  const C = l.container;
  const blocks = useMemo(() => l.terminals.flatMap((t) => t.blocks), [l]);
  return (
    <group>
      {blocks.map((b) => {
        const o = st.occ[b.id] ?? 0;
        if (o < 0.75 || b.temp) return null;
        const bl = b.bays * (C.L + C.gapL) + 1.4, bw = b.rows * (C.W + C.gapW) + 1.4;
        return (
          <mesh key={b.id} position={[b.cx, PAD_H + 0.04, b.cz]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[bl, bw]} />
            <meshBasicMaterial color={COL.orange} transparent opacity={o >= 0.85 ? 0.62 : 0.3} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

// 대응: HJNC 임시 블록에 쌓이는 파란 컨테이너
export function TempFill() {
  const { data, step, moved, simMode } = useView();
  const l = data.layout;
  const C = l.container;
  const block = useMemo(() => l.terminals.flatMap((t) => t.blocks).find((b) => b.temp)!, [l]);
  const ref = useRef<THREE.InstancedMesh>(null!);
  const cap = block.bays * block.rows * 4;
  useLayoutEffect(() => {
    const n = step >= 3 && simMode === 'after' ? Math.round((moved / data.action.volume.value) * cap * 0.9) : 0;
    const bl = block.bays * (C.L + C.gapL), bw = block.rows * (C.W + C.gapW);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const per = block.bays * block.rows;
      const k = Math.floor(i / per), j = i % per;
      const bay = j % block.bays, row = Math.floor(j / block.bays);
      m.makeTranslation(block.cx - bl / 2 + (bay + 0.5) * (C.L + C.gapL), PAD_H + (k + 0.5) * C.H, block.cz - bw / 2 + (row + 0.5) * (C.W + C.gapW));
      ref.current.setMatrixAt(i, m);
    }
    ref.current.count = n;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [moved, step, simMode, block, C, cap, data.action.volume.value]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cap]} frustumCulled={false} castShadow>
      <boxGeometry args={[C.L, C.H * 0.94, C.W]} />
      <meshStandardMaterial color={COL.blue} emissive={COL.blue} emissiveIntensity={0.25} roughness={0.5} />
    </instancedMesh>
  );
}
