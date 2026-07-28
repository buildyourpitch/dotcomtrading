const { getSupabaseClient } = require('./utils/supabaseClient');
const { calculateCurrentPrice, stateForPrice } = require('./utils/priceEngine');

exports.handler = async (event) => {
  const videoId = event.queryStringParameters && event.queryStringParameters.video_id;
  if (!videoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'video_id query param required' }) };
  }

  const supabase = getSupabaseClient();
  const { data: video, error } = await supabase.from('videos').select('*').eq('id', videoId).single();

  if (error || !video) {
    return { statusCode: 404, body: JSON.stringify({ error: 'video not found' }) };
  }

  const price = calculateCurrentPrice(video);
  const state = stateForPrice(price, video);

  // Persist the decayed price so future lookups don't have to replay every window from scratch.
  if (price !== Number(video.current_price)) {
    await supabase.from('videos').update({ current_price: price }).eq('id', videoId);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId, title: video.title, price, state })
  };
};
