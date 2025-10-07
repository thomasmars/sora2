import dotenv from 'dotenv';
import { promises as fs } from 'node:fs';
import path from 'node:path';
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

  if (!body.size) {
    body.size = DEFAULT_VIDEO_SIZE;
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

export {
  createVideo,
  listVideos,
  getVideo,
  deleteVideo,
  downloadVideo,
  downloadVideoBuffer,
  downloadVideoContent,
  DEFAULT_VIDEO_SIZE,
  OpenAIRequestError,
  APIError,
};
