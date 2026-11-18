import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { COL } from './palette';
import { PAD_H } from './Ground';
import { nodeMap, polyline, polyLen, along, slice, TRUCK_GAP } from './geo';
import { useQueuePaths } from './Roads';
import { useUI, peekHold, peekLeave } from '../store';
import { useView } from '../view';
import { Icon } from '../ui/Icon';

function useCause() {
  const data = useUI((s) => s.data)!;
  return useMemo(() => {
    const ids = data.diagnosis.cause.blocks;
    const bs = data.layout.terminals.flatMap((t) => t.blocks).filter((b) => ids.includes(b.id));
    const x = bs.reduce((a, b) => a + b.cx, 0) / bs.length;
    const z = bs.reduce((a, b) => a + b.cz, 0) / bs.length;
    const C = data.layout.container;
    const zs = bs.map((b) => b.cz);
    return { x, z, w: bs[0].bays * (C.L + C.gapL) + 2, d: Math.max(...zs) - Math.min(...zs) + bs[0].rows * (C.W + C.gapW) + 2 };
  }, [data]);
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 원인 위치: 빨간 테두리 + 퍼지는 링 + 원인 카드
export function CauseMarker() {
  const { data, st } = useView();
  const c = useCause();
  const ring1 = useRef<THREE.Mesh>(null!), ring2 = useRef<THREE.Mesh>(null!);
  const mat1 = useRef<THREE.MeshBasicMaterial>(null!), mat2 = useRef<THREE.MeshBasicMaterial>(null!);
  const beam = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(({ clock }) => {
    if (reduceMotion()) return;
    // 퍼져 나가는 파동 링 2개(반 박자 차이) + 기둥 빛 맥박
    const T = clock.elapsedTime;
    [[ring1, mat1, 0], [ring2, mat2, 0.5]].forEach(([r, m, off]) => {
      const t = ((T / 1.4 + (off as number)) % 1);
      (r as typeof ring1).current.scale.set(1 + t * 1.6, 1 + t * 1.6, 1);
      (m as typeof mat1).current.opacity = 0.9 * (1 - t);
    });
    beam.current.opacity = 0.26 + 0.16 * (0.5 + 0.5 * Math.sin(T * 4.5));
  });
  const occ = Math.round(Math.max(...data.diagnosis.cause.blocks.map((b) => st.occ[b] ?? 0)) * 100);
  if (occ < 88) return null;
  const r = Math.max(c.w, c.d) / 2 + 12;
  // 위에 덮어 그리기: 컨테이너·크레인에 가려지지 않게
  const top = { depthTest: false, depthWrite: false, transparent: true } as const;
  return (
    <group position={[c.x, PAD_H + 0.08, c.z]}>
      {/* 안쪽 원판 + 굵은 이중 실선 링 */}
      <mesh rotation-x={-Math.PI / 2} renderOrder={10}>
        <circleGeometry args={[r, 72]} />
        <meshBasicMaterial color={COL.red} opacity={0.2} {...top} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} renderOrder={12}>
        <ringGeometry args={[r - 3.6, r, 96]} />
        <meshBasicMaterial color={COL.red} opacity={1} {...top} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} renderOrder={12}>
        <ringGeometry args={[r - 6.2, r - 5.2, 96]} />
        <meshBasicMaterial color={COL.red} opacity={0.85} {...top} />
      </mesh>
      {/* 퍼지는 파동 링 */}
      <mesh ref={ring1} rotation-x={-Math.PI / 2} renderOrder={11}>
        <ringGeometry args={[r - 2.6, r, 96]} />
        <meshBasicMaterial ref={mat1} color={COL.red} opacity={0.9} {...top} />
      </mesh>
      <mesh ref={ring2} rotation-x={-Math.PI / 2} renderOrder={11}>
        <ringGeometry args={[r - 2.6, r, 96]} />
        <meshBasicMaterial ref={mat2} color={COL.red} opacity={0.5} {...top} />
      </mesh>
      {/* 경보 기둥 빛: 멀리서도 위치가 보이게 */}
      <mesh position-y={18} renderOrder={9}>
        <cylinderGeometry args={[r * 0.55, r * 0.75, 36, 48, 1, true]} />
        <meshBasicMaterial ref={beam} color={COL.red} opacity={0.2} side={THREE.DoubleSide} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// 전파 경로: 원인 → 게이트 → 대기열 끝, 빨간 점선 화살표
export function Propagation() {
  const { data, queues } = useView();
  const c = useCause();
  const paths = useQueuePaths(data.layout);
  const p = paths[data.diagnosis.congestion.node];
  const q = queues[data.diagnosis.congestion.node] ?? 0;
  const pts = useMemo(() => {
    if (q < 40) return null;
    const tail = slice(p.pts, Math.min(p.len, q * TRUCK_GAP + 1));
    const y = 4;
    return [new THREE.Vector3(c.x, y, c.z), ...tail.map(([x, z]) => new THREE.Vector3(x, y, z))];
  }, [p, q, c]);
  if (!pts) return null;
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  const dir = end.clone().sub(prev).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return (
    <group>
      <Line points={pts} color={COL.orange} lineWidth={16} transparent opacity={0.18} />
      <Line points={pts} color={COL.orange} lineWidth={7} dashed dashSize={5} gapSize={3} />
      <mesh position={end} quaternion={quat}>
        <coneGeometry args={[3.4, 8, 16]} />
        <meshBasicMaterial color={COL.orange} />
      </mesh>
    </group>
  );
}

// 대기열 끝에 붙는 카드: 몇 대가 어디까지 밀렸는지
export function QueueTags() {
  const { data, queues, step } = useView();
  const paths = useQueuePaths(data.layout);
  return (
    <>
      {Object.entries(paths).map(([gid, p]) => {
        const q = queues[gid] ?? 0;
        if (q < 15) return null;
        const d = Math.min(p.len, q * TRUCK_GAP + 3);
        const s = along(p.pts, d);
        const jam = q >= 40;
        const km = (d * 10 / 1000).toFixed(1);
        if (step >= 3 && gid === data.action.to.node) return null;
        return (
          <Html key={gid} position={[s.x, 4, s.z]} zIndexRange={[25, 0]} style={{ pointerEvents: 'none', transform: 'translate(14px, -50%)' }}>
            <div className={`tag ${jam ? 'tag-jam' : 'tag-warn'}`}>
              <span className="tag-k">{jam ? '대기열 넘침' : '대기 증가'}</span>
              <span className="tag-v">{data.layout.nodes.find((n) => n.id === gid)!.terminal} 게이트 {q}대 · {km} km</span>
            </div>
          </Html>
        );
      })}
    </>
  );
}

// 대응 경로와 이동하는 파란 트럭
export function ActionRoute() {
  const { data, step, simT, simMode, moved } = useView();
  const decision = useUI((s) => s.decision);
  const simCand = useUI((s) => s.simCand);
  const l = data.layout;
  const N = nodeMap(l);
  const tb = useMemo(() => l.terminals.flatMap((t) => t.blocks).find((b) => b.temp)!, [l]);
  const pts2 = useMemo(() => [...polyline(l, data.action.route), [tb.cx, tb.cz] as [number, number]], [l, data, tb]);
  const len = polyLen(pts2);
  const ref = useRef<THREE.InstancedMesh>(null!);
  const n = 22;
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const show = step >= 3 && simMode === 'after';
  const moving = show && moved < data.action.volume.value - 1;
  useFrame(() => {
    if (!ref.current) return;
    let k = 0;
    if (moving) {
      for (let i = 0; i < n; i++) {
        const d = ((i / n) * len + simT * 60) % len;
        const s = along(pts2, d);
        q.setFromAxisAngle(up, -Math.atan2(s.dz, s.dx));
        m.compose(new THREE.Vector3(s.x + -s.dz * 1.35, 0.85, s.z + s.dx * 1.35), q, new THREE.Vector3(1, 1, 1));
        ref.current.setMatrixAt(k++, m);
      }
    }
    ref.current.count = k;
    ref.current.instanceMatrix.needsUpdate = true;
  });
  // 경로·임시 블록은 터미널 간 이동 후보(ACT-01)를 재생할 때만 그린다
  if (!show || (simMode === 'after' && !data.cands.candidates.find((c) => c.id === simCand)?.route)) return null;
  const v = pts2.map(([x, z]) => new THREE.Vector3(x, 1.2, z));
  const g = N[data.action.to.node];
  return (
    <group>
      {pts2.slice(1).map((b, i) => {
        const a = pts2[i];
        const sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return (
          <mesh key={i} position={[(a[0] + b[0]) / 2, 0.44, (a[1] + b[1]) / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(b[1] - a[1], b[0] - a[0])]}>
            <planeGeometry args={[sl + 8, 8]} />
            <meshBasicMaterial color={COL.blue} transparent opacity={decision === 'approved' ? 0.45 : 0.28} depthWrite={false} />
          </mesh>
        );
      })}
      <Line points={v} color={COL.blue} lineWidth={decision === 'approved' ? 4.5 : 3} dashed={decision !== 'approved'} dashSize={3} gapSize={1.6} />
      <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false} castShadow>
        <boxGeometry args={[2.6, 1, 1]} />
        <meshStandardMaterial color={COL.blue} emissive={COL.blue} emissiveIntensity={0.3} />
      </instancedMesh>
      <ShiftBlink x={g.x} z={g.z} />
    </group>
  );
}

// 혼잡 전가: 대응 후 나빠지는 곳의 주황 점멸 테두리
function ShiftBlink({ x, z }: { x: number; z: number }) {
  const { queues, data } = useView();
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const q = queues[data.action.to.node] ?? 0;
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = reduceMotion() ? 0.9 : 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 5));
  });
  if (q < 13) return null;
  return (
    <group position={[x, 0.5, z]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[9, 10.2, 4, 1]} />
        <meshBasicMaterial ref={mat} color={COL.orange} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// 터미널 카드: 이름 + 장치율(수치와 막대) + 게이트 대기
export function Labels() {
  const { data, st, step } = useView();
  const focus = useUI((s) => s.focus);
  const l = data.layout;
  return (
    <group>
      {step === 1 && <TerminalHover />}
      {l.terminals.map((t) => {
        // 블록 라벨이 뜨는 터미널(진단 DGT, 확대한 터미널)은 카드가 블록 칩을 가리므로 숨긴다
        if (t.id === (step === 2 ? 'DGT' : step === 1 && focus !== 'port' ? focus : null)) return null;
        const r = t.rect;
        const occ = Math.round((t.blocks.filter((b) => !b.temp).reduce((a, b) => a + (st.occ[b.id] ?? 0), 0) / t.blocks.filter((b) => !b.temp).length) * 100);
        const lvl = occ >= 85 ? 'hi' : occ >= 75 ? 'mid' : 'lo';
        // 정렬 규칙: 모든 카드는 터미널 왼쪽 끝에 맞춘다. 북쪽 부두는 위, 남쪽 부두와 DGT는 아래(DGT 위는 HJNC 카드와 같은 줄이라 겹침).
        const above = t.quay !== 'N' && t.id !== 'DGT';
        const pos: [number, number, number] = [r.x0, 2, above ? r.z0 - 3 : r.z1 + 3];
        const anchor = above ? 'translate(0, -100%)' : 'translate(0, 0)';
        const dim = step >= 2 && !focus.includes(t.id);
        return (
          <Html key={t.id} position={pos} zIndexRange={[20, 0]} style={{ pointerEvents: 'none', transform: anchor }}>
            {(() => {
              return (
                <div
                  data-tid={t.id}
                  className={`tbox ${dim ? 'is-dim' : ''} ${lvl === 'hi' ? 'is-hi' : ''}`}
                >
                  <div className="tbox-main"><div className="tbox-id"><b>{t.name}</b></div></div>
                </div>
              );
            })()}
          </Html>
        );
      })}
      {l.nodes.filter((n) => n.kind === 'wait').map((n) => (
        <Html key={n.id} position={[n.x, 3, n.z - 9]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="plain-label">{n.name}</div>
        </Html>
      ))}
      {step === 2 && <CraneStatus />}
    </group>
  );
}

// 확대했을 때 블록마다 번호와 장치율 (터미널을 눌렀을 때, S2의 DGT)
export function BlockLabels() {
  const { data, st, step } = useView();
  const focus = useUI((s) => s.focus);
  const id = step === 2 ? 'DGT' : step === 1 && focus !== 'port' ? focus : null;
  const t = id ? data.layout.terminals.find((x) => x.id === id) : null;
  if (!t) return null;
  const cause = data.diagnosis.cause.blocks;
  return (
    <>
      {t.blocks.map((b) => {
        const o = Math.round((st.occ[b.id] ?? 0) * 100);
        const lvl = cause.includes(b.id) && o >= 88 ? 'cause' : o >= 85 ? 'hi' : o >= 75 ? 'mid' : 'lo';
        return (
          <Html key={b.id} position={[b.cx, 5.2, b.cz]} center zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`bchip bchip-${lvl}`}><b>{b.id.split('-')[1]}</b>{b.temp ? '임시' : `${o}%`}</div>
          </Html>
        );
      })}
    </>
  );
}

// S2: DGT 안벽 크레인 상태
function CraneStatus() {
  const data = useUI((s) => s.data)!;
  const t = data.layout.terminals.find((x) => x.id === 'DGT')!;
  const n = Math.floor((t.rect.z1 - t.rect.z0) / 15);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const busy = i < 3;
        return (
          <Html key={i} position={[t.rect.x1 + 14, 12, t.rect.z0 + 7.5 + i * 15]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`qc ${busy ? 'qc-busy' : 'qc-idle'}`}>
              <Icon name={busy ? 'dot' : 'wait'} size={10} />QC{i + 1} {busy ? '작업' : '대기'}
            </div>
          </Html>
        );
      })}
    </>
  );
}

// 터미널 구역 어디든 마우스를 올리면 그 터미널의 CCTV 병목 히트맵을 띄운다(관제 화면)
// 구역 모서리를 화면 좌표로 옮겨 포함 여부로 판정한다(장비·컨테이너가 위에 있어도 구역 안이면 된다)
function TerminalHover() {
  const { camera, gl, controls } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    // 확대한 상태: 카드로 구역을 골랐거나, 마우스 휠로 항만 전체 화면보다 확대한 경우
    const isZoomed = () => {
      const minZ = (controls as unknown as { minZoom?: number } | null)?.minZoom;
      return useUI.getState().focus !== 'port' || (minZ !== undefined && (camera as THREE.OrthographicCamera).zoom > minZ * 1.35);
    };
    const inPoly = (px: number, py: number, p: [number, number][]) => {
      let c = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if ((p[i][1] > py) !== (p[j][1] > py) && px < ((p[j][0] - p[i][0]) * (py - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
      }
      return c;
    };
    // 확대한 화면(focus가 항만 전체가 아님)에서는 마우스를 올려도 뜨지 않는다. 터미널 안을 눌러야 뜬다
    const hitOf = (e: PointerEvent | MouseEvent) => {
      const d = useUI.getState().data;
      if (!d) return null;
      const b = el.getBoundingClientRect();
      const px = e.clientX - b.left, py = e.clientY - b.top;
      for (const t of d.layout.terminals) {
        const r = t.rect;
        const poly = ([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] as [number, number][]).map(([x, z]) => {
          const v = new THREE.Vector3(x, 0, z).project(camera);
          return [((v.x + 1) / 2) * b.width, ((1 - v.y) / 2) * b.height] as [number, number];
        });
        if (inPoly(px, py, poly)) return t.id;
      }
      return null;
    };
    // 위쪽 터미널 줄(남쪽 부두) 바로 아래 바다의 화면 높이: 아래쪽 터미널의 히트맵이 뜨는 자리
    const seaYOf = () => {
      const d = useUI.getState().data;
      if (!d) return 0;
      const zmax = Math.max(...d.layout.terminals.filter((t) => t.quay === 'S').map((t) => t.rect.z1)) + 4;
      const v = new THREE.Vector3(0, 0, zmax).project(camera);
      return el.getBoundingClientRect().top + ((1 - v.y) / 2) * el.getBoundingClientRect().height;
    };
    let down: [number, number] | null = null;
    const move = (e: PointerEvent) => {
      const s = useUI.getState();
      const zoomed = isZoomed();
      const hit = hitOf(e);
      if (hit && (!zoomed || s.peek)) { peekHold(); s.set({ peek: { tid: zoomed ? s.peek!.tid : hit, x: e.clientX, y: e.clientY, seaY: seaYOf() } }); }
      else if (!hit && s.peek) peekLeave();
    };
    const pdown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const click = (e: MouseEvent) => {
      const s = useUI.getState();
      if (!isZoomed() || (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5)) return;
      const hit = hitOf(e);
      if (hit) { peekHold(); s.set({ peek: { tid: hit, x: e.clientX, y: e.clientY, seaY: seaYOf() } }); }
      else if (s.peek) peekLeave(0);
    };
    const leave = () => { peekLeave(); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', pdown);
    el.addEventListener('click', click);
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerdown', pdown); el.removeEventListener('click', click); el.removeEventListener('pointerleave', leave); useUI.getState().set({ peek: null }); };
  }, [camera, gl, controls]);
  return null;
}
