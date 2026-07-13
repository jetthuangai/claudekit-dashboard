# AgentKit Dashboard

Dashboard tiếng Việt tra cứu skill và agent của hai bộ công cụ [AgentKit](https://agentkit.best) (tên cũ: ClaudeKit): **Engineer** (91 skills, 16 agents) và **Marketing** (73 skills, 32 agents).

Có nút đổi giao diện (đen–hồng ⇄ xanh AgentKit) ở góc header, và link "Xem bản ClaudeKit cũ" ở footer để mở lại bản dashboard cũ (`legacy/`).

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

Dữ liệu nằm trong `data/data.js` + `data/details.js`, sinh tự động từ bản build kit của AgentKit CLI (`ak`):

```bash
# 1. Build nội dung kit ra ngoài repo (cần đăng nhập ak: ak login)
ak kit init engineer  --build-only --out ../ak-kit-build --target claude-code --yes --no-interactive
ak kit init marketing --build-only --out ../ak-kit-build --target claude-code --yes --no-interactive

# 2. Quét bản build → sinh dữ liệu
node scripts/build-data.mjs
```

Yêu cầu:
- Node.js ≥ 18 (không cần npm install — script không có dependency)
- AgentKit CLI `ak` đã đăng nhập (`ak login`), có quyền hai kit engineer + marketing
- Nguồn kit mặc định ở `../ak-kit-build` (đổi bằng biến môi trường `AK_KIT_SRC`)

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
