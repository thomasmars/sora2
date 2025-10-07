import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
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
} from './src/videos.js';

const DEFAULT_MODEL = process.env.SORA_DEFAULT_MODEL || 'sora-2';
const DEFAULT_SIZE = process.env.SORA_DEFAULT_SIZE || DEFAULT_VIDEO_SIZE;
const EXAMPLE_PROMPT = 'A cinematic slow-motion shot of glowing jellyfish floating through a neon coral reef.'; // Tweak this prompt to experiment.
const DEFAULT_DOWNLOAD_DIR = process.env.SORA_DOWNLOAD_DIR || path.join(process.cwd(), 'downloads');

function printUsage() {
  console.log(`Usage: node index.js <command> [options]\n\n` +
    `Commands:\n` +
    `  create [prompt...]        Create a new video using the provided prompt (or the example prompt).\n` +
    `  status <videoId>          Fetch the status/details for a specific video.\n` +
    `  list                      List all videos.\n` +
    `  download <videoId> [file] Download a finished video to the downloads directory (or a provided path).\n` +
    `  delete <videoId>          Delete a video by id.\n` +
    `  help                      Show this message.\n`);
}

async function handleCreate(args) {
  const prompt = args.length ? args.join(' ') : EXAMPLE_PROMPT;
  const payload = {
    model: DEFAULT_MODEL,
    prompt,
    size: DEFAULT_SIZE,
  };

  console.log('Submitting create video request with payload:');
  console.log(JSON.stringify(payload, null, 2));

  const response = await createVideo(payload);
  console.log('Create video response:');
  console.log(JSON.stringify(response, null, 2));
}

async function handleStatus(args) {
  const [videoId] = args;
  if (!videoId) {
    throw new Error('Missing required <videoId>.');
  }

  const response = await getVideo(videoId);
  console.log(`Video ${videoId}:`);
  console.log(JSON.stringify(response, null, 2));
}

async function handleList() {
  const response = await listVideos();
  console.log('Videos:');
  console.log(JSON.stringify(response, null, 2));
}

async function handleDownload(args) {
  const [videoId, fileArg] = args;
  if (!videoId) {
    throw new Error('Missing required <videoId>.');
  }

  const destination = fileArg || path.join(DEFAULT_DOWNLOAD_DIR, `${videoId}.mp4`);
  const savedPath = await downloadVideo(videoId, destination);
  console.log(`Video ${videoId} downloaded to ${savedPath}`);
}

async function handleDelete(args) {
  const [videoId] = args;
  if (!videoId) {
    throw new Error('Missing required <videoId>.');
  }

  await deleteVideo(videoId);
  console.log(`Video ${videoId} deleted.`);
}

async function runCLI() {
  const [, , command, ...args] = process.argv;

  switch ((command || '').toLowerCase()) {
    case 'create':
      await handleCreate(args);
      break;
    case 'status':
      await handleStatus(args);
      break;
    case 'list':
      await handleList();
      break;
    case 'download':
      await handleDownload(args);
      break;
    case 'delete':
      await handleDelete(args);
      break;
    case 'help':
    case '':
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exitCode = 1;
  }
}

const invokedFromCLI = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  const entryURL = pathToFileURL(path.resolve(entry)).href;
  return entryURL === import.meta.url;
})();

if (invokedFromCLI) {
  runCLI().catch((error) => {
    if (error instanceof OpenAIRequestError || error instanceof APIError) {
      console.error('OpenAI API error:', error.status);
      if (error.error) {
        console.error(JSON.stringify(error.error, null, 2));
      } else {
        console.error(error.message);
      }
    } else {
      console.error(error.message || error);
    }
    process.exitCode = 1;
  });
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
