export async function onRequestPost(context) {
  const GEMINI_API_KEY = context.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({
      error: { message: 'GEMINI_API_KEY not set.' }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), { status: 400 });
  }

  try {
    // gemini-2.5-flash is confirmed available in your API key's model list
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const maxTokens = Math.min((body.max_tokens || 1000) * 3, 8192);

    const geminiBody = {
      systemInstruction: {
        parts: [{ text: body.system || 'Du bist ein hilfreicher Assistent.' }]
      },
      contents: (body.messages || []).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: body.temperature || 0.9,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    const data = await response.json();

    // Extract text — skip thought parts
    let responseText = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      const parts = data.candidates[0].content.parts;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!parts[i].thought && parts[i].text) {
          responseText = parts[i].text;
          break;
        }
      }
    }

    // Return in Anthropic-compatible format
    if (responseText) {
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: responseText }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Pass through Gemini response (error etc)
    return new Response(JSON.stringify(data), {
      status: response.ok ? 200 : response.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: { message: 'Worker error: ' + e.message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
