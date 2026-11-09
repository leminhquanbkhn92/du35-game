// Cuộc sống văn phòng: đồng nghiệp tự đứng dậy đi cà phê, WC, xem kệ ảnh, ghé bàn tán gẫu,
// gọi điện trong phone booth và rủ nhau họp nhóm, xong việc thì quay về chỗ làm.
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function turnTo(obj, target, k) {
  let d = target - obj.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  obj.rotation.y += d * Math.min(1, k);
}

export function createAmbient({ fillers, seats, findPath, placeAtSeat, label, getPlayerPos, max = 16 }) {
  const active = new Set();
  let timer = 1.5, meetTimer = 5;

  const huddle = (cx, cz) => ({
    center: { x: cx, z: cz },
    slots: [0, 1, 2, 3].map((i) => ({ x: cx + Math.cos(i * Math.PI / 2 + 0.4) * 0.9, z: cz + Math.sin(i * Math.PI / 2 + 0.4) * 0.9 })),
    busy: false,
  });
  const meetPlaces = [
    { center: { x: -20.3, z: 0.5 }, slots: [{ x: -21.5, z: 0.5 }, { x: -19.1, z: 0.5 }, { x: -20.3, z: -0.4 }, { x: -20.3, z: 1.4 }], busy: false },
    huddle(2.0, 6.3), huddle(-33.0, 5.5), huddle(9.5, 6.3), huddle(-3.5, 6.3),
  ];
  const booths = [{ x: -9.7, z: -9.6, busy: false }, { x: -5.6, z: -9.6, busy: false }];

  function emote(n, e) {
    const l = label(e, 'emote');
    l.position.y = n.ch.pose === 'sit' ? 1.75 : 1.95;
    n.ch.root.add(l);
    setTimeout(() => { n.ch.root.remove(l); l.element.remove(); }, 2400);
  }
  function go(n, target, then) {
    n.ch.setPose('stand');
    n.path = findPath(n.ch.root.position, target);
    n.moving = true;
    n.waitT = 0;
    n.then = then;
  }
  function wait(n, sec, face, then, chatter = null) {
    n.moving = false;
    n.waitT = sec;
    n.face = face;
    n.then = then;
    n.chatter = chatter;
    n.emoteT = rand(1.5, 4);
  }
  function begin(n) { n.busy = true; active.add(n); }
  function home(n) {
    go(n, seats[n.seat], () => {
      placeAtSeat(n);
      n.moving = false; n.busy = false; n.chatter = null;
      active.delete(n);
      if (n.release) { const r = n.release; n.release = null; r(); }
    });
  }

  function pickIdle() {
    const idle = fillers.filter((n) => !n.busy);
    if (!idle.length) return null;
    const pp = getPlayerPos();
    if (pp && Math.random() < 0.65) {
      const near = idle.filter((n) => dist(n.ch.root.position, pp) < 22);
      if (near.length) return pick(near);
    }
    return pick(idle);
  }

  // ---------- các hoạt động ----------
  const ACT = {
    coffee(n) {
      const a = rand(0, Math.PI * 2), c = { x: -41.6, z: 5.8 };
      go(n, { x: c.x + Math.cos(a) * 1.6, z: c.z + Math.sin(a) * 1.6 }, () => {
        emote(n, pick(['☕', '🧋', '🍪']));
        wait(n, rand(6, 10), c, () => home(n), ['😋', '☕', '😄']);
      });
    },
    wc(n) {
      go(n, { x: 36.05, z: 2.0 }, () => go(n, { x: 36.05, z: -1.6 }, () => {
        n.ch.setPose('hidden');
        wait(n, rand(5, 8), null, () => { n.ch.setPose('stand'); home(n); });
      }));
    },
    kudos(n) {
      const x = rand(-10, 14);
      go(n, { x, z: 8.7 }, () => {
        emote(n, pick(['🏆', '🥹', '👏']));
        wait(n, rand(4, 6), { x, z: 11 }, () => home(n));
      });
    },
    chat(n) {
      const s0 = seats[n.seat];
      const m = fillers.find((o) => o !== n && !o.busy && dist(seats[o.seat], s0) < 9 && dist(seats[o.seat], s0) > 1.5 && Math.random() < 0.3)
        || fillers.find((o) => o !== n && !o.busy && dist(seats[o.seat], s0) < 9 && dist(seats[o.seat], s0) > 1.5);
      if (!m) return ACT.coffee(n);
      m.busy = true;
      const s = seats[m.seat];
      const p = { x: s.x - Math.sin(s.rot) * 0.9, z: s.z - Math.cos(s.rot) * 0.9 };
      go(n, p, () => {
        emote(n, pick(['💬', '👋', '🤗']));
        setTimeout(() => emote(m, pick(['😂', '😆', '👍', '🙌'])), 900);
        wait(n, rand(6, 10), s, () => { m.busy = false; home(n); }, ['😂', '💬', '🤣', '👀']);
      });
    },
    booth(n) {
      const b = booths.find((x) => !x.busy);
      if (!b) return ACT.kudos(n);
      b.busy = true;
      n.release = () => { b.busy = false; };
      go(n, { x: b.x, z: -8.4 }, () => go(n, { x: b.x, z: b.z }, () => {
        n.ch.root.position.set(b.x, 0, b.z);
        n.ch.root.rotation.y = Math.PI;
        n.ch.setPose('sit');
        emote(n, '📞');
        wait(n, rand(10, 16), null, () => home(n), ['📞', '🗣️', '🤔']);
      }));
    },
  };
  const WEIGHTS = [['coffee', 3], ['chat', 4], ['kudos', 1], ['wc', 1.5], ['booth', 1.2]];
  function startRandom() {
    const n = pickIdle();
    if (!n) return;
    let r = Math.random() * WEIGHTS.reduce((s, w) => s + w[1], 0), name = 'chat';
    for (const [k, w] of WEIGHTS) { if ((r -= w) < 0) { name = k; break; } }
    begin(n);
    ACT[name](n);
  }

  function startMeeting() {
    const place = meetPlaces.filter((p) => !p.busy);
    if (!place.length) return;
    const pl = pick(place);
    const seed = pickIdle();
    if (!seed) return;
    const area = seats[seed.seat].area;
    const members = fillers.filter((n) => !n.busy && seats[n.seat].area === area)
      .sort((a, b) => dist(seats[a.seat], seats[seed.seat]) - dist(seats[b.seat], seats[seed.seat]))
      .slice(0, 3 + Math.floor(Math.random() * 2));
    if (members.length < 3) return;
    pl.busy = true;
    let left = members.length;
    const stay = rand(18, 26);
    members.forEach((n, i) => {
      begin(n);
      n.release = () => { if (--left === 0) pl.busy = false; };
      const slot = pl.slots[i % pl.slots.length];
      go(n, slot, () => {
        emote(n, pick(['👋', '📋', '💡']));
        wait(n, stay - i * 0.8, pl.center, () => home(n), ['💡', '📊', '🗣️', '👍', '🤔', '✅', '📅']);
      });
    });
  }

  return {
    get active() { return active.size; },
    update(dt) {
      timer -= dt;
      if (timer <= 0) { timer = rand(0.8, 1.8); if (active.size < max) startRandom(); }
      meetTimer -= dt;
      if (meetTimer <= 0) { meetTimer = rand(10, 18); if (active.size < max + 4) startMeeting(); }
      for (const n of active) {
        const r = n.ch.root;
        if (n.path && n.path.length) {
          const tgt = n.path[0];
          const dx = tgt.x - r.position.x, dz = tgt.z - r.position.z, d = Math.hypot(dx, dz);
          if (d < 0.08) {
            n.path.shift();
            if (!n.path.length) { n.moving = false; const f = n.then; n.then = null; if (f) f(); }
          } else {
            const step = Math.min(d, 1.8 * dt);
            r.position.x += (dx / d) * step; r.position.z += (dz / d) * step;
            turnTo(r, Math.atan2(dx, dz), dt * 10);
          }
        } else if (n.waitT > 0) {
          n.waitT -= dt;
          if (n.face) turnTo(r, Math.atan2(n.face.x - r.position.x, n.face.z - r.position.z), dt * 6);
          if (n.chatter && n.ch.pose !== 'hidden') { n.emoteT -= dt; if (n.emoteT <= 0) { n.emoteT = rand(3.5, 6); emote(n, pick(n.chatter)); } }
          if (n.waitT <= 0) { const f = n.then; n.then = null; if (f) f(); }
        }
      }
      for (const n of fillers) n.ch.update(dt, !!(n.moving && n.path && n.path.length));
    },
  };
}
