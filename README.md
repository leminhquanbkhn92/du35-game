# Một Sprint ở DU35 (prototype)

Game 3D trên trình duyệt mô phỏng 5 ngày làm việc (1 sprint) trong team DU35, dùng cho **onboarding, team building và tuyển dụng**.

## Chạy game

Game dùng ES Modules nên **phải chạy qua web server** (mở trực tiếp file `index.html` sẽ không chạy):

```bash
cd du35-game
python -m http.server 8735
```

Mở trình duyệt: http://localhost:8735

## Bản online (GitHub Pages)

- Link: https://leminhquanbkhn92.github.io/du35-game/
- Bản online được tạo từ thư mục này bằng script, **tên nhân viên được viết tắt** (ví dụ: Nguyễn Văn An → anh NV.An). Thư mục `du35-game` (tên đầy đủ) không bao giờ được đẩy lên GitHub.
- Cập nhật bản online sau khi sửa game:

```bash
cd "D:/AI Project/Game AI"
python -I tools/build_public.py
cd du35-deploy && git add -A && git commit -m "Cập nhật game" && git push
```

## Cách chơi

- **WASD / phím mũi tên**: di chuyển · **Shift**: chạy · **E**: tương tác
- **Chuột phải kéo**: xoay camera · **Lăn chuột**: zoom
- Đi theo mũi tên cam để làm nhiệm vụ. Có thể trò chuyện với đồng nghiệp và pha cà phê ở pantry để hồi năng lượng.

## Nội dung 5 ngày

| Ngày | Hoạt động |
|---|---|
| 1 | Onboarding với HR (quiz quy định), gặp PM, daily stand-up, fix bug đầu tiên, học cách tạo PR |
| 2 | Stand-up, **Sprint Planning (planning poker)**, làm task |
| 3 | Stand-up, **call với khách hàng Úc (tiếng Anh)**, sự cố production |
| 4 | Stand-up, xử lý comment code review, sinh nhật đồng nghiệp |
| 5 | Stand-up, **demo cho khách hàng Mỹ**, Retrospective → màn hình kết quả |

Có 5 chỉ số: Năng lượng, Kỹ năng, Đồng đội, Khách hàng, Tiến độ sprint. Năng lượng dưới 20 thì hiệu quả công việc giảm một nửa.

## Văn phòng

Dựng theo sơ đồ tầng 5 của DU35: phòng dự án, khu Pre-sale/QA và bàn quản lý, tủ giày, Meeting room 1–3, lễ tân, phone booth 1–2, các khu member và bàn Giám đốc/Manager, kệ cây cảnh và ảnh khen ngợi từ khách hàng, 2 team dự án, nhà vệ sinh, khu BA. **Góc cà phê** được thêm cho game (không có trong sơ đồ). NPC tự tìm đường bằng A* nên có thể sửa bố cục trong `js/office.js` mà không cần sửa đường đi.

## Sửa nội dung (không cần biết code)

Toàn bộ câu thoại, câu hỏi, tình huống nằm trong **`data/content.json`**:

- `npcs`: tên, vai trò, màu áo, chỗ ngồi (`spot`), câu nói của các đồng nghiệp. Để `name` trống thì chỉ hiện chức danh
- `areas`: tên hiển thị các khu (phòng dự án, team dự án A/B…)
- `kudos`: lời khen của khách hàng trên kệ ảnh
- `days`: lịch từng ngày (thứ tự nhiệm vụ)
- `quizzes.onboarding`: câu hỏi quy định công ty (**đang là nội dung mẫu, cần sửa theo quy định thật**)
- `standups`, `poker`, `bugs`, `clients`, `events`: dữ liệu cho các mini-game
- `endings`: các danh hiệu cuối game
- `careerUrl`: link tuyển dụng (để `#` thì nút "Ứng tuyển" sẽ ẩn)

⚠️ Không đưa tên khách hàng, dự án hay code thật vào game.

### Danh sách nhân sự (`data/staff.json`) – BẢN NỘI BỘ

- Tạo từ file "Danh sách nhân sự - DU35", chỉ giữ **tên, giới tính, bộ phận, techstack chính** (không có SĐT, email, HR ID, level).
- `seat` là chỗ ngồi trong game (`khu:số`), đang xếp tạm theo bộ phận/techstack: QA → khu QA, BA → khu BA, DU35.1 → khu DU35/Member/Phòng dự án, DU35.2 → Member giữa/Pre-sale, DU35.3 → 2 team dự án, DU35.4 → Member phía dưới. Sửa lại cho đúng chỗ ngồi thật.
- Văn phòng có ~200 chỗ (dãy bàn đôi), **cả 183 người đều ngồi tại chỗ** (181 nhân viên + Giám đốc và Manager là NPC). Tên hiện khi đi lại gần. Toàn bộ danh sách cũng có trong **Bảng thành viên** (kiosk gần lối vào, có ô tìm kiếm).
- Để game mượt, đồ đạc và nhân vật ngồi được gộp thành ít mesh (~120 draw call); các nhân vật ngồi tĩnh, chỉ NPC cốt truyện có hoạt ảnh.
- **Xoá file này trước khi phát hành công khai** (cho tuyển dụng): game sẽ tự dùng nhân vật vô danh.

## Cấu trúc code

```
du35-game/
├── index.html          # khung trang, HUD, màn hình bắt đầu
├── css/style.css       # giao diện
├── data/content.json   # TOÀN BỘ nội dung game
└── js/
    ├── main.js         # vòng lặp game, ngày/nhiệm vụ, người chơi, NPC, camera
    ├── office.js       # dựng văn phòng 3D, va chạm, đường đi NPC
    ├── character.js    # nhân vật low-poly + animation đi/ngồi
    ├── minigames.js    # stand-up, planning poker, fix bug, call khách, quiz, sự kiện
    ├── stage.js        # renderer Three.js, ánh sáng, hàm tiện ích
    └── ui.js           # hộp thoại, HUD, thông báo
```

Công nghệ: Three.js 0.160 (CDN), JavaScript thuần, không cần build. Tiến độ được lưu bằng localStorage.

Debug: mở `http://localhost:8735/?debug` rồi dùng `DU35.tpTarget()` / `DU35.interact()` trong console để nhảy nhanh đến nhiệm vụ.

## Việc tiếp theo gợi ý

1. Thay nội dung mẫu bằng quy định, quy trình và tình huống thật của DU35
2. Sửa sơ đồ văn phòng (`js/office.js`) cho giống văn phòng thật
3. Thay nhân vật khối bằng model từ Blender + Mixamo (file .glb)
4. Thêm nhạc nền, âm thanh
5. Xin phép bộ phận HR/Marketing trước khi dùng logo, tên VMO và phát hành
