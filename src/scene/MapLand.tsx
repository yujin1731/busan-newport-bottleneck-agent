import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { COL, BOX } from './palette';
import { Boxes, type Bx } from './Equipment';
import { PAD_H } from './Ground';
import { hash } from './geo';
import { useUI } from '../store';
import type { Layout } from '../data/types';

// 지도형 지형: 실제 신항 배치(북컨 일직선, 동쪽 BNMT, 남컨 사선 부두, 북쪽 배후단지·시가지, 녹지)를
// 평평한 다각형으로 그린다. 좌표는 장면 좌표(x 동쪽, z 남쪽).
type Pt = [number, number];
type Poly = { pts: Pt[]; color: string; y: number };

const C_LAND = COL.land;
const C_PARCEL = '#dfe2ea'; // 배후단지 필지
const C_GREEN = '#d2e4c6'; // 녹지(지도형, 높이 없음)
const C_CITY = '#e7e8e4'; // 시가지 바탕
const C_ROAD = '#ffffff';

function polys(l: Layout): Poly[] {
  const T = Object.fromEntries(l.terminals.map((t) => [t.id, t.rect]));
  const N = Object.fromEntries(l.nodes.map((n) => [n.id, n]));
  const north = T.HJNC.z0; // 북컨 터미널 북쪽 끝
  const RN = N.j_ne.z, RS = N.j_se.z, XE = N.j_ne.x;
  const out: Poly[] = [];
  const add = (pts: Pt[], color: string, y = 0) => out.push({ pts, color, y });

  // 북쪽 본토(배후단지 + 시가지)
  add([[-900, north], [900, north], [900, -900], [-900, -900]], C_LAND);
  // 서쪽(DGT 배후·웅동): 남서쪽 해안선은 비스듬히
  add([[-900, north], [T.DGT.x0, north], [T.DGT.x0, T.DGT.z1 + 30], [T.DGT.x0 - 60, T.DGT.z1 + 48], [-900, T.DGT.z1 + 60]], C_LAND);
  // 동쪽 BNMT 부두와 가덕도 쪽 육지
  add([[XE - 8, north], [900, north], [900, 900], [XE - 8, 900]], C_LAND);
  // 남컨 부두: 터미널 북쪽 끝을 따라 사선으로 이어지는 부두 + 서쪽 연장부
  const south: Pt[] = [
    [T.BCT.x0 - 80, T.BCT.z0 + 16], [T.BCT.x0, T.BCT.z0], [T.BCT.x1 + 4, T.BCT.z0],
    [T.BNCT.x0 - 4, T.BNCT.z0], [T.BNCT.x1 + 6, T.BNCT.z0], [T.HPNT.x0 - 6, T.HPNT.z0],
    [XE - 8, T.HPNT.z0 - 6], [XE - 8, 900], [T.BCT.x0 - 80, 900],
  ];
  add(south, C_LAND);
  // 남쪽 반도 해안(서쪽은 바다 쪽으로 비스듬히)
  add([[T.BCT.x0 - 80, RS + 20], [T.BCT.x0 - 140, RS + 90], [-900, RS + 220], [-900, 900], [T.BCT.x0 - 80, 900]], C_LAND);

  // 배후단지 필지: 북컨 뒤(도로 북쪽), 남컨 뒤(남측 도로 남쪽)
  const parcels = (x0: number, x1: number, z0: number, z1: number, w: number, d: number, gap: number) => {
    for (let x = x0; x + w <= x1; x += w + gap) for (let z = z0; z + d <= z1; z += d + gap) add([[x, z], [x + w, z], [x + w, z + d], [x, z + d]], C_PARCEL, 0.01);
  };
  parcels(T.HJNC.x0, XE - 20, RN - 72, RN - 10, 46, 26, 6); // 북컨 배후단지
  parcels(T.BCT.x0 - 40, XE - 20, RS + 10, RS + 66, 46, 22, 6); // 남컨 배후단지
  parcels(T.DGT.x0 - 150, T.DGT.x0 - 16, RN - 72, T.DGT.z1, 40, 26, 6); // 웅동 배후단지

  // 시가지(용원·웅천): 도로 격자
  add([[T.HJNC.x0 - 40, RN - 260], [XE + 40, RN - 260], [XE + 40, RN - 90], [T.HJNC.x0 - 40, RN - 90]], C_CITY, 0.005);
  for (let x = T.HJNC.x0 - 40; x <= XE + 40; x += 44) add([[x, RN - 260], [x + 2.4, RN - 260], [x + 2.4, RN - 90], [x, RN - 90]], C_ROAD, 0.02);
  for (let z = RN - 260; z <= RN - 90; z += 34) add([[T.HJNC.x0 - 40, z], [XE + 40, z], [XE + 40, z + 2.4], [T.HJNC.x0 - 40, z + 2.4]], C_ROAD, 0.02);

  // 녹지(산·공원을 지도처럼 평평하게)
  add([[T.DGT.x0 - 260, RN - 120], [T.DGT.x0 - 40, RN - 150], [T.HJNC.x0 - 50, RN - 230], [T.HJNC.x0 - 70, RN - 400], [T.DGT.x0 - 300, RN - 380]], C_GREEN, 0.01);
  add([[XE + 70, north + 30], [XE + 220, north - 20], [XE + 330, RS - 40], [XE + 200, RS + 120], [XE + 60, RS + 40]], C_GREEN, 0.01);
  add([[T.BCT.x0 - 60, RS + 90], [XE - 40, RS + 85], [XE + 40, RS + 300], [T.BCT.x0 - 100, RS + 320]], C_GREEN, 0.01);

  // 배후단지 구역 색(참고 지도: 웅동 보라, 북·남컨 황토). 지도처럼 옅게
  const ex = extras(l);
  add(ex.ungdong, '#e4def0', 0.004);
  add(ex.northBack, '#ece6d6', 0.004);
  add(ex.southBack, '#ece6d6', 0.004);
  add(ex.westBack, '#e6e2ee', 0.004);
  // 서컨·BNMT 부두 바닥(바다 위 매립지)
  for (const p of ex.piers) add(rect(p), C_LAND);
  // 서방파제(가는 둑)
  add(ex.breakwater, '#d9dde3', 0);
  // 토도(작은 섬)
  add(ex.todo, C_GREEN, 0);
  return out;
}

type R = { x0: number; x1: number; z0: number; z1: number };
const rect = (r: R): Pt[] => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];

// 실제 신항 배치에서 우리 운영 터미널(7곳) 밖에 있는 부두·구역
function extras(l: Layout) {
  const T = Object.fromEntries(l.terminals.map((t) => [t.id, t.rect]));
  const N = Object.fromEntries(l.nodes.map((n) => [n.id, n]));
  const RN = N.j_ne.z, RS = N.j_se.z, XE = N.j_ne.x, north = T.HJNC.z0, D = T.DGT;
  const feeder: R = { x0: D.x0, x1: D.x1, z0: north + 2, z1: D.z0 - 4 }; // 피더부두(BPA)
  const p26: R = { x0: D.x0, x1: D.x1, z0: D.z1 + 4, z1: D.z1 + 78 }; // 서컨 2-6단계
  const bnmt: R = { x0: T.PNIT.x1 + 14, x1: XE - 8, z0: T.PNIT.z1 - 2, z1: T.HPNT.z0 - 8 }; // BNMT·다목적부두
  const todo: Pt[] = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return [-66 + Math.cos(a) * 11, 56 + Math.sin(a) * 7] as Pt; });
  return {
    feeder, p26, bnmt, todo,
    piers: [feeder, p26, { x0: D.x0 - 30, x1: D.x0, z0: D.z1, z1: p26.z1 }, bnmt],
    ungdong: rect({ x0: D.x0 - 260, x1: D.x0 - 10, z0: RN - 230, z1: north - 4 }),
    northBack: rect({ x0: T.HJNC.x0 + 30, x1: XE - 30, z0: RN - 84, z1: RN - 6 }),
    southBack: rect({ x0: T.BCT.x0 - 60, x1: T.BNCT.x1, z0: RS + 6, z1: RS + 72 }),
    westBack: rect({ x0: D.x0 - 70, x1: D.x0 - 6, z0: north + 4, z1: p26.z1 }),
    breakwater: [[p26.x0 + 6, p26.z1 + 14], [p26.x0 + 12, p26.z1 + 10], [p26.x0 + 70, p26.z1 + 120], [p26.x0 + 64, p26.z1 + 124]] as Pt[],
    labels: [
      { t: '웅동배후단지', p: [D.x0 - 30, 0, RN - 62] },
      { t: '서컨테이너부두 배후단지', p: [D.x0 - 40, 0, 104], lo: true },
      { t: '북컨테이너부두 배후단지', p: [(T.PNC.x0 + T.PNC.x1) / 2, 0, RN - 60] },
      { t: '남컨테이너부두 배후단지', p: [T.BCT.x0 + 10, 0, RS + 40] },
      { t: '피더부두', p: [(D.x0 + D.x1) / 2, 0, (feeder.z0 + feeder.z1) / 2] },
      { t: '서컨 2-6단계', p: [(D.x0 + D.x1) / 2, 0, p26.z1 - 10] },
      { t: 'BNMT·다목적부두', p: [(bnmt.x0 + bnmt.x1) / 2, 0, (bnmt.z0 + bnmt.z1) / 2], lo: true },
      { t: '토도', p: [-66, 0, 56], lo: true },
      { t: '서방파제', p: [p26.x0 + 40, 0, p26.z1 + 70], lo: true },
    ] as { t: string; p: [number, number, number]; lo?: boolean }[],
  };
}

// 운영 터미널이 아닌 부두: 패드 + 컨테이너 줄(정적), 지명 라벨(관제 화면에서만)
export function MapExtras() {
  const l = useUI((s) => s.data)!.layout;
  const step = useUI((s) => s.step);
  const ex = useMemo(() => extras(l), [l]);
  const items = useMemo(() => {
    const out: Bx[] = [];
    const yard = (r: R, fill: number, key: string) => {
      out.push({ p: [(r.x0 + r.x1) / 2, PAD_H / 2, (r.z0 + r.z1) / 2], s: [r.x1 - r.x0, PAD_H, r.z1 - r.z0], c: COL.pad });
      const w = r.x1 - r.x0, d = r.z1 - r.z0, vertical = d > w;
      const n = Math.floor((vertical ? w : d) / 5.5) - 1;
      for (let i = 1; i < n; i++) {
        if (hash(key + i) > fill) continue;
        const len = (vertical ? d : w) * (0.55 + hash(key + 'l' + i) * 0.3), h = 0.8 * (1 + Math.floor(hash(key + 'h' + i) * 3));
        const c = BOX[Math.floor(hash(key + 'c' + i) * BOX.length)];
        if (vertical) out.push({ p: [r.x0 + 4 + i * 5.5 * (w - 8) / (n * 5.5), PAD_H + h / 2, (r.z0 + r.z1) / 2], s: [1.8, h, len], c });
        else out.push({ p: [(r.x0 + r.x1) / 2, PAD_H + h / 2, r.z0 + 4 + i * 5.5 * (d - 8) / (n * 5.5)], s: [len, h, 1.8], c });
      }
    };
    yard(ex.feeder, 0.7, 'fd');
    yard(ex.p26, 0.35, 'p26'); // 신규 개장 단계: 덜 채움
    yard(ex.bnmt, 0.6, 'bn');
    return out;
  }, [ex]);
  return (
    <group>
      <Boxes items={items} shadows />
      {step === 1 && ex.labels.map((m) => (
        <Html key={m.t} position={m.p} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`maplabel ${m.lo ? 'is-lo' : ''}`}>{m.t}</div>
        </Html>
      ))}
    </group>
  );
}

export function MapLand() {
  const l = useUI((s) => s.data)!.layout;
  const meshes = useMemo(() => polys(l).map((p) => {
    const s = new THREE.Shape(p.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return { g, color: p.color, y: p.y };
  }), [l]);
  return (
    <group>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.g} position={[0, m.y, 0]} receiveShadow>
          <meshStandardMaterial color={m.color} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
