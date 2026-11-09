import * as THREE from 'three';
import { mat } from './stage.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function part(geo, color) {
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true;
  return m;
}

// Nhân vật low-poly dựng bằng khối cơ bản. Mặt hướng về +z.
export function makeCharacter({ shirt = '#1f5eff', pants = '#2d3a4f', skin = '#f2c9a8', hair = '#1a1a1a', female = false, lanyard = true } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // chân (pivot ở hông)
  const mkLeg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.8, 0);
    const leg = part(new THREE.CylinderGeometry(0.075, 0.065, 0.72, 8), pants);
    leg.position.y = -0.38;
    const shoe = part(new THREE.BoxGeometry(0.15, 0.08, 0.26), '#20242c');
    shoe.position.set(0, -0.76, 0.04);
    p.add(leg, shoe);
    body.add(p);
    return p;
  };
  const legL = mkLeg(-0.11), legR = mkLeg(0.11);

  // thân
  const torso = part(new THREE.BoxGeometry(female ? 0.42 : 0.46, 0.6, 0.26), shirt);
  torso.position.y = 1.1;
  body.add(torso);
  if (female) {
    const skirt = part(new THREE.CylinderGeometry(0.2, 0.27, 0.3, 10), pants);
    skirt.position.y = 0.72;
    body.add(skirt);
  }
  const hip = part(new THREE.BoxGeometry(0.4, 0.14, 0.24), pants);
  hip.position.y = 0.82;
  body.add(hip);
  if (lanyard) {
    const card = part(new THREE.BoxGeometry(0.1, 0.13, 0.02), '#ffffff');
    card.position.set(0, 1.02, 0.14);
    const strap = part(new THREE.BoxGeometry(0.02, 0.22, 0.02), '#1f5eff');
    strap.position.set(0, 1.18, 0.135);
    body.add(card, strap);
  }

  // tay (pivot ở vai)
  const mkArm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 1.36, 0);
    const arm = part(new THREE.CapsuleGeometry(0.06, 0.42, 4, 8), shirt);
    arm.position.y = -0.27;
    const hand = part(new THREE.SphereGeometry(0.065, 8, 6), skin);
    hand.position.y = -0.56;
    p.add(arm, hand);
    body.add(p);
    return p;
  };
  const armL = mkArm(female ? -0.27 : -0.29), armR = mkArm(female ? 0.27 : 0.29);

  // đầu
  const head = new THREE.Group();
  head.position.y = 1.62;
  const neck = part(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), skin);
  neck.position.y = -0.18;
  const skull = part(new THREE.SphereGeometry(0.2, 16, 12), skin);
  const hairTop = part(new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairTop.position.y = 0.02;
  hairTop.rotation.x = -0.25;
  head.add(neck, skull, hairTop);
  if (female) {
    const back = part(new THREE.BoxGeometry(0.38, 0.42, 0.14), hair);
    back.position.set(0, -0.08, -0.13);
    head.add(back);
  }
  for (const ex of [-0.07, 0.07]) {
    const eye = part(new THREE.SphereGeometry(0.025, 6, 6), '#1b1b1b');
    eye.position.set(ex, 0.01, 0.185);
    head.add(eye);
  }
  body.add(head);

  // bóng mờ dưới chân
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  root.add(shadow);

  let phase = Math.random() * 10, sitting = false, t = Math.random() * 10;

  return {
    root, head,
    get sitting() { return sitting; },
    sit(on) {
      sitting = on;
      body.position.y = on ? -0.3 : 0;
      legL.rotation.x = legR.rotation.x = on ? -Math.PI / 2 : 0;
      armL.rotation.x = armR.rotation.x = on ? -0.9 : 0;
      shadow.visible = !on;
    },
    // speed: m/s hiện tại
    update(dt, speed) {
      t += dt;
      if (sitting) {
        // gõ phím nhẹ
        armL.rotation.x = -0.9 + Math.sin(t * 9) * 0.06;
        armR.rotation.x = -0.9 + Math.cos(t * 11) * 0.06;
        head.rotation.y = Math.sin(t * 0.4) * 0.15;
        return;
      }
      if (speed > 0.05) {
        phase += dt * speed * 4.2;
        const a = Math.sin(phase) * Math.min(0.75, 0.25 + speed * 0.18);
        legL.rotation.x = a; legR.rotation.x = -a;
        armL.rotation.x = -a * 0.8; armR.rotation.x = a * 0.8;
        body.position.y = Math.abs(Math.cos(phase)) * 0.04;
      } else {
        const k = Math.min(1, dt * 10);
        legL.rotation.x += (0 - legL.rotation.x) * k;
        legR.rotation.x += (0 - legR.rotation.x) * k;
        armL.rotation.x += (Math.sin(t * 1.5) * 0.03 - armL.rotation.x) * k;
        armR.rotation.x += (-Math.sin(t * 1.5) * 0.03 - armR.rotation.x) * k;
        body.position.y = Math.sin(t * 2) * 0.008;
      }
    },
  };
}

// Nhân vật ngồi tĩnh gộp thành 1 mesh (dùng cho ~180 đồng nghiệp, giảm draw call rất nhiều)
const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
export function makeSeatedStatic(opts) {
  const ch = makeCharacter(opts);
  ch.sit(true);
  ch.root.updateMatrixWorld(true);
  const geos = [];
  ch.root.traverse((o) => {
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
  const root = new THREE.Group();
  root.add(mesh);
  return { root, head: null, sitting: true, sit() {}, update() {} };
}
