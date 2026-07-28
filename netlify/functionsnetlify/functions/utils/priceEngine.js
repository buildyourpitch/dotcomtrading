// Pricing formula (from Dotcom_Trading_Dynamic_Video_Store_Plan.md):
//   +8% per sale in a 15-min window (applied in stripe-webhook.js)
//   -5% per fully elapsed window with no sales (applied lazily here)
//   Floor $9 / Ceiling $49

const WINDOW_MS = 15 * 60 * 1000;
const DECAY_RATE = 0.05;

// Recalculates what the price SHOULD be right now, decaying it for every
// full window that's passed since the last sale (or since creation, if never sold).
function calculateCurrentPrice(video) {
  const now = Date.now();
  const lastActivity = video.last_sale_at
    ? new Date(video.last_sale_at).getTime()
    : new Date(video.created_at).getTime();

  const windowsElapsed = Math.floor((now - lastActivity) / WINDOW_MS);
  let price = Number(video.current_price);

  if (windowsElapsed > 0) {
    price = price * Math.pow(1 - DECAY_RATE, windowsElapsed);
  }

  price = Math.max(video.floor_price, Math.min(video.ceiling_price, price));
  return Math.round(price * 100) / 100;
}

// Maps price position between floor/ceiling to a UI state label.
function stateForPrice(price, video) {
  const range = video.ceiling_price - video.floor_price;
  const position = range > 0 ? (price - video.floor_price) / range : 0;
  if (position < 0.33) return 'accumulation';
  if (position < 0.7) return 'breakout';
  return 'distribution';
}

module.exports = { calculateCurrentPrice, stateForPrice, WINDOW_MS, DECAY_RATE };
