# AgentKit Dashboard

Dashboard tiếng Việt tra cứu skill và agent của hai bộ công cụ [AgentKit](https://agentkit.best) (tên cũ: ClaudeKit): **Engineer** (98 skills, 16 agents) và **Marketing** (78 skills, 32 agents).

Có nút đổi giao diện (đen–hồng ⇄ xanh AgentKit) ở góc header, và link "Xem bản ClaudeKit cũ" ở footer để mở lại bản dashboard cũ (`legacy/`).

Site tĩnh thuần — HTML + CSS + vanilla JS, không build step, không framework.

## Cài đặt & khởi chạy

Đây là site tĩnh — **để xem thì chỉ cần trình duyệt**, không phải cài đặt gì. Node.js/`ak` chỉ cần khi muốn cập nhật lại dữ liệu (xem mục [Cập nhật dữ liệu](#cập-nhật-dữ-liệu)).

### 1. Tải mã nguồn về

```bash
git clone https://github.com/jetthuangai/claudekit-dashboard.git
cd claudekit-dashboard
```

(Không có Git cũng được: bấm **Code → Download ZIP** trên trang GitHub rồi giải nén.)

### 2. Chạy trên máy

- **Cách nhanh nhất**: bấm đúp mở `index.html` bằng trình duyệt (chạy được cả trên `file://`).
  Lưu ý: cần **kết nối internet** cho lần đầu, vì thư viện tìm kiếm Fuse.js được nạp từ CDN. Mọi thứ khác (lọc, yêu thích, ghi chú, đổi giao diện) chạy offline bình thường.
- **Cách khuyên dùng** (ổn định hơn, tránh vài hạn chế của `file://`): chạy một web server tĩnh trong thư mục dự án rồi mở `http://localhost:8000`:

  ```bash
  # có sẵn Python:
  python -m http.server 8000
  # hoặc có sẵn Node.js:
  npx serve .
  ```

Bản dashboard cũ (ClaudeKit) nằm ở `legacy/index.html` — mở tương tự, hoặc bấm link "Xem bản ClaudeKit cũ" ở footer.

### 3. Đưa lên mạng (GitHub Pages)

Vào **Settings → Pages → Deploy from a branch**, chọn nhánh `main`, thư mục `/` (root). Sau ~1–2 phút site chạy tại `https://<tài-khoản>.github.io/<tên-repo>/`.

## Tính năng

- 🔍 Tìm kiếm mờ tiếng Việt (Fuse.js) — gõ có dấu hoặc không dấu đều được, phím tắt `Ctrl K`
- 🗂 Lọc theo nhóm chức năng, loại (Skill / Agent / Lệnh), yêu thích
- 📋 Copy lệnh một chạm, đếm số lần dùng
- ⭐ Yêu thích + 📝 ghi chú cá nhân — lưu bằng `localStorage`, chỉ trên máy bạn
- 💡 "Gợi ý theo tình huống": các chuỗi lệnh mẫu cho việc thường gặp
- ♿ Điều khiển được hoàn toàn bằng bàn phím, tương phản đạt WCAG AA

## Cập nhật dữ liệu

Dữ liệu nằm trong `data/data.js` + `data/details.js`, sinh tự động từ bản build kit của AgentKit CLI (`ak`):

```bash
# 1. Build nội dung kit ra ngoài repo (cần đăng nhập ak: ak login)
#    Lưu ý: --out phải là ĐƯỜNG DẪN TUYỆT ĐỐI (xem phần dưới)
ak kit init engineer  --remote --build-only --force --out /duong/dan/tuyet-doi/ak-kit-build --target claude-code --yes --no-interactive
ak kit init marketing --remote --build-only --force --out /duong/dan/tuyet-doi/ak-kit-build --target claude-code --yes --no-interactive

# 2. Quét bản build → sinh dữ liệu
node scripts/build-data.mjs
```

Yêu cầu:
- Node.js ≥ 18 (không cần npm install — script không có dependency)
- AgentKit CLI `ak` đã đăng nhập (`ak login`), có quyền hai kit engineer + marketing
- Nguồn kit mặc định ở `../ak-kit-build` (đổi bằng biến môi trường `AK_KIT_SRC`)

Ba cờ cần lưu ý với `ak` 2.8.0-beta.1:
- `--remote` **vẫn phải ghi rõ**, dù CLI báo "đây là mặc định, sắp bỏ". Thiếu nó thì `ak` báo nhầm là chưa mua kit.
- `--out` phải là đường dẫn tuyệt đối. Đường dẫn tương đối (`../ak-kit-build`) làm `ak` nhân đôi thư mục (`ak-kit-build/ak-kit-build/…`) rồi build lỗi.
- `--force` để ghi đè bản build cũ, nếu không `ak` dừng vì thư mục đã tồn tại.

Mô tả tiếng Việt biên tập thủ công trong `scripts/vi-content.json` (mô tả ngắn) + `scripts/vi-details.json` (chi tiết). Item mới chưa dịch sẽ được liệt kê ở `scripts/missing-vi.txt`. Lần đầu quét một kit vừa đổi có thể cần `BUILD_BOOTSTRAP=1 node scripts/build-data.mjs` để bỏ tạm các cổng kiểm tra bản dịch, dịch xong rồi chạy lại bình thường.

Id thẻ (`{kit}-{type}-{slug}`) cắt tiền tố `ak-` nên giữ nguyên qua đợt đổi tên ck→ak — yêu thích/ghi chú của bạn không mất với các thẻ giữ tên gốc.

## Cấu trúc

```
index.html            # app một trang
assets/css/main.css   # design tokens + components (theme đen–hồng)
assets/js/*.js        # plain scripts, namespace window.CKApp
data/data.js          # SINH TỰ ĐỘNG — đừng sửa tay
data/scenarios.js     # kịch bản "Gợi ý theo tình huống"
scripts/build-data.mjs      # script trích xuất dữ liệu
scripts/vi-content.json     # bản dịch tiếng Việt biên tập tay
```

## Ghi chú bản quyền

Dashboard này là công cụ tra cứu cá nhân. Tên và mô tả ngắn của skill/agent thuộc về [AgentKit](https://agentkit.best) — nội dung đầy đủ của các bộ kit **không** có trong repo này.
