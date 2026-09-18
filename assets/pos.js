/* PLA Forge POS console. Card collection deliberately lives in the native iPhone app. */
async function posPage() {
  const user = currentForgeUser();
  const productsHost = document.querySelector('#posProducts');
  const cartHost = document.querySelector('#posCartItems');
  const search = document.querySelector('#posSearch');
  const locationSelect = document.querySelector('#posLocation');
  const cart = new Map();
  let products = [];

  document.querySelector('#posUser').innerHTML = `<strong>${esc(user?.name || user?.email || 'Forge employee')}</strong><span>${esc(user?.role === 'admin' ? 'Administrator' : 'POS staff')}</span>`;
  function money(value) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0)); }
  function visibleProducts() {
    const query = String(search.value || '').trim().toLowerCase();
    return products.filter(p => !query || [p.name, p.sku, p.description].join(' ').toLowerCase().includes(query));
  }
  function renderProducts() {
    const rows = visibleProducts();
    productsHost.innerHTML = rows.length ? rows.map(p => {
      const price = Number(p.price || 0);
      return `<button class="pos-product${price <= 0 ? ' pos-product-unpriced' : ''}" data-sku="${esc(p.sku)}" ${price <= 0 ? 'disabled title="Set a price before selling this item"' : ''}><span class="pos-product-sku">${esc(p.sku)}</span><strong>${esc(p.name)}</strong><small>${price > 0 ? money(price) : 'Price not set'}</small></button>`;
    }).join('') : `<div class="pos-empty">No matching sale items.</div>`;
    productsHost.querySelectorAll('.pos-product').forEach(button => button.onclick = () => add(button.dataset.sku));
  }
  function renderCart() {
    const lines = Array.from(cart.values());
    const count = lines.reduce((sum, x) => sum + x.qty, 0);
    const total = lines.reduce((sum, x) => sum + x.qty * x.price, 0);
    cartHost.innerHTML = lines.length ? lines.map(x => `<div class="pos-cart-line"><div><strong>${esc(x.name)}</strong><small>${esc(x.sku)} · ${money(x.price)} each</small></div><div class="pos-quantity"><button aria-label="Remove one ${esc(x.name)}" data-action="remove" data-sku="${esc(x.sku)}">−</button><strong>${x.qty}</strong><button aria-label="Add one ${esc(x.name)}" data-action="add" data-sku="${esc(x.sku)}">+</button></div><strong>${money(x.price * x.qty)}</strong></div>`).join('') : '<div class="pos-empty">Choose an item to start a sale.</div>';
    cartHost.querySelectorAll('button').forEach(button => button.onclick = () => button.dataset.action === 'add' ? add(button.dataset.sku) : remove(button.dataset.sku));
    document.querySelector('#posItemsCount').textContent = String(count);
    document.querySelector('#posTotal').textContent = money(total);
    document.querySelector('#posPay').disabled = !count;
  }
  function add(sku) { const p = products.find(x => x.sku === sku); if (!p) return; const line = cart.get(sku) || { sku: p.sku, name: p.name, price: Number(p.price), qty: 0 }; line.qty++; cart.set(sku, line); renderCart(); }
  function remove(sku) { const line = cart.get(sku); if (!line) return; line.qty--; if (line.qty <= 0) cart.delete(sku); renderCart(); }
  search.addEventListener('input', renderProducts);
  document.querySelector('#posClear').onclick = () => { cart.clear(); renderCart(); };
  document.querySelector('#posPay').onclick = () => alert('This basket is ready for the PLA Forge POS iPhone app. The live Stripe payment step will appear here once the app and secure POS API are connected.');
  try {
    products = (await cloudCoreProducts()).filter(p => p.active && p.on_sale && Number(p.price || 0) > 0);
    renderProducts(); renderCart();
    if (!products.length) {
      const setup = document.querySelector('#posSetup'); setup.hidden = false;
      setup.innerHTML = '<strong>Products are not ready for POS yet.</strong> Mark products as on sale and give them a GBP price in the catalogue before taking payments.';
    }
  } catch (error) { productsHost.innerHTML = `<div class="pos-empty">Could not load the sale catalogue: ${esc(error.message)}</div>`; }
}
