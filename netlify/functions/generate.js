exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: { message: 'GEMINI_API_KEY not set.' }
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: 'Invalid JSON body' } }) };
  }

  // Try models in order of preference — fall back if one fails
  const MODELS = [
    'gemini-2.5-pro-preview-03-25',
    'gemini-2.0-flash',
    'gemini-1.5-pro'
  ];

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
    }
  };

  let lastError = null;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      });

      const data = await response.json();

      // If model not found or not available, try next
      if (data.error && (data.error.status === 'NOT_FOUND' || data.error.status === 'INVALID_ARGUMENT' || data.error.code === 404)) {
        lastError = data.error;
        continue;
      }

      // Return whatever we got (success or other error)
      return {
        statusCode: response.ok ? 200 : response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Model-Used': model
        },
        body: JSON.stringify(data)
      };

    } catch (e) {
      lastError = { message: e.message };
      continue;
    }
  }

  // All models failed
  return {
    statusCode: 500,
    body: JSON.stringify({ error: lastError || { message: 'All models failed' } })
  };
};
