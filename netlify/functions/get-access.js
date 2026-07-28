const { getSupabaseClient } = require('./utils/supabaseClient');

exports.handler = async (event) => {
  const { video_id, email } = event.queryStringParameters || {};

  if (!video_id || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'video_id and email are required' }) };
  }

  const supabase = getSupabaseClient();

  const { data: accessRow } = await supabase
    .from('access')
    .select('*')
    .eq('video_id', video_id)
    .eq('buyer_email', email)
    .maybeSingle();

  if (!accessRow) {
    return { statusCode: 403, body: JSON.stringify({ error: 'No access found for this email on this video' }) };
  }

  const { data: video, error } = await supabase.from('videos').select('title, loom_url').eq('id', video_id).single();

  if (error || !video || !video.loom_url) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Video not found or not yet configured' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: video.title, loom_url: video.loom_url })
  };
};
