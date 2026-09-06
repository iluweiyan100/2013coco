// utils/orderDisplay.js
// 订单卡片商品显示格式化

// 冰淇淋拼球：spec 形如「双球：香草×1+巧克力×1」（球数前缀 + 口味；口味间以「+」分隔，加料以「 +」分隔）。
// 卡片名显示为「冰淇淋」+ 球数（冰淇淋单球/双球/三球），口味拆成 { name, qty }、加料拆成字符串数组，供分行显示。
const SCOOP_RE = /^(单球|双球|三球)[：:]([\s\S]*)$/;

// 拆「名称×数量」为 { name, qty }；无数量（如加料）时 qty 记 1
function parseQty(s) {
  const str = String(s);
  const m = str.match(/^(.+?)×(\d+)$/);
  return m ? { name: m[1], qty: Number(m[2]) } : { name: str, qty: 1 };
}

function formatScoopProduct(p) {
  if (!p || !p.spec) return p;
  const raw = String(p.spec);
  const m = raw.match(SCOOP_RE);
  // 拼球判定：带「球：」前缀，或已脱前缀但含「口味×球数」
  const isScoop = !!m || /×\d+/.test(raw);
  if (!isScoop) return p;
  const rest = m ? m[2] : raw;
  const seg = rest.split(' +');                                   // 口味在前，加料以「 +」开头
  const flavors = seg[0].split('+').filter(s => s).map(parseQty);
  const toppings = seg.slice(1).join('+').split('+').filter(s => s);
  return Object.assign({}, p, {
    name: m ? `冰淇淋${m[1]}` : p.name,
    flavors,
    toppings
    // spec 保留原样，供支付/存储使用
  });
}

// 计算订单已退金额（元）：优先按商品 refunded 标记累加（新分批退款路径）；
// 旧整单退款（无 per-item 标记）用 doc 级 refundAmount / totalAmount 兜底。
function refundedAmountOf(order) {
  if (!order) return 0;
  const products = order.products || [];
  const flagged = products.reduce((s, p) => s + (p.refunded ? (Number(p.price) || 0) : 0), 0);
  if (flagged > 0) return flagged;
  if (order.status === 'refunded') {
    return Number(order.refundAmount) || Number(order.totalAmount) || 0;
  }
  return 0;
}

// 订单实收净额（元）= 总额 − 已退金额
function netAmountOf(order) {
  const total = Number(order && order.totalAmount) || 0;
  return Math.round((total - refundedAmountOf(order)) * 100) / 100;
}

module.exports = { formatScoopProduct, refundedAmountOf, netAmountOf };
