const productGrid = document.querySelector("#product-grid");
const productCount = document.querySelector("#product-count");
const emptyState = document.querySelector("#empty-state");
const cartCount = document.querySelector("#cart-count");
const cartContent = document.querySelector("#cart-content");
const cartFooter = document.querySelector("#cart-footer");
const ordersContent = document.querySelector("#orders-content");
const overlay = document.querySelector("#overlay");
const cartPanel = document.querySelector("#cart-panel");
const ordersPanel = document.querySelector("#orders-panel");
const checkoutDialog = document.querySelector("#checkout-dialog");
const checkoutForm = document.querySelector("#checkout-form");
const checkoutError = document.querySelector("#checkout-error");
const toast = document.querySelector("#toast");

let products = [];
let activeCategory = "All";
let cart = readCart();
let adminToken = "";
let toastTimer;

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("creeperzon-cart") || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem("creeperzon-cart", JSON.stringify(cart));
  updateCartCount();
}

function formatPrice(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function visibleProducts() {
  const search = document.querySelector("#search-input").value.trim().toLowerCase();
  return products.filter((product) => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const matchesSearch = !search || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
}

function renderProducts() {
  const matches = visibleProducts();
  productCount.textContent = `${matches.length} ${matches.length === 1 ? "good find" : "good finds"}`;
  emptyState.hidden = matches.length > 0;
  productGrid.innerHTML = matches.map((product) => `
    <article class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
        ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}
        <button class="quick-add" type="button" data-add="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to bag">+</button>
      </div>
      <div class="product-info">
        <div class="product-meta"><span>${escapeHtml(product.category)}</span><span class="rating"><span aria-hidden="true">★</span> ${Number(product.rating).toFixed(1)}</span></div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description)}</p>
        <div class="product-buy"><span class="product-price">${formatPrice(product.price_cents)}</span><button type="button" data-add="${escapeHtml(product.id)}">Add to bag <span aria-hidden="true">↗</span></button></div>
      </div>
    </article>`).join("");
}

function cartLines() {
  return Object.entries(cart).map(([id, quantity]) => {
    const product = products.find((item) => item.id === id);
    return product && Number.isInteger(quantity) && quantity > 0 ? { product, quantity } : null;
  }).filter(Boolean);
}

function updateCartCount() {
  const count = cartLines().reduce((sum, line) => sum + line.quantity, 0);
  cartCount.textContent = String(count);
  cartCount.classList.toggle("has-items", count > 0);
}

function renderCart() {
  const lines = cartLines();
  if (!lines.length) {
    cartContent.innerHTML = `<div class="cart-empty"><span aria-hidden="true">♡</span><h3>Your bag is taking a breather.</h3><p>Add something lovely and it’ll show up here.</p><button class="text-button" type="button" data-close-panel>Keep exploring →</button></div>`;
    cartFooter.innerHTML = "";
    return;
  }
  cartContent.innerHTML = lines.map(({ product, quantity }) => `
    <article class="cart-line">
      <img src="${escapeHtml(product.image)}" alt="">
      <div class="cart-line-copy"><h3>${escapeHtml(product.name)}</h3><span>${formatPrice(product.price_cents)}</span>
        <div class="quantity-control"><button type="button" data-quantity="${escapeHtml(product.id)}" data-change="-1" aria-label="Remove one ${escapeHtml(product.name)}">−</button><span>${quantity}</span><button type="button" data-quantity="${escapeHtml(product.id)}" data-change="1" aria-label="Add one ${escapeHtml(product.name)}">+</button></div>
      </div><strong class="line-total">${formatPrice(product.price_cents * quantity)}</strong>
    </article>`).join("");
  const total = lines.reduce((sum, line) => sum + line.product.price_cents * line.quantity, 0);
  cartFooter.innerHTML = `<div class="subtotal"><span>Subtotal</span><strong>${formatPrice(total)}</strong></div><p>Delivery details come next. No payment collected.</p><button class="primary-button" id="checkout-button" type="button">Continue to checkout <span aria-hidden="true">→</span></button>`;
}

function openPanel(panel) {
  cartPanel.classList.remove("is-open");
  ordersPanel.classList.remove("is-open");
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
  document.body.classList.add("has-open-panel");
}

function closePanels() {
  cartPanel.classList.remove("is-open");
  ordersPanel.classList.remove("is-open");
  cartPanel.setAttribute("aria-hidden", "true");
  ordersPanel.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
  document.body.classList.remove("has-open-panel");
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("The shop couldn't load just now.");
    products = await response.json();
    cart = Object.fromEntries(Object.entries(cart).filter(([id]) => products.some((product) => product.id === id)));
    saveCart();
    renderProducts();
  } catch (error) {
    productGrid.innerHTML = `<div class="loading-state load-error">${escapeHtml(error.message)} Please refresh to try again.</div>`;
  }
}

async function loadOrders(token) {
  ordersContent.innerHTML = `<p class="orders-message">Loading incoming orders...</p>`;
  try {
    const response = await fetch("/api/admin/orders", { headers: { "X-Admin-Token": token } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Couldn't load the orders.");
    adminToken = token;
    renderOrders(result);
  } catch (error) {
    adminToken = "";
    ordersContent.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>${adminTokenForm()}`;
  }
}

function adminTokenForm() {
  return `<form class="admin-token-form" id="admin-token-form"><p>Enter your store admin token to see and update incoming orders.</p><label for="admin-token">Admin token</label><input id="admin-token" name="admin-token" type="password" autocomplete="current-password" required><button class="primary-button" type="submit">View orders <span aria-hidden="true">→</span></button><p class="form-hint">Set ADMIN_TOKEN in your Railway service variables.</p></form>`;
}

function renderOrders(orders) {
  if (!orders.length) {
    ordersContent.innerHTML = `<div class="orders-empty"><span aria-hidden="true">✳</span><h3>Nothing in the queue yet.</h3><p>New customer orders will show up here.</p></div>`;
    return;
  }
  ordersContent.innerHTML = `<div class="orders-summary">${orders.length} recent ${orders.length === 1 ? "order" : "orders"}</div>${orders.map((order) => `
    <article class="order-card">
      <div class="order-card-heading"><div><span class="order-number">ORDER #${order.id}</span><span class="order-date">${new Date(order.created_at).toLocaleString()}</span></div><span class="status-pill status-${escapeHtml(order.status.toLowerCase())}">${escapeHtml(order.status)}</span></div>
      <h3>${escapeHtml(order.customer_name)}</h3><a class="order-email" href="mailto:${escapeHtml(order.email)}">${escapeHtml(order.email)}</a>
      <p class="order-address">${escapeHtml(order.address)}</p>
      <ul class="order-items">${order.items.map((item) => `<li><span>${escapeHtml(item.product_name)} × ${item.quantity}</span><span>${formatPrice(item.unit_price_cents * item.quantity)}</span></li>`).join("")}</ul>
      <div class="order-total"><span>Order total</span><strong>${formatPrice(order.total_cents)}</strong></div>
      <label class="status-label" for="status-${order.id}">Update status</label>
      <select id="status-${order.id}" class="status-select" data-order-status="${order.id}">${["Pending", "Processing", "Shipped", "Cancelled"].map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
    </article>`).join("")}`;
}

document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  renderProducts();
  document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
});
document.querySelector("#search-input").addEventListener("input", renderProducts);
document.querySelectorAll(".category-link").forEach((button) => button.addEventListener("click", () => {
  activeCategory = button.dataset.category;
  document.querySelectorAll(".category-link").forEach((item) => item.classList.toggle("is-active", item === button));
  renderProducts();
}));
productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const id = button.dataset.add;
  cart[id] = Math.min(20, (cart[id] || 0) + 1);
  saveCart();
  showToast("Added to your bag — good choice.");
});
document.querySelector("#cart-button").addEventListener("click", () => {
  renderCart();
  openPanel(cartPanel);
});
document.querySelector("#orders-button").addEventListener("click", () => {
  openPanel(ordersPanel);
  ordersContent.innerHTML = adminToken ? `<p class="orders-message">Loading incoming orders...</p>` : adminTokenForm();
  if (adminToken) loadOrders(adminToken);
});
document.querySelectorAll(".close-panel").forEach((button) => button.addEventListener("click", closePanels));
overlay.addEventListener("click", closePanels);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePanels();
});

cartContent.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    const id = quantityButton.dataset.quantity;
    cart[id] = (cart[id] || 0) + Number(quantityButton.dataset.change);
    if (cart[id] <= 0) delete cart[id];
    saveCart();
    renderCart();
    return;
  }
  if (event.target.closest("[data-close-panel]")) closePanels();
  if (event.target.closest("#checkout-button")) {
    checkoutError.textContent = "";
    checkoutDialog.showModal();
  }
});

document.querySelector("#close-checkout").addEventListener("click", () => checkoutDialog.close());
checkoutDialog.addEventListener("click", (event) => {
  if (event.target === checkoutDialog) checkoutDialog.close();
});
checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  checkoutError.textContent = "";
  const button = document.querySelector("#place-order");
  button.disabled = true;
  button.innerHTML = "Placing your order...";
  const formData = new FormData(checkoutForm);
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: formData.get("customer_name"),
        email: formData.get("email"),
        address: formData.get("address"),
        items: cartLines().map(({ product, quantity }) => ({ product_id: product.id, quantity })),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Your order couldn't be placed.");
    cart = {};
    saveCart();
    checkoutForm.reset();
    checkoutDialog.close();
    closePanels();
    showToast(`Order #${result.id} is in — thanks for shopping with us!`);
  } catch (error) {
    checkoutError.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = `Place my order <span aria-hidden="true">→</span>`;
  }
});

ordersContent.addEventListener("submit", async (event) => {
  if (event.target.id !== "admin-token-form") return;
  event.preventDefault();
  const token = new FormData(event.target).get("admin-token");
  await loadOrders(String(token));
});
ordersContent.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-order-status]");
  if (!select || !adminToken) return;
  select.disabled = true;
  try {
    const response = await fetch(`/api/admin/orders/${select.dataset.orderStatus}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
      body: JSON.stringify({ status: select.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Couldn't update the order.");
    showToast(`Order #${result.id} updated to ${result.status}.`);
    await loadOrders(adminToken);
  } catch (error) {
    showToast(error.message);
    await loadOrders(adminToken);
  } finally {
    select.disabled = false;
  }
});

updateCartCount();
loadProducts();
