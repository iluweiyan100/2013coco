// utils/pay.js
// 共享支付逻辑：创建订单 + 调起微信支付
// 供 cart.js（购物车支付）和 order.js（弹窗立即支付）共用

const SUBSCRIBE = require('../config/subscribe.js');

// 生成自定义订单 _id（创建时即写入 orderId/outTradeNo，避免 post-add update 被安全规则禁止）
function genOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * 获取每日递进取餐码：T01/T02... (堂食) 或 K01/K02... (外带)
 * @param {string} orderType - 'dine-in' | 'takeaway'
 * @returns {string}
 */
async function getNextPickupNumber(orderType) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'initDB',
      data: { action: 'getNextPickupNumber', orderType }
    });
    if (res.result && res.result.success && res.result.pickupNumber) {
      return res.result.pickupNumber;
    }
    throw new Error('云函数返回异常');
  } catch (e) {
    console.warn('[PickupNumber] 云函数计数失败，使用随机码兜底:', e.message);
    const prefix = orderType === 'dine-in' ? 'T' : 'K';
    const letters = 'ABCDEFGH';
    return prefix + letters[Math.floor(Math.random() * letters.length)] +
      String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
  }
}

/**
 * 构建单笔订单对象（内存对象，不写库）
 * @param {Array} items - [{ name, price, qty, spec }]
 * @param {string} orderType - 'dine-in' | 'takeaway'
 * @param {string} remark
 * @returns {object}
 */
function buildOrder(items, orderType, remark) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const totalAmount = items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.qty || 1), 0);

  return {
    id: Date.now() + Math.random(),
    date: `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    orderType,  // 'dine-in' / 'takeaway'
    status: 'making',
    statusText: '制作中',
    remark,
    products: items.map(item => ({
      productId: item.id || '',
      name: item.name,
      temperature: item.temperature || item.spec || '',  // 冰淇淋固定「冰」，其它用 spec 兜底
      spec: item.spec || '',  // 拼球详情（双球：口味A+口味B）或温度
      quantity: item.qty || 1,
      price: (parseFloat(item.price) || 0) * (item.qty || 1)
    })),
    totalAmount: parseFloat(totalAmount.toFixed(2))
  };
}

/**
 * 获取当前用户 openid
 * @returns {string|null}
 */
function getOpenid() {
  let openid = wx.getStorageSync('openid');
  if (!openid) {
    const app = getApp();
    if (app.globalData.openid) {
      openid = app.globalData.openid;
      wx.setStorageSync('openid', openid);
    }
  }
  return openid || null;
}

/**
 * 创建待支付订单记录（写入 orders 集合）
 * @param {Array} orders - buildOrder 返回的订单对象数组
 * @returns {Array<string>} orderIds
 */
async function createPendingOrders(orders) {
  const openid = getOpenid();
  if (!openid) {
    throw new Error('用户未登录，请重新打开小程序');
  }
  console.log('[CreatePendingOrders] openid:', openid);

  const db = wx.cloud.database();

  // 获取桌位上下文
  const ctx = getApp().globalData.tableContext
    || wx.getStorageSync('tableContext') || null;
  console.log('[Pay] 桌位上下文:', JSON.stringify(ctx));

  // 预生成所有订单 _id，创建时即写入 orderId/outTradeNo（安全规则已禁止 post-add update）
  const orderIds = orders.map(() => genOrderId());
  const outTradeNo = orderIds.length === 1
    ? orderIds[0]
    : orderIds[0].slice(0, 26) + '_' + orderIds.length;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const orderId = orderIds[i];

    await db.collection('orders').add({
      data: {
        _id: orderId,
        orderId: orderId,
        outTradeNo: outTradeNo,
        openid: openid,
        pickupNumber: '',  // 取餐号改为支付成功后由 webhook 回填，下单时不占用
        orderType: order.orderType,
        status: 'pending',
        remark: order.remark || '',
        products: order.products,
        totalAmount: order.totalAmount,
        createTime: db.serverDate(),
        // 关联桌位（所有订单类型）
        tableId: ctx ? (ctx.tableId || '') : '',
        tableName: ctx ? (ctx.tableName || '') : ''
      }
    });
  }

  return { orderIds, outTradeNo };
}

/**
 * 服务端查单：确认微信支付真实状态
 * @param {string} outTradeNo
 * @returns {'SUCCESS'|'NOT_PAID'|'UNKNOWN'}
 */
async function queryPaymentState(outTradeNo) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'createPayment',
      data: { action: 'query', outTradeNo }
    });
    const r = res.result || {};
    return r.tradeState === 'SUCCESS' ? 'SUCCESS' : 'NOT_PAID';
  } catch (e) {
    console.warn('[Pay] 查单失败（未知状态）:', e.message);
    return 'UNKNOWN';
  }
}

/**
 * 删除待支付订单
 * @param {Array<string>} [orderIds] - 指定要删除的订单 ID 列表；不传则删除当前用户所有 pending 订单
 */
async function deletePendingOrders(orderIds) {
  const openid = getOpenid();
  if (!openid) return;
  const db = wx.cloud.database();

  try {
    if (orderIds && orderIds.length > 0) {
      // 精确删除指定订单
      await Promise.all(orderIds.map(id =>
        db.collection('orders').doc(id).remove()
      ));
    } else {
      // 兜底：删除当前用户所有 pending 订单
      await db.collection('orders')
        .where({ openid: openid, status: 'pending' })
        .remove();
    }
  } catch (e) {
    console.warn('[Pay] 删除pending订单失败', e);
  }
}

// 拼球规格一致性校验：球数（单/双/三球）必须等于各口味份数之和。
// spec 形如「三球：柠檬雪葩×2+香草×1 +奥利奥碎」（「 +」后为加料，不计入球数）。
// 一致或非拼球返回 null，否则返回 { name, ballCount, flavorTotal }。
function findScoopMismatch(orderGroups) {
  const BALL = { '单球': 1, '双球': 2, '三球': 3 };
  for (const g of (orderGroups || [])) {
    for (const item of (g.items || [])) {
      const spec = item && item.spec;
      if (!spec || typeof spec !== 'string') continue;
      let ballCount = 0;
      for (const k in BALL) {
        if (spec.indexOf(k) === 0) { ballCount = BALL[k]; break; }
      }
      if (!ballCount) continue; // 非拼球条目，跳过
      const colon = spec.indexOf('：');
      let flavorPart = colon >= 0 ? spec.slice(colon + 1) : spec;
      const topIdx = flavorPart.indexOf(' +');
      if (topIdx >= 0) flavorPart = flavorPart.slice(0, topIdx); // 去掉加料段
      let total = 0;
      for (const seg of flavorPart.split('+').filter(Boolean)) {
        const m = seg.match(/×(\d+)/);
        if (m) total += parseInt(m[1], 10);
      }
      if (total !== ballCount) {
        return { name: item.name || '', ballCount, flavorTotal: total };
      }
    }
  }
  return null;
}

let payInFlight = false;

/**
 * 执行核心支付流程（异步，由 pay() 在订阅授权回调中调用）
 * @param {Array} orderGroups - [{ items, orderType, remark }]
 * @param {Function} onSuccess - 支付成功回调
 * @param {Function} onFail - 支付失败回调 (非取消)
 */
async function executePay(orderGroups, onSuccess, onFail) {
  // 拼球一致性校验：口味球数 ≠ 所选球数时不调起支付（覆盖立即购买 + 购物车结算）
  const mismatch = findScoopMismatch(orderGroups);
  if (mismatch) {
    wx.showToast({ title: `「${mismatch.name}」口味球数与所选球数不一致，请重新选择`, icon: 'none', duration: 2500 });
    return;
  }

  // 防重复点击：同一时刻只允许一个支付流程进行
  if (payInFlight) {
    console.warn('[Pay] 支付流程进行中，拦截重复调用');
    return;
  }
  payInFlight = true;

  wx.showLoading({ title: '正在下单...', mask: true });

  const openid = getOpenid();
  if (!openid) {
    wx.hideLoading();
    wx.showToast({ title: '用户未登录，请重新打开小程序', icon: 'none' });
    payInFlight = false;
    return;
  }
  console.log('[Pay] openid:', openid);

  let orderIds = [];
  let outTradeNo = '';

  try {
    // 1. 构建订单对象
    const orders = orderGroups
      .filter(g => g.items && g.items.length > 0)
      .map(g => buildOrder(g.items, g.orderType, g.remark || ''));

    if (orders.length === 0) {
      wx.hideLoading();
      payInFlight = false;
      return;
    }

    // 2. 创建待支付订单记录（创建时即写入 orderId/outTradeNo）
    const created = await createPendingOrders(orders);
    orderIds = created.orderIds;
    outTradeNo = created.outTradeNo;

    // 3. 计算总金额
    const totalAmount = orders.reduce((s, o) => s + o.totalAmount, 0);

    // 4. 调云函数统一下单
    const paymentRes = await wx.cloud.callFunction({
      name: 'createPayment',
      data: {
        totalAmount: totalAmount,
        orderId: outTradeNo,
        orderIds: orderIds,
        openid: openid
      }
    });

    wx.hideLoading();

    if (!paymentRes.result || !paymentRes.result.paymentParams) {
      throw new Error('获取支付参数失败');
    }

    // 5. 调起微信支付
    const params = paymentRes.result.paymentParams;
    await wx.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign
    });

    // 6. 支付成功：订单状态由 webhook 回调权威写入 making（客户端不再直写，防伪造免费单）
    // 7. 累加商品销量（best-effort，幂等由服务端 salesCounted 保证）
    try {
      await wx.cloud.callFunction({ name: 'initDB', data: { action: 'recordSales', orderIds } });
    } catch (salesErr) {
      console.warn('[Sales] 销量累加失败（可忽略）', salesErr);
    }

    payInFlight = false;
    if (onSuccess) {
      try {
        onSuccess(orderIds);
      } catch (e) {
        console.warn('[Pay] onSuccess 回调异常（订单已支付，不影响数据）:', e);
      }
    }

  } catch (e) {
    wx.hideLoading();
    console.error('[Pay] 支付流程失败:', e);
    const isCancel = e.errMsg && e.errMsg.indexOf('cancel') !== -1;

    if (isCancel) {
      // 用户主动取消：无支付发生，安全删除待支付订单
      await deletePendingOrders(orderIds);
    } else {
      // 非取消：可能「已扣款但本地报错」，先查微信确认，绝不直接删单（防丢已付款订单）
      const state = orderIds.length > 0 ? await queryPaymentState(outTradeNo) : 'NOT_PAID';
      if (state === 'SUCCESS') {
        // 已扣款：按成功处理（webhook 会兜底写订单状态）
        try {
          await wx.cloud.callFunction({ name: 'initDB', data: { action: 'recordSales', orderIds } });
        } catch (salesErr) {
          console.warn('[Sales] 销量累加失败（可忽略）', salesErr);
        }
        if (onSuccess) {
          try { onSuccess(orderIds); } catch (e2) {
            console.warn('[Pay] onSuccess 回调异常（订单已支付，不影响数据）:', e2);
          }
        }
      } else if (state === 'NOT_PAID') {
        // 明确未付：安全删除待支付订单
        await deletePendingOrders(orderIds);
        if (onFail) {
          onFail(e);
        } else {
          wx.showToast({ title: e.message || '支付失败，请重试', icon: 'none', duration: 2000 });
        }
      } else {
        // 查单失败（UNKNOWN）：不删单，等 webhook 收尾
        if (onFail) {
          onFail(e);
        } else {
          wx.showToast({ title: '支付结果确认中，请稍后刷新', icon: 'none', duration: 2500 });
        }
      }
    }
    payInFlight = false;
  }
}

/**
 * 一键下单支付（对外主入口）
 * 先请求订阅消息授权（必须在同步调用栈中），再执行支付
 *
 * @param {object} options
 * @param {Array} options.orderGroups - [{ items, orderType, remark }]
 *   items: [{ name, price, qty, spec }]
 *   orderType: 'dine-in' | 'takeaway'
 *   remark: string
 * @param {Function} [options.onSuccess] - 支付成功回调 (orderIds)
 * @param {Function} [options.onFail] - 支付失败回调 (error)
 */
function pay({ orderGroups, onSuccess, onFail } = {}) {
  if (!orderGroups || orderGroups.length === 0) return;

  // 请求订阅消息授权（必须在同步调用栈中触发，不可放在 await 之后）
  wx.requestSubscribeMessage({
    tmplIds: [SUBSCRIBE.PAYMENT_SUCCESS, SUBSCRIBE.PICKUP_NOTIFY],
    success: (res) => {
      const payAccepted = res[SUBSCRIBE.PAYMENT_SUCCESS] === 'accept';
      const pickupAccepted = res[SUBSCRIBE.PICKUP_NOTIFY] === 'accept';
      console.log('[Subscribe] 付款成功通知:', payAccepted ? '已授权' : '已拒绝',
                   '取餐通知:', pickupAccepted ? '已授权' : '已拒绝');
    },
    fail: (err) => {
      console.warn('[Subscribe] 订阅消息授权失败:', err);
    },
    complete: () => {
      // 无论授权结果如何，继续支付流程
      executePay(orderGroups, onSuccess, onFail);
    },
  });
}

/**
 * 店员手动点单（线下扫码收款）：只记账、不调微信支付。
 * 构建订单对象后直接调用 initDB.createManualOrder 落库为 making（已收款）。
 * @param {Array} orderGroups - [{ items, orderType, remark }]，items 结构同 pay()
 * @param {Function} [onSuccess] - 成功回调 (orderIds)
 * @param {Function} [onFail] - 失败回调 (error)
 */
async function recordManualOrder(orderGroups, onSuccess, onFail) {
  const openid = getOpenid();
  if (!openid) {
    const e = new Error('用户未登录，请重新打开小程序');
    if (onFail) onFail(e); else wx.showToast({ title: e.message, icon: 'none' });
    return;
  }

  wx.showLoading({ title: '正在下单...', mask: true });
  try {
    const orders = (orderGroups || [])
      .filter(g => g.items && g.items.length > 0)
      .map(g => buildOrder(g.items, g.orderType, g.remark || ''));

    if (orders.length === 0) {
      wx.hideLoading();
      return;
    }

    const res = await wx.cloud.callFunction({
      name: 'initDB',
      data: { action: 'createManualOrder', orders }
    });
    wx.hideLoading();

    const r = res.result || {};
    if (!r.success) throw new Error(r.message || '下单失败');
    if (onSuccess) onSuccess(r.orderIds);
  } catch (e) {
    wx.hideLoading();
    if (onFail) onFail(e);
    else wx.showToast({ title: e.message || '下单失败，请重试', icon: 'none', duration: 2000 });
  }
}

/**
 * 店员手动订单编辑：原地更新已有订单（不新建、不支付、不改取餐号）。
 * @param {string} orderId - 要编辑的订单 _id
 * @param {object} orderGroup - { items, orderType, remark }，items 结构同 pay()
 * @param {Function} [onSuccess] - 成功回调 (order)
 * @param {Function} [onFail] - 失败回调 (error)
 */
async function updateManualOrder(orderId, orderGroup, onSuccess, onFail) {
  if (!orderId) {
    const e = new Error('缺少订单ID');
    if (onFail) onFail(e); else wx.showToast({ title: e.message, icon: 'none' });
    return;
  }
  const openid = getOpenid();
  if (!openid) {
    const e = new Error('用户未登录，请重新打开小程序');
    if (onFail) onFail(e); else wx.showToast({ title: e.message, icon: 'none' });
    return;
  }

  wx.showLoading({ title: '保存中...', mask: true });
  try {
    const g = orderGroup || {};
    const order = buildOrder(g.items, g.orderType, g.remark || '');

    const res = await wx.cloud.callFunction({
      name: 'initDB',
      data: {
        action: 'updateManualOrder',
        id: orderId,
        orderType: order.orderType,
        remark: order.remark,
        products: order.products,
        totalAmount: order.totalAmount
      }
    });
    wx.hideLoading();

    const r = res.result || {};
    if (!r.success) throw new Error(r.message || '保存失败');
    if (onSuccess) onSuccess(r.order);
  } catch (e) {
    wx.hideLoading();
    if (onFail) onFail(e);
    else wx.showToast({ title: e.message || '保存失败，请重试', icon: 'none', duration: 2000 });
  }
}

/**
 * 店员手动订单删除：移除订单并回退销量。
 * @param {string} orderId - 要删除的订单 _id
 * @param {Function} [onSuccess] - 成功回调
 * @param {Function} [onFail] - 失败回调 (error)
 */
async function deleteManualOrder(orderId, onSuccess, onFail) {
  if (!orderId) {
    const e = new Error('缺少订单ID');
    if (onFail) onFail(e); else wx.showToast({ title: e.message, icon: 'none' });
    return;
  }
  const openid = getOpenid();
  if (!openid) {
    const e = new Error('用户未登录，请重新打开小程序');
    if (onFail) onFail(e); else wx.showToast({ title: e.message, icon: 'none' });
    return;
  }

  wx.showLoading({ title: '删除中...', mask: true });
  try {
    const res = await wx.cloud.callFunction({
      name: 'initDB',
      data: { action: 'deleteManualOrder', id: orderId }
    });
    wx.hideLoading();

    const r = res.result || {};
    if (!r.success) throw new Error(r.message || '删除失败');
    if (onSuccess) onSuccess();
  } catch (e) {
    wx.hideLoading();
    if (onFail) onFail(e);
    else wx.showToast({ title: e.message || '删除失败，请重试', icon: 'none', duration: 2000 });
  }
}

module.exports = {
  getNextPickupNumber,
  buildOrder,
  findScoopMismatch, // 拼球一致性校验（支付前拦截球数 ≠ 口味份数之和）
  createPendingOrders,
  deletePendingOrders,
  getOpenid,
  pay,               // 完整流程：订阅授权 + 支付
  executePay,        // 仅支付（不含订阅授权），供外部已处理订阅的场景使用
  recordManualOrder, // 店员手动记账下单（不支付）
  updateManualOrder, // 店员手动订单编辑（原地更新）
  deleteManualOrder, // 店员手动订单删除
};
