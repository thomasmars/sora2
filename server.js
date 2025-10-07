import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import express from 'express';

import {
  createVideo,
  listVideos,
  getVideo,
  deleteVideo,
  downloadVideoContent,
  DEFAULT_VIDEO_SIZE,
  OpenAIRequestError,
  APIError,
} from './src/videos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/videos', async (req, res, next) => {
  try {
    const query = { ...req.query };
    const videos = await listVideos(query);
    res.json(videos);
  } catch (error) {
    next(error);
  }
});

app.post('/api/videos', async (req, res, next) => {
  try {
    const { prompt, model, size, ...rest } = req.body ?? {};

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const payload = {
      prompt,
      size: size || process.env.SORA_DEFAULT_SIZE || DEFAULT_VIDEO_SIZE,
      ...rest,
    };

    if (model) {
      payload.model = model;
    } else {
      payload.model = process.env.SORA_DEFAULT_MODEL || 'sora-2';
    }

    if (!payload.size) {
      payload.size = DEFAULT_VIDEO_SIZE;
    }

    const response = await createVideo(payload);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

app.get('/api/videos/:id', async (req, res, next) => {
  try {
    const video = await getVideo(req.params.id);
    res.json(video);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/videos/:id', async (req, res, next) => {
  try {
    await deleteVideo(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/videos/:id/download', async (req, res, next) => {
  try {
    const response = await downloadVideoContent(req.params.id);
    const filename = `${req.params.id}.mp4`;
    const contentType = response?.headers?.get('content-type') || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    if (!response?.headers?.get('content-disposition')) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    if (response?.body) {
      const stream = typeof response.body.getReader === 'function'
        ? Readable.fromWeb(response.body)
        : response.body;

      stream.on('error', next);
      stream.pipe(res);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    }
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof OpenAIRequestError || error instanceof APIError) {
    const status = error.status ?? 500;
    res.status(status).json({
      error: error.message,
      details: error.error ?? error.details ?? null,
    });
    return;
  }

  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'Invalid JSON payload.' });
    return;
  }

  res.status(500).json({ error: error?.message || 'Unknown server error.' });
});

app.listen(PORT, () => {
  console.log(`Sora2 control panel available at http://localhost:${PORT}`);
});
