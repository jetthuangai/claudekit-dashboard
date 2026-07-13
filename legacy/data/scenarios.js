// Curated situational guides — "Gợi ý theo tình huống".
// Every `ref` MUST be a real item id in data/data.js (validated by scripts/build-data.mjs).
window.CK_SCENARIOS = [
  {
    id: 'lam-website-moi',
    kit: 'engineer',
    icon: '🌐',
    question: 'Tôi muốn làm website mới',
    steps: [{ ref: 'eng-skill-bootstrap' }, { ref: 'eng-skill-cook' }, { ref: 'eng-skill-deploy' }],
    tip: 'Bootstrap sẽ hỏi bạn từng bước — cứ trả lời tự nhiên, không cần biết code.'
  },
  {
    id: 'gap-bug',
    kit: 'engineer',
    icon: '🐞',
    question: 'Tôi gặp bug / web bị lỗi',
    steps: [{ ref: 'eng-skill-fix' }, { ref: 'eng-skill-ck-debug', note: 'nếu chưa hết lỗi' }],
    tip: 'Mô tả lỗi càng cụ thể (làm gì thì lỗi, thông báo gì) thì sửa càng nhanh.'
  },
  {
    id: 'dua-web-len-mang',
    kit: 'engineer',
    icon: '🚀',
    question: 'Tôi muốn đưa web lên mạng',
    steps: [{ ref: 'eng-skill-git' }, { ref: 'eng-skill-test' }, { ref: 'eng-skill-deploy' }],
    tip: 'Deploy tự nhận diện nền tảng phù hợp (Vercel, GitHub Pages...) cho bạn.'
  },
  {
    id: 'lam-logo-xu-ly-anh',
    kit: 'engineer',
    icon: '🎨',
    question: 'Tôi muốn làm logo / xử lý ảnh',
    steps: [{ ref: 'eng-skill-design' }, { ref: 'eng-skill-media-processing' }],
    tip: 'Cần ảnh AI đẹp nhanh? Thử thêm /ck:ai-artist với 129 prompt có sẵn.'
  },
  {
    id: 'ke-hoach-tinh-nang-lon',
    kit: 'engineer',
    icon: '📐',
    question: 'Tôi muốn làm tính năng lớn, bài bản',
    steps: [{ ref: 'eng-skill-ck-plan' }, { ref: 'eng-skill-cook' }, { ref: 'eng-skill-ck-code-review' }],
    tip: 'Kế hoạch trước, code sau — tiết kiệm thời gian sửa đi sửa lại.'
  },
  {
    id: 'viet-content',
    kit: 'marketing',
    icon: '✍️',
    question: 'Tôi muốn viết content marketing',
    steps: [{ ref: 'mkt-cmd-write-blog' }, { ref: 'mkt-cmd-write-audit' }, { ref: 'mkt-cmd-write-publish' }],
    tip: 'Chuỗi viết → chấm điểm → xuất bản giúp content luôn đạt chuẩn trước khi đăng.'
  },
  {
    id: 'len-top-google',
    kit: 'marketing',
    icon: '🔎',
    question: 'Tôi muốn website lên top Google',
    steps: [{ ref: 'mkt-cmd-seo-audit' }, { ref: 'mkt-cmd-seo-keywords' }, { ref: 'mkt-cmd-write-blog' }],
    tip: 'Audit trước để biết site yếu chỗ nào, rồi mới chọn từ khoá và viết bài.'
  },
  {
    id: 'chien-dich-email',
    kit: 'marketing',
    icon: '📬',
    question: 'Tôi muốn làm chiến dịch email',
    steps: [{ ref: 'mkt-cmd-persona' }, { ref: 'mkt-cmd-email-sequence' }, { ref: 'mkt-cmd-campaign-email' }],
    tip: 'Hiểu khách (persona) trước khi viết chuỗi email — tỉ lệ mở sẽ khác hẳn.'
  }
];
