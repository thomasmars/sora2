import dotenv from 'dotenv';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import imageSize from 'image-size';
import sharp from 'sharp';
import OpenAI from 'openai';

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable. Set it in your .env file.');
}

const clientOptions = {
  apiKey: API_KEY,
};

if (process.env.OPENAI_API_BASE_URL) {
  clientOptions.baseURL = process.env.OPENAI_API_BASE_URL;
}

if (process.env.OPENAI_BETA_HEADER) {
  clientOptions.defaultHeaders = {
    ...clientOptions.defaultHeaders,
    'OpenAI-Beta': process.env.OPENAI_BETA_HEADER,
  };
}

const client = new OpenAI(clientOptions);
const videos = client.videos;
const { APIError } = OpenAI;
const OpenAIRequestError = APIError;
const DEFAULT_VIDEO_SIZE = process.env.SORA_DEFAULT_SIZE || '1280x720';
const MODEL_SIZE_RULES = {
  'sora-2': [
    { label: '1280x720', width: 1280, height: 720 },
    { label: '720x1280', width: 720, height: 1280 },
  ],
  'sora-2-pro': [
    { label: '1280x720', width: 1280, height: 720 },
    { label: '720x1280', width: 720, height: 1280 },
    { label: '1024x1792', width: 1024, height: 1792 },
    { label: '1792x1024', width: 1792, height: 1024 },
  ],
};
const DEFAULT_SIZE_RULES = MODEL_SIZE_RULES['sora-2'];

function getSizeRules(model) {
  return MODEL_SIZE_RULES[model] || DEFAULT_SIZE_RULES;
}
const SUPPORTED_INPUT_REFERENCE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]);

function buildOptions(options = {}) {
  const requestOptions = {};

  if (options.signal) {
    requestOptions.signal = options.signal;
  }

  if (options.headers) {
    requestOptions.headers = options.headers;
  }

  return Object.keys(requestOptions).length ? requestOptions : undefined;
}

async function createVideo(payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('createVideo expects a payload object.');
  }

  const body = { ...payload };
  const model = body.model || 'sora-2';
  const sizeRules = getSizeRules(model);
  let referenceMeta;

  if (body.input_reference_path) {
    referenceMeta = await createInputReferenceFromPath(body.input_reference_path, sizeRules);
    body.input_reference = referenceMeta.file;
    delete body.input_reference_path;
  } else if (body.input_reference && body.input_reference.file) {
    referenceMeta = body.input_reference;
    body.input_reference = referenceMeta.file;
  }

  if (referenceMeta?.sizeLabel) {
    body.size = referenceMeta.sizeLabel;
  } else if (body.size) {
    body.size = coerceSizeToSupported(body.size, sizeRules) || sizeRules[0]?.label || DEFAULT_VIDEO_SIZE;
  } else {
    body.size = sizeRules[0]?.label || DEFAULT_VIDEO_SIZE;
  }

  return videos.create(body, buildOptions(options));
}

async function listVideos(query = {}, options = {}) {
  const requestOptions = buildOptions(options);
  if (requestOptions) {
    return videos.list(query, requestOptions);
  }
  return videos.list(query);
}

async function getVideo(videoId, options = {}) {
  if (!videoId) {
    throw new TypeError('getVideo requires a videoId.');
  }

  return videos.retrieve(videoId, buildOptions(options));
}

async function deleteVideo(videoId, options = {}) {
  if (!videoId) {
    throw new TypeError('deleteVideo requires a videoId.');
  }

  return videos.delete(videoId, buildOptions(options));
}

async function resourceToBuffer(resource) {
  if (!resource) {
    throw new Error('No data returned from OpenAI when downloading video.');
  }

  if (Buffer.isBuffer(resource)) {
    return resource;
  }

  if (resource instanceof Uint8Array) {
    return Buffer.from(resource);
  }

  if (typeof resource.arrayBuffer === 'function') {
    const arrayBuffer = await resource.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (resource.data) {
    const { data } = resource;

    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    }

    if (typeof data === 'string') {
      return Buffer.from(data, 'base64');
    }

    if (typeof data.arrayBuffer === 'function') {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  throw new Error('Unsupported download response from OpenAI client.');
}

function sanitizeVideoId(videoId) {
  if (!videoId) {
    throw new TypeError('A videoId is required.');
  }

  return videoId;
}

async function fetchVideoContent(videoId, options = {}) {
  const id = sanitizeVideoId(videoId);
  return videos.downloadContent(id, undefined, buildOptions(options));
}

async function downloadVideoBuffer(videoId, options = {}) {
  const response = await fetchVideoContent(videoId, options);
  return resourceToBuffer(response);
}

async function downloadVideo(videoId, destination, options = {}) {
  if (!videoId) {
    throw new TypeError('downloadVideo requires a videoId.');
  }

  if (!destination) {
    throw new TypeError('downloadVideo requires a destination file path.');
  }

  const absoluteDestination = path.resolve(destination);
  const buffer = await downloadVideoBuffer(videoId, options);

  await fs.mkdir(path.dirname(absoluteDestination), { recursive: true });
  await fs.writeFile(absoluteDestination, buffer);

  return absoluteDestination;
}

async function downloadVideoContent(videoId, options = {}) {
  return fetchVideoContent(videoId, options);
}

async function createInputReferenceFromPath(filePath, sizeRules = DEFAULT_SIZE_RULES) {
  if (!filePath) {
    return undefined;
  }

  const absolutePath = path.resolve(filePath);
  const data = await fs.readFile(absolutePath);
  const filename = path.basename(absolutePath);
  return buildInputReference(data, filename, undefined, sizeRules);
}

async function createInputReferenceFromBuffer(buffer, filename = 'input-reference.bin', mimeType, sizeRules = DEFAULT_SIZE_RULES) {
  if (!buffer) {
    return undefined;
  }

  const resolvedName = filename || 'input-reference.bin';
  return buildInputReference(buffer, resolvedName, mimeType, sizeRules);
}

async function buildInputReference(data, filename, explicitMimeType, sizeRules = DEFAULT_SIZE_RULES) {
  const inferredMime = inferMimeType(filename, explicitMimeType);
  const mimeType = ensureSupportedMimeType(inferredMime, filename);
  const alignment = await alignBufferToSupportedSize(data, mimeType, sizeRules);
  const file = await OpenAI.toFile(alignment.buffer, filename, { type: mimeType });
  return { file, mimeType, sizeLabel: alignment.sizeLabel };
}

async function alignBufferToSupportedSize(buffer, mimeType, sizeRules = DEFAULT_SIZE_RULES) {
  if (!isImageMimeType(mimeType) || !sizeRules || !sizeRules.length) {
    return { buffer, sizeLabel: undefined };
  }

  const baseDimensions = getImageDimensions(buffer);
  if (!baseDimensions) {
    return { buffer, sizeLabel: undefined };
  }

  const targetSize = chooseSupportedVideoSize(baseDimensions.width, baseDimensions.height, sizeRules);
  if (!targetSize) {
    return { buffer, sizeLabel: undefined };
  }

  if (targetSize.width === baseDimensions.width && targetSize.height === baseDimensions.height) {
    return { buffer, sizeLabel: targetSize.label };
  }

  const format = mimeTypeToSharpFormat(mimeType);
  let pipeline = sharp(buffer).resize(targetSize.width, targetSize.height, { fit: 'cover' });
  if (format) {
    pipeline = pipeline.toFormat(format);
  }
  const resized = await pipeline.toBuffer();
  return { buffer: resized, sizeLabel: targetSize.label };
}

function getImageDimensions(buffer) {
  try {
    const { width, height } = imageSize(buffer);
    if (width && height) {
      return { width, height };
    }
  } catch (_error) {
    // Ignore and fall back to default handling
  }
  return undefined;
}

function chooseSupportedVideoSize(width, height, sizeRules = DEFAULT_SIZE_RULES) {
  if (!width || !height || !sizeRules || !sizeRules.length) {
    return undefined;
  }

  const isLandscape = width >= height;
  const ratio = width / height;
  const candidates = sizeRules.filter((size) => (size.width >= size.height) === isLandscape);
  const pool = candidates.length ? candidates : sizeRules;

  let best = pool[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const size of pool) {
    const sizeRatio = size.width / size.height;
    const diff = Math.abs(sizeRatio - ratio);
    if (diff < bestScore) {
      best = size;
      bestScore = diff;
    }
  }

  return best;
}

function coerceSizeToSupported(size, sizeRules = DEFAULT_SIZE_RULES) {
  if (!sizeRules || !sizeRules.length || !size) {
    return size;
  }

  const normalized = normalizeSizeLabel(size);
  const directMatch = sizeRules.find((rule) => rule.label === normalized);
  if (directMatch) {
    return directMatch.label;
  }

  const match = normalized.match(/^(\d+)x(\d+)$/);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      const candidate = chooseSupportedVideoSize(width, height, sizeRules);
      if (candidate) {
        return candidate.label;
      }
    }
  }

  return sizeRules[0]?.label;
}

function normalizeSizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9x]/g, '')
    .replace(/x+/, 'x');
}

function mimeTypeToSharpFormat(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpeg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return undefined;
  }
}

function isImageMimeType(mimeType) {
  return typeof mimeType === 'string' && mimeType.startsWith('image/');
}

function inferMimeType(filename, fallbackMimeType) {
  if (fallbackMimeType && typeof fallbackMimeType === 'string' && fallbackMimeType.trim()) {
    const normalized = fallbackMimeType.trim().toLowerCase();
    if (SUPPORTED_INPUT_REFERENCE_MIME_TYPES.has(normalized)) {
      return normalized;
    }
  }

  const ext = path.extname(filename || '').toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    default:
      return fallbackMimeType || undefined;
  }
}

function ensureSupportedMimeType(mimeType, filename) {
  const normalized = (mimeType || '').trim().toLowerCase();
  if (!SUPPORTED_INPUT_REFERENCE_MIME_TYPES.has(normalized)) {
    const supported = Array.from(SUPPORTED_INPUT_REFERENCE_MIME_TYPES).join(', ');
    throw new Error(
      `Unsupported input_reference file type${
        filename ? ` for "${filename}"` : ''
      }. Supported types: ${supported}.`
    );
  }
  return normalized;
}

export {
  createVideo,
  listVideos,
  getVideo,
  deleteVideo,
  downloadVideo,
  downloadVideoBuffer,
  downloadVideoContent,
  createInputReferenceFromPath,
  createInputReferenceFromBuffer,
  DEFAULT_VIDEO_SIZE,
  MODEL_SIZE_RULES,
  getSizeRules,
  coerceSizeToSupported,
  SUPPORTED_INPUT_REFERENCE_MIME_TYPES,
  OpenAIRequestError,
  APIError,
};
