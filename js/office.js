import * as THREE from 'three';
import { scene, mat, box, cyl, canvasTexture, signMesh, label } from './stage.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sơ đồ tầng 5 – DU35. Toạ độ: x trái(-) → phải(+), z trên/bắc(-) → dưới/nam(+). Lối vào ở phía nam.
// Quy đổi từ ảnh sơ đồ (đã nới rộng): x ≈ (px - 1000) / 22, z ≈ (py - 195) / 18 (đơn vị: mét)
export const BOUNDS = { minX: -45.4, maxX: 38.1, minZ: -10.7, maxZ: 10.5 };
export const colliders = [];   // {minX,maxX,minZ,maxZ}
export const seats = {};       // id -> {x,z,rot,screen}
export const areaSeats = {};   // khu -> [seatId]
export const spots = {};       // id -> Vector3 (điểm tương tác)
export const rooms = {};       // id -> {name, slots, center}
export const spawn = { x: -18.6, z: 9.4 };

const WALL_H = 2.6;
const addCol = (minX, maxX, minZ, maxZ) => colliders.push({ minX, maxX, minZ, maxZ });
const glassMat = new THREE.MeshStandardMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.1, depthWrite: false });
const frostMat = new THREE.MeshStandardMaterial({ color: '#e9f3fb', transparent: true, opacity: 0.6, roughness: 0.4, depthWrite: false });

// tường thẳng (ngang hoặc dọc), có thể chừa các khoảng cửa [[a,b],...]
function wall(x1, z1, x2, z2, { h = WALL_H, color = '#f4f1ec', material = null, gaps = [] } = {}) {
  const horiz = Math.abs(z2 - z1) < 0.01;
  const a0 = horiz ? Math.min(x1, x2) : Math.min(z1, z2), a1 = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
  const segs = [];
  let cur = a0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) segs.push([cur, g0]); cur = Math.max(cur, g1); }
  if (cur < a1) segs.push([cur, a1]);
  const t = 0.14;
  for (const [s0, s1] of segs) {
    const len = s1 - s0, mid = (s0 + s1) / 2;
    const [w, d, cx, cz] = horiz ? [len, t, mid, z1] : [t, len, x1, mid];
    const m = box(w, h, d, material || color, cx, h / 2, cz);
    if (material) m.castShadow = false;
    scene.add(m);
    if (material) scene.add(box(w + 0.02, 0.07, d + 0.02, '#3b4659', cx, h, cz));
    addCol(cx - w / 2 - 0.04, cx + w / 2 + 0.04, cz - d / 2 - 0.04, cz + d / 2 + 0.04);
  }
}

function floorPatch(x1, x2, z1, z2, color, y = 0.01) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), mat(color));
  m.rotation.x = -Math.PI / 2; m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); m.receiveShadow = true;
  scene.add(m);
}

function areaLabel(text, x, z, y = 2.7) {
  const lb = label(text, 'room-label');
  lb.position.set(x, y, z);
  scene.add(lb);
}

function plant(x, z, s = 1, collide = true) {
  const g = new THREE.Group();
  g.add(cyl(0.22 * s, 0.17 * s, 0.4 * s, '#d9d2c5', 0, 0.2 * s, 0));
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 * s, 0), mat(i % 2 ? '#3f9a5b' : '#4fb06a'));
    const a = (i / 5) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.14 * s, (0.65 + (i % 2) * 0.25) * s, Math.sin(a) * 0.14 * s);
    m.castShadow = true;
    g.add(m);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  if (collide) addCol(x - 0.3 * s, x + 0.3 * s, z - 0.3 * s, z + 0.3 * s);
  return g;
}

function chair(x, z, rot, color = '#2f3a4d') {
  const g = new THREE.Group();
  g.add(box(0.5, 0.08, 0.5, color, 0, 0.47, 0));
  g.add(box(0.5, 0.55, 0.07, color, 0, 0.8, -0.25));
  g.add(cyl(0.03, 0.03, 0.4, '#8a93a3', 0, 0.25, 0, 8));
  g.add(cyl(0.25, 0.25, 0.04, '#59616f', 0, 0.04, 0, 10));
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}

// màn hình + bàn phím, màn hình quay về phía ghế
const SCREEN_MAT = new THREE.MeshStandardMaterial({ color: '#203a6b', emissive: '#203a6b', emissiveIntensity: 0.6 });
function monitor(x, z, rot) {
  const g = new THREE.Group();
  g.add(box(0.62, 0.38, 0.04, '#1c2230', 0, 1.12, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), SCREEN_MAT);
  scr.position.set(0, 1.12, 0.022);
  g.add(scr);
  g.add(box(0.05, 0.2, 0.05, '#1c2230', 0, 0.86, -0.02));
  g.add(box(0.22, 0.02, 0.16, '#1c2230', 0, 0.77, -0.02));
  g.add(box(0.42, 0.02, 0.14, '#e8eaee', 0, 0.77, 0.28));
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
  return scr;
}

// ghế + màn hình. rot: hướng người ngồi nhìn (0 = +z)
let seatN = 0;
function addSeat(area, x, z, rot, id) {
  id = id || `s${seatN++}`;
  chair(x, z, rot);
  const scr = monitor(x + Math.sin(rot) * 0.83, z + Math.cos(rot) * 0.83, rot + Math.PI);
  seats[id] = { x, z, rot, screen: scr, area };
  (areaSeats[area] ||= []).push(id);
  return id;
}

function deskTop(cx, cz, w, d) {
  scene.add(box(w, 0.06, d, '#e7dccb', cx, 0.74, cz));
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) scene.add(box(0.06, 0.72, 0.06, '#9aa1ad', cx + lx * (w / 2 - 0.05), 0.36, cz + lz * (d / 2 - 0.05)));
  addCol(cx - w / 2 - 0.05, cx + w / 2 + 0.05, cz - d / 2 - 0.05, cz + d / 2 + 0.05);
}

// dãy bàn dọc sát tường, ghế phía đông
function deskColumn(area, x, z1, z2, pitch = 1.25) {
  deskTop(x, (z1 + z2) / 2, 0.8, z2 - z1);
  const n = Math.floor((z2 - z1) / pitch);
  const off = (z2 - z1 - (n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) addSeat(area, x + 0.83, z1 + off + i * pitch, -Math.PI / 2);
}
// dãy bàn đôi (ghế 2 bên). vertical = bàn chạy theo trục z
function bench(area, cx, cz, len, vertical, pitch = 1.25) {
  if (vertical) { deskTop(cx, cz, 1.4, len); scene.add(box(0.03, 0.3, len - 0.1, '#c9d3e0', cx, 0.92, cz)); }
  else { deskTop(cx, cz, len, 1.4); scene.add(box(len - 0.1, 0.3, 0.03, '#c9d3e0', cx, 0.92, cz)); }
  const n = Math.floor(len / pitch), start = -((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const o = start + i * pitch;
    if (vertical) { addSeat(area, cx - 1.15, cz + o, Math.PI / 2); addSeat(area, cx + 1.15, cz + o, -Math.PI / 2); }
    else { addSeat(area, cx + o, cz - 1.15, 0); addSeat(area, cx + o, cz + 1.15, Math.PI); }
  }
}
// bàn quản lý đơn, người ngồi quay mặt về phía nam (về phía team)
function managerDesk(key, x, z, title) {
  deskTop(x, z, 1.5, 0.75);
  addSeat('mgr_' + key, x, z - 0.83, 0, 'mgr_' + key);
  if (title) {
    const s = signMesh(title, 0.9, 0.2, { bg: '#0f1a2e', size: 0.5 });
    s.position.set(x, 0.79, z + 0.2); s.rotation.x = -Math.PI / 2.6; scene.add(s);
  }
}

function slotsAround(cx, cz, w, d, n) {
  const s = [];
  const per = Math.ceil(n / 2);
  for (let i = 0; i < per; i++) {
    const x = cx - w / 2 + (w / (per + 1)) * (i + 1) * 1 + 0;
    s.push({ x, z: cz + d / 2 + 0.55, face: { x, z: cz } });
    s.push({ x, z: cz - d / 2 - 0.55, face: { x, z: cz } });
  }
  return s.slice(0, n);
}

function meetingTable(cx, cz, w, d) {
  scene.add(box(w, 0.07, d, '#f7f7f5', cx, 0.75, cz));
  scene.add(box(0.12, 0.72, d * 0.7, '#9aa1ad', cx - w / 2 + 0.3, 0.36, cz));
  scene.add(box(0.12, 0.72, d * 0.7, '#9aa1ad', cx + w / 2 - 0.3, 0.36, cz));
  addCol(cx - w / 2 - 0.05, cx + w / 2 + 0.05, cz - d / 2 - 0.05, cz + d / 2 + 0.05);
  const per = Math.max(1, Math.floor(w / 1.1));
  for (let i = 0; i < per; i++) {
    const x = cx - w / 2 + (w / per) * (i + 0.5);
    chair(x, cz + d / 2 + 0.35, Math.PI, '#4a5a78');
    chair(x, cz - d / 2 - 0.35, 0, '#4a5a78');
  }
}

function sign(text, w, h, x, y, z, rotY = 0, opts) {
  const s = signMesh(text, w, h, opts);
  s.position.set(x, y, z); s.rotation.y = rotY;
  scene.add(s);
  return s;
}

export function buildOffice(C) {
  const A = C.areas || {};
  // ---------- sàn ----------
  const floorTex = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#c3c8d0'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 3;
    for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(21, 5.5);
  const W = BOUNDS.maxX - BOUNDS.minX + 0.4, D = BOUNDS.maxZ - BOUNDS.minZ + 0.4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((BOUNDS.minX + BOUNDS.maxX) / 2, 0, (BOUNDS.minZ + BOUNDS.maxZ) / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 80), mat('#c7d3df'));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  // ---------- tường ngoài ----------
  const minX = -45.5, maxX = 38.2, minZ = -10.8, maxZ = 10.6;
  wall(minX, minZ, maxX, minZ);
  wall(minX, minZ, minX, maxZ);
  wall(maxX, minZ, maxX, maxZ);
  wall(minX, maxZ, maxX, maxZ, { h: 0.9, color: '#d9dee6', gaps: [[-19.9, -17.3]] });
  const winMat = new THREE.MeshStandardMaterial({ color: '#a9d6f5', emissive: '#a9d6f5', emissiveIntensity: 0.35 });
  for (let x = -1; x <= 34; x += 5) { const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.3), winMat); w.position.set(x, 1.75, minZ + 0.08); scene.add(w); }
  for (let z = -8; z <= 8; z += 5) { const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.3), winMat); w.position.set(maxX - 0.08, 1.75, z); w.rotation.y = -Math.PI / 2; scene.add(w); }
  // lối vào
  floorPatch(-20.1, -17.1, 9.2, 10.55, '#1f5eff', 0.015);
  scene.add(box(0.25, 2.4, 0.25, '#3b4659', -20.0, 1.2, maxZ));
  scene.add(box(0.25, 2.4, 0.25, '#3b4659', -17.2, 1.2, maxZ));
  scene.add(box(3.05, 0.3, 0.25, '#3b4659', -18.6, 2.45, maxZ));
  sign('LỐI VÀO · EXIT', 2.2, 0.26, -18.6, 2.45, maxZ - 0.14, Math.PI, { bg: '#1aa36b', size: 0.55 });
  spots.exit = new THREE.Vector3(-18.6, 0, 10.0);

  // ================= KHU TRÁI =================
  // Phòng dự án (ERC trên sơ đồ)
  floorPatch(-45.4, -39.0, -10.7, 1.1, '#cfd8e3', 0.012);
  wall(-39.0, minZ, -39.0, 1.1, { material: glassMat });
  wall(minX, 1.1, -39.0, 1.1, { material: glassMat, gaps: [[-43.7, -42.5]] });
  deskColumn('erc', -45.0, -10.0, 0.0);
  bench('erc', -40.9, -5.1, 9.6, true);
  areaLabel(A.erc || 'Phòng dự án', -42.2, -5);
  sign(A.erc || 'Phòng dự án', 1.6, 0.3, -41.0, 2.25, 1.18, 0, { bg: '#0f1a2e', size: 0.45 });

  // Pre-sale & QA + bàn quản lý phía trên
  floorPatch(-38.4, -25.5, -7.4, 3.2, '#8796ab');
  bench('presale', -34.6, -4.8, 6.2, false);
  bench('presale', -34.6, 0.2, 6.2, false);
  bench('qa', -28.15, -2.1, 9.4, true);
  managerDesk('sdm', -37.0, -8.6, 'SDM');
  managerDesk('presale', -33.2, -8.6, 'PRE-SALE');
  managerDesk('qa', -28.2, -8.6, 'QA MANAGER');
  areaLabel(A.presale || 'Pre-sale', -34.6, -2.3);
  areaLabel(A.qa || 'QA', -28.15, -2.1);

  // Tủ giày – sát tường phía nam
  scene.add(box(19.3, 1.0, 0.85, '#c9b08a', -35.65, 0.5, 10.15));
  for (let i = 0; i < 15; i++) scene.add(box(1.2, 0.85, 0.02, '#b89c74', -44.6 + i * 1.28, 0.5, 9.71));
  addCol(-45.4, -25.95, 9.65, maxZ);
  areaLabel('Tủ giày', -35.6, 10.1, 1.7);

  // Góc cà phê (thêm cho game – không có trong sơ đồ), sát tường phía tây
  const CX = -41.6, CZ = 5.8;
  floorPatch(minX + 0.1, -38.0, 2.6, 8.9, '#d9b98c', 0.012);
  scene.add(box(0.6, 0.95, 2.6, '#f2f2f2', -45.15, 0.48, CZ));
  scene.add(box(0.65, 0.05, 2.7, '#3b4659', -45.15, 0.98, CZ));
  addCol(minX, -44.8, CZ - 1.35, CZ + 1.35);
  const cm = new THREE.Group();
  cm.add(box(0.42, 0.6, 0.5, '#2b2f38', 0, 0, 0));
  cm.add(box(0.05, 0.12, 0.3, '#ff7a1a', 0.22, 0.1, 0));
  cm.position.set(-45.15, 1.31, CZ - 0.6); scene.add(cm);
  spots.coffee = new THREE.Vector3(-44.1, 0, CZ - 0.6);
  scene.add(cyl(0.8, 0.8, 0.06, '#ffffff', CX, 0.76, CZ, 24));
  scene.add(cyl(0.08, 0.3, 0.74, '#9aa1ad', CX, 0.37, CZ, 12));
  addCol(CX - 0.85, CX + 0.85, CZ - 0.85, CZ + 0.85);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; scene.add(cyl(0.2, 0.2, 0.06, '#ff9f1c', CX + Math.cos(a) * 1.25, 0.5, CZ + Math.sin(a) * 1.25, 12)); }
  areaLabel('Góc cà phê', CX, CZ);
  spots.pantry = new THREE.Vector3(CX, 0, CZ - 1.8);
  const f = { x: CX, z: CZ };
  rooms.pantry = { name: 'Góc cà phê', center: f, slots: [
    { x: CX - 1.3, z: CZ - 1.0, face: f }, { x: CX + 1.3, z: CZ - 1.0, face: f },
    { x: CX - 1.3, z: CZ + 1.0, face: f }, { x: CX + 1.3, z: CZ + 1.0, face: f },
    { x: CX, z: CZ - 1.45, face: f }, { x: CX + 1.6, z: CZ, face: f },
  ] };
  const cake = new THREE.Group();
  cake.add(cyl(0.22, 0.22, 0.16, '#fff3e6', 0, 0, 0));
  cake.add(cyl(0.23, 0.23, 0.03, '#ff7a9a', 0, 0.08, 0));
  cake.add(cyl(0.015, 0.015, 0.1, '#1f5eff', 0, 0.15, 0, 6));
  cake.position.set(CX, 0.87, CZ); cake.visible = false; cake.traverse((o) => (o.userData.keep = true)); scene.add(cake);

  // Bảng thành viên DU35 (kiosk gần lối vào)
  scene.add(box(0.9, 1.0, 0.45, '#0f1a2e', -24.0, 0.5, 8.6));
  const kiosk = signMesh('THÀNH VIÊN DU35', 0.86, 0.5, { bg: '#1f5eff', size: 0.2 });
  kiosk.position.set(-24.0, 1.08, 8.6); kiosk.rotation.x = -Math.PI / 2 + 0.35; scene.add(kiosk);
  addCol(-24.5, -23.5, 8.35, 8.85);
  areaLabel('Bảng thành viên', -24.0, 8.6, 1.8);
  spots.directory = new THREE.Vector3(-24.0, 0, 7.8);

  // ================= KHU GIỮA: phòng họp & lễ tân =================
  // Meeting room 1
  floorPatch(-22.4, -13.2, -10.7, -1.1, '#cfd8e3', 0.012);
  wall(-22.4, minZ, -22.4, -1.1, { material: glassMat, gaps: [[-3.3, -1.9]] });
  wall(-13.2, minZ, -13.2, -1.1, { material: glassMat });
  wall(-22.4, -1.1, -13.2, -1.1, { material: frostMat });
  meetingTable(-17.6, -6.0, 5.0, 1.6);
  scene.add(box(2.6, 1.2, 0.05, '#ffffff', -17.6, 1.5, minZ + 0.08));
  sign('DAILY 9:15', 1.4, 0.3, -18.0, 1.8, minZ + 0.12, 0, { bg: '#ffffff', fg: '#1f5eff', size: 0.6 });
  areaLabel('Meeting room 1', -17.6, -6);
  rooms.room_1 = { name: 'Meeting room 1', center: { x: -17.6, z: -6.0 }, slots: slotsAround(-17.6, -6.0, 5.0, 1.6, 6) };
  spots.room_1 = new THREE.Vector3(-21.4, 0, -2.6);
  // Meeting room 2 & 3
  floorPatch(-22.4, -13.2, -1.1, 2.6, '#d6dde7', 0.012);
  wall(-22.4, -1.1, -22.4, 2.6, { material: glassMat });
  wall(-18.2, -1.1, -18.2, 2.6, { material: frostMat });
  wall(-13.2, -1.1, -13.2, 2.6, { material: glassMat });
  wall(-22.4, 2.6, -13.2, 2.6, { material: glassMat, gaps: [[-20.9, -19.6], [-16.3, -15.0]] });
  meetingTable(-20.3, 0.5, 1.6, 0.9);
  meetingTable(-15.7, 0.4, 2.2, 0.9);
  scene.add(box(1.9, 1.05, 0.06, '#111622', -15.7, 1.55, -1.0));
  sign('VIDEO CALL', 1.74, 0.92, -15.7, 1.55, -0.96, 0, { bg: '#1b3a7a', size: 0.2 });
  areaLabel('Meeting 2', -20.3, 0.5);
  areaLabel('Meeting 3', -15.7, 0.5);
  rooms.room_2 = { name: 'Meeting room 2', center: { x: -20.3, z: 0.5 }, slots: slotsAround(-20.3, 0.5, 1.6, 0.9, 2) };
  rooms.room_3 = { name: 'Meeting room 3', center: { x: -15.7, z: 0.4 }, slots: [
    { x: -17.15, z: 0.4, face: { x: -15.7, z: 0.4 } }, { x: -14.25, z: 0.4, face: { x: -15.7, z: 0.4 } },
    { x: -16.3, z: 1.4, face: { x: -15.7, z: 0.4 } }, { x: -15.1, z: 1.4, face: { x: -15.7, z: 0.4 } }] };
  spots.room_2 = new THREE.Vector3(-20.25, 0, 2.0);
  spots.room_3 = new THREE.Vector3(-15.65, 0, 2.05);
  // Lễ tân
  scene.add(box(6.2, 1.05, 0.65, '#ffffff', -18.5, 0.53, 4.75));
  scene.add(box(6.3, 0.06, 0.75, '#1f5eff', -18.5, 1.08, 4.75));
  addCol(-21.65, -15.35, 4.38, 5.12);
  sign('LỄ TÂN · RECEPTION', 2.4, 0.3, -18.5, 0.7, 5.09, 0, { bg: '#0f1a2e', size: 0.5 });
  chair(-18.5, 3.85, 0);
  monitor(-17.6, 4.55, Math.PI);
  seats.reception = { x: -18.5, z: 3.85, rot: 0, area: 'reception' };
  plant(-22.3, 10.0, 0.9); plant(-14.9, 10.0, 0.9);

  // ================= KHU GIỮA-PHẢI =================
  for (const [x1, x2, n] of [[-11.5, -7.9, 1], [-7.4, -3.8, 2]]) {
    wall(x1, minZ, x1, -7.6, { material: frostMat });
    wall(x2, minZ, x2, -7.6, { material: frostMat });
    wall(x1, -7.6, x2, -7.6, { material: glassMat, gaps: [[(x1 + x2) / 2 - 0.65, (x1 + x2) / 2 + 0.65]] });
    scene.add(box(1.1, 0.05, 0.55, '#e7dccb', (x1 + x2) / 2, 0.74, -10.3));
    chair((x1 + x2) / 2, -9.6, Math.PI);
    areaLabel(`Phone booth ${n}`, (x1 + x2) / 2, -9.2, 2.4);
  }
  floorPatch(-11.8, 16.0, -6.0, 3.3, '#8796ab');
  const MID = [['du35', -9.55], ['m2', -5.4], ['m3', 0.85], ['m4', 7.2], ['m5', 13.35]];
  for (const [a, x] of MID) bench(a, x, -1.2, 7.8, true);
  managerDesk('empty', 0.85, -8.5, 'MANAGER');
  managerDesk('director', 7.2, -8.5, 'GIÁM ĐỐC');
  managerDesk('manager2', 13.35, -8.5, 'MANAGER');
  areaLabel(A.du35 || 'DU35', -9.55, -1.2);
  areaLabel(A.m2 || 'Member', -5.4, -1.2);
  areaLabel(A.m3 || 'Member', 0.85, -1.2);
  areaLabel(A.m4 || 'Member', 7.2, -1.2);
  areaLabel(A.m5 || 'Member', 13.35, -1.2);
  plant(-12.4, -5.6); plant(3.9, -5.8, 0.9); plant(10.3, -5.8, 0.9); plant(16.6, -5.8, 0.9);

  // Kệ cây cảnh + ảnh khen ngợi từ khách hàng – sát tường phía nam
  const KZ = 10.1;
  scene.add(box(27.2, 1.0, 0.95, '#f7f4ee', 2.1, 0.5, KZ));
  addCol(-11.55, 15.75, KZ - 0.52, maxZ);
  const frameColors = ['#ffd84d', '#9fe0ff', '#ffb3c1', '#b7f5a1', '#d7c6ff'];
  for (let i = 0; i < 18; i++) {
    const x = -10.6 + i * 1.5;
    if (i % 2 === 0) plant(x, KZ, 0.55, false).position.y = 1.0;
    else {
      const fr = new THREE.Group();
      fr.add(box(0.5, 0.62, 0.04, '#3b4659', 0, 0, 0));
      fr.add(box(0.42, 0.54, 0.02, frameColors[i % 5], 0, 0, -0.025));
      fr.position.set(x, 1.18, KZ + 0.05); fr.rotation.x = 1.1;
      scene.add(fr);
    }
  }
  areaLabel('Cây cảnh & ảnh khen ngợi từ khách hàng', 2.1, KZ, 2.1);
  spots.kudos = new THREE.Vector3(2.1, 0, KZ - 1.3);

  // ================= KHU PHẢI =================
  floorPatch(17.8, 33.3, -6.4, 2.2, '#8796ab');
  bench('sdax', 25.5, -4.1, 14, false);
  bench('stl', 25.5, 0.6, 14, false);
  areaLabel(A.sdax || 'Team dự án A', 25.5, -4.1);
  areaLabel(A.stl || 'Team dự án B', 25.5, 0.6);
  // Nhà vệ sinh
  floorPatch(33.8, maxX - 0.1, -6.0, 1.2, '#e3eef2', 0.012);
  wall(33.8, -6.0, maxX, -6.0, { color: '#dfe5ec' });
  wall(33.8, -6.0, 33.8, 1.2, { color: '#dfe5ec' });
  wall(33.8, 1.2, maxX, 1.2, { color: '#dfe5ec', gaps: [[35.4, 36.7]] });
  sign('WC', 0.6, 0.4, 36.05, 2.2, 1.29, 0, { bg: '#1f5eff', size: 0.7 });
  scene.add(box(1.2, 0.85, 0.5, '#ffffff', 36.0, 0.43, -5.6));
  areaLabel('Nhà vệ sinh', 36.0, -2.4);
  spots.wc = new THREE.Vector3(36.05, 0, 2.0);
  // Member phía dưới & BA
  floorPatch(18.4, 36.4, 3.6, 10.5, '#8796ab');
  bench('br1', 21.85, 5.5, 5.4, false);
  bench('br1', 21.85, 9.0, 5.4, false);
  bench('br2', 29.7, 5.5, 5.4, false);
  bench('br2', 29.7, 9.0, 5.4, false);
  deskColumn('ba', 34.4, 4.0, 10.0);
  areaLabel(A.br1 || 'Member', 21.85, 7.25);
  areaLabel(A.br2 || 'Member', 29.7, 7.25);
  areaLabel(A.ba || 'BA', 35.0, 7.0);
  plant(17.2, 9.9); plant(37.6, 3.0, 0.8);

  buildNavGrid();
  return { cake };
}

// ================= Gộp đồ hoạ tĩnh (giảm draw call) =================
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.keep || !o.visible) return;
    let p = o, skip = false;
    while (p) { if (p.userData.keep) { skip = true; break; } p = p.parent; }
    if (skip) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    groups.get(key).geos.push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const { mat, cast, recv, geos } of groups.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = cast; m.receiveShadow = recv;
    root.add(m);
  }
  return { merged: victims.length, meshes: groups.size };
}

// ================= Tìm đường A* trên lưới =================
const CELL = 0.2, INFLATE = 0.3;
let GW = 0, GH = 0, blocked = null;
const gx0 = BOUNDS.minX, gz0 = BOUNDS.minZ;
function buildNavGrid() {
  GW = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL) + 1;
  GH = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL) + 1;
  blocked = new Uint8Array(GW * GH);
  for (const c of colliders) {
    const i0 = Math.max(0, Math.floor((c.minX - INFLATE - gx0) / CELL)), i1 = Math.min(GW - 1, Math.ceil((c.maxX + INFLATE - gx0) / CELL));
    const j0 = Math.max(0, Math.floor((c.minZ - INFLATE - gz0) / CELL)), j1 = Math.min(GH - 1, Math.ceil((c.maxZ + INFLATE - gz0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = gx0 + i * CELL, z = gz0 + j * CELL;
      const dx = Math.max(c.minX - x, 0, x - c.maxX), dz = Math.max(c.minZ - z, 0, z - c.maxZ);
      if (dx * dx + dz * dz < INFLATE * INFLATE) blocked[j * GW + i] = 1;
    }
  }
}
const toCell = (x, z) => [Math.round((x - gx0) / CELL), Math.round((z - gz0) / CELL)];
const free = (i, j) => i >= 0 && j >= 0 && i < GW && j < GH && !blocked[j * GW + i];
function nearestFree(i, j) {
  if (free(i, j)) return [i, j];
  for (let r = 1; r < 20; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(i + di, j + dj)) return [i + di, j + dj];
  }
  return [i, j];
}
function lineFree(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (CELL * 0.5));
  for (let k = 1; k < n; k++) {
    const [i, j] = toCell(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
    if (!free(i, j)) return false;
  }
  return true;
}
export function findPath(from, to) {
  const [si, sj] = nearestFree(...toCell(from.x, from.z));
  const [ti, tj] = nearestFree(...toCell(to.x, to.z));
  const N = GW * GH, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const start = sj * GW + si, goal = tj * GW + ti;
  const h = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const heap = [];
  const push = (f, id) => { heap.push([f, id]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  g[start] = 0; push(h(si, sj), start);
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false;
  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    const ci = cur % GW, cj = (cur / GW) | 0;
    for (const [di, dj, cost] of NB) {
      const ni = ci + di, nj = cj + dj;
      if (!free(ni, nj)) continue;
      if (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj))) continue;
      const nid = nj * GW + ni, ng = g[cur] + cost;
      if (ng < g[nid]) { g[nid] = ng; came[nid] = cur; push(ng + h(ni, nj), nid); }
    }
  }
  if (!found) return [{ x: to.x, z: to.z }];
  const cells = [];
  for (let c = goal; c !== -1; c = came[c]) cells.push({ x: gx0 + (c % GW) * CELL, z: gz0 + ((c / GW) | 0) * CELL });
  cells.reverse();
  // làm mượt đường đi
  const out = [];
  let a = { x: from.x, z: from.z }, k = 0;
  while (k < cells.length - 1) {
    let far = k + 1;
    for (let m = cells.length - 1; m > k + 1; m--) if (lineFree(a.x, a.z, cells[m].x, cells[m].z)) { far = m; break; }
    out.push(cells[far]); a = cells[far]; k = far;
  }
  out.push({ x: to.x, z: to.z });
  return out;
}

// va chạm hình tròn với hộp
export function collide(pos, r = 0.3) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 === 0) {
        const o = [[pos.x - c.minX, -1, 0], [c.maxX - pos.x, 1, 0], [pos.z - c.minZ, 0, -1], [c.maxZ - pos.z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
        pos.x += o[1] * (o[0] + r); pos.z += o[2] * (o[0] + r);
      } else {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      }
    }
  }
}
