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
    // Convert Anthropic-style request to Gemini format
    const model = 'gemini-1.5-pro';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    // Build Gemini request
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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    const data = await response.json();

    // Handle Gemini errors
    if (data.error) {
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: data.error })
      };
    }

    // Return Gemini response as-is (HTML extractText() handles Gemini format)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'Proxy error: ' + e.message } })
    };
  }
};
