export const $ = (s) => document.querySelector(s);

export const STATS = {
  energy:   { label: '⚡ Năng lượng', color: '#ffb020' },
  skill:    { label: '🧠 Kỹ năng', color: '#7a4dff' },
  team:     { label: '🤝 Đồng đội', color: '#1aa36b' },
  client:   { label: '😊 Khách hàng', color: '#1f5eff' },
  progress: { label: '📈 Tiến độ sprint', color: '#ff7a1a' },
};

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderStats(st) {
  $('#hud-stats').innerHTML = Object.entries(STATS).map(([k, s]) => `
    <div class="stat"><div class="row"><span>${s.label}</span><span>${Math.round(st[k])}</span></div>
    <div class="bar"><i style="width:${Math.max(0, Math.min(100, st[k]))}%;background:${s.color}"></i></div></div>`).join('');
}

export function chips(fx) {
  return `<div class="chips">${Object.entries(fx || {}).filter(([, v]) => v).map(([k, v]) =>
    `<span class="chip ${v > 0 ? 'up' : 'down'}">${STATS[k]?.label || k} ${v > 0 ? '+' : ''}${v}</span>`).join('')}</div>`;
}

export function toast(html, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

let modalOpen = false;
export const isModalOpen = () => modalOpen;

export function openModal(html) {
  modalOpen = true;
  $('#modal-card').innerHTML = html;
  $('#modal').hidden = false;
  return $('#modal-card');
}
export function closeModal() {
  modalOpen = false;
  $('#modal').hidden = true;
  $('#modal-card').innerHTML = '';
}

export function head(name, sub, color, initial) {
  return `<div class="m-head"><div class="m-avatar" style="background:${color}">${esc(initial ?? name[0])}</div>
    <div><div class="m-title">${esc(name)}</div><div class="m-sub">${esc(sub)}</div></div></div>`;
}

// Hộp thoại đơn giản với các nút; trả về index nút được bấm
export function dialog({ title, sub = '', color = '#1f5eff', initial, text, buttons = ['Tiếp tục'], extra = '' }) {
  return new Promise((resolve) => {
    const card = openModal(`${head(title, sub, color, initial)}<div class="m-text">${esc(text)}</div>${extra}
      <div class="m-foot"><span></span><div class="btns" style="display:flex;gap:8px">${buttons.map((b, i) =>
        `<button data-i="${i}" class="${i === buttons.length - 1 ? 'primary' : ''}">${esc(b)}</button>`).join('')}</div></div>`);
    card.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { closeModal(); resolve(+b.dataset.i); }));
    card.querySelector('button.primary')?.focus();
  });
}

// Chọn một đáp án từ danh sách; trả về index
export function choose(card, selector, onPick) {
  const btns = [...card.querySelectorAll(selector)];
  btns.forEach((b, i) => b.addEventListener('click', () => {
    if (b.disabled) return;
    btns.forEach((x) => (x.disabled = true));
    onPick(i, b, btns);
  }));
  return btns;
}

export function waitClick(el) {
  return new Promise((r) => el.addEventListener('click', r, { once: true }));
}
