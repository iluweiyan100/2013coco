// utils/pay.js
// 共享支付逻辑：创建订单 + 调起微信支付
// 供 cart.js（购物车支付）和 order.js（弹窗立即支付）共用

const SUBSCRIBE = require('../config/subscribe.js');

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
      name: item.name,
      temperature: item.spec || '',  // 与 staff 页面字段对齐
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
  const orderIds = [];

  // 获取桌位上下文
  const ctx = getApp().globalData.tableContext
    || wx.getStorageSync('tableContext') || null;
  console.log('[Pay] 桌位上下文:', JSON.stringify(ctx));

  for (const order of orders) {
    const pickupNumber = await getNextPickupNumber(order.orderType);
    console.log('[Pay] 订单 orderType:', order.orderType, '取餐码:', pickupNumber);

    const res = await db.collection('orders').add({
      data: {
        openid: openid,
        pickupNumber: pickupNumber,
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
    // 写入 orderId 和 outTradeNo 字段，供支付回调查询使用
    await db.collection('orders').doc(res._id).update({
      data: { orderId: res._id, outTradeNo: '' }
    });
    orderIds.push(res._id);
  }

  return orderIds;
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

let payInFlight = false;

/**
 * 执行核心支付流程（异步，由 pay() 在订阅授权回调中调用）
 * @param {Array} orderGroups - [{ items, orderType, remark }]
 * @param {Function} onSuccess - 支付成功回调
 * @param {Function} onFail - 支付失败回调 (非取消)
 */
async function executePay(orderGroups, onSuccess, onFail) {
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
    return;
  }
  console.log('[Pay] openid:', openid);

  let orderIds = [];

  try {
    // 1. 构建订单对象
    const orders = orderGroups
      .filter(g => g.items && g.items.length > 0)
      .map(g => buildOrder(g.items, g.orderType, g.remark || ''));

    if (orders.length === 0) {
      wx.hideLoading();
      return;
    }

    // 2. 创建待支付订单记录
    orderIds = await createPendingOrders(orders);

    // 3. 计算 outTradeNo（≤32字符）并回写到每条订单
    const totalAmount = orders.reduce((s, o) => s + o.totalAmount, 0);
    const outTradeNo = orderIds.length === 1
      ? orderIds[0]
      : orderIds[0].slice(0, 26) + '_' + orderIds.length;

    const db = wx.cloud.database();
    await Promise.all(orderIds.map(id =>
      db.collection('orders').doc(id).update({ data: { outTradeNo } })
    ));

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

    // 6. 支付成功，本地更新订单状态为 making（不等 webhook，确保用户端立即可见）
    // 注意：仅更新 status，paidAt 由 webhook 回调写入，避免客户端 serverDate() 权限问题
    try {
      const db2 = wx.cloud.database();
      const results = await Promise.all(orderIds.map(id =>
        db2.collection('orders').doc(id).update({
          data: { status: 'making' }
        })
      ));
      console.log('[Pay] 订单状态更新为 making 成功:', results.map(r => r.stats));
    } catch (updateErr) {
      // 本地更新失败不影响主流程，webhook 会兜底
      console.warn('[Pay] 本地更新订单状态失败:', updateErr);
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
    if (e.errMsg && e.errMsg.indexOf('cancel') !== -1) {
      await deletePendingOrders(orderIds);
    } else {
      await deletePendingOrders(orderIds);
      if (onFail) {
        onFail(e);
      } else {
        wx.showToast({
          title: e.message || '支付失败，请重试',
          icon: 'none',
          duration: 2000
        });
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

module.exports = {
  getNextPickupNumber,
  buildOrder,
  createPendingOrders,
  deletePendingOrders,
  getOpenid,
  pay,         // 完整流程：订阅授权 + 支付
  executePay,  // 仅支付（不含订阅授权），供外部已处理订阅的场景使用
};
