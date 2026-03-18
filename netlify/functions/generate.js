exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'GEMINI_API_KEY not set.' } })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: 'Invalid JSON body' } }) };
  }

  try {
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
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    const data = await response.json();

    // Detailed logging to diagnose parsing issues
    console.log('Status:', response.status);
    if (data.candidates && data.candidates[0]) {
      const parts = data.candidates[0].content && data.candidates[0].content.parts;
      console.log('Parts count:', parts ? parts.length : 0);
      if (parts) {
        parts.forEach((p, i) => {
          console.log(`Part[${i}] thought:${!!p.thought} textLen:${(p.text||'').length} preview:${(p.text||'').slice(0,120).replace(/\n/g,' ')}`);
        });
      }
      console.log('FinishReason:', data.candidates[0].finishReason);
    }
    if (data.error) {
      console.log('Error:', JSON.stringify(data.error).slice(0, 200));
    }

    // Extract the actual text response (skip thought parts)
    let responseText = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      const parts = data.candidates[0].content.parts;
      // Get last non-thought part
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!parts[i].thought && parts[i].text) {
          responseText = parts[i].text;
          break;
        }
      }
    }

    // Return in Anthropic-compatible format so the HTML doesn't need changes
    if (responseText) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          content: [{ type: 'text', text: responseText }]
        })
      };
    }

    // Fallback: return raw Gemini response
    return {
      statusCode: response.ok ? 200 : response.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };

  } catch (e) {
    console.log('Exception:', e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'Proxy error: ' + e.message } })
    };
  }
};
