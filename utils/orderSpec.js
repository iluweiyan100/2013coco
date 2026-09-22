// utils/orderSpec.js
// 点单规格（拼球/加料）的纯计算：供 pages/order/order.js 与 components/staff-order-sidebar 共用，
// 避免两端各维护一份相同的计价与 spec 拼装逻辑（改一处即可，防止两端行为分叉）。

// 按球数返回单件价
function scoopUnitPrice(spec, selectedSpec, specScoopPrices, scoopConfig) {
  const s = spec || selectedSpec;
  const cfg = specScoopPrices || scoopConfig || {};
  if (s === '双球') return cfg.double !== undefined ? cfg.double : 38;
  if (s === '三球') return cfg.triple !== undefined ? cfg.triple : 45;
  return cfg.single !== undefined ? cfg.single : 28;
}

// 已选加料价格合计（元）= Σ(单价 × 份数)
function selectedToppingsTotal(specToppings) {
  const total = (specToppings || []).reduce((s, t) => s + (Number(t.price) || 0) * (t.qty || 0), 0);
  return Math.round(total * 100) / 100;
}

// 当前基础单价：拼球按球数价，其余按商品价
function baseUnitPrice(data) {
  const { specModalType, specModalProduct, selectedSpec, specScoopPrices, scoopConfig } = data || {};
  if (!specModalProduct) return 0;
  if (specModalType === 'scoop') return scoopUnitPrice(selectedSpec, selectedSpec, specScoopPrices, scoopConfig);
  return Number(specModalProduct.price) || 0;
}

// 弹窗实时合计 = 基础价 + 已选加料
function specTotalPrice(data) {
  return Math.round((baseUnitPrice(data) + selectedToppingsTotal(data && data.specToppings)) * 100) / 100;
}

// 拼球：单口味多球显示加料，多口味拼球隐藏加料并清空已选。
// 返回可直接传给 setData 的对象 { scoopMixed, specToppings? }（仅混拼时带已清空的 specToppings）。
function resolveScoopToppingVisibility(data) {
  const { specModalType, specModalProduct, specFlavors, specToppings } = data || {};
  if (specModalType !== 'scoop') {
    return { scoopMixed: false };
  }
  const anchorId = specModalProduct && specModalProduct.id;
  const mixed = (specFlavors || []).some(f => f.id !== anchorId && (f.qty || 0) > 0);
  if (mixed) {
    return { scoopMixed: true, specToppings: (specToppings || []).map(t => ({ ...t, qty: 0 })) };
  }
  return { scoopMixed: false };
}

// 把已选加料拼到规格文字末尾，如「 +奥利奥碎×2+坚果」（份数 1 时省略 ×1）
function appendToppings(specToppings, base) {
  const parts = (specToppings || [])
    .filter(t => (t.qty || 0) > 0)
    .map(t => (t.qty || 0) > 1 ? `${t.name}×${t.qty}` : t.name);
  if (!parts.length) return base || '';
  return (base ? base + ' +' : '') + parts.join('+');
}

// 拼出拼球规格字符串，如「双球：香草×1+巧克力×1」「三球：香草×2+巧克力×1」，追加已选加料
function buildScoopSpec(selectedSpec, specFlavors, specToppings) {
  const ball = selectedSpec || '单球';
  const parts = (specFlavors || [])
    .filter(f => f.qty > 0)
    .map(f => `${f.name}×${f.qty}`);
  return appendToppings(specToppings, `${ball}：${parts.join('+')}`);
}

module.exports = {
  scoopUnitPrice,
  selectedToppingsTotal,
  baseUnitPrice,
  specTotalPrice,
  resolveScoopToppingVisibility,
  appendToppings,
  buildScoopSpec
};
