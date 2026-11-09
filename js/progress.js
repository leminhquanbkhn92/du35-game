// Tình hình công việc (giả lập) của từng người, cố định theo tên để lần nào hỏi cũng giống nhau.
export const MOODS = ['😓', '😐', '🙂', '😄'];
export const STATUS = {
  ontrack: { label: 'Đúng tiến độ', color: '#1aa36b' },
  atrisk: { label: 'Có rủi ro', color: '#e8a317' },
  blocked: { label: 'Đang vướng', color: '#e5484d' },
};
const TASKS = [
  [/manual|automation|qa|test/i, ['chạy regression test cho bản release', 'viết test case cho tính năng mới', 'kiểm thử API thanh toán', 'chạy bộ automation test hằng đêm']],
  [/^ba$/i, ['làm rõ requirement với khách', 'viết user story cho sprint sau', 'vẽ luồng nghiệp vụ mới', 'chuẩn bị tài liệu demo']],
  [/pm|resource|leader|manager/i, ['lên kế hoạch sprint', 'chuẩn bị báo cáo tuần cho khách', 'điều phối nguồn lực dự án', 'review rủi ro dự án']],
  [/c\+\+|baseband|^c$/i, ['tối ưu module xử lý tín hiệu', 'fix bug crash trên firmware', 'viết unit test cho driver', 'port code sang nền tảng mới']],
  [/node|java|golang|\.net|python|ruby|fullstack/i, ['làm API mới cho khách', 'tối ưu truy vấn database', 'tích hợp cổng thanh toán', 'refactor service cũ']],
  [/react|angular|flutter|ux|ui/i, ['làm màn hình đặt hàng mới', 'fix lỗi giao diện trên Safari', 'làm app mobile phiên bản mới', 'tối ưu tốc độ tải trang']],
  [/data|annotation|analyst/i, ['xây pipeline dữ liệu', 'làm dashboard báo cáo doanh thu', 'gán nhãn dữ liệu cho mô hình AI', 'làm sạch dữ liệu khách hàng']],
  [/security/i, ['rà soát lỗ hổng bảo mật', 'cấu hình tường lửa cho khách']],
];
const BLOCKERS = ['đang chờ khách confirm requirement', 'môi trường staging bị lỗi từ sáng', 'chưa có quyền truy cập hệ thống của khách', 'API bên thứ ba chưa có tài liệu', 'đang chờ team khác merge code', 'thiếu dữ liệu test từ khách'];

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function statusOf(person, project) {
  let h = hash(person.name + '|' + (person.stack || ''));
  const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  const list = (TASKS.find(([re]) => re.test(person.stack || '')) || [null, ['hỗ trợ dự án', 'review code của đồng đội']])[1];
  const progress = 25 + Math.floor(r() * 70);
  const x = r();
  const status = x < 0.15 ? 'blocked' : x < 0.35 ? 'atrisk' : 'ontrack';
  return {
    project,
    task: list[Math.floor(r() * list.length)],
    progress,
    status,
    blocker: status === 'ontrack' ? '' : BLOCKERS[Math.floor(r() * BLOCKERS.length)],
    mood: status === 'blocked' ? 1 : status === 'atrisk' ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2),
    asked: false,
  };
}
