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
    steps: [{ ref: 'eng-skill-fix' }, { ref: 'eng-skill-debug', note: 'nếu chưa hết lỗi' }],
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
    tip: 'Cần ảnh AI đẹp nhanh? Thử thêm /ak:ai-artist với 129 prompt có sẵn.'
  },
  {
    id: 'ke-hoach-tinh-nang-lon',
    kit: 'engineer',
    icon: '📐',
    question: 'Tôi muốn làm tính năng lớn, bài bản',
    steps: [{ ref: 'eng-skill-plan' }, { ref: 'eng-skill-cook' }, { ref: 'eng-skill-code-review' }],
    tip: 'Kế hoạch trước, code sau — tiết kiệm thời gian sửa đi sửa lại.'
  },
  {
    id: 'viet-content',
    kit: 'marketing',
    icon: '✍️',
    question: 'Tôi muốn viết content marketing',
    steps: [{ ref: 'mkt-skill-content-marketing' }, { ref: 'mkt-skill-write' }, { ref: 'mkt-skill-social' }],
    tip: 'Lên chiến lược nội dung → viết bài → đăng lên mạng xã hội, đi trọn một mạch.'
  },
  {
    id: 'len-top-google',
    kit: 'marketing',
    icon: '🔎',
    question: 'Tôi muốn website lên top Google',
    steps: [{ ref: 'mkt-skill-seo' }, { ref: 'mkt-skill-competitor' }, { ref: 'mkt-skill-write' }],
    tip: 'Soi SEO để biết site yếu chỗ nào, xem đối thủ, rồi viết bài đúng hướng.'
  },
  {
    id: 'chien-dich-email',
    kit: 'marketing',
    icon: '📬',
    question: 'Tôi muốn làm chiến dịch email',
    steps: [{ ref: 'mkt-skill-persona' }, { ref: 'mkt-skill-email' }, { ref: 'mkt-skill-campaign' }],
    tip: 'Hiểu khách (persona) trước khi viết email và chạy chiến dịch — tỉ lệ mở sẽ khác hẳn.'
  }
];
