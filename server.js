import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const ollama = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://localhost:11434/v1',
});

async function tryQwen(messages) {
  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'qwen/qwen3.6-plus:free',
    messages,
    stream: true,
    max_tokens: 4096,
  });

  return { type: 'qwen', stream };
}

async function tryOllama(messages) {
  const listRes = await ollama.models.list();
  const models = listRes.data || [];
  if (!models.length) throw new Error('No Ollama models pulled');
  const modelId = models[0].id;
  console.log(`Qwen failed, falling back to Ollama model: ${modelId}`);

  const stream = await ollama.chat.completions.create({
    model: modelId,
    messages,
    stream: true,
    max_tokens: 4096,
  });

  return { type: 'ollama', stream, model: modelId };
}

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  const messages = [
    ...(history || []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let result;
  try {
    result = await tryQwen(messages);
  } catch (qErr) {
    console.log('Qwen failed:', qErr.message);
    try {
      result = await tryOllama(messages);
    } catch (oErr) {
      console.log('Ollama also failed:', oErr.message);
      res.status(500).json({ error: `Qwen: ${qErr.message} | Ollama: ${oErr.message}` });
      return;
    }
  }

  try {
    for await (const chunk of result.stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      }
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`JEFF.AI on port ${PORT}`));
