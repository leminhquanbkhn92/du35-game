import * as THREE from 'three';
import { scene, camera, renderer, labelRenderer, label, sun } from './stage.js';
import { buildOffice, seats, areaSeats, spots, rooms, collide, findPath, spawn, BOUNDS, mergeStatic } from './office.js';
import { makeCharacter, makeSeatedStatic, PASTEL } from './character.js';
import { $, renderStats, chips, toast, dialog, openModal, closeModal, isModalOpen, head, esc, waitClick } from './ui.js';
import * as MG from './minigames.js';
import { createAmbient } from './ambient.js';
import { statusOf, MOODS, STATUS } from './progress.js';

const C = await fetch('data/content.json').then((r) => r.json());
const SAVE_KEY = 'du35-sprint-v1';
const WEEKDAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu'];
const FILLER_LINES = ['Đang chạy deadline, nói chuyện sau nhé! 😅', 'Chào bạn mới! Mình ở team bên cạnh, cần gì cứ hỏi nha.', 'Trưa nay team mình đi ăn bún chả, đi cùng không?', 'Máy pha cà phê ở góc cà phê ngon lắm đó.', 'Khách Mỹ vừa approve PR của mình, vui ghê!'];
const ROLE_SHIRT = { dev: '#ff9f1c', qa: '#06d6a0', ba: '#b388ff' };
// kiểu tóc & phụ kiện riêng cho nhân vật có tên (có thể ghi đè bằng "look" trong content.json)
const NPC_LOOK = {
  hr: { hairStyle: 'bun', acc: 'bow' }, pm: { hairStyle: 'short', acc: 'glasses' }, tl: { hairStyle: 'spiky', acc: 'headphones' },
  qa: { hairStyle: 'pony', acc: 'none' }, dev: { hairStyle: 'messy', acc: 'cap' }, ba: { hairStyle: 'twin', acc: 'none' },
  director: { hairStyle: 'short', acc: 'glasses' }, sdm: { hairStyle: 'bob', acc: 'none' }, presale: { hairStyle: 'curly', acc: 'none' },
  qam: { hairStyle: 'long', acc: 'glasses' }, mgr2: { hairStyle: 'bun', acc: 'none' },
};
const EMOTES = ['☕', '💡', '😂', '🎵', '🔥', '🐛', '✅', '🚀', '😴', '🍜', '💪', '🎉', '🤔', '❤️', '🧋'];
const ALL_TEAM = ['pm', 'tl', 'qa', 'dev', 'ba'];
const GATHER = { standup: ALL_TEAM, poker: ALL_TEAM, retro: ALL_TEAM, birthday: ALL_TEAM, client: ['pm', 'ba'] };

const office = buildOffice(C);
// "khu:số thứ tự" -> id ghế, ví dụ "du35:1", "mgr_director:0", "reception"
const seatFor = (spec) => { if (seats[spec]) return spec; const [a, i] = spec.split(':'); return (areaSeats[a] || [])[+i || 0]; };
const MY_SEAT = seatFor(C.mySeat || 'du35:0');
const npcTitle = (d) => (d.name ? `${d.name} (${d.role})` : d.role);
// màn hình của người chơi giữ riêng (đổi màu khi làm việc), phần còn lại gộp lại cho nhẹ
seats[MY_SEAT].screen.material = seats[MY_SEAT].screen.material.clone();
seats[MY_SEAT].screen.userData.keep = true;
const mergeInfo = mergeStatic(scene);

// ---------- state ----------
let S = null; // {name, role, day, step, stats, talked, coffee, clock, dayStart}
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} };
const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } };
const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

function applyFx(fx) {
  for (const [k, v] of Object.entries(fx || {})) if (k in S.stats) S.stats[k] = Math.max(0, Math.min(100, S.stats[k] + v));
  renderStats(S.stats);
}

// ---------- NPCs ----------
const npcs = {};
const v3 = (p) => new THREE.Vector3(p.x, 0, p.z);
function placeAtSeat(n) {
  const s = seats[n.seat];
  n.ch.root.position.set(s.x, 0, s.z);
  n.ch.root.rotation.y = s.rot;
  n.ch.sit(true);
  n.loc = 'seat'; n.path = []; n.face = null; n.moving = false; n.waitT = 0;
}
for (const [id, d] of Object.entries(C.npcs)) {
  const ch = makeCharacter({ shirt: d.color, hair: d.hair, female: d.female, seed: id.length * 977 + id.charCodeAt(0) * 31, ...(NPC_LOOK[id] || {}), ...(d.look || {}) });
  const lb = label(d.name ? `${d.name} · ${d.role}` : d.role);
  lb.position.y = 2.0;
  ch.root.add(lb);
  scene.add(ch.root);
  const n = { id, d, ch, seat: seatFor(d.spot), path: [], speed: 0, loc: 'seat', chain: Promise.resolve() };
  placeAtSeat(n);
  npcs[id] = n;
}
const usedSeats = new Set([MY_SEAT, ...Object.values(npcs).map((n) => n.seat), 'mgr_empty']);
let fseed = 7;
const frand = () => (fseed = (fseed * 16807) % 2147483647) / 2147483647;
// Nhân sự thật (data/staff.json – bản nội bộ). Không có file thì dùng nhân vật vô danh.
const STAFF = await fetch('data/staff.json').then((r) => (r.ok ? r.json() : { staff: [] })).catch(() => ({ staff: [] }));
const staffList = STAFF.staff || [];
// Xếp chỗ tự động lúc chạy: ghế ghi sẵn trong staff.json ("seat") → nhóm QA/BA → theo bộ phận → ghế trống bất kỳ
function assignSeats(list) {
  const R = C.seating || {};
  const qaStacks = R.qaStacks || ['Manual Test', 'Automation Tester', 'QA Baseband'];
  const unitAreas = R.unitAreas || { 'DU35.1': ['du35', 'm2', 'erc', 'presale'], 'DU35.2': ['m3', 'm4', 'm5', 'presale'], 'DU35.3': ['sdax', 'stl'], 'DU35.4': ['br1', 'br2'] };
  const npcNames = new Set(Object.values(C.npcs).map((n) => n.name).filter(Boolean));
  const taken = new Set(usedSeats);
  const freeIn = (a) => (areaSeats[a] || []).filter((id) => !taken.has(id));
  const out = [];
  const people = list.filter((s) => !npcNames.has(s.name));
  const give = (s, id) => { taken.add(id); out.push({ person: s, seat: id }); s._seated = true; };
  for (const s of people) { const id = s.seat && seatFor(s.seat); if (id && !taken.has(id)) give(s, id); }
  const fill = (area, pred) => { for (const s of people) { if (s._seated || !pred(s)) continue; const f = freeIn(area); if (!f.length) return; give(s, f[0]); } };
  fill('qa', (s) => qaStacks.includes(s.stack));
  fill('ba', (s) => s.stack === 'BA');
  for (const [u, areas] of Object.entries(unitAreas)) for (const a of areas) fill(a, (s) => s.unit === u);
  const memberAreas = Object.keys(areaSeats).filter((a) => !a.startsWith('mgr_') && a !== 'reception');
  for (const a of memberAreas) fill(a, () => true);
  const left = people.filter((s) => !s._seated);
  if (left.length) console.warn(`Không đủ ghế cho ${left.length} người`, left.map((s) => s.name));
  return out;
}
const seatedPairs = staffList.length ? assignSeats(staffList) : [];
const seated = seatedPairs.map((p) => p.person);
const FILLER_SEATS = staffList.length
  ? seatedPairs.map((p) => p.seat)
  : Object.keys(seats).filter((id) => !usedSeats.has(id) && id !== 'reception' && frand() < (C.fillRate ?? 0.6));
const palette = PASTEL;
const fillers = FILLER_SEATS.map((sid, i) => {
  const person = staffList.length ? seated[i] : null;
  const female = person ? person.female : i % 3 === 1;
  const ch = makeSeatedStatic({ shirt: palette[Math.floor(frand() * palette.length)], female, seed: 1000 + i * 7919 });
  scene.add(ch.root);
  const n = { id: 'f' + i, ch, seat: sid, path: [], filler: true, person };
  if (person) {
    n.label = label(person.name);
    n.label.position.y = 1.9;
    n.label.visible = false;
    ch.root.add(n.label);
  }
  placeAtSeat(n);
  return n;
});
// đồng nghiệp tự đi lại, họp hành, làm việc
const ambient = createAmbient({ fillers, seats, findPath, placeAtSeat, label, getPlayerPos: () => player?.ch.root.position });

function walkPath(n, pts) {
  return new Promise((resolve) => {
    n.ch.sit(false);
    n.path = pts.map(v3);
    n.onArrive = resolve;
  });
}
function moveNpc(n, dest) {
  n.chain = n.chain.then(async () => {
    if (dest.type === 'room' && n.loc === dest.id) return;
    if (dest.type === 'seat' && n.loc === 'seat') return;
    const p = n.ch.root.position;
    if (dest.type === 'seat') {
      const s = seats[n.seat];
      await walkPath(n, findPath(p, s));
      placeAtSeat(n);
    } else {
      await walkPath(n, findPath(p, dest.slot));
      n.loc = dest.id;
      n.face = dest.slot.face;
    }
  });
  return n.chain;
}
function gatherFor(step) {
  if (!step) return;
  const key = step.type === 'event' ? step.ref : step.type;
  const ids = GATHER[key];
  const room = rooms[step.target];
  if (!ids || !room) return;
  ids.forEach((id, i) => moveNpc(npcs[id], { type: 'room', id: step.target, slot: room.slots[i % room.slots.length] }));
  if (key === 'birthday') office.cake.visible = true;
}
function sendHome(exceptIds = []) {
  for (const n of Object.values(npcs)) if (!exceptIds.includes(n.id)) moveNpc(n, { type: 'seat' });
}
function updateNpc(n, dt) {
  const r = n.ch.root;
  let speed = 0;
  if (n.path && n.path.length) {
    const tgt = n.path[0];
    const dx = tgt.x - r.position.x, dz = tgt.z - r.position.z;
    const d = Math.hypot(dx, dz);
    const sp = 2.4;
    if (d < 0.08) {
      n.path.shift();
      if (!n.path.length && n.onArrive) { const f = n.onArrive; n.onArrive = null; f(); }
    } else {
      const step = Math.min(d, sp * dt);
      r.position.x += (dx / d) * step; r.position.z += (dz / d) * step;
      turnTo(r, Math.atan2(dx, dz), dt * 10);
      speed = sp;
    }
  } else if (n.face) {
    turnTo(r, Math.atan2(n.face.x - r.position.x, n.face.z - r.position.z), dt * 6);
  }
  n.ch.update(dt, speed);
}
function turnTo(obj, target, k) {
  let d = target - obj.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  obj.rotation.y += d * Math.min(1, k);
}

// ---------- player ----------
let player = null;
function makePlayer() {
  if (player) scene.remove(player.ch.root);
  const ch = isManager()
    ? makeCharacter({ shirt: '#3a86ff', hair: '#2b1d14', hairStyle: 'short', acc: 'glasses', seed: 43 })
    : makeCharacter({ shirt: ROLE_SHIRT[S.role] || '#4cc9f0', hair: '#2b1d14', hairStyle: 'short', acc: 'leaf', seed: 42 }); // mầm lá = tân binh 🌱
  const lb = label(`${S.name} (${isManager() ? 'quản lý' : 'bạn'})`, 'npc-label me');
  lb.position.y = 2.0;
  ch.root.add(lb);
  scene.add(ch.root);
  player = { ch, vel: 0 };
  spawnPlayer();
}
function spawnPlayer() {
  player.ch.sit(false);
  player.ch.root.position.set(spawn.x, 0, spawn.z);
  player.ch.root.rotation.y = Math.PI;
}

// ---------- input & camera ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'KeyE' && !isModalOpen() && !busy && current) runInteraction(current);
  if (e.code === 'KeyR' && S && isManager() && !isModalOpen() && !busy) showReport();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const cam = { yaw: 0, pitch: 0.92, dist: 12.5 };
let dragging = false, lastX = 0;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 2 || e.button === 1) { dragging = true; lastX = e.clientX; } });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => { if (dragging) { cam.yaw -= (e.clientX - lastX) * 0.006; lastX = e.clientX; } });
renderer.domElement.addEventListener('wheel', (e) => { cam.dist = Math.max(6, Math.min(20, cam.dist + e.deltaY * 0.01)); }, { passive: true });
const camTarget = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  const p = player ? player.ch.root.position : new THREE.Vector3(0, 0, 2);
  const want = new THREE.Vector3(
    p.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    Math.sin(cam.pitch) * cam.dist,
    p.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  const k = snap ? 1 : Math.min(1, dt * 6);
  camera.position.lerp(want, k);
  // nhìn hơi lệch về phía trước người chơi để thấy nhiều văn phòng hơn
  const ahead = cam.dist * 0.18;
  camTarget.lerp(new THREE.Vector3(p.x - Math.sin(cam.yaw) * ahead, 1, p.z - Math.cos(cam.yaw) * ahead), snap ? 1 : Math.min(1, dt * 8));
  camera.lookAt(camTarget);
  // mặt trời (bóng đổ) đi theo vùng camera đang nhìn vì văn phòng rất rộng
  sun.position.set(camTarget.x - 10, 22, camTarget.z + 12);
  sun.target.position.set(camTarget.x, 0, camTarget.z);
}

function updatePlayer(dt) {
  if (!player || busy || isModalOpen()) { if (player) player.ch.update(dt, 0); return; }
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1;
  if (keys.KeyA || keys.ArrowLeft) s -= 1;
  const r = player.ch.root;
  let speed = 0;
  if (f || s) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const len = Math.hypot(mx, mz); mx /= len; mz /= len;
    speed = keys.ShiftLeft || keys.ShiftRight ? 5.5 : 3.3;
    r.position.x += mx * speed * dt;
    r.position.z += mz * speed * dt;
    turnTo(r, Math.atan2(mx, mz), dt * 12);
  }
  // va chạm với NPC
  for (const n of [...Object.values(npcs), ...fillers]) {
    const q = n.ch.root.position;
    const dx = r.position.x - q.x, dz = r.position.z - q.z, d = Math.hypot(dx, dz), min = 0.55;
    if (d < min && d > 0.0001) { r.position.x += (dx / d) * (min - d); r.position.z += (dz / d) * (min - d); }
  }
  collide(r.position, 0.3);
  r.position.x = Math.max(BOUNDS.minX + 0.2, Math.min(BOUNDS.maxX - 0.2, r.position.x));
  r.position.z = Math.max(BOUNDS.minZ + 0.2, Math.min(BOUNDS.maxZ - 0.2, r.position.z));
  player.ch.update(dt, speed);
}

// ---------- objective marker ----------
const marker = new THREE.Group();
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff7a1a', emissiveIntensity: 0.5 }));
cone.rotation.x = Math.PI;
marker.add(cone);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
ring.rotation.x = -Math.PI / 2;
scene.add(marker, ring);

function stepTargetPos(step) {
  if (!step) return null;
  if (npcs[step.target]) return npcs[step.target].ch.root.position;
  if (step.target === 'my_desk') return v3(seats[MY_SEAT]);
  return spots[step.target] || null;
}

// ---------- day flow ----------
let busy = false, current = null;
const curDay = () => C.days[S.day];
const isManager = () => !!S && S.role === 'manager';
const curStep = () => (isManager() ? null : curDay()?.steps[S.step]);

function refreshHud() {
  if (isManager()) {
    $('#hud-day').textContent = 'Quản lý · Đi dạo DU35';
    $('#hud-clock').textContent = S.clock;
    const asked = Object.values(S.mgr || {}).filter((x) => x.asked).length;
    $('#obj-text').textContent = `Hỏi thăm mọi người: ${asked}/${fillers.length} · Phím R: báo cáo tiến độ`;
    renderStats(S.stats);
    return;
  }
  $('#hud-day').textContent = `Ngày ${S.day + 1} / ${C.days.length} · ${WEEKDAYS[S.day] || ''}`;
  $('#hud-clock').textContent = S.clock;
  const st = curStep();
  $('#obj-text').textContent = st ? st.label : '';
  renderStats(S.stats);
}

function promptFor(step) {
  const n = C.npcs[step.target];
  switch (step.type) {
    case 'quiz': case 'talk': return `Nói chuyện với ${n ? n.name : ''}`;
    case 'standup': return 'Bắt đầu Daily Stand-up';
    case 'poker': return 'Bắt đầu Sprint Planning';
    case 'bugfix': return 'Mở máy tính làm task';
    case 'client': return 'Bắt đầu video call';
    case 'event': return C.events[step.ref]?.title || 'Tham gia';
    case 'leave': return 'Log timesheet & ra về';
  }
  return 'Tương tác';
}

function findInteraction() {
  const p = player.ch.root.position;
  const st = curStep();
  const tp = stepTargetPos(st);
  if (st && tp && Math.hypot(tp.x - p.x, tp.z - p.z) < 2.2) return { kind: 'step', text: promptFor(st) };
  let best = null, bd = 1.9;
  for (const n of Object.values(npcs)) {
    const q = n.ch.root.position, d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd && !n.path.length) { bd = d; best = { kind: 'npc', n, text: `Trò chuyện với ${n.d.name || n.d.role}` }; }
  }
  for (const n of fillers) {
    const q = n.ch.root.position, d = Math.hypot(q.x - p.x, q.z - p.z);
    if (n.ch.pose === 'hidden') continue;
    const who = n.person ? n.person.name : 'đồng nghiệp';
    if (d < Math.min(bd, 1.6)) { bd = d; best = { kind: 'filler', n, text: isManager() ? `Hỏi thăm ${who}` : `Chào ${who}` }; }
  }
  const near = (v, r) => v && Math.hypot(v.x - p.x, v.z - p.z) < r;
  if (staffList.length && near(spots.directory, 1.6)) best = { kind: 'directory', text: 'Xem bảng thành viên DU35' };
  if (near(spots.coffee, 1.6)) best = { kind: 'coffee', text: 'Pha cà phê ☕' };
  if (near(spots.kudos, 1.8)) best = { kind: 'kudos', text: 'Xem ảnh khen ngợi từ khách hàng' };
  if (near(spots.wc, 1.4)) best = { kind: 'wc', text: 'Rửa mặt cho tỉnh táo 💧' };
  if (isManager() && near(spots.exit, 1.8)) best = { kind: 'mgr-exit', text: 'Kết thúc buổi đi dạo' };
  return best;
}

function showDirectory() {
  const units = [...new Set(staffList.map((s) => s.unit))].sort();
  const card = openModal(`${head('Thành viên DU35', `${staffList.length} thành viên · ${units.length} bộ phận`, '#1f5eff', '👥')}
    <input id="dir-q" placeholder="Tìm theo tên hoặc techstack..." style="width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;font:inherit;margin-bottom:10px">
    <div id="dir-list" style="max-height:52vh;overflow:auto"></div>
    <div class="m-foot"><span class="m-sub">Đi quanh văn phòng để gặp từng người</span><button class="primary" id="dir-close">Đóng</button></div>`);
  const render = (q = '') => {
    q = q.trim().toLowerCase();
    card.querySelector('#dir-list').innerHTML = units.map((u) => {
      const ppl = staffList.filter((s) => s.unit === u && (!q || s.name.toLowerCase().includes(q) || (s.stack || '').toLowerCase().includes(q)));
      if (!ppl.length) return '';
      return `<div style="font-weight:800;margin:10px 0 6px">${esc(u)} <span class="m-sub">(${ppl.length})</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px">${ppl.map((s) =>
          `<div style="background:#f4f6fb;border-radius:8px;padding:6px 10px;font-size:13px"><b>${esc(s.name)}</b><br><span class="m-sub">${esc(s.stack || '—')}</span></div>`).join('')}</div>`;
    }).join('') || '<div class="m-sub">Không tìm thấy.</div>';
  };
  render();
  const inp = card.querySelector('#dir-q');
  inp.addEventListener('input', () => render(inp.value));
  inp.focus();
  return waitClick(card.querySelector('#dir-close')).then(closeModal);
}

// ================= Vai Quản lý: đi dạo, hỏi thăm, nắm tiến độ =================
const MGR_INTRO = 'Hôm nay bạn là quản lý. Hãy đi dạo quanh văn phòng, đến gần từng người và bấm E để hỏi thăm: xem họ đang làm gì, tiến độ ra sao, có vướng mắc không.\n\nĐộng viên, gỡ vướng, nhắc deadline hay rủ đi cà phê sẽ ảnh hưởng tới tinh thần team và tiến độ dự án.\n\nPhím R: xem báo cáo tiến độ theo khu. Ra cửa chính để kết thúc.';
const addMin = (hhmm, m) => {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + mm + m);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const areaName = (a) => (C.areas && C.areas[a]) || a;
function personOf(n) { return n.person || { name: `Đồng nghiệp ${n.id.slice(1)}`, unit: 'DU35', stack: '' }; }
function infoOf(n) {
  const p = personOf(n);
  S.mgr ||= {};
  return (S.mgr[p.name] ||= statusOf(p, areaName(seats[n.seat].area)));
}
function progressBar(v, color) { return `<div class="meter"><div class="bar"><i style="width:${v}%;background:${color}"></i></div><b>${v}%</b></div>`; }

async function managerTalk(n) {
  const p = personOf(n), st = infoOf(n);
  const honor = p.female ? 'Chị' : 'Anh';
  const greet = ['Dạ, em hơi đuối chút ạ...', 'Dạ em vẫn ổn ạ.', 'Em chào anh/chị ạ!', 'Chào anh/chị! Hôm nay em vui lắm 😄'][st.mood];
  const stInfo = STATUS[st.status];
  const opts = [
    { t: '👍 Động viên tinh thần', k: 'cheer' },
    { t: '🧩 Hỏi vướng mắc & hỗ trợ', k: 'help' },
    { t: '⏰ Nhắc deadline', k: 'push' },
    { t: '☕ Rủ đi cà phê', k: 'coffee' },
  ];
  const card = openModal(`${head(p.name, `${p.unit}${p.stack ? ' · ' + p.stack : ''} · ${st.project}`, PASTEL[p.name.length % PASTEL.length], MOODS[st.mood])}
    <div class="m-text">“${esc(greet)} Em đang <b>${esc(st.task)}</b>.”</div>
    <div class="m-sub" style="margin-bottom:4px">Tiến độ việc đang làm · <b style="color:${stInfo.color}">${stInfo.label}</b></div>
    ${progressBar(st.progress, stInfo.color)}
    ${st.status !== 'ontrack' ? `<div class="feedback no">⚠️ Vướng mắc: ${esc(st.blocker)}</div>` : ''}
    <div class="m-sub" style="margin:14px 0 8px">Bạn muốn:</div>
    <div class="choices">${opts.map((o) => `<button>${o.t}</button>`).join('')}</div>
    <div class="m-foot"><span></span><button id="mt-close">Đóng</button></div>`);
  const pickK = await new Promise((res) => {
    card.querySelectorAll('.choices button').forEach((b, i) => b.addEventListener('click', () => res(opts[i].k), { once: true }));
    card.querySelector('#mt-close').addEventListener('click', () => res(null), { once: true });
  });
  if (!pickK) { closeModal(); return; }
  const first = !st.asked;
  st.asked = true;
  let fx = {}, reply = '';
  if (pickK === 'cheer') {
    st.mood = Math.min(3, st.mood + 1);
    fx = { team: first ? 2 : 1 };
    reply = st.mood >= 2 ? 'Dạ em cảm ơn anh/chị, em có thêm động lực rồi ạ! 💪' : 'Dạ em cảm ơn, em sẽ cố gắng ạ.';
  } else if (pickK === 'help') {
    if (st.status !== 'ontrack') {
      reply = `Dạ em đang vướng: ${st.blocker}. Anh/chị hỗ trợ giúp em thì tốt quá! (Bạn đã liên hệ để gỡ vướng) Em cảm ơn ạ, giờ em làm tiếp được rồi! 🙌`;
      st.status = 'ontrack'; st.blocker = ''; st.progress = Math.min(100, st.progress + 10); st.mood = Math.min(3, st.mood + 1);
      fx = { progress: 3, client: 2, team: 1 };
    } else {
      reply = 'Dạ hiện em chưa vướng gì ạ, có gì em báo anh/chị ngay.';
      fx = { team: first ? 1 : 0 };
    }
  } else if (pickK === 'push') {
    st.progress = Math.min(100, st.progress + 5);
    if (st.mood <= 1) { st.mood = Math.max(0, st.mood - 1); fx = { team: -2, progress: 1 }; reply = 'Dạ... em biết rồi ạ 😓 (Có vẻ bạn ấy đang áp lực, nên hỏi vướng mắc trước.)'; }
    else { fx = { progress: 2 }; reply = 'Dạ em nắm rồi ạ, em sẽ xong đúng hạn!'; }
  } else if (pickK === 'coffee') {
    st.mood = Math.min(3, st.mood + 1);
    fx = { team: 2, energy: -3 };
    reply = 'Ôi tuyệt quá, đi luôn anh/chị ơi! ☕';
  }
  applyFx(fx);
  S.clock = addMin(S.clock, 10);
  save();
  refreshHud();
  card.querySelector('.choices').outerHTML = `<div class="feedback ok">💬 ${honor} ${esc(p.name.split(' ').pop())}: “${esc(reply)}”<div style="margin-top:8px">${chips(fx)}</div></div>`;
  const close = card.querySelector('#mt-close');
  close.classList.add('primary');
  close.focus();
  await waitClick(close);
  closeModal();
  if (S.clock >= '18:00' && !S.lateWarned) { S.lateWarned = true; toast('🌆 Đã 18:00 rồi, ra cửa chính để kết thúc buổi đi dạo nhé!', 4000); }
}

function reportRows() {
  const by = {};
  for (const n of fillers) {
    const a = seats[n.seat].area;
    const r = (by[a] ||= { area: areaName(a), total: 0, asked: 0, sum: 0, blocked: 0, risk: 0 });
    r.total++;
    const st = S.mgr?.[personOf(n).name];
    if (st && st.asked) { r.asked++; r.sum += st.progress; if (st.status === 'blocked') r.blocked++; if (st.status === 'atrisk') r.risk++; }
  }
  return Object.values(by);
}

function showReport() {
  const rows = reportRows();
  const tot = rows.reduce((a, r) => ({ total: a.total + r.total, asked: a.asked + r.asked, sum: a.sum + r.sum, blocked: a.blocked + r.blocked, risk: a.risk + r.risk }), { total: 0, asked: 0, sum: 0, blocked: 0, risk: 0 });
  const cell = 'padding:7px 8px;border-bottom:1px solid var(--line);font-size:13px';
  const card = openModal(`${head('Báo cáo tiến độ DU35', `${S.clock} · đã hỏi thăm ${tot.asked}/${tot.total} người`, '#1f5eff', '📊')}
    <div class="summary-grid">
      <div class="s">Tiến độ TB (đã hỏi)<b>${tot.asked ? Math.round(tot.sum / tot.asked) + '%' : '—'}</b></div>
      <div class="s">Đang vướng<b style="color:#e5484d">${tot.blocked}</b></div>
      <div class="s">Có rủi ro<b style="color:#e8a317">${tot.risk}</b></div>
      <div class="s">🤝 Tinh thần team<b>${Math.round(S.stats.team)}</b></div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="text-align:left;color:var(--muted)"><th style="${cell}">Khu / dự án</th><th style="${cell}">Người</th><th style="${cell}">Đã hỏi</th><th style="${cell}">Tiến độ TB</th><th style="${cell}">Vướng</th></tr>
      ${rows.map((r) => `<tr><td style="${cell}"><b>${esc(r.area)}</b></td><td style="${cell}">${r.total}</td><td style="${cell}">${r.asked}</td>
        <td style="${cell}">${r.asked ? progressBar(Math.round(r.sum / r.asked), '#1f5eff') : '<span class="m-sub">chưa hỏi</span>'}</td>
        <td style="${cell};color:${r.blocked ? '#e5484d' : 'inherit'}">${r.blocked || '—'}</td></tr>`).join('')}
    </table>
    <div class="m-foot"><span class="m-sub">Chỉ thống kê những người bạn đã hỏi thăm</span><button class="primary" id="rp-close">Đóng</button></div>`);
  return waitClick(card.querySelector('#rp-close')).then(closeModal);
}

async function managerEnd() {
  const asked = Object.values(S.mgr || {}).filter((x) => x.asked).length;
  const i = await dialog({ title: 'Kết thúc buổi đi dạo?', sub: S.clock, initial: '🏁', text: `Bạn đã hỏi thăm ${asked}/${fillers.length} người. Xem báo cáo tổng kết và kết thúc?`, buttons: ['Đi tiếp', 'Kết thúc'] });
  if (i !== 1) return;
  await showReport();
  const st = S.stats;
  const score = Math.round(((st.team + st.progress + st.client) / 3) * 0.7 + Math.min(100, (asked / Math.max(1, fillers.length)) * 100) * 0.3);
  const title = score >= 80 ? '🌟 Quản lý được yêu mến nhất' : score >= 60 ? '🤝 Quản lý tận tâm' : score >= 40 ? '🚶 Quản lý chăm đi dạo' : '☕ Hôm sau đi dạo thêm nhé';
  clearSave();
  const card = openModal(`${head('Tổng kết buổi đi dạo', `${S.name} · Quản lý`, '#1f5eff', '🏁')}
    <div style="text-align:center"><div class="title-badge">${title}</div></div>
    <div class="summary-grid">
      <div class="s">Điểm<b>${score}</b></div><div class="s">Đã hỏi thăm<b>${asked}</b></div>
      <div class="s">🤝 Tinh thần team<b>${Math.round(st.team)}</b></div><div class="s">📈 Tiến độ<b>${Math.round(st.progress)}</b></div>
      <div class="s">😊 Khách hàng<b>${Math.round(st.client)}</b></div>
    </div>
    <div class="m-foot"><button id="again" class="primary">Chơi lại</button></div>`);
  card.querySelector('#again').addEventListener('click', () => location.reload());
}

async function runInteraction(it) {
  busy = true;
  $('#prompt').hidden = true;
  try {
    if (it.kind === 'step') await runStep();
    else if (it.kind === 'npc') {
      const n = it.n;
      const line = n.d.idle[Math.floor(Math.random() * n.d.idle.length)];
      const first = !S.talked[n.id];
      await dialog({ title: npcTitle(n.d), sub: 'Trò chuyện', color: n.d.color, text: line, extra: first ? chips({ team: 1 }) : '', buttons: ['OK'] });
      if (first) { S.talked[n.id] = true; applyFx({ team: 1 }); save(); }
    } else if (it.kind === 'filler' && isManager()) {
      await managerTalk(it.n);
    } else if (it.kind === 'mgr-exit') {
      await managerEnd();
    } else if (it.kind === 'filler') {
      const who = it.n.person;
      toast(`${who ? `<b>${esc(who.name)}</b> · ${esc(who.unit)}${who.stack ? ' · ' + esc(who.stack) : ''}<br>` : ''}💬 ${FILLER_LINES[Math.floor(Math.random() * FILLER_LINES.length)]}`, 3500);
    } else if (it.kind === 'directory') {
      await showDirectory();
    } else if (it.kind === 'kudos') {
      const k = C.kudos || [];
      const first = !S.talked.kudos;
      await dialog({ title: 'Ảnh khen ngợi từ khách hàng', sub: 'Kệ cây cảnh', initial: '🏆', text: k.map((x) => `“${x.text}”\n— ${x.from}`).join('\n\n'), extra: first ? chips({ team: 2 }) : '', buttons: ['Tự hào quá!'] });
      if (first) { S.talked.kudos = true; applyFx({ team: 2 }); save(); }
    } else if (it.kind === 'wc') {
      if (S.talked.wc) toast('💧 Bạn vừa rửa mặt rồi.');
      else { S.talked.wc = true; applyFx({ energy: 5 }); toast('💧 Tỉnh táo hơn hẳn! ' + chips({ energy: 5 })); save(); }
    } else if (it.kind === 'coffee') {
      if (S.coffee >= 2) toast('☕ Hôm nay bạn uống 2 ly rồi, uống thêm sẽ mất ngủ đó!');
      else { S.coffee++; applyFx({ energy: 12 }); toast('☕ Cà phê sữa đá! ' + chips({ energy: 12 })); save(); }
    }
  } finally { busy = false; }
}

async function runStep() {
  const st = curStep();
  const ctx = { npcs: C.npcs, role: S.role, stats: S.stats };
  let fx = {};
  if (st.type === 'bugfix') sitAtDesk(true);
  switch (st.type) {
    case 'quiz': fx = await MG.quiz(C.quizzes[st.ref], ctx); break;
    case 'talk': fx = await MG.talk(C.talks[st.ref], ctx); break;
    case 'standup': fx = await MG.standup(C.standups[st.ref], ctx); break;
    case 'poker': fx = await MG.poker(C.poker[st.ref], ctx); break;
    case 'bugfix': fx = await MG.bugfix(C.bugs[st.ref], ctx); break;
    case 'client': fx = await MG.client(C.clients[st.ref], ctx); break;
    case 'event': fx = await MG.event(C.events[st.ref], ctx); break;
    case 'leave': return endDay();
  }
  if (st.type === 'bugfix') sitAtDesk(false);
  if (S.stats.energy < 20) {
    // mệt thì làm việc kém hiệu quả: kỹ năng & tiến độ chỉ được một nửa
    fx = { ...fx };
    for (const k of ['skill', 'progress']) if (fx[k] > 0) fx[k] = Math.round(fx[k] / 2);
    toast('😴 Vì quá mệt nên hiệu quả công việc giảm một nửa.', 4000);
  }
  applyFx(fx);
  S.clock = st.time || S.clock;
  S.step++;
  office.cake.visible = false;
  const next = curStep();
  const nextKey = next ? (next.type === 'event' ? next.ref : next.type) : null;
  const keepIds = next && GATHER[nextKey] && rooms[next.target] ? GATHER[nextKey] : [];
  sendHome(keepIds);
  gatherFor(next);
  save();
  refreshHud();
  if (S.stats.energy <= 15) toast('😵 Bạn đang rất mệt. Ra pantry pha cà phê hoặc về sớm nghỉ ngơi nhé!', 4000);
}

function sitAtDesk(on) {
  const s = seats[MY_SEAT];
  const r = player.ch.root;
  if (on) { r.position.set(s.x, 0, s.z); r.rotation.y = s.rot; player.ch.sit(true); s.screen.material.emissive.set('#3a7bff'); }
  else { player.ch.sit(false); r.position.set(s.x, 0, s.z + (s.rot === Math.PI ? 0.75 : -0.75)); s.screen.material.emissive.set('#203a6b'); }
}

async function endDay() {
  const st = curStep();
  S.clock = st.time || '18:00';
  refreshHud();
  const delta = {};
  for (const k in S.stats) delta[k] = Math.round(S.stats[k] - S.dayStart[k]);
  const last = S.day >= C.days.length - 1;
  const options = [
    { t: '⏰ Tăng ca thêm 1 tiếng', fx: { progress: 8, energy: -15 } },
    { t: '📚 Về học thêm tiếng Anh / kỹ thuật', fx: { skill: 6, energy: -8 } },
    { t: '🍜 Đi ăn tối cùng team', fx: { team: 6, energy: -4 } },
    { t: '🛌 Về nhà nghỉ ngơi sớm', fx: { energy: 15 } },
  ];
  const card = openModal(`${head(`Kết thúc ${curDay().title}`, `${WEEKDAYS[S.day]} · ${S.clock}`, '#0f1a2e', '🌙')}
    <div class="m-sub">Thay đổi trong ngày</div><div style="margin:8px 0 16px">${chips(delta) || '<span class="m-sub">Không đổi</span>'}</div>
    <div class="m-text" style="margin-bottom:10px"><b>${last ? 'Tối thứ Sáu rồi! Bạn muốn làm gì?' : 'Tối nay bạn làm gì?'}</b></div>
    <div class="choices">${options.map((o) => `<button>${esc(o.t)} ${chips(o.fx)}</button>`).join('')}</div>`);
  const i = await new Promise((res) => card.querySelectorAll('.choices button').forEach((b, k) => b.addEventListener('click', () => res(k), { once: true })));
  closeModal();
  applyFx(options[i].fx);
  if (last) return showEnding();
  S.day++;
  S.step = 0;
  applyFx({ energy: 25 });
  startDay();
}

function showEnding() {
  const st = S.stats;
  const score = Math.round((st.skill + st.team + st.client + st.progress) / 4);
  const end = C.endings.find((e) => score >= e.min) || C.endings[C.endings.length - 1];
  clearSave();
  const hasCareer = C.careerUrl && C.careerUrl !== '#';
  const card = openModal(`${head('Kết thúc Sprint', `${S.name} · ${C.roles[S.role].name}`, '#1f5eff', '🏁')}
    <div style="text-align:center"><div class="title-badge">${esc(end.title)}</div><div class="m-text">${esc(end.text)}</div></div>
    <div class="summary-grid">
      <div class="s">Điểm tổng<b>${score}</b></div>
      <div class="s">🧠 Kỹ năng<b>${Math.round(st.skill)}</b></div>
      <div class="s">🤝 Đồng đội<b>${Math.round(st.team)}</b></div>
      <div class="s">😊 Khách hàng<b>${Math.round(st.client)}</b></div>
      <div class="s">📈 Tiến độ<b>${Math.round(st.progress)}</b></div>
    </div>
    <div class="m-foot"><button id="again">Chơi lại</button>${hasCareer ? '<button class="primary" id="career">Ứng tuyển vào DU35</button>' : ''}</div>`);
  card.querySelector('#again').addEventListener('click', () => location.reload());
  card.querySelector('#career')?.addEventListener('click', () => window.open(C.careerUrl, '_blank', 'noopener'));
}

async function startDay() {
  S.dayStart = { ...S.stats };
  S.coffee = 0;
  S.talked = {};
  S.clock = isManager() ? (S.clock && S.clock !== '08:30' ? S.clock : '09:00') : '08:30';
  if (!isManager() && S.step > 0) S.clock = curDay().steps[S.step - 1].time;
  save();
  for (const n of Object.values(npcs)) { n.chain = Promise.resolve(); placeAtSeat(n); }
  spawnPlayer();
  cam.yaw = 0;
  updateCamera(0, true);
  refreshHud();
  $('#hud').hidden = false;
  gatherFor(curStep());
  if (isManager()) {
    if (!S.mgrIntro) {
      S.mgrIntro = true; save();
      await dialog({ title: 'Vai Quản lý', sub: 'Đi dạo DU35', initial: '🧭', text: MGR_INTRO, buttons: ['Bắt đầu đi dạo'] });
    }
    return;
  }
  if (S.step === 0) await dialog({ title: `Ngày ${S.day + 1}: ${curDay().title}`, sub: WEEKDAYS[S.day], initial: S.day + 1, text: curDay().intro, buttons: ['Bắt đầu'] });
}

// ---------- start screen ----------
let role = 'dev';
$('#role-pick').innerHTML = Object.entries(C.roles).map(([id, r]) => `<button data-r="${id}" class="${id === role ? 'on' : ''}">${esc(r.name)}<small>${esc(r.desc)}</small></button>`).join('');
$('#role-pick').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
  role = b.dataset.r;
  $('#role-pick').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
}));
const saved = loadSave();
if (saved && C.days[saved.day]) {
  $('#btn-continue').hidden = false;
  $('#cont-day').textContent = saved.day + 1;
  $('#btn-continue').addEventListener('click', () => { S = saved; $('#start').hidden = true; makePlayer(); startDay(); });
}
$('#btn-new').addEventListener('click', () => {
  const name = $('#in-name').value.trim() || 'Bạn';
  S = { name, role, day: 0, step: 0, stats: { ...C.startStats, ...(C.roles[role].stats || {}) }, talked: {}, coffee: 0, clock: '08:30' };
  $('#start').hidden = true;
  makePlayer();
  startDay();
});

// ---------- loop ----------
const clock = new THREE.Clock();
let t = 0, emoteTimer = 1;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  for (const n of Object.values(npcs)) updateNpc(n, dt);
  ambient.update(dt);
  // thỉnh thoảng một đồng nghiệp gần đó bật biểu tượng cảm xúc
  emoteTimer -= dt;
  if (player && emoteTimer <= 0 && fillers.length) {
    emoteTimer = 0.9 + Math.random() * 1.2;
    const pp = player.ch.root.position;
    const near = fillers.filter((n) => !n.busy && Math.hypot(n.ch.root.position.x - pp.x, n.ch.root.position.z - pp.z) < 14);
    if (near.length) {
      const n = near[Math.floor(Math.random() * near.length)];
      const e = label(EMOTES[Math.floor(Math.random() * EMOTES.length)], 'emote');
      e.position.y = 1.75;
      n.ch.root.add(e);
      setTimeout(() => { n.ch.root.remove(e); e.element.remove(); }, 2400);
    }
  }
  // chỉ hiện tên đồng nghiệp ở gần để màn hình không bị rối
  if (player) {
    const pp = player.ch.root.position;
    for (const n of fillers) if (n.label) n.label.visible = n.ch.pose !== 'hidden' && Math.hypot(n.ch.root.position.x - pp.x, n.ch.root.position.z - pp.z) < (isManager() ? 4.0 : 3.0);
  }
  updatePlayer(dt);
  updateCamera(dt);
  if (S && player) {
    const tp = stepTargetPos(curStep());
    marker.visible = ring.visible = !!tp;
    if (tp) {
      const h = npcs[curStep().target] ? 2.55 : 1.4;
      marker.position.set(tp.x, h + Math.sin(t * 3) * 0.12, tp.z);
      cone.rotation.y = t * 2;
      ring.position.set(tp.x, 0.03, tp.z);
      const s = 1 + Math.sin(t * 3) * 0.08; ring.scale.set(s, s, s);
    }
    current = !busy && !isModalOpen() ? findInteraction() : null;
    const pr = $('#prompt');
    if (current) { pr.innerHTML = `<kbd>E</kbd>${esc(current.text)}`; pr.hidden = false; } else pr.hidden = true;
  } else {
    marker.visible = ring.visible = false;
    cam.yaw += dt * 0.08; // xoay chậm ở màn hình chờ
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}
updateCamera(0, true);
frame();

// Công cụ debug: mở game với ?debug để dùng window.DU35 trong console
if (location.search.includes('debug')) {
  window.DU35 = {
    get state() { return S; },
    tp(x, z) { player.ch.root.position.set(x, 0, z); },
    tpTarget() { const p = stepTargetPos(curStep()); if (p) player.ch.root.position.set(p.x + 0.9, 0, p.z + 0.9); },
    interact() { const it = findInteraction(); if (it) runInteraction(it); return it?.text; },
    npcs, step: () => curStep(), mergeInfo, fillers: () => fillers.length,
    bench() { const t0 = performance.now(); for (let i = 0; i < 20; i++) renderer.render(scene, camera); renderer.getContext().finish(); return { msPerFrame: ((performance.now() - t0) / 20).toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
    ff(sec) { for (let i = 0; i < sec * 30; i++) { for (const n of Object.values(npcs)) updateNpc(n, 1 / 30); ambient.update(1 / 30); } },
    ambient, managerTalk: (i) => managerTalk(fillers[i]), showReport, fillerList: fillers,
  };
}
