const Stripe = require('stripe');
const { getSupabaseClient } = require('./utils/supabaseClient');
const { calculateCurrentPrice } = require('./utils/priceEngine');

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

  const supabase = getSupabaseClient();
  const { data: video, error } = await supabase.from('videos').select('*').eq('id', video_id).single();

  if (error || !video) {
    return { statusCode: 404, body: JSON.stringify({ error: 'video not found' }) };
  }

  const price = calculateCurrentPrice(video);
  const siteUrl = process.env.URL || 'https://dotcomtrading.netlify.app';
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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
