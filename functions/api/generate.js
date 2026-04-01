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
    // ── TTS mode ─────────────────────────────────────────────────────────────
    if (body.mode === 'tts') {
      const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;

      let speechConfig;

      if (body.speakers && body.speakers.length === 2) {
        // Multi-speaker mode (HV2 interview)
        speechConfig = {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: body.speakers.map(s => ({
              speaker: s.name,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } }
            }))
          }
        };
      } else {
        // Single speaker mode
        speechConfig = {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: body.voice || 'Kore' }
          }
        };
      }

      const ttsBody = {
        contents: [{ parts: [{ text: body.text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: speechConfig
        }
      };

      const response = await fetch(ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsBody)
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        return new Response(JSON.stringify({ error: data.error || { message: 'TTS failed' } }), {
          status: response.ok ? 500 : response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Extract base64 PCM audio
      const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/pcm';

      if (!audioData) {
        return new Response(JSON.stringify({ error: { message: 'No audio data in response' } }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ audioData, mimeType }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── Text generation mode (default) ───────────────────────────────────────
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const maxTokens = 65536;

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

    let responseText = '';
    if (data.candidates?.[0]?.content?.parts) {
      const parts = data.candidates[0].content.parts;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!parts[i].thought && parts[i].text) {
          responseText = parts[i].text;
          break;
        }
      }
    }

    if (responseText) {
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: responseText }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify(data), {
      status: response.ok ? 200 : response.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: { message: 'Worker error: ' + e.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
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
