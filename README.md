# SORA Test App

This app is for testing our SORA video generation integration. It provides a simple web UI (and an optional CLI) to create, monitor, and download videos via the official `openai` Node SDK.

## Setup

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Install dependencies: `npm install`.
3. Start the server: `npm run serve` then open `http://localhost:3000`.

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

## CLI (optional)

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
