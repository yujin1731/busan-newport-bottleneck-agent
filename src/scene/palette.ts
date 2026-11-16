// 밝은 디지털트윈. 지형·장비는 흰색·연회색, 바다는 연한 파랑.
// 상태 색: 빨강 = 병목, 주황 = 주의·혼잡 전가, 진한 파랑 = 대응. 컨테이너는 이 색들과 겹치지 않게 옅게.
export const COL = {
  bg: '#d8e6ef',
  sea: '#5aa3c8',
  seaDeep: '#4b93ba',
  seaLine: '#c4dcef',
  land: '#e9ede6',
  landEdge: '#dfe5ee',
  green: '#cfe3cf',
  pad: '#e4e8ee',
  padEdge: '#c9d1dc',
  apron: '#d3d9e2',
  lane: '#ffffff',
  road: '#8d97a6',
  roadEdge: '#c3cad5',
  roadLine: '#ffffff',
  truckCab: '#f7f9fc',
  truckBox: '#dce3ec',
  hull: '#3b4a5e',
  hullBottom: '#7a8698',
  deck: '#eef1f5',
  bridge: '#ffffff',
  crane: '#f4f6f9',
  craneDark: '#5f6f86',
  craneAccent: '#7d9cc4',
  building: '#f8fafc',
  buildingRoof: '#e2e7ee',
  roofBlue: '#a9c1ec',
  roofBlueDark: '#7d9fdc',
  tank: '#eef2f7',
  red: '#e5484d',
  orange: '#f08a24',
  blue: '#2563eb',
  blueLight: '#5b8cff',
  white: '#ffffff',
};

// 컨테이너: 흰색·연회색·옅은 청회색 계열 (상태 색보다 훨씬 옅게)
// 실제 선사 컨테이너처럼 여러 색, 다만 채도를 낮춰 상태 표시(바닥 면·링·라벨)를 가리지 않게
export const BOX = ['#b8614c', '#3f6b96', '#4f8a68', '#c9974e', '#9aa3ad', '#eef1f4', '#8a5a86', '#3f8796', '#a8b8cc', '#d7d0c4', '#5a7fb3', '#c7a07a'];
