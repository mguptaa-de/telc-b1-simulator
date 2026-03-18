exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: { message: 'GEMINI_API_KEY not set. Add it in Netlify → Site configuration → Environment variables.' }
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: 'Invalid JSON body' } }) };
  }

  try {
    // gemini-3.1-pro-preview — requires billing enabled
    const model = 'gemini-3.1-pro-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiBody = {
      systemInstruction: {
        parts: [{ text: body.system || 'Du bist ein hilfreicher Assistent.' }]
      },
      contents: (body.messages || []).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      generationConfig: {
        maxOutputTokens: body.max_tokens || 1000,
        temperature: body.temperature || 0.9
        // No thinkingConfig — model decides automatically when billing is active
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    const data = await response.json();

    console.log('Model:', model, 'Status:', response.status);
    if (data.error) {
      console.log('Gemini error:', JSON.stringify(data.error).slice(0, 300));
    }

    return {
      statusCode: response.ok ? 200 : response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };

  } catch (e) {
    console.log('Proxy exception:', e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'Proxy error: ' + e.message } })
    };
  }
};
