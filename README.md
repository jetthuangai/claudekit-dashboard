# ClaudeKit Dashboard

Dashboard tiếng Việt tra cứu skill, agent và lệnh của hai bộ công cụ [ClaudeKit](https://agentkit.best): **Engineer** (84 skills, 13 agents) và **Marketing** (100 skills, 31 agents, 78 lệnh).

Site tĩnh thuần — HTML + CSS + vanilla JS, không build step, không framework.

## Dùng thử

- **Online**: bật GitHub Pages của repo này (Settings → Pages → Deploy from branch `main`, thư mục `/`).
- **Local**: mở thẳng `index.html` bằng trình duyệt — mọi tính năng hoạt động cả trên `file://`.

## Tính năng

- 🔍 Tìm kiếm mờ tiếng Việt (Fuse.js) — gõ có dấu hoặc không dấu đều được, phím tắt `Ctrl K`
- 🗂 Lọc theo nhóm chức năng, loại (Skill / Agent / Lệnh), yêu thích
- 📋 Copy lệnh một chạm, đếm số lần dùng
- ⭐ Yêu thích + 📝 ghi chú cá nhân — lưu bằng `localStorage`, chỉ trên máy bạn
- 💡 "Gợi ý theo tình huống": các chuỗi lệnh mẫu cho việc thường gặp
- ♿ Điều khiển được hoàn toàn bằng bàn phím, tương phản đạt WCAG AA

## Cập nhật dữ liệu

Dữ liệu nằm trong `data/data.js`, sinh tự động bởi:

```bash
node scripts/build-data.mjs
```

Yêu cầu:
- Node.js ≥ 18 (không cần npm install — script không có dependency)
- ClaudeKit Engineer cài tại `.claude/` của thư mục này (quét local)
- `gh` CLI đã đăng nhập tài khoản có quyền đọc repo `claudekit/claudekit-marketing` (fetch từ xa, có cache tại `scripts/.cache/`)

Mô tả tiếng Việt được biên tập thủ công trong `scripts/vi-content.json` — item mới chưa có bản dịch sẽ được liệt kê cảnh báo khi chạy script.

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

Dashboard này là công cụ tra cứu cá nhân. Tên và mô tả ngắn của skill/agent thuộc về [ClaudeKit](https://agentkit.best) — nội dung đầy đủ của các bộ kit **không** có trong repo này.
