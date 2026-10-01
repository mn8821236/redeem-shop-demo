/* Standalone visual preview. All records are synthetic, in-memory, and reset on reload.
 * This file never sends /api requests to a server and never performs network writes.
 * It is deliberately not included in the production public/ build.
 */
(() => {
  'use strict';
  const originalFetch = window.fetch.bind(window);
  const now = () => new Date().toISOString();
  let sequence = 100;
  const nextId = (prefix) => `${prefix}${++sequence}`;
  const products = [
    { id: 1, slug: 'inspiration-starter', name: '灵感启动包', subtitle: '把脑海里的好点子，变成下一件作品。', description: '一份为日常创作准备的数字补给。本页面仅展示数字商品店的下单与交付流程。\n这是虚构演示商品，付款按钮不会扣款，不包含真实订阅或第三方服务。', category: '创作灵感', priceCents: 2900, stock: 28, features: ['创意启发', '即刻交付', '演示商品'], badge: '编辑推荐', active: true, demo: true },
    { id: 2, slug: 'workflow-essentials', name: '效率工具箱', subtitle: '少一点重复，多一点专注。', description: '从日常清单到工作节奏，找到适合自己的效率方式。此商品仅用于静态页面交互演示，没有实际工具或订阅权益。', category: '效率工具', priceCents: 4900, stock: 16, features: ['轻量工作流', '清晰结构', '演示商品'], badge: '人气好物', active: true, demo: true },
    { id: 3, slug: 'code-companion', name: '开发者补给', subtitle: '为每一次构建，留一些探索的余地。', description: '面向开发与探索的数字好物概念演示。不提供真实 API 密钥、软件许可或账号服务，不索取第三方凭证。', category: '开发探索', priceCents: 6900, stock: 12, features: ['开发灵感', '探索实践', '演示商品'], badge: '灵感上新', active: true, demo: true },
    { id: 4, slug: 'design-collection', name: '设计灵感集', subtitle: '让好看的想法，也有好用的表达。', description: '以设计资源为主题的虚构商品，用于预览详情、订单、兑换与后台管理界面。不会交付真实设计素材。', category: '创作灵感', priceCents: 3900, stock: 22, features: ['设计参考', '视觉探索', '演示商品'], badge: '', active: true, demo: true },
    { id: 5, slug: 'learning-pass', name: '知识漫游卡', subtitle: '对世界保持好奇，给成长一点时间。', description: '学习内容主题的演示商品。价格、库存与订单均为本地虚构数据，刷新页面后回到初始状态。', category: '学习成长', priceCents: 1900, stock: 35, features: ['碎片学习', '持续成长', '演示商品'], badge: '轻松入门', active: true, demo: true },
    { id: 6, slug: 'digital-weekend', name: '数字漫游包', subtitle: '留一点空白，发现屏幕另一边的精彩。', description: '数字体验组合主题演示，不涉及任何真实会员、充值或服务商。可尝试模拟支付，并使用演示兑换码生成回执。', category: '数字体验', priceCents: 5900, stock: 8, features: ['自由探索', '数字体验', '演示商品'], badge: '', active: true, demo: true }
  ];
  const orders = [];
  const deliveries = new Map();
  const redemptions = [];
  const audit = [{ action: 'preview.started', detail: '纯静态预览已启动：无数据库、无真实认证、所有内容均为虚构演示。', createdAt: now() }];
  let authenticated = false;
  const csrfToken = 'STATIC_PREVIEW_NOT_A_REAL_CSRF_TOKEN';
  const log = (action, detail) => audit.unshift({ action, detail, createdAt: now() });
  const fail = (message, status = 400, code = 'STATIC_DEMO_ERROR') => { const error = new Error(message); error.status = status; error.code = code; throw error; };
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const clean = (value) => String(value ?? '').trim();
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function publicOrder(order, withCodes = false) {
    const { lookupToken, email, ...result } = order;
    if (withCodes && order.status === 'fulfilled') result.codes = copy(deliveries.get(order.id) || []);
    return copy(result);
  }
  function authorize(input) {
    const order = orders.find((o) => o.id === input.orderId && o.lookupToken === input.lookupToken);
    if (!order) fail('演示订单不存在或查询码不匹配。刷新页面会清除之前的全部演示数据。', 404);
    return order;
  }
  function fulfill(order) {
    if (order.status === 'fulfilled') return;
    const product = products.find((p) => p.id === order.productId);
    if (!product || product.stock < order.quantity) { order.status = 'paid_unfulfilled'; return; }
    product.stock -= order.quantity;
    deliveries.set(order.id, Array.from({ length: order.quantity }, () => ({ code: `DEMO-STARPORT-${nextId('CODE')}-NOTREAL`, redeemedAt: null })));
    order.status = 'fulfilled'; order.paidAt = now(); order.fulfilledAt = now();
    log('demo.order.fulfilled', `${order.id}：模拟交付完成，没有发生真实付款。`);
  }
  function redemptionResult(item) {
    return { productName: item.productName, redeemedAt: item.createdAt, receipt: item.id, status: item.status, fulfilledAt: item.fulfilledAt, fulfillmentNote: item.fulfillmentNote, message: '静态演示回执：没有充值任何账户，没有开通真实权益，刷新后此记录消失。' };
  }
  function handle(path, method, input) {
    if (path === '/api/config' && method === 'GET') return { demoMode: true, paymentMode: 'demo', storeName: '星屿补给 · 静态预览', allowManualPayments: true };
    if (path === '/api/products' && method === 'GET') return { products: copy(products.filter((p) => p.active)) };
    if (path === '/api/orders' && method === 'POST') {
      const product = products.find((p) => p.id === Number(input.productId) && p.active);
      if (!product || !product.stock) fail('这件演示商品暂时没有库存');
      const order = { id: nextId('SPDEMO'), lookupToken: nextId('DEMO_QUERY_'), productId: product.id, productName: product.name, quantity: 1, totalCents: product.priceCents, status: 'pending', currency: 'CNY', createdAt: now(), expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), paymentMode: 'demo', email: 'preview@example.invalid' };
      orders.unshift(order); log('demo.order.created', `${order.id}：创建虚构演示订单。`);
      return { order: publicOrder(order), lookupToken: order.lookupToken };
    }
    if (path === '/api/orders/lookup' && method === 'POST') return { order: publicOrder(authorize(input), true) };
    if (path === '/api/payments/demo' && method === 'POST') { const order = authorize(input); fulfill(order); return { order: publicOrder(order, true) }; }
    if (path === '/api/redeem' && method === 'POST') {
      let found; let order;
      for (const [orderId, codes] of deliveries) { const code = codes.find((item) => item.code === clean(input.code)); if (code) { found = code; order = orders.find((o) => o.id === orderId); break; } }
      if (!found) fail('演示码无效。请先创建订单并点击模拟支付，或重新开始；刷新会清除旧数据。', 404);
      const existing = redemptions.find((r) => r.code === found.code); if (existing) return redemptionResult(existing);
      const item = { id: nextId('RDDEMO'), productName: order.productName, orderId: order.id, code: found.code, status: 'completed_demo', note: clean(input.note).slice(0, 500), createdAt: now(), fulfilledAt: now(), fulfillmentNote: '静态演示完成，无真实服务' };
      found.redeemedAt = item.createdAt; redemptions.unshift(item); log('demo.voucher.redeemed', `${item.id}：已生成虚构回执。`); return redemptionResult(item);
    }
    if (path === '/api/admin/session' && method === 'GET') return authenticated ? { authenticated: true, csrfToken } : { authenticated: false };
    if (path === '/api/admin/login' && method === 'POST') { authenticated = true; log('demo.admin.entered', '进入视觉演示管理台，无真实身份验证。'); return { csrfToken }; }
    if (path.startsWith('/api/admin/')) {
      if (!authenticated) fail('请先点击进入演示管理台', 401, 'AUTH_REQUIRED');
      if (path === '/api/admin/logout' && method === 'POST') { authenticated = false; return { ok: true }; }
      if (path === '/api/admin/dashboard' && method === 'GET') return { stats: { revenueCents: orders.filter((o) => o.paidAt).reduce((sum, o) => sum + o.totalCents, 0), paidOrders: orders.filter((o) => o.paidAt).length, pendingOrders: orders.filter((o) => o.status === 'pending').length, availableCodes: products.reduce((sum, p) => sum + p.stock, 0) }, products: copy(products), orders: orders.map((o) => ({ ...publicOrder(o), email: 'preview@example.invalid' })), redemptions: redemptions.map(({ code, ...r }) => copy(r)), audit: copy(audit) };
      const productMatch = path.match(/^\/api\/admin\/products\/(\d+)$/);
      if ((path === '/api/admin/products' && method === 'POST') || (productMatch && method === 'PATCH')) {
        if (!clean(input.name) || !clean(input.slug) || !Number.isInteger(input.priceCents) || input.priceCents < 1) fail('请填写演示商品名称、标识与有效价格');
        const existing = productMatch ? products.find((p) => p.id === Number(productMatch[1])) : null;
        if (productMatch && !existing) fail('演示商品不存在', 404);
        const product = { ...(existing || { id: ++sequence, stock: 0 }), name: clean(input.name), slug: clean(input.slug), subtitle: clean(input.subtitle), description: clean(input.description), category: clean(input.category), priceCents: input.priceCents, features: Array.isArray(input.features) ? input.features.map(clean) : [], badge: clean(input.badge), active: Boolean(input.active), demo: true };
        if (existing) Object.assign(existing, product); else products.push(product);
        log('demo.product.saved', `本页内存商品 ${product.name} 已保存，刷新会重置。`); return { product: copy(product) };
      }
      if (path === '/api/admin/codes/import' && method === 'POST') {
        const product = products.find((p) => p.id === Number(input.productId)); if (!product) fail('请选择演示商品');
        if (!Array.isArray(input.codes) || !input.codes.length || input.codes.length > 500) fail('每次请输入 1 至 500 行演示文本');
        product.stock += input.codes.length; log('demo.inventory.imported', `演示库存增加 ${input.codes.length}。原始输入不会作为真实凭证保存。`);
        orders.filter((o) => o.productId === product.id && o.status === 'paid_unfulfilled').forEach(fulfill);
        return { imported: input.codes.length };
      }
      const paymentMatch = path.match(/^\/api\/admin\/orders\/([A-Z0-9]+)\/mark-paid$/);
      if (paymentMatch && method === 'POST') {
        const order = orders.find((o) => o.id === paymentMatch[1]); if (!order) fail('演示订单不存在', 404);
        if (clean(input.reason).length < 8 || clean(input.transactionId).length < 6) fail('请填写至少 8 字演示原因与至少 6 字模拟交易号');
        if (Number(input.amountCents) !== order.totalCents) fail('演示核款金额应与订单金额一致');
        fulfill(order); return { order: publicOrder(order) };
      }
      const redemptionMatch = path.match(/^\/api\/admin\/redemptions\/([A-Z0-9]+)\/fulfill$/);
      if (redemptionMatch && method === 'POST') {
        const item = redemptions.find((r) => r.id === redemptionMatch[1]); if (!item) fail('演示申请不存在', 404);
        if (clean(input.note).length < 8) fail('请填写至少 8 字演示说明');
        item.status = 'fulfilled'; item.fulfilledAt = now(); item.fulfillmentNote = clean(input.note); log('demo.fulfillment.saved', '仅修改页面演示状态，无实际服务。'); return redemptionResult(item);
      }
    }
    fail(`静态预览不支持此操作：${method} ${path}。未向任何服务器发送请求。`, 404, 'STATIC_ROUTE_UNSUPPORTED');
  }
  // Visible management examples are fabricated, including every order ID and code.
  for (const [index, paid] of [[0, true], [1, true], [2, false]]) {
    const product = products[index];
    const order = { id: nextId('SPDEMO'), lookupToken: nextId('DEMO_QUERY_'), productId: product.id, productName: product.name, quantity: 1, totalCents: product.priceCents, status: 'pending', currency: 'CNY', createdAt: now(), expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), paymentMode: 'demo', email: 'preview@example.invalid' };
    orders.push(order); if (paid) fulfill(order);
  }
  redemptions.push({ id: nextId('RDDEMO'), productName: '设计灵感集（虚构履约示例）', orderId: orders[0].id, code: 'DEMO-FABRICATED-FULFILLMENT-EXAMPLE', status: 'pending_fulfillment', note: '这是用于预览履约管理界面的虚构申请，不需要进行真实服务。', createdAt: now(), fulfilledAt: null, fulfillmentNote: null });
  window.fetch = async (resource, options = {}) => {
    const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource?.url || '';
    const method = String(options.method || (typeof resource === 'object' && resource.method) || 'GET').toUpperCase();
    // Only the app's explicit root-relative API contract is intercepted.
    // Never reinterpret arbitrary external URLs as local preview requests.
    if (!url.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(method)) throw new Error('静态预览禁止一切网络写请求');
      return originalFetch(resource, options);
    }
    const path = url.split('?')[0];
    let input = {};
    try {
      if (options.body) input = JSON.parse(options.body);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return response(handle(path, method, input));
    } catch (error) { return response({ error: error.message || '静态预览操作未完成', code: error.code || 'STATIC_DEMO_ERROR' }, error.status || 400); }
  };
})();
