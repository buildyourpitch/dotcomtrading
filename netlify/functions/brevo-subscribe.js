exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let email, tag;
  try {
    const body = JSON.parse(event.body || '{}');
    email = body.email;
    tag = body.tag || 'unspecified';
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valid email is required' }) };
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LIST_ID = process.env.BREVO_LIST_ID;

  if (!BREVO_API_KEY || !BREVO_LIST_ID) {
    console.error('Missing BREVO_API_KEY or BREVO_LIST_ID env vars');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        listIds: [parseInt(BREVO_LIST_ID, 10)],
        attributes: { SOURCE_TAG: tag },
        updateEnabled: true
      })
    });

    if (!response.ok && response.status !== 400) {
      const errText = await response.text();
      console.error('Brevo error:', response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Brevo subscription failed' }) };
    }

    // Send the matching welcome email right away (never blocks the signup)
    const WELCOME_TEMPLATES = {
      'workshop-october-17': 28,        // Oct 17 welcome: Zoom link + 100 AI Money Prompts
      'workshop-october-3-replay': 27   // Replay link + Oct 17 invite
    };
    const templateId = WELCOME_TEMPLATES[tag];
    if (templateId) {
      try {
        const sendRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
          body: JSON.stringify({ templateId, to: [{ email }] })
        });
        if (!sendRes.ok) console.error('Welcome email error:', sendRes.status, await sendRes.text());
      } catch (mailErr) {
        console.error('Welcome email failed:', mailErr);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('brevo-subscribe error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected server error' }) };
  }
};
