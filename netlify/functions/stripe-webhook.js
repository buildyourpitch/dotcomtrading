const Stripe = require('stripe');
const { getSupabaseClient } = require('./utils/supabaseClient');

const TICK_UP_RATE = 0.08;
const BUNDLE_VIDEO_IDS = ['wfc-zones', 'wfc-live', 'options-pnl', 'options-chains', 'candle-formation', 'bull-pennant', 'wfc-zones-2'];

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const buyer_email = session.customer_details ? session.customer_details.email : null;
    const price_paid = (session.amount_total || 0) / 100;
    const supabase = getSupabaseClient();

    if (session.metadata && session.metadata.type === 'oneonone') {
      // 1:1 session purchase — no video, no dynamic pricing. Just log it so it can be scheduled manually.
      if (buyer_email) {
        await supabase.from('oneonone_bookings').insert({
          buyer_email,
          price_paid,
          stripe_session_id: session.id
        });
      } else {
        console.error('1:1 webhook missing buyer_email on session', session.id);
      }
    } else {
      const video_id = session.metadata && session.metadata.video_id;

      if (!video_id || !buyer_email) {
        console.error('Webhook missing video_id or buyer_email on session', session.id);
      } else if (video_id === 'all-access') {
        // Bundle purchase — grant access to all 7 videos, record one sale row. Doesn't affect
        // individual video dynamic pricing (that only ticks up on single-video purchases).
        await supabase.from('sales').insert({
          video_id: 'all-access',
          buyer_email,
          price_paid,
          stripe_session_id: session.id
        });

        const accessRows = BUNDLE_VIDEO_IDS.map((id) => ({ video_id: id, buyer_email }));
        await supabase.from('access').insert(accessRows);
      } else {
        await supabase.from('sales').insert({
          video_id,
          buyer_email,
          price_paid,
          stripe_session_id: session.id
        });

        await supabase.from('access').insert({ video_id, buyer_email });

        const { data: video } = await supabase.from('videos').select('*').eq('id', video_id).single();
        if (video) {
          const newPrice = Math.min(
            video.ceiling_price,
            Math.round(Number(video.current_price) * (1 + TICK_UP_RATE) * 100) / 100
          );
          await supabase
            .from('videos')
            .update({ current_price: newPrice, last_sale_at: new Date().toISOString() })
            .eq('id', video_id);
        }
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
