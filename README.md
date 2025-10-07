# Sora2 Video API Helpers

Utility functions and lightweight commands for working with OpenAI's Sora2 video endpoints via the official `openai` Node SDK. Load your API key from a `.env` file, edit the sample prompt, and run the provided commands to create and manage videos.

## Setup

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Remove any existing `node_modules` folder and `package-lock.json` to ensure a clean install.
3. Install dependencies: `npm install`.
4. Use Node.js 18+ so that the global `fetch` API is available (needed by the OpenAI SDK).

Optional environment variables:

- `OPENAI_API_BASE_URL` – override the API base (default `https://api.openai.com/v1`).
- `OPENAI_BETA_HEADER` – set if OpenAI requires a beta header (value from the docs).
- `SORA_DEFAULT_MODEL` – default model used by the CLI `create` command (defaults to `sora-2`).
- `SORA_DEFAULT_SIZE` – default video size used when one is not provided (defaults to `1280x720`).
- `SORA_DOWNLOAD_DIR` – directory used when no download path is provided (defaults to `<project>/downloads`).

## Commands

The project exposes a small CLI backed by the OpenAI client. Update the `EXAMPLE_PROMPT` constant in `index.js` to try new prompts, or provide a prompt inline when running the command.

```
node index.js help
```

Available commands:

- `node index.js create [prompt...]` – Create a video with the provided prompt or the example prompt in `index.js`.
- `node index.js status <videoId>` – Fetch status/details for a video.
- `node index.js list` – List all videos.
- `node index.js download <videoId> [file]` – Download a video to `downloads/<id>.mp4` (or a custom file path).
- `node index.js delete <videoId>` – Delete a video.

### CLI workflow

```
node index.js create
node index.js status vid_123
node index.js download vid_123
```

### Web control panel

```bash
npm run serve
# open http://localhost:3000
```

## Using the helpers in code

```js
import {
  createVideo,
  listVideos,
  getVideo,
  deleteVideo,
  downloadVideo,
  APIError,
} from './index.js';

const run = async () => {
  try {
    const video = await createVideo({
      model: 'sora-2',
      size: '1280x720',
      prompt: 'A serene sunrise over rolling hills in spring',
    });
    console.log('Created video:', video);

    const status = await getVideo(video.id);
    console.log('Video status:', status);

    await downloadVideo(video.id, `downloads/${video.id}.mp4`);
    console.log('Downloaded video file.');
  } catch (error) {
    if (error instanceof APIError) {
      console.error('OpenAI API error:', error.status, error.message);
    } else {
      console.error('Unexpected error:', error);
    }
  }
};

run();
```

Each helper accepts an optional `signal` in the options object if you need abort control.

## Functions

- `createVideo(payload, options?)` – Calls `openai.videos.create` with your generation payload.
- `listVideos(options?)` – Calls `openai.videos.list`.
- `getVideo(videoId, options?)` – Calls `openai.videos.retrieve` for status/details.
- `deleteVideo(videoId, options?)` – Calls `openai.videos.delete`.
- `downloadVideo(videoId, destination, options?)` – Fetches `openai.videos.downloadContent` and saves the file locally.

Errors from the OpenAI client propagate as `APIError` (also exported as `OpenAIRequestError` for compatibility).
# sora2
