'use strict';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const currency = (cents) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(Number(cents || 0) / 100);
const dateTime = (value) => value && !Number.isNaN(new Date(value).valueOf()) ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const state = { config: { demoMode: true, paymentMode: 'disabled', allowManualPayments: false }, products: [], category: 'all', search: '', order: null, credentials: null, csrf: null, dashboard: null, adminLoading: false, checkoutProduct: null };
const SESSION_KEY = 'starport.current-order.v1';
let toastTimer;

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.admin && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = state.csrf || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, { method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store', headers, signal: controller.signal, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
    let data;
    try { data = await response.json(); } catch { throw new Error('服务器返回了无法识别的内容，请稍后重试'); }
    if (!response.ok) {
      const error = new Error(data.error || '操作未完成，请稍后再试');
      error.code = data.code; error.status = response.status;
      if (options.admin && response.status === 401) showAdminLogin();
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('连接超时，结果尚未确认。支付或兑换后请先查询状态，勿重复下单');
    if (error instanceof TypeError) throw new Error('网络连接失败，请检查连接后重试。支付或兑换后请先查询状态');
    throw error;
  } finally { clearTimeout(timeout); }
}

function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4300); }
function errorIn(form, message = '') { const target = $('.form-error', form); if (target) target.textContent = message; }
async function busy(form, action) {
  const buttons = $$('button[type="submit"]', form);
  if (form.dataset.busy) return;
  form.dataset.busy = 'true'; errorIn(form);
  buttons.forEach((button) => { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = '正在处理…'; });
  try { await action(); } catch (error) { errorIn(form, error.message || '操作未完成'); }
  finally { delete form.dataset.busy; buttons.forEach((button) => { button.disabled = false; button.textContent = button.dataset.originalText; delete button.dataset.originalText; }); }
}
function rememberCredentials(credentials) {
  state.credentials = credentials;
  // Static preview: keep synthetic credentials in memory only; never persist data.
  $('#restore-order').hidden = false;
}
function restoreCredentials() { state.credentials = null; $('#restore-order').hidden = true; }
function fillLookup() {
  if (!state.credentials) return;
  $('#lookup-order-id').value = state.credentials.orderId;
  $('#lookup-token').value = state.credentials.lookupToken;
}
async function copyText(value, success = '已复制，请妥善保存') {
  try { await navigator.clipboard.writeText(value); toast(success); }
  catch { toast('浏览器未允许复制，请手动选择并复制内容'); }
}
function openDialog(dialog) { if (!dialog.open) dialog.showModal(); document.body.classList.add('no-scroll'); }
function closeDialog(dialog) { dialog.close(); if (!$$('dialog[open]').length) document.body.classList.remove('no-scroll'); }

function route() {
  const hash = location.hash.slice(1) || 'shop';
  const view = ['orders', 'redeem', 'admin'].includes(hash) ? hash : 'store';
  $$('.app-view').forEach((element) => { element.hidden = element.id !== `${view}-view`; });
  $$('[data-nav]').forEach((link) => { const active = link.dataset.nav === (hash === 'products' ? 'shop' : hash); link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  if (view === 'admin') loadAdmin();
  if (view !== 'store') window.scrollTo({ top: 0, behavior: 'instant' });
  else if (['products', 'faq'].includes(hash)) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }));
  else window.scrollTo({ top: 0, behavior: 'instant' });
  document.title = `${{ orders: '查询订单', redeem: '兑换中心', admin: '商店管理', store: '给数字生活一点好灵感' }[view]} · 星屿补给 STARPORT`;
}

const icons = [
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 7v34M7 24h34M12 12l24 24M12 36l24-24" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M10 10h11v11H10zM27 10h11v11H27zM10 27h11v11H10zM27 27h11v11H27z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m15 15-9 9 9 9m18-18 9 9-9 9M28 8l-8 32" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m24 5 5.6 12.5L43 24l-13.4 6.5L24 43l-5.6-12.5L5 24l13.4-6.5L24 5Z" stroke="currentColor" stroke-width="2.5"/><path d="M24 15v18M15 24h18" stroke="currentColor" stroke-width="2"/></svg>',
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M9 10h13c4 0 6 2 6 6v24c-1-3-4-4-8-4H9V10Zm30 0H28v30c1-3 4-4 8-4h3V10Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="7" y="11" width="34" height="27" rx="5" stroke="currentColor" stroke-width="2.5"/><path d="m19 19 12 6-12 6V19Z" fill="currentColor"/></svg>'
];
function visual(product, index = 0) {
  const i = Math.abs(Number(product.id || index)) % icons.length;
  return `<div class="product-visual">${product.badge ? `<span class="product-badge">${escapeHTML(product.badge)}</span>` : ''}<div class="product-emblem">${icons[i]}</div><span class="visual-caption">STARPORT · DIGITAL ESSENTIALS</span></div>`;
}
function priceMarkup(cents) { const parts = (Number(cents || 0) / 100).toFixed(2).split('.'); return `<span class="price"><span class="currency">¥</span>${escapeHTML(parts[0])}<span class="price-decimal">.${parts[1]}</span></span>`; }
function productById(id) { return state.products.find((product) => String(product.id) === String(id)); }
function renderCategories() {
  const categories = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
  if (state.category !== 'all' && !categories.includes(state.category)) state.category = 'all';
  $('#category-filters').innerHTML = [{ value: 'all', label: '全部好物' }, ...categories.map((category) => ({ value: category, label: category }))].map(({ value, label }) => `<button type="button" class="filter-button${state.category === value ? ' active' : ''}" data-category="${escapeHTML(value)}" aria-pressed="${state.category === value}">${escapeHTML(label)}</button>`).join('');
}
function renderProducts() {
  const query = state.search.toLocaleLowerCase();
  const products = state.products.filter((product) => (state.category === 'all' || product.category === state.category) && `${product.name} ${product.subtitle} ${product.category}`.toLocaleLowerCase().includes(query));
  if (!products.length) { $('#product-grid').innerHTML = `<div class="empty-state"><h3>${state.products.length ? '还没找到这件好物' : '好物正在准备中'}</h3><p>${state.products.length ? '换个关键词，或看看其他分类吧。' : '当前没有已上架的商品，请稍后再来。'}</p>${state.products.length ? '<button type="button" class="button button-outline" data-reset-filters>查看全部好物</button>' : ''}</div>`; return; }
  $('#product-grid').innerHTML = products.map((product, index) => `<article class="product-card">${visual(product, index)}<div class="product-info"><span class="product-category">${escapeHTML(product.category)}${product.demo ? ' / DEMO' : ' / 商家服务凭证'}</span><h3><button type="button" class="product-title-button" data-detail="${escapeHTML(product.id)}">${escapeHTML(product.name)}</button></h3><p class="product-subtitle">${escapeHTML(product.subtitle || product.description)}</p><div class="product-features">${(product.features || []).slice(0, 3).map((feature) => `<span class="feature-tag">${escapeHTML(feature)}</span>`).join('')}</div><div class="product-bottom"><div>${priceMarkup(product.priceCents)}<span class="stock-label${product.stock ? '' : ' sold-out'}">${product.stock ? `● 库存 ${escapeHTML(product.stock)} 份` : '暂时售罄，补给在路上'}</span></div><button type="button" class="buy-button" data-buy="${escapeHTML(product.id)}" ${!product.stock || state.config.paymentMode === 'disabled' ? 'disabled' : ''}>${!product.stock ? '暂时售罄' : state.config.paymentMode === 'disabled' ? '暂未开放' : '立即选购'} <span aria-hidden="true">↗</span></button></div></div></article>`).join('');
}
async function loadProducts() {
  try { const data = await api('/api/products'); state.products = (data.products || []).filter((product) => product.active !== false); renderCategories(); renderProducts(); }
  catch (error) { $('#product-grid').innerHTML = `<div class="empty-state"><h3>好物清单暂时没有到站</h3><p>${escapeHTML(error.message)}</p><button type="button" class="button button-outline" data-retry-products>重新加载</button></div>`; }
}
function showProduct(id) {
  const product = productById(id); if (!product) return;
  $('#product-dialog-content').innerHTML = `<div class="product-detail-art">${visual(product)}</div><div class="product-detail-body"><span class="product-category">${escapeHTML(product.category)}${product.demo ? ' / DEMO' : ' / 商家服务凭证'}</span><h2 id="product-dialog-title">${escapeHTML(product.name)}</h2><p class="detail-subtitle">${escapeHTML(product.subtitle)}</p><p class="detail-description">${escapeHTML(product.description)}</p><ul class="detail-features">${(product.features || []).map((feature) => `<li>${escapeHTML(feature)}</li>`).join('')}</ul><div class="notice"><strong>${product.demo ? '演示商品说明' : '商家服务兑换凭证'}</strong><p>${product.demo ? '此商品用于验证下单、交付与兑换流程，模拟支付不会扣款，也不产生真实第三方权益。' : '购买后交付本站商家服务兑换码，非任何第三方服务商的官方充值码。兑换申请须由商家履约，不会自动充值第三方账户。'}</p></div><div class="detail-purchase"><div>${priceMarkup(product.priceCents)}<span class="stock-label">当前可用库存 ${escapeHTML(product.stock)} 份</span></div><button type="button" class="button button-dark" data-buy="${escapeHTML(product.id)}" ${!product.stock || state.config.paymentMode === 'disabled' ? 'disabled' : ''}>${!product.stock ? '暂时售罄' : state.config.paymentMode === 'disabled' ? '暂未开放' : '立即选购'} ↗</button></div></div>`;
  openDialog($('#product-dialog'));
}
function startCheckout(id) {
  const product = productById(id); if (!product || !product.stock) return;
  state.checkoutProduct = product;
  if ($('#product-dialog').open) closeDialog($('#product-dialog'));
  const form = $('#checkout-form'); form.reset(); form.hidden = false; errorIn(form);
  form.elements.productId.value = product.id;
  $('#checkout-payment-channel').hidden = state.config.paymentMode !== 'manual_demo';
  $('#created-order').hidden = true; $('#created-order').replaceChildren();
  $('#checkout-title').textContent = '好体验，就差这一步。';
  $('.modal-subtitle', $('#checkout-dialog')).textContent = '创建订单后请先保存查询密钥。';
  $('#checkout-summary').innerHTML = `<div><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.category)} · 数量 1 · ${product.demo ? '演示商品' : '商家服务兑换凭证'}</small></div>${priceMarkup(product.priceCents)}`;
  $('.notice', form).innerHTML = product.demo ? '<strong>演示商品 · 不产生真实权益</strong><p>当前使用模拟支付，不会扣款。兑换只生成演示凭证，不开通第三方服务。</p>' : '<strong>商家服务兑换凭证</strong><p>下单不代表付款成功。支付核验后交付兑换码；提交兑换申请后，仍需商家完成实际服务。</p>';
  if (state.config.paymentMode === 'manual_demo') $('.notice', form).innerHTML = '<strong>人工收款流程测试 · 勿真实转账</strong><p>订单会增加 ¥0.01–¥0.99 的测试尾差，生成后将明确列出商品金额、尾差和应付测试金额。当前未配置收款二维码。付款申报只会记录申请，不代表已到账或自动发货。</p>';
  $('button[type="submit"]', form).textContent = product.demo ? '创建演示订单 →' : '创建订单 →';
  openDialog($('#checkout-dialog'));
}

function showCreatedOrder(data) {
  rememberCredentials({ orderId: data.order.id, lookupToken: data.lookupToken }); state.order = data.order; fillLookup(); renderOrder(data.order);
  $('#checkout-form').hidden = true;
  $('#checkout-title').textContent = '订单已创建，请保存凭证';
  $('.modal-subtitle', $('#checkout-dialog')).textContent = '查询密钥只在创建时展示，请存到你信任的位置。';
  $('#created-order').hidden = false;
  $('#created-order').innerHTML = `<div class="secret-box"><span>订单号</span><span class="secret-value">${escapeHTML(data.order.id)}</span></div><div class="secret-box"><span>查询密钥 · 勿向他人透露</span><span class="secret-value">${escapeHTML(data.lookupToken)}</span></div><button type="button" class="button button-outline" id="copy-order-credentials">复制订单号与查询密钥</button><p class="form-note">凭此密钥可获取订单中的兑换码。不会通过邮件发送；当前页面仅在内存中保留演示信息，刷新即重置。</p><label class="checkbox-label"><input type="checkbox" id="saved-order-credentials"> 我已妥善保存订单号和查询密钥</label><button type="button" class="button button-dark full-width" id="continue-payment" disabled>查看订单并继续付款 →</button>`;
  $('#copy-order-credentials').addEventListener('click', () => copyText(`星屿补给订单\n订单号：${data.order.id}\n查询密钥：${data.lookupToken}\n请勿分享此凭证`));
  $('#saved-order-credentials').addEventListener('change', (event) => { $('#continue-payment').disabled = !event.target.checked; });
  $('#continue-payment').addEventListener('click', () => { fillLookup(); renderOrder(data.order); closeDialog($('#checkout-dialog')); $('#created-order').replaceChildren(); location.hash = 'orders'; });
}
const statuses = { pending: ['等待付款', ''], fulfilled: ['已交付', 'success'], paid_unfulfilled: ['已付款 · 待补货', ''], expired: ['订单已过期', 'ended'], cancelled: ['已取消', 'ended'], paid: ['已付款', 'success'], pending_fulfillment: ['待商家履约', ''], completed_demo: ['演示已完成', 'success'] };
function statusPill(status) { const [label, style] = statuses[status] || [status || '状态未知', '']; return `<span class="status-pill ${style}">${escapeHTML(label)}</span>`; }
function renderOrder(order) {
  state.order = order;
  const codes = Array.isArray(order.codes) ? order.codes : [];
  const orderCredentials = state.credentials?.orderId === order.id ? { ...state.credentials } : null;
  const isDemo = (order.paymentMode || state.config.paymentMode) === 'demo';
  const result = $('#lookup-result'); result.className = 'order-result';
  result.innerHTML = `<div class="result-topline"><h2>你的订单</h2>${statusPill(order.status)}</div><dl class="order-facts"><dt>订单号</dt><dd class="order-id">${escapeHTML(order.id)}</dd><dt>所选好物</dt><dd>${escapeHTML(order.productName)}</dd><dt>购买数量</dt><dd>${escapeHTML(order.quantity || 1)} 份</dd><dt>订单金额</dt><dd><strong>${currency(order.totalCents)}</strong></dd><dt>创建时间</dt><dd>${dateTime(order.createdAt)}</dd>${order.baseTotalCents != null && order.tailCents ? `<dt>商品基础金额</dt><dd>${currency(order.baseTotalCents)}</dd><dt>测试尾差</dt><dd>+ ${currency(order.tailCents)}</dd><dt>准确测试应付</dt><dd><strong>${currency(order.totalCents)}</strong></dd>` : ''}${order.status === 'pending' ? `<dt>有效时间至</dt><dd>${dateTime(order.expiresAt)}</dd>` : ''}<dt>支付方式</dt><dd>${isDemo ? '模拟支付 · 不会扣款' : order.paymentMode === 'manual_demo' ? `${order.paymentChannel === 'wechat' ? '微信' : '支付宝'}人工核款测试` : order.paymentMode === 'manual' ? '商家人工核款' : '待支付渠道核验'}</dd></dl>${codes.length ? `<div class="delivery-box"><h3>你的数字兑换码</h3>${codes.map((item, index) => `<div class="code-row"><span class="code-value">${escapeHTML(item.code)}</span><button type="button" class="copy-button" data-copy-code="${index}">复制</button></div><p class="code-state">${item.redeemedAt ? `已提交兑换 · ${dateTime(item.redeemedAt)}` : '尚未提交兑换'}</p><button type="button" class="text-link" data-use-code="${index}">${item.redeemedAt ? '查询兑换进度' : '去兑换中心使用'} →</button>`).join('')}</div>` : ''}${order.status === 'pending' ? (isDemo && state.config.demoMode ? '<div class="notice"><strong>这是一次模拟支付</strong><p>点击下方按钮后，系统会模拟核验支付并交付库存码，不会收取任何真实款项。</p></div><button type="button" class="button button-dark full-width" id="demo-payment">模拟支付并领取兑换码 →</button>' : '<div class="notice"><strong>等待收款核验</strong><p>当前页面没有真实在线支付通道。请仅按照商家已核实的收款说明操作，切勿将订单创建成功视为付款成功。</p></div>') : ''}${order.status === 'paid_unfulfilled' ? '<div class="notice"><strong>款项已确认，库存暂不足</strong><p>当前订单尚未交付兑换码，商家补货后会自动分配。请保存凭证并稍后刷新查询。</p></div>' : ''}${order.status === 'expired' ? '<div class="notice"><p>该订单已过付款有效期。请返回商店重新选择商品，不要对过期订单付款。</p></div>' : ''}<button type="button" class="text-link restore-link" id="refresh-order">刷新订单状态 ↻</button><div class="form-error" role="alert"></div>`;
  if (order.paymentMode === 'manual_demo' && order.status === 'pending') {
    const claimArea = document.createElement('form'); claimArea.className = 'claim-form';
    claimArea.innerHTML = `<div class="notice notice-danger"><strong>仅测试，勿真实转账</strong><p>未配置收款二维码。测试应付金额：${currency(order.totalCents)}，其中商品金额 ${currency(order.baseTotalCents ?? order.totalCents)}，尾差 ${currency(order.tailCents || 0)}。付款申报不会解锁兑换码，必须经过商家核实。</p></div>${order.paymentClaimedAt ? `<p class="form-note">已申报：${dateTime(order.paymentClaimedAt)}，等待人工核验</p>` : ''}<label>测试付款渠道<select name="paymentChannel" disabled><option value="alipay" ${order.paymentChannel === 'alipay' ? 'selected' : ''}>支付宝</option><option value="wechat" ${order.paymentChannel === 'wechat' ? 'selected' : ''}>微信支付</option></select></label><label>模拟付款参考信息 <span class="optional">可选</span><input name="reference" maxlength="120" placeholder="仅填写测试参考信息，不上传支付秘密"></label><button type="submit" class="button button-outline full-width">提交模拟付款申报</button><div class="form-error" role="alert"></div>`;
    $('#refresh-order').before(claimArea);
    claimArea.addEventListener('submit', (event) => { event.preventDefault(); busy(claimArea, async () => { const data = await api('/api/payments/claim', { method: 'POST', body: { ...orderCredentials, paymentChannel: claimArea.elements.paymentChannel.value, reference: claimArea.elements.reference.value.trim() } }); renderOrder(data.order); toast('模拟申报已提交，仍需人工核验后交付'); }); });
  }
  $$('[data-copy-code]', result).forEach((button) => button.addEventListener('click', () => copyText(codes[Number(button.dataset.copyCode)].code)));
  $$('[data-use-code]', result).forEach((button) => button.addEventListener('click', () => { $('#redeem-code').value = codes[Number(button.dataset.useCode)].code; location.hash = 'redeem'; }));
  $('#refresh-order').addEventListener('click', async (event) => { const button = event.currentTarget; button.disabled = true; try { if (!orderCredentials) throw new Error('请重新输入此订单的查询凭证'); const data = await api('/api/orders/lookup', { method: 'POST', body: orderCredentials }); renderOrder(data.order); } catch (error) { errorIn(result, error.message); } finally { button.disabled = false; } });
  $('#demo-payment')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; if (button.disabled) return; button.disabled = true; button.textContent = '正在核验并交付…'; errorIn(result);
    try { const data = await api('/api/payments/demo', { method: 'POST', body: orderCredentials }); renderOrder(data.order); toast(data.order.status === 'fulfilled' ? '模拟支付成功，兑换码已交付' : '模拟支付成功，等待库存交付'); await loadProducts(); }
    catch (error) { errorIn(result, `${error.message}。如结果不确定，请点击刷新订单状态。`); button.disabled = false; button.textContent = '模拟支付并领取兑换码 →'; }
  });
}
async function lookupCurrent() { if (!state.credentials) throw new Error('请先填写订单号与查询密钥'); const data = await api('/api/orders/lookup', { method: 'POST', body: state.credentials }); renderOrder(data.order); }
function renderRedemption(data) {
  const demo = data.status === 'completed_demo'; const pending = data.status === 'pending_fulfillment';
  const result = $('#redeem-result'); result.className = 'order-result';
  result.innerHTML = `<div class="receipt-stamp" aria-hidden="true">${pending ? '◷' : '✳'}</div><div class="result-topline"><h2>${demo ? '演示兑换已完成' : pending ? '申请已提交，等待履约' : '商家已标记服务完成'}</h2></div><dl class="order-facts"><dt>对应商品</dt><dd>${escapeHTML(data.productName)}</dd><dt>申请编号</dt><dd class="order-id">${escapeHTML(data.receipt)}</dd><dt>提交时间</dt><dd>${dateTime(data.redeemedAt)}</dd><dt>当前状态</dt><dd>${demo ? '演示完成，无真实权益' : pending ? '等待商家实际履约' : '已完成，请核对实际交付'}</dd>${data.fulfilledAt ? `<dt>处理时间</dt><dd>${dateTime(data.fulfilledAt)}</dd>` : ''}</dl><p class="receipt-note">${escapeHTML(data.message)}</p>${data.fulfillmentNote ? `<div class="notice"><strong>商家履约说明</strong><p>${escapeHTML(data.fulfillmentNote)}</p></div>` : ''}<div class="notice"><strong>${demo ? '请注意：这是演示回执' : '此凭证不是第三方官方充值码'}</strong><p>${demo ? '本次操作没有充值任何第三方账户，也未开通真实订阅或服务。' : '兑换申请与实际服务完成是两个步骤。本页面不会登录你的第三方账号或执行外部充值。'} 再次使用同一码可查询已有记录，不会重复创建申请。</p></div>`;
}

function showAdminLogin() { state.csrf = null; state.dashboard = null; $('#admin-loading').hidden = true; $('#admin-login-form').hidden = false; $('#admin-dashboard').hidden = true; $('#admin-logout').hidden = true; }
async function loadAdmin() {
  if (state.adminLoading) return;
  state.adminLoading = true; $('#admin-error').textContent = '';
  if (!state.dashboard) $('#admin-loading').hidden = false;
  try {
    const session = await api('/api/admin/session');
    if (!session.authenticated) { showAdminLogin(); return; }
    state.csrf = session.csrfToken; await refreshAdmin();
  } catch (error) { $('#admin-error').textContent = error.message; }
  finally { $('#admin-loading').hidden = true; state.adminLoading = false; }
}
async function refreshAdmin() {
  const data = await api('/api/admin/dashboard', { admin: true }); state.dashboard = data;
  $('#admin-login-form').hidden = true; $('#admin-dashboard').hidden = false; $('#admin-logout').hidden = false;
  const stats = data.stats || {};
  $('#admin-stats').innerHTML = [[state.config.demoMode ? '演示成交金额' : '已核款订单金额', currency(stats.revenueCents)], ['已付款订单', stats.paidOrders || 0], ['等待付款', stats.pendingOrders || 0], ['可用兑换码', stats.availableCodes || 0]].map(([label, value]) => `<div class="stat-card"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join('');
  $('#admin-product-rows').innerHTML = (data.products || []).map((p) => `<tr><td><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.slug)} · ${p.demo ? '演示' : '真实商家服务'}</small></td><td>${escapeHTML(p.category)}</td><td>${currency(p.priceCents)}</td><td>${escapeHTML(p.stock)}</td><td><span class="status-pill ${p.active ? 'success' : 'ended'}">${p.active ? '已上架' : '已下架'}</span></td><td><button type="button" class="table-action" data-edit-product="${escapeHTML(p.id)}">编辑</button></td></tr>`).join('') || '<tr><td colspan="6">还没有商品，先创建第一件好物吧。</td></tr>';
  $('#admin-order-rows').innerHTML = (data.orders || []).map((o) => `<tr><td><strong>${escapeHTML(o.id)}</strong><small>${dateTime(o.createdAt)}</small></td><td>${escapeHTML(o.productName)} × ${escapeHTML(o.quantity || 1)}</td><td>${escapeHTML(o.email || '未提供')}</td><td>${currency(o.totalCents)}</td><td>${statusPill(o.status)}${o.paymentClaim ? `<small class="claim-review-label">${['pending', 'expired'].includes(o.status) ? '已申报 · 待核对' : '付款申报记录'}</small><small>${escapeHTML(o.paymentClaim.channel === 'wechat' ? '微信支付' : o.paymentClaim.channel === 'alipay' ? '支付宝' : o.paymentClaim.channel)} · ${dateTime(o.paymentClaim.createdAt)}</small><small class="note-cell">${escapeHTML(o.paymentClaim.reference || '未填写参考信息')}</small>` : ''}</td><td>${o.status === 'pending' || o.status === 'expired' ? `<button type="button" class="table-action warning" data-mark-paid="${escapeHTML(o.id)}" ${state.config.allowManualPayments ? '' : 'disabled title="服务器未启用人工核款"'}>人工核款</button>${state.config.allowManualPayments ? '' : '<small>服务器未启用</small>'}` : '—'}</td></tr>`).join('') || '<tr><td colspan="6">暂时没有订单</td></tr>';
  $('#import-product').innerHTML = '<option value="">请选择商品</option>' + (data.products || []).map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}${p.demo ? ' [演示]' : ''}</option>`).join('');
  $('#audit-list').innerHTML = (data.audit || []).map((item) => `<article class="audit-item"><strong>${escapeHTML(item.action)}</strong><p>${escapeHTML(item.detail)}</p><time>${dateTime(item.createdAt)}</time></article>`).join('') || '<p class="form-note">暂时没有操作记录</p>';
  $('#admin-redemption-rows').innerHTML = (data.redemptions || []).map((item) => `<tr><td><strong>${escapeHTML(item.id)}</strong><small>${dateTime(item.createdAt)}</small></td><td>${escapeHTML(item.productName)}<small>${escapeHTML(item.orderId)}</small></td><td class="note-cell">${escapeHTML(item.note || '无备注')}</td><td>${item.status === 'fulfilled' ? '<span class="status-pill success">服务已完成</span>' : statusPill(item.status)}${item.fulfillmentNote ? `<small class="note-cell">${escapeHTML(item.fulfillmentNote)}</small>` : ''}</td><td>${item.status === 'pending_fulfillment' ? `<button type="button" class="table-action" data-fulfill="${escapeHTML(item.id)}">记录履约</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5">暂时没有兑换申请</td></tr>';
}
function showAdminProduct(id) {
  const form = $('#admin-product-form'); form.reset(); errorIn(form);
  const product = state.dashboard?.products.find((p) => String(p.id) === String(id));
  $('#admin-product-title').textContent = product ? '编辑商品' : '新建商品';
  form.elements.id.value = product?.id || '';
  for (const field of ['name', 'slug', 'subtitle', 'description', 'category', 'badge']) form.elements[field].value = product?.[field] || '';
  form.elements.price.value = product ? (product.priceCents / 100).toFixed(2) : '';
  form.elements.features.value = (product?.features || []).join('\n');
  form.elements.active.checked = product ? product.active : true;
  form.elements.demo.checked = product ? product.demo : state.config.demoMode;
  openDialog($('#admin-product-dialog'));
}
function showManualPaid(id) {
  if (!state.config.allowManualPayments) { toast('服务器未启用人工核款'); return; }
  const order = state.dashboard?.orders.find((o) => o.id === id); if (!order) return;
  const form = $('#manual-paid-form'); form.reset(); errorIn(form); form.elements.orderId.value = id;
  $('#manual-order-info').textContent = `订单 ${id} · ${order.productName} · 必须核实准确到账 ${currency(order.totalCents)}`;
  form.elements.amount.value = (order.totalCents / 100).toFixed(2);
  form.elements.channel.value = order.paymentChannel || 'manual';
  const needsExceptionReview = order.paymentReviewRequired || order.status === 'expired';
  $('#exception-review-label').hidden = !needsExceptionReview;
  form.elements.exceptionReviewed.required = Boolean(needsExceptionReview);
  openDialog($('#manual-paid-dialog'));
}
function showFulfill(id) {
  const form = $('#fulfill-form'); form.reset(); errorIn(form); form.elements.redemptionId.value = id;
  $('#fulfill-request-id').textContent = `申请编号：${id}`; openDialog($('#fulfill-dialog'));
}

function applyMode() {
  if (state.config.demoMode) return;
  $('.demo-tag').textContent = 'MERCHANT VOUCHERS';
  $('.demo-strip > span:nth-child(2)').textContent = '独立商家服务凭证 · 非官方充值码 · 不索取第三方账号密码';
  $('.admin-demo-notice').innerHTML = '<strong>商家服务环境</strong><p>请依据真实收款记录核款，并在实际完成服务后记录履约。真实在线支付尚未接入时，请勿将订单创建视为付款成功。</p>';
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.matches('[data-close-dialog]')) closeDialog(button.closest('dialog'));
  else if (button.matches('[data-detail]')) showProduct(button.dataset.detail);
  else if (button.matches('[data-buy]')) startCheckout(button.dataset.buy);
  else if (button.matches('[data-category]')) { state.category = button.dataset.category; renderCategories(); renderProducts(); }
  else if (button.matches('[data-reset-filters]')) { state.category = 'all'; state.search = ''; $('#product-search').value = ''; renderCategories(); renderProducts(); }
  else if (button.matches('[data-retry-products]')) loadProducts();
  else if (button.matches('[data-toggle-password]')) { const input = document.getElementById(button.dataset.togglePassword); const show = input.type === 'password'; input.type = show ? 'text' : 'password'; button.textContent = show ? '隐藏' : '显示'; button.setAttribute('aria-label', show ? '隐藏查询密钥' : '显示查询密钥'); }
  else if (button.matches('[data-admin-tab]')) { $$('[data-admin-tab]').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); }); $$('.admin-panel').forEach((panel) => { panel.hidden = panel.id !== `admin-${button.dataset.adminTab}`; }); }
  else if (button.matches('[data-edit-product]')) showAdminProduct(button.dataset.editProduct);
  else if (button.matches('[data-mark-paid]')) showManualPaid(button.dataset.markPaid);
  else if (button.matches('[data-fulfill]')) showFulfill(button.dataset.fulfill);
});
$$('dialog').forEach((dialog) => {
  dialog.addEventListener('close', () => { if (!$$('dialog[open]').length) document.body.classList.remove('no-scroll'); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog); } });
});
$('#product-search').addEventListener('input', (event) => { state.search = event.target.value.trim(); renderProducts(); });
$('#restore-order').addEventListener('click', () => { fillLookup(); toast('已填入本次会话的最近订单'); });
$('#checkout-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => { const data = await api('/api/orders', { method: 'POST', body: { productId: Number(form.elements.productId.value), quantity: 1, email: form.elements.email.value.trim(), ...(state.config.paymentMode === 'manual_demo' ? { paymentChannel: form.elements.paymentChannel.value } : {}) } }); showCreatedOrder(data); });
});
$('#lookup-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => { const credentials = { orderId: form.elements.orderId.value.trim(), lookupToken: form.elements.lookupToken.value.trim() }; const data = await api('/api/orders/lookup', { method: 'POST', body: credentials }); rememberCredentials(credentials); renderOrder(data.order); });
});
$('#redeem-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => { const data = await api('/api/redeem', { method: 'POST', body: { code: form.elements.code.value.trim(), note: form.elements.note.value.trim() } }); renderRedemption(data); });
});
$('#admin-login-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => { const data = await api('/api/admin/login', { method: 'POST', body: { password: form.elements.password.value } }); state.csrf = data.csrfToken; form.reset(); await refreshAdmin(); toast('已登录管理台'); });
});
$('#admin-logout').addEventListener('click', async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try { await api('/api/admin/logout', { method: 'POST', body: {}, admin: true }); showAdminLogin(); $('#admin-dashboard').querySelectorAll('tbody, #audit-list').forEach((el) => el.replaceChildren()); toast('已退出管理'); }
  catch (error) { $('#admin-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#add-product').addEventListener('click', () => showAdminProduct());
$('#refresh-admin').addEventListener('click', async () => { try { await refreshAdmin(); toast('管理数据已刷新'); } catch (error) { $('#admin-error').textContent = error.message; } });
$('#admin-product-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => {
    const id = form.elements.id.value;
    const body = { name: form.elements.name.value.trim(), slug: form.elements.slug.value.trim(), subtitle: form.elements.subtitle.value.trim(), description: form.elements.description.value.trim(), category: form.elements.category.value.trim(), priceCents: Math.round(Number(form.elements.price.value) * 100), features: form.elements.features.value.split('\n').map((v) => v.trim()).filter(Boolean), badge: form.elements.badge.value.trim(), active: form.elements.active.checked, demo: form.elements.demo.checked };
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : '/api/admin/products', { method: id ? 'PATCH' : 'POST', body, admin: true });
    closeDialog($('#admin-product-dialog')); toast('商品已保存'); await Promise.all([refreshAdmin(), loadProducts()]);
  });
});
$('#import-codes-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget; $('.form-success', form).textContent = '';
  busy(form, async () => {
    const codes = form.elements.codes.value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
    if (!codes.length || codes.length > 500) throw new Error('请每次导入 1 至 500 个兑换码');
    const data = await api('/api/admin/codes/import', { method: 'POST', body: { productId: Number(form.elements.productId.value), codes }, admin: true });
    form.elements.codes.value = ''; $('.form-success', form).textContent = `成功导入 ${data.imported} 个兑换码。库存已更新，待补货订单会自动交付。`;
    await Promise.all([refreshAdmin(), loadProducts()]);
  });
});
$('#manual-paid-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => { await api(`/api/admin/orders/${encodeURIComponent(form.elements.orderId.value)}/mark-paid`, { method: 'POST', body: { reason: form.elements.reason.value.trim(), channel: form.elements.channel.value, transactionId: form.elements.transactionId.value.trim(), amountCents: Math.round(Number(form.elements.amount.value) * 100), ...(!$('#exception-review-label').hidden && form.elements.exceptionReviewed.checked ? { exceptionReviewed: true } : {}) }, admin: true }); closeDialog($('#manual-paid-dialog')); toast('人工核款已记录，请核对订单交付状态'); await Promise.all([refreshAdmin(), loadProducts()]); });
});
$('#fulfill-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => { await api(`/api/admin/redemptions/${encodeURIComponent(form.elements.redemptionId.value)}/fulfill`, { method: 'POST', body: { note: form.elements.note.value.trim() }, admin: true }); closeDialog($('#fulfill-dialog')); toast('履约记录已保存'); await refreshAdmin(); });
});
window.addEventListener('hashchange', route);

async function boot() {
  restoreCredentials();
  try { state.config = await api('/api/config'); applyMode(); }
  catch (error) { toast(`商店配置暂不可用：${error.message}`); }
  route(); await loadProducts();
}
boot();
