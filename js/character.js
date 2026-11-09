import * as THREE from 'three';
import { mat } from './stage.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Nhân vật chibi dễ thương: đầu to, mắt tròn long lanh, má hồng, nhiều kiểu tóc & phụ kiện.
export const PASTEL = ['#ff8fab', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c', '#90be6d', '#f28482', '#7bdff2', '#cdb4db', '#ffb4a2', '#a0c4ff'];
export const HAIR = ['#2b1d14', '#1a1a1a', '#4a2a17', '#6b4226', '#3a2416', '#8a5a3c', '#2b1d14', '#1a1a1a'];
const FUN_HAIR = ['#e07aa8', '#6c8cff', '#b48cff', '#f2a65a'];
const STYLES_M = ['short', 'spiky', 'messy', 'short', 'curly'];
const STYLES_F = ['bob', 'pony', 'twin', 'bun', 'long'];
const ACCS = ['none', 'none', 'none', 'cap', 'headphones', 'glasses', 'beanie', 'catears', 'leaf', 'bow', 'glasses'];

function rngFrom(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function part(geo, color) {
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true;
  return m;
}
const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

export function makeCharacter(o = {}) {
  const rnd = rngFrom(o.seed ?? Math.random() * 1e9);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const female = !!o.female;
  const shirt = o.shirt || pick(PASTEL);
  const pants = o.pants || (female ? pick(['#5a6b8c', '#3b4659', '#c98bb9', '#f4f1de']) : pick(['#3b4659', '#2d3a4f', '#6b7f99', '#c2a878']));
  const skin = o.skin || pick(['#ffdcc7', '#f8d0b4', '#f1c3a1', '#ffe2d0']);
  const hair = o.hair || (rnd() < 0.08 ? pick(FUN_HAIR) : pick(HAIR));
  const hairStyle = o.hairStyle || pick(female ? STYLES_F : STYLES_M);
  const acc = o.acc ?? pick(ACCS);
  const accent = o.accent || pick(PASTEL);
  const hi = o.detail ?? true;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const H = 0.52; // chiều cao hông

  // ---- chân ----
  const mkLeg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, H, 0);
    const leg = part(new THREE.CylinderGeometry(0.075, 0.07, 0.4, 8), pants);
    leg.position.y = -0.2;
    const foot = part(S(0.09, 10, 8), '#3a3f4b');
    foot.scale.set(1, 0.6, 1.45);
    foot.position.set(0, -0.44, 0.04);
    p.add(leg, foot);
    body.add(p);
    return p;
  };
  const legL = mkLeg(-0.1), legR = mkLeg(0.1);

  // ---- thân tròn ----
  const torso = part(new THREE.CapsuleGeometry(0.2, 0.18, 6, 12), shirt);
  torso.position.y = H + 0.28;
  torso.scale.set(1.05, 1, 0.85);
  body.add(torso);
  const hip = part(new THREE.CylinderGeometry(0.19, 0.2, 0.14, 12), pants);
  hip.position.y = H + 0.04;
  body.add(hip);
  if (female && hairStyle !== 'pony' && rnd() < 0.6) {
    const skirt = part(new THREE.CylinderGeometry(0.19, 0.28, 0.22, 12), pants);
    skirt.position.y = H + 0.0;
    body.add(skirt);
  }
  // hình in trên áo (ngôi sao / tim / tròn) cho vui
  if (hi && rnd() < 0.6) {
    const deco = part(rnd() < 0.5 ? new THREE.OctahedronGeometry(0.06, 0) : S(0.05, 8, 6), accent);
    deco.scale.set(1, 1, 0.35);
    deco.position.set(0, H + 0.33, 0.18);
    body.add(deco);
  }

  // ---- tay ----
  const mkArm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, H + 0.44, 0);
    const arm = part(new THREE.CapsuleGeometry(0.058, 0.2, 4, 8), shirt);
    arm.position.y = -0.15;
    const hand = part(S(0.068, 10, 8), skin);
    hand.position.y = -0.3;
    p.add(arm, hand);
    body.add(p);
    return p;
  };
  const armL = mkArm(-0.25), armR = mkArm(0.25);

  // ---- đầu to ----
  const head = new THREE.Group();
  head.position.y = H + 0.8;
  const skull = part(S(0.33, 20, 16), skin);
  skull.scale.set(1.05, 0.95, 1);
  head.add(skull);
  // mắt long lanh
  for (const ex of [-0.12, 0.12]) {
    const eye = part(S(0.055, 12, 10), '#2a1e1b');
    eye.scale.set(0.9, 1.15, 0.55);
    eye.position.set(ex, -0.02, 0.295);
    const shine = part(S(0.02, 8, 6), '#ffffff');
    shine.position.set(ex + 0.018, 0.015, 0.325);
    head.add(eye, shine);
  }
  // má hồng
  for (const bx of [-0.2, 0.2]) {
    const blush = part(S(0.055, 10, 8), '#ff9aa8');
    blush.scale.set(1, 0.55, 0.3);
    blush.position.set(bx, -0.1, 0.262);
    head.add(blush);
  }
  // miệng cười
  const mouth = part(new THREE.TorusGeometry(0.042, 0.012, 6, 12, Math.PI), '#7a3b2e');
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.1, 0.31);
  head.add(mouth);

  // ---- tóc ----
  const cap = part(new THREE.SphereGeometry(0.35, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
  cap.rotation.x = -0.28;
  cap.position.y = 0.01;
  head.add(cap);
  const fringe = part(S(0.17, 12, 8), hair);
  fringe.scale.set(1.5, 0.45, 0.7);
  fringe.position.set(0, 0.2, 0.22);
  head.add(fringe);
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, color = hair) => {
    const m = part(geo, color);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    head.add(m);
    return m;
  };
  switch (hairStyle) {
    case 'spiky':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = add(new THREE.ConeGeometry(0.08, 0.2, 6), Math.cos(a) * 0.15, 0.32, Math.sin(a) * 0.15 - 0.03);
        c.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      }
      break;
    case 'messy':
      for (let i = 0; i < 4; i++) add(S(0.1, 8, 6), -0.15 + i * 0.1, 0.3 + (i % 2) * 0.04, -0.02 + (i % 2) * 0.05);
      break;
    case 'curly':
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; add(S(0.1, 8, 6), Math.cos(a) * 0.24, 0.2 + Math.sin(i) * 0.05, Math.sin(a) * 0.24 - 0.05); }
      break;
    case 'bun':
      add(S(0.13, 12, 10), 0, 0.36, -0.1);
      break;
    case 'pony': {
      const t = add(new THREE.CapsuleGeometry(0.09, 0.24, 4, 8), 0, -0.04, -0.37);
      t.rotation.x = 0.45;
      add(S(0.05, 8, 6), 0, 0.12, -0.33, 1, 1, 1, accent);
      break;
    }
    case 'twin':
      add(S(0.13, 12, 10), -0.34, -0.02, -0.08);
      add(S(0.13, 12, 10), 0.34, -0.02, -0.08);
      add(S(0.04, 8, 6), -0.28, 0.08, -0.05, 1, 1, 1, accent);
      add(S(0.04, 8, 6), 0.28, 0.08, -0.05, 1, 1, 1, accent);
      break;
    case 'bob':
      add(S(0.3, 14, 10), 0, -0.06, -0.12, 1.12, 0.95, 0.75);
      add(new THREE.CapsuleGeometry(0.09, 0.16, 4, 8), -0.3, -0.12, 0.02);
      add(new THREE.CapsuleGeometry(0.09, 0.16, 4, 8), 0.3, -0.12, 0.02);
      break;
    case 'long':
      add(new THREE.CapsuleGeometry(0.26, 0.32, 4, 10), 0, -0.24, -0.16, 1.05, 1, 0.55);
      break;
  }

  // ---- phụ kiện ----
  switch (acc) {
    case 'cap': {
      add(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), 0, 0.04, 0, 1, 1, 1, accent).rotation.x = -0.15;
      const brim = add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), 0, 0.17, 0.3, 1, 1, 1.3, accent);
      brim.rotation.x = 0.15;
      break;
    }
    case 'beanie':
      add(new THREE.SphereGeometry(0.365, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), 0, 0.03, 0, 1, 1, 1, accent).rotation.x = -0.2;
      add(S(0.07, 8, 6), 0, 0.4, -0.06, 1, 1, 1, '#ffffff');
      break;
    case 'headphones': {
      const band = add(new THREE.TorusGeometry(0.36, 0.028, 6, 20, Math.PI), 0, 0.02, 0, 1, 1, 1, '#2b2f38');
      for (const sx of [-1, 1]) { const cup = add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), sx * 0.35, 0, 0, 1, 1, 1, accent); cup.rotation.z = Math.PI / 2; }
      break;
    }
    case 'glasses':
      for (const gx of [-0.12, 0.12]) add(new THREE.TorusGeometry(0.075, 0.012, 6, 16), gx, -0.02, 0.33, 1, 1, 1, '#2b2f38');
      add(new THREE.BoxGeometry(0.09, 0.012, 0.012), 0, 0.0, 0.335, 1, 1, 1, '#2b2f38');
      break;
    case 'catears':
      for (const sx of [-1, 1]) {
        add(new THREE.ConeGeometry(0.1, 0.17, 4), sx * 0.2, 0.32, 0, 1, 1, 0.6, hair).rotation.z = -sx * 0.35;
        add(new THREE.ConeGeometry(0.055, 0.1, 4), sx * 0.2, 0.31, 0.03, 1, 1, 0.4, '#ffb3c6').rotation.z = -sx * 0.35;
      }
      break;
    case 'leaf': {
      add(new THREE.CylinderGeometry(0.01, 0.012, 0.12, 6), 0, 0.4, 0, 1, 1, 1, '#4f9d4a');
      const l1 = add(S(0.06, 8, 6), -0.05, 0.47, 0, 1.4, 0.45, 0.8, '#7ccf6b'); l1.rotation.z = 0.5;
      const l2 = add(S(0.06, 8, 6), 0.05, 0.47, 0, 1.4, 0.45, 0.8, '#7ccf6b'); l2.rotation.z = -0.5;
      break;
    }
    case 'bow':
      add(new THREE.ConeGeometry(0.07, 0.12, 4), -0.07, 0.3, 0.12, 1, 1, 0.5, accent).rotation.z = Math.PI / 2;
      add(new THREE.ConeGeometry(0.07, 0.12, 4), 0.07, 0.3, 0.12, 1, 1, 0.5, accent).rotation.z = -Math.PI / 2;
      add(S(0.035, 8, 6), 0, 0.3, 0.13, 1, 1, 1, accent);
      break;
  }
  body.add(head);

  // bóng mờ dưới chân
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  root.add(shadow);

  let phase = rnd() * 10, sitting = false, t = rnd() * 10;
  const ph = rnd() * 6.28;
  let hopTimer = 2 + rnd() * 6, hop = 0;

  return {
    root, head,
    get sitting() { return sitting; },
    sit(on) {
      sitting = on;
      body.position.y = on ? -0.05 : 0;
      body.rotation.z = 0;
      legL.rotation.x = legR.rotation.x = on ? -Math.PI / 2 : 0;
      armL.rotation.x = armR.rotation.x = on ? -1.0 : 0;
      shadow.visible = !on;
    },
    // speed: m/s hiện tại
    update(dt, speed) {
      t += dt;
      if (sitting) {
        armL.rotation.x = -1.0 + Math.sin(t * 9 + ph) * 0.08;
        armR.rotation.x = -1.0 + Math.cos(t * 11 + ph) * 0.08;
        head.rotation.z = Math.sin(t * 2.2 + ph) * 0.07; // lắc lư theo nhạc
        body.position.y = -0.05 + Math.abs(Math.sin(t * 4.4 + ph)) * 0.012;
        return;
      }
      if (speed > 0.05) {
        // đi kiểu nhún nhảy
        phase += dt * speed * 4.6;
        const a = Math.sin(phase) * Math.min(0.8, 0.3 + speed * 0.18);
        legL.rotation.x = a; legR.rotation.x = -a;
        armL.rotation.x = -a * 1.1; armR.rotation.x = a * 1.1;
        armL.rotation.z = -0.15; armR.rotation.z = 0.15;
        body.position.y = Math.abs(Math.sin(phase)) * 0.09;
        body.rotation.z = Math.sin(phase) * 0.06;
        head.rotation.z = -Math.sin(phase) * 0.06;
        hop = 0;
      } else {
        const k = Math.min(1, dt * 10);
        legL.rotation.x += (0 - legL.rotation.x) * k;
        legR.rotation.x += (0 - legR.rotation.x) * k;
        armL.rotation.x += (Math.sin(t * 1.8 + ph) * 0.06 - armL.rotation.x) * k;
        armR.rotation.x += (-Math.sin(t * 1.8 + ph) * 0.06 - armR.rotation.x) * k;
        armL.rotation.z += (-0.08 - armL.rotation.z) * k; armR.rotation.z += (0.08 - armR.rotation.z) * k;
        body.rotation.z += (0 - body.rotation.z) * k;
        head.rotation.z = Math.sin(t * 1.2 + ph) * 0.09;
        // thỉnh thoảng nhảy lên một cái
        hopTimer -= dt;
        if (hopTimer < 0) { hop = 0.001; hopTimer = 4 + Math.random() * 6; }
        if (hop > 0) {
          hop += dt / 0.4;
          if (hop >= 1) hop = 0;
          body.position.y = Math.sin(hop * Math.PI) * 0.14;
          armL.rotation.z = -0.6 * Math.sin(hop * Math.PI); armR.rotation.z = 0.6 * Math.sin(hop * Math.PI);
        } else body.position.y = Math.sin(t * 2.4 + ph) * 0.01;
      }
    },
  };
}

// Đồng nghiệp gộp thành 1 mesh cho nhẹ (~180 người). Có 2 dáng: ngồi và đứng (tạo khi cần).
// Khi đi lại thì nhún nhảy cả người kiểu chibi.
const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
function bake(root) {
  root.updateMatrixWorld(true);
  const geos = [];
  root.traverse((o) => {
    if (!o.isMesh || o.material.isMeshBasicMaterial) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count, c = o.material.color, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), BAKED_MAT);
  mesh.castShadow = true;
  return mesh;
}
export function makeStaticPerson(opts) {
  const o = { ...opts, detail: false };
  const sitCh = makeCharacter(o);
  sitCh.sit(true);
  const seated = bake(sitCh.root);
  let standing = null;
  const root = new THREE.Group();
  root.add(seated);
  let t = Math.random() * 10, pose = 'sit';
  const w = 1.6 + Math.random() * 1.6, ph = Math.random() * 6.28;
  const api = {
    root, head: null,
    get pose() { return pose; },
    setPose(p) {
      pose = p;
      if (p === 'stand' && !standing) { const c = makeCharacter(o); c.sit(false); standing = bake(c.root); root.add(standing); }
      seated.visible = p === 'sit';
      if (standing) standing.visible = p === 'stand';
    },
    sit(on) { api.setPose(on ? 'sit' : 'stand'); },
    update(dt, moving) {
      t += dt;
      if (pose === 'sit') {
        seated.position.y = Math.abs(Math.sin(t * w + ph)) * 0.015;
        seated.rotation.z = Math.sin(t * w * 0.5 + ph) * 0.03;
      } else if (pose === 'stand' && standing) {
        if (moving) { standing.position.y = Math.abs(Math.sin(t * 9 + ph)) * 0.12; standing.rotation.z = Math.sin(t * 9 + ph) * 0.07; }
        else { standing.position.y = Math.abs(Math.sin(t * 2 + ph)) * 0.02; standing.rotation.z = Math.sin(t * 1.3 + ph) * 0.04; }
      }
    },
  };
  return api;
}
export const makeSeatedStatic = makeStaticPerson;
