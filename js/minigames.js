import { openModal, closeModal, head, esc, chips, choose, waitClick, dialog } from './ui.js';

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const npcTitle = (npc) => (npc.name ? `${npc.name} (${npc.role})` : npc.role);
const npcHead = (npc, sub) => head(npcTitle(npc), sub, npc.color, (npc.name || npc.role)[0]);

function finish(card, fx, title = 'Hoàn thành!', note = '') {
  card.insertAdjacentHTML('beforeend', `<div class="feedback ok" style="margin-top:16px"><b>${esc(title)}</b>${note ? '<br>' + esc(note) : ''}<div style="margin-top:8px">${chips(fx)}</div></div>
    <div class="m-foot"><span></span><button class="primary" id="mg-done">Tiếp tục</button></div>`);
  const b = card.querySelector('#mg-done');
  b.focus();
  return waitClick(b).then(() => { closeModal(); return fx; });
}

// ---------- Daily stand-up ----------
export async function standup(data, ctx) {
  let correct = 0;
  const TIME = 15;
  for (let r = 0; r < data.rounds.length; r++) {
    const round = data.rounds[r];
    const order = shuffle(round.options.map((t, i) => ({ t, i })));
    const card = openModal(`${head('Daily Stand-up', `Meeting room 1 · Câu ${r + 1}/${data.rounds.length} · Ngắn gọn, đúng trọng tâm`, '#1f5eff', '☀')}
      <div class="timer"><i id="tm"></i></div>
      <div class="m-text"><b>${esc(ctx.npcs.pm.name)}:</b> ${esc(round.q)}</div>
      <div class="choices">${order.map((o) => `<button>${esc(o.t)}</button>`).join('')}</div><div id="fb"></div>`);
    const ok = await new Promise((resolve) => {
      const bar = card.querySelector('#tm');
      const t0 = performance.now();
      let done = false;
      const tick = () => {
        if (done) return;
        const left = 1 - (performance.now() - t0) / (TIME * 1000);
        bar.style.width = Math.max(0, left * 100) + '%';
        if (left <= 0) { done = true; btns.forEach((b) => (b.disabled = true)); btns[order.findIndex((o) => o.i === round.a)].classList.add('right'); resolve(null); return; }
        requestAnimationFrame(tick);
      };
      const btns = choose(card, '.choices button', (i, b) => {
        done = true;
        const right = order[i].i === round.a;
        b.classList.add(right ? 'right' : 'wrong');
        if (!right) btns[order.findIndex((o) => o.i === round.a)].classList.add('right');
        resolve(right);
      });
      requestAnimationFrame(tick);
    });
    if (ok) correct++;
    const fb = card.querySelector('#fb');
    fb.innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}">${ok === null ? '⏰ Hết giờ! Stand-up nên trả lời nhanh, gọn.' : ok ? '👍 Rõ ràng, đúng trọng tâm!' : '🤔 Chưa ổn. Stand-up cần nói cụ thể: đã làm gì, sẽ làm gì, có vướng mắc gì.'}</div>
      <div class="m-foot"><span></span><button class="primary" id="nx">${r < data.rounds.length - 1 ? 'Câu tiếp' : 'Kết thúc'}</button></div>`;
    const nx = fb.querySelector('#nx'); nx.focus();
    await waitClick(nx);
  }
  const fx = { team: correct * 3 - 2, skill: correct, progress: 2, energy: -5 };
  const card = openModal(`${head('Daily Stand-up', 'Kết quả', '#1f5eff', '☀')}<div class="m-text">Bạn trả lời tốt ${correct}/${data.rounds.length} câu.</div>`);
  return finish(card, fx, correct === data.rounds.length ? 'Stand-up hoàn hảo!' : 'Xong stand-up');
}

// ---------- Planning poker ----------
export async function poker(data, ctx) {
  const CARDS = [1, 2, 3, 5, 8, 13];
  const voters = ['pm', 'tl', 'qa', 'dev'];
  let perfect = 0, close = 0;
  await dialog({ title: 'Sprint Planning', sub: 'Meeting room 1', initial: '🃏', text: data.intro + '\n\nChọn số story point bạn nghĩ là hợp lý. Càng gần ý kiến chung của team càng tốt!', buttons: ['Bắt đầu'] });
  for (let s = 0; s < data.stories.length; s++) {
    const st = data.stories[s];
    const card = openModal(`${head('Planning Poker', `User story ${s + 1}/${data.stories.length}`, '#7a4dff', '🃏')}
      <div class="story"><b>${esc(st.title)}</b>${esc(st.desc)}</div>
      <div class="cards">${CARDS.map((c) => `<button>${c}</button>`).join('')}</div><div id="rv"></div>`);
    const pick = await new Promise((res) => choose(card, '.cards button', (i, b) => { b.classList.add('primary'); res(CARDS[i]); }));
    const sorted = [...st.team].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const diff = Math.abs(CARDS.indexOf(pick) - CARDS.indexOf(median));
    if (diff === 0) perfect++; else if (diff === 1) close++;
    card.querySelector('#rv').innerHTML = `<div class="votes">${voters.map((v, i) => `<div class="vote"><div class="v">${st.team[i]}</div>${esc(ctx.npcs[v].name)}</div>`).join('')}
      <div class="vote"><div class="v" style="background:#ff7a1a">${pick}</div>Bạn</div></div>
      <div class="feedback ${diff === 0 ? 'ok' : diff === 1 ? 'ok' : 'no'}">${diff === 0 ? '🎯 Chính xác như team!' : diff === 1 ? '👌 Khá sát.' : '🤔 Lệch khá xa, team thảo luận lại.'} Chốt: <b>${median} point</b>. ${esc(st.note)}</div>
      <div class="m-foot"><span></span><button class="primary" id="nx">${s < data.stories.length - 1 ? 'Story tiếp' : 'Kết thúc'}</button></div>`;
    const nx = card.querySelector('#nx'); nx.focus();
    await waitClick(nx);
  }
  const fx = { team: perfect * 3 + close, skill: perfect * 2 + close, progress: 8, energy: -8 };
  const card = openModal(`${head('Sprint Planning', 'Kết quả', '#7a4dff', '🃏')}<div class="m-text">Ước lượng chính xác ${perfect}, gần đúng ${close} trên ${data.stories.length} story.</div>`);
  return finish(card, fx, 'Sprint backlog đã sẵn sàng!');
}

// ---------- Fix bug ----------
export async function bugfix(bug, ctx) {
  const roleHint = ctx.role === 'qa' ? 'Là QA, bạn cùng dev tìm nguyên nhân để viết bug report chính xác.' : ctx.role === 'ba' ? 'Là BA, bạn cần hiểu nguyên nhân để giải thích cho khách hàng.' : 'Tìm dòng code gây lỗi.';
  const card = openModal(`${head(bug.title, 'Jira · In Progress', '#0b5cff', '🐞')}
    <div class="story">${esc(bug.story)}<br><i>${esc(roleHint)}</i></div>
    <div class="m-sub" style="margin-top:10px">Bước 1: bấm vào dòng code có lỗi</div>
    <pre class="code">${bug.code.map((l, i) => `<span class="ln" data-i="${i}"><span class="n">${i + 1}</span>${esc(l)}</span>`).join('')}</pre>
    <div id="st"></div>`);
  let wrong = 0;
  await new Promise((res) => {
    const lines = [...card.querySelectorAll('.ln')];
    lines.forEach((ln) => ln.addEventListener('click', function onClick() {
      const i = +ln.dataset.i;
      if (i === bug.bug) {
        lines.forEach((x) => x.replaceWith(x.cloneNode(true)));
        card.querySelectorAll('.ln')[i].classList.add('bug');
        res();
      } else {
        wrong++;
        ln.classList.add('sel');
        card.querySelector('#st').innerHTML = `<div class="feedback no">Dòng ${i + 1} không có vấn đề. Thử lại nhé!${wrong >= 2 ? ' (Gợi ý: xem kỹ dòng ' + (bug.bug + 1) + ')' : ''}</div>`;
      }
    }));
  });
  const order = shuffle(bug.fixes.map((t, i) => ({ t, i })));
  const st = card.querySelector('#st');
  st.innerHTML = `<div class="m-sub" style="margin:6px 0 8px">Bước 2: chọn cách sửa đúng cho dòng ${bug.bug + 1}</div>
    <div class="choices">${order.map((o) => `<button style="font-family:Consolas,monospace">${esc(o.t)}</button>`).join('')}</div>`;
  const fixed = await new Promise((res) => {
    const btns = choose(st, '.choices button', (i, b) => {
      const ok = order[i].i === bug.fix;
      b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) btns[order.findIndex((o) => o.i === bug.fix)].classList.add('right');
      res(ok);
    });
  });
  st.insertAdjacentHTML('beforeend', `<div class="feedback ${fixed ? 'ok' : 'no'}">${fixed ? '✅ Chuẩn!' : '❌ Chưa đúng.'} ${esc(bug.explain)}</div>`);
  const fx = { skill: (wrong === 0 ? 4 : 1) + (fixed ? 4 : 0), progress: fixed ? 12 : 8, energy: -15, client: fixed ? 2 : 0 };
  return finish(card, fx, fixed ? 'Đã tạo Pull Request!' : 'Anh Hùng sẽ hỗ trợ bạn sửa lại khi review.');
}

// ---------- Call với khách hàng ----------
export async function client(c, ctx) {
  let sat = 50, sum = 0;
  const card = openModal(`${head(c.name, c.where + ' · Video call (English)', c.avatar)}
    <div class="meter">Mức hài lòng <div class="bar"><i id="sat" style="width:50%"></i></div></div><div id="cl" style="margin-top:14px"></div>`);
  const box = card.querySelector('#cl');
  for (let s = 0; s < c.steps.length; s++) {
    const step = c.steps[s];
    const order = shuffle(step.options.map((o, i) => ({ ...o, i })));
    box.innerHTML = `<div class="client-line"><b>${esc(c.name)}:</b> “${esc(step.say)}”</div>
      <div class="m-sub" style="margin-bottom:8px">Bạn trả lời:</div>
      <div class="choices">${order.map((o) => `<button>${esc(o.t)}</button>`).join('')}</div><div id="fb"></div>`;
    const o = await new Promise((res) => choose(box, '.choices button', (i, b) => {
      if (order[i].s >= 20) b.classList.add('right'); else if (order[i].s < 0) b.classList.add('wrong'); else b.classList.add('primary');
      res(order[i]);
    }));
    sum += o.s;
    sat = Math.max(0, Math.min(100, sat + o.s * 0.7));
    card.querySelector('#sat').style.width = sat + '%';
    const best = order.reduce((a, b) => (b.s > a.s ? b : a));
    box.querySelector('#fb').innerHTML = `<div class="feedback ${o.s >= 20 ? 'ok' : 'no'}">${o.s >= 20 ? '👍 Chuyên nghiệp: rõ ràng, có thông tin cụ thể.' : '💡 ' + esc(o.tip || 'Câu trả lời tốt hơn: “' + best.t + '”')}</div>
      <div class="m-foot"><span></span><button class="primary" id="nx">${s < c.steps.length - 1 ? 'Tiếp' : 'Kết thúc call'}</button></div>`;
    const nx = box.querySelector('#nx'); nx.focus();
    await waitClick(nx);
  }
  box.innerHTML = '';
  const fx = { client: Math.round(sum / 4), skill: 3, progress: 8, energy: -10 };
  return finish(card, fx, sum >= 60 ? `${c.name}: “Great job, team!”` : `${c.name}: “Thanks, let's follow up by email.”`);
}

// ---------- Quiz onboarding ----------
export async function quiz(q, ctx) {
  const npc = ctx.npcs[q.npc];
  await dialog({ title: npcTitle(npc), sub: 'Onboarding', color: npc.color, text: q.intro, buttons: ['Bắt đầu'] });
  let correct = 0;
  for (let i = 0; i < q.questions.length; i++) {
    const it = q.questions[i];
    const card = openModal(`${npcHead(npc, `Câu ${i + 1}/${q.questions.length}`)}<div class="m-text"><b>${esc(it.q)}</b></div>
      <div class="choices">${it.options.map((o) => `<button>${esc(o)}</button>`).join('')}</div><div id="fb"></div>`);
    const ok = await new Promise((res) => {
      const btns = choose(card, '.choices button', (k, b) => {
        const right = k === it.a;
        b.classList.add(right ? 'right' : 'wrong');
        if (!right) btns[it.a].classList.add('right');
        res(right);
      });
    });
    if (ok) correct++;
    card.querySelector('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}">${ok ? '✅ Đúng!' : '❌ Chưa đúng.'} ${esc(it.explain)}</div>
      <div class="m-foot"><span></span><button class="primary" id="nx">${i < q.questions.length - 1 ? 'Câu tiếp' : 'Xong'}</button></div>`;
    const nx = card.querySelector('#nx'); nx.focus();
    await waitClick(nx);
  }
  const fx = { skill: correct * 2, team: 2, energy: -3 };
  const card = openModal(`${npcHead(npc, 'Onboarding')}<div class="m-text">Bạn trả lời đúng ${correct}/${q.questions.length} câu. Đây là thẻ nhân viên và laptop của em nhé! 💻</div>`);
  return finish(card, fx, 'Hoàn tất thủ tục nhận việc');
}

// ---------- Sự kiện có lựa chọn ----------
export async function event(ev, ctx) {
  const npc = ctx.npcs[ev.npc];
  const card = openModal(`${head(ev.title, npcTitle(npc), npc.color, (npc.name || npc.role)[0])}<div class="m-text">${esc(ev.text)}</div>
    <div class="choices">${ev.options.map((o) => `<button>${esc(o.t)}</button>`).join('')}</div>`);
  const i = await new Promise((res) => choose(card, '.choices button', (k, b) => { b.classList.add('primary'); res(k); }));
  const o = ev.options[i];
  return finish(card, o.fx, 'Kết quả', o.res);
}

// ---------- Nói chuyện ----------
export async function talk(t, ctx) {
  const npc = ctx.npcs[t.npc];
  await dialog({ title: npcTitle(npc), sub: 'Trò chuyện', color: npc.color, text: t.text, extra: t.fx ? chips(t.fx) : '', buttons: ['Cảm ơn anh/chị!'] });
  return t.fx || {};
}
