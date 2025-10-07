import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import express from 'express';
import multer from 'multer';

import {
  createVideo,
  listVideos,
  getVideo,
  deleteVideo,
  downloadVideoContent,
  createInputReferenceFromBuffer,
  getSizeRules,
  coerceSizeToSupported,
  DEFAULT_VIDEO_SIZE,
  SUPPORTED_INPUT_REFERENCE_MIME_TYPES,
  OpenAIRequestError,
  APIError,
} from './src/videos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });
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

app.post('/api/videos', upload.single('input_reference'), async (req, res, next) => {
  try {
    const { prompt, model, size, ...rest } = req.body ?? {};

    const promptText = typeof prompt === 'string' ? prompt.trim() : '';

    if (!promptText) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const sizeValue = typeof size === 'string' ? size.trim() : size;

    const payload = {
      prompt: promptText,
      size: sizeValue || process.env.SORA_DEFAULT_SIZE || DEFAULT_VIDEO_SIZE,
      ...rest,
    };

    if (payload.seconds !== undefined) {
      const parsedSeconds = Number(payload.seconds);
      if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
        payload.seconds = String(parsedSeconds);
      } else {
        delete payload.seconds;
      }
    }

    const modelValue = typeof model === 'string' ? model.trim() : model;

    if (modelValue) {
      payload.model = modelValue;
    } else {
      payload.model = process.env.SORA_DEFAULT_MODEL || 'sora-2';
    }

    const sizeRules = getSizeRules(payload.model);
    payload.size = coerceSizeToSupported(payload.size, sizeRules) || sizeRules[0]?.label || DEFAULT_VIDEO_SIZE;

    if (req.file && req.file.buffer && req.file.buffer.length) {
      const filename = req.file.originalname || req.file.fieldname || 'input-reference.bin';
      const providedType = normalizeMimeType(req.file.mimetype);

      if (
        providedType &&
        !SUPPORTED_INPUT_REFERENCE_MIME_TYPES.has(providedType)
      ) {
        return res.status(400).json({
          error: `Unsupported input_reference type "${providedType}". Supported types: ${Array.from(
            SUPPORTED_INPUT_REFERENCE_MIME_TYPES
          ).join(', ')}`,
        });
      }

      try {
        payload.input_reference = await createInputReferenceFromBuffer(
          req.file.buffer,
          filename,
          providedType,
          sizeRules
        );
        if (payload.input_reference?.sizeLabel) {
          payload.size = payload.input_reference.sizeLabel;
        }
      } catch (error) {
        return res.status(400).json({ error: error.message || 'Failed to process input reference.' });
      }
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

function normalizeMimeType(value) {
  if (!value || typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'application/octet-stream') {
    return undefined;
  }
  return trimmed;
}
