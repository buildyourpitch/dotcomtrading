const Stripe = require('stripe');
const { getSupabaseClient } = require('./utils/supabaseClient');

const TICK_UP_RATE = 0.08;

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
    const video_id = session.metadata && session.metadata.video_id;
    const buyer_email = session.customer_details ? session.customer_details.email : null;
    const price_paid = (session.amount_total || 0) / 100;

    if (video_id && buyer_email) {
      const supabase = getSupabaseClient();

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
    } else {
      console.error('Webhook missing video_id or buyer_email on session', session.id);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
