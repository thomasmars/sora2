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
- `SORA_INPUT_REFERENCE` – optional path to a guide media file used by the CLI `create` command.
- `SORA_DOWNLOAD_DIR` – directory used when no download path is provided (defaults to `<project>/downloads`).
- Set `SORA_DEFAULT_MODEL=sora-2-pro` (or pass `--model sora-2-pro`) to enable cinematic/tall resolutions.

Supported `size` values: `1280x720`, `1792x1024`, `1024x1792`, `720x1280` (tall/wide variants require the `sora-2-pro` model).
Supported `input_reference` formats: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`.
Image guides are automatically cropped/resized to the closest supported resolution.

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
# Create using defaults
node index.js create

# Attach a guide file (env var or flag)
SORA_INPUT_REFERENCE=./guide.png node index.js create "A cyberpunk city at dawn"
node index.js create --file=./guide.png "A cyberpunk city at dawn"

node index.js status vid_123
node index.js download vid_123
# When a guide image is provided, the requested size automatically matches the image dimensions.
# Use `--model sora-2-pro` to access cinematic or tall resolutions.
```

### Web control panel

```bash
npm run serve
# open http://localhost:3000

# The Create Video form now accepts an optional reference file.
# Supported types: JPEG, PNG, WEBP images or MP4 video.
# If you upload an image, the requested size automatically matches the image dimensions.
```

## Using the helpers in code

```js
import {
  createVideo,
  listVideos,
  getVideo,
  deleteVideo,
  downloadVideo,
  createInputReferenceFromPath,
  APIError,
} from './index.js';

const run = async () => {
  try {
    const video = await createVideo({
      model: 'sora-2',
      size: '1280x720',
      input_reference: await createInputReferenceFromPath('./guide.png'),
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
- `createInputReferenceFromPath(filePath, sizeRules?)` – Loads a local file and returns an uploadable reference aligned to supported sizes.
- `createInputReferenceFromBuffer(buffer, filename?, mimeType?, sizeRules?)` – Wraps a buffer so it can be passed as `input_reference` while enforcing size/mime rules.
- `DEFAULT_VIDEO_SIZE` – Shared default size (`1280x720`).
- `MODEL_SIZE_RULES` – Map describing allowed output resolutions per model.
- `getSizeRules(model)` – Helper to fetch the allowed sizes for a given model.
- `coerceSizeToSupported(size, sizeRules?)` – Snaps an arbitrary size to the closest supported resolution.
- `SUPPORTED_INPUT_REFERENCE_MIME_TYPES` – Set of allowed MIME types for guide media.

Errors from the OpenAI client propagate as `APIError` (also exported as `OpenAIRequestError` for compatibility).
