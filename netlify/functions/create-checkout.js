const Stripe = require('stripe');
const { getSupabaseClient } = require('./utils/supabaseClient');
const { calculateCurrentPrice } = require('./utils/priceEngine');

// Flat bundle price for "buy all 7 videos" — separate from the per-video dynamic pricing.
const BUNDLE_PRICE = 69;
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

  if (!video_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'video_id is required' }) };
  }

  const siteUrl = process.env.URL || 'https://dotcomtrading.netlify.app';
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  // ── BUNDLE PURCHASE: flat price, grants access to all 7 videos ──
  if (video_id === 'all-access') {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(BUNDLE_PRICE * 100),
              product_data: { name: 'Dotcom Trading Vault — All 7 Videos (Full Access)' }
            },
            quantity: 1
          }
        ],
        metadata: { video_id: 'all-access' },
        success_url: `${siteUrl}/access.html?video_id=all-access&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/#section-vault`
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: session.url })
      };
    } catch (err) {
      console.error('Stripe bundle checkout creation failed:', err);
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not create checkout session' }) };
    }
  }

  // ── SINGLE VIDEO PURCHASE: dynamic price ──
  const supabase = getSupabaseClient();
  const { data: video, error } = await supabase.from('videos').select('*').eq('id', video_id).single();

  if (error || !video) {
    return { statusCode: 404, body: JSON.stringify({ error: 'video not found' }) };
  }

  const price = calculateCurrentPrice(video);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(price * 100),
            product_data: { name: video.title }
          },
          quantity: 1
        }
      ],
      metadata: { video_id },
      success_url: `${siteUrl}/access.html?video_id=${encodeURIComponent(video_id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#section-vault`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('Stripe checkout creation failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not create checkout session' }) };
  }
};
