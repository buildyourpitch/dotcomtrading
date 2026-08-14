const Stripe = require('stripe');

// Flat price to unlock the full roadmap (steps 3-9). Individual per-video dynamic
// pricing has been retired — this is now the only paid checkout for the roadmap content.
// $8.18 = birthday sale price.
const ROADMAP_UNLOCK_PRICE = 8.18;
const BUNDLE_VIDEO_IDS = ['wfc-zones', 'wfc-live', 'options-pnl', 'options-chains', 'candle-formation', 'bull-pennant', 'wfc-zones-2'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let video_id;
  try {
    ({ video_id } = JSON.parse(event.body || '{}'));
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (video_id !== 'all-access') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Only the full roadmap unlock is available — individual video purchases have been retired.' }) };
  }

  const siteUrl = process.env.URL || 'https://dotcomtrading.netlify.app';
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(ROADMAP_UNLOCK_PRICE * 100),
            product_data: { name: 'Dotcom Trading — Full Roadmap Unlock (7 Videos)' }
          },
          quantity: 1
        }
      ],
      metadata: { video_id: 'all-access' },
      success_url: `${siteUrl}/index.html?unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#section-roadmap`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('Stripe roadmap checkout creation failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not create checkout session' }) };
  }
};
