const MODELS = [
  'qwen/qwen3.6-plus:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
  'google/gemma-3-27b-it:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];

export const maxDuration = 300;

async function tryModel(messages, index = 0) {
  if (index >= MODELS.length) {
    throw new Error('Todos os modelos falharam, tente novamente mais tarde');
  }

  const model = process.env.OPENAI_MODEL || MODELS[index];

  const res = await fetch(
    process.env.OPENAI_BASE_URL + '/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 4096,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.log(`Model ${model} failed (${res.status}):`, err.slice(0, 200));
    // Rate limit ou erro — tenta o próximo
    return tryModel(messages, index + 1);
  }

  return { stream: res.body, model };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { message, history } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const customModels = body.models || MODELS;
    const messages = [
      ...(history || []),
      { role: 'user', content: message },
    ];

    const { stream, model } = await tryStream(messages, customModels);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Model': model,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function tryStream(messages, models = MODELS, index = 0) {
  if (index >= models.length) {
    throw new Error('Todos os modelos falharam, tente novamente mais tarde');
  }

  const model = models[index];

  const res = await fetch(
    process.env.OPENAI_BASE_URL + '/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 4096,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.log(`[${model}] failed (${res.status}):`, errText.slice(0, 150));
    return tryStream(messages, models, index + 1);
  }

  console.log(`Using model: ${model}`);
  return { stream: res.body, model };
}
