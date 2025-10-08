const createForm = document.querySelector('#create-form');
const createResult = document.querySelector('#create-result');
const refreshBtn = document.querySelector('#refresh-btn');
const videosTableBody = document.querySelector('#videos-table tbody');
const details = document.querySelector('#details');
const envIndicator = document.querySelector('#env-indicator');

const DEFAULT_SIZE = '1280x720';
let isRefreshing = false;
let autoRefreshTimer = null;

function showJson(element, payload) {
  if (!element) return;
  if (payload === undefined || payload === null) {
    element.hidden = true;
    element.textContent = '';
    return;
  }

  element.hidden = false;
  element.textContent = JSON.stringify(payload, null, 2);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function apiRequest(input, init) {
  const response = await fetch(input, init);
  const payload = await parseResponse(response);

  if (!response.ok) {
    const error = new Error('Request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function resolveStatus(video) {
  return (
    video?.status ||
    video?.processing?.state ||
    video?.metadata?.status ||
    'unknown'
  );
}

function resolveModel(video) {
  return video?.model || video?.metadata?.model || '–';
}

function resolveProgress(video) {
  const candidates = [
    video?.progress,
    video?.processing?.progress,
    video?.metadata?.progress,
    video?.progress_percent,
    video?.progressPercent,
  ];

  let value;
  for (const c of candidates) {
    if (c === undefined || c === null || c === '') continue;
    value = c;
    break;
  }

  if (value === undefined) return undefined;

  // Normalize variants: "72%", "0.72", 0.72, 72
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+(?:\.\d+)?%$/.test(trimmed)) {
      value = parseFloat(trimmed.replace('%', ''));
    } else if (/^\d*(?:\.\d+)?$/.test(trimmed)) {
      value = parseFloat(trimmed);
    }
  }

  if (typeof value === 'number' && isFinite(value)) {
    // If looks like 0..1, convert to percent
    if (value <= 1) value = value * 100;
    // Clamp
    value = Math.max(0, Math.min(100, value));
    // Round to 1 decimal if needed
    return Math.round(value * 10) / 10;
  }

  return undefined;
}

function resolveCreated(video) {
  const ts = video?.created_at ?? video?.created ?? video?.createdAt;
  if (ts === undefined || ts === null || ts === '') return '–';

  try {
    // Handle numeric epoch seconds vs. milliseconds and numeric strings
    if (typeof ts === 'number' || (typeof ts === 'string' && /^\d+$/.test(ts))) {
      let n = Number(ts);
      if (Number.isFinite(n)) {
        if (n < 1e12) n *= 1000; // likely seconds → ms
        const d = new Date(n);
        if (!isNaN(d.getTime())) return d.toLocaleString();
      }
    }

    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch (_error) {
    // fall through
  }

  return String(ts);
}

function renderVideos(videos = []) {
  videosTableBody.innerHTML = '';

  if (!videos.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No videos found yet. Generate one to get started.';
    cell.style.textAlign = 'center';
    row.appendChild(cell);
    videosTableBody.appendChild(row);
    return;
  }

  videos.forEach((video) => {
    const row = document.createElement('tr');

    const idCell = document.createElement('td');
    idCell.className = 'video-id';

    const fullId = video.id || 'unknown';
    const truncatedId = fullId.length > 5 ? `…${fullId.slice(-5)}` : fullId;

    const idButton = document.createElement('button');
    idButton.type = 'button';
    idButton.className = 'id-toggle';
    idButton.textContent = truncatedId;
    idButton.dataset.state = 'short';
    idButton.addEventListener('click', () => {
      const showingShort = idButton.dataset.state === 'short';
      idButton.textContent = showingShort ? fullId : truncatedId;
      idButton.dataset.state = showingShort ? 'full' : 'short';
    });

    idCell.appendChild(idButton);
    row.appendChild(idCell);

    const statusCell = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = 'status-pill';
    statusPill.textContent = resolveStatus(video);
    statusCell.appendChild(statusPill);
    row.appendChild(statusCell);

    const progressCell = document.createElement('td');
    const progress = resolveProgress(video);
    if (typeof progress === 'number') {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';

      const track = document.createElement('div');
      track.className = 'progress';
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = `${progress}%`;
      track.appendChild(bar);

      const label = document.createElement('span');
      label.className = 'progress-label';
      label.textContent = `${progress}%`;

      wrapper.appendChild(track);
      wrapper.appendChild(label);
      progressCell.appendChild(wrapper);
    } else {
      progressCell.textContent = '–';
    }
    row.appendChild(progressCell);

    const modelCell = document.createElement('td');
    modelCell.textContent = resolveModel(video);
    row.appendChild(modelCell);

    const createdCell = document.createElement('td');
    createdCell.textContent = resolveCreated(video);
    row.appendChild(createdCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const inspectButton = document.createElement('button');
    inspectButton.type = 'button';
    inspectButton.textContent = 'Inspect';
    inspectButton.addEventListener('click', async () => {
      try {
        const data = await apiRequest(`/api/videos/${video.id}`);
        showJson(details, data);
      } catch (error) {
        showJson(details, { error: error.payload || error.message });
      }
    });
    actionsCell.appendChild(inspectButton);

    const downloadLink = document.createElement('a');
    downloadLink.href = `/api/videos/${video.id}/download`;
    downloadLink.textContent = 'Download';
    downloadLink.setAttribute('download', `${video.id}.mp4`);
    actionsCell.appendChild(downloadLink);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      if (!confirm(`Delete ${video.id}?`)) return;
      try {
        await apiRequest(`/api/videos/${video.id}`, { method: 'DELETE' });
        await refreshVideos();
      } catch (error) {
        alert(`Delete failed: ${error.status || ''} ${JSON.stringify(error.payload || error.message)}`);
      }
    });
    actionsCell.appendChild(deleteButton);

    row.appendChild(actionsCell);
    videosTableBody.appendChild(row);
  });
}

async function refreshVideos() {
  if (isRefreshing) return;
  isRefreshing = true;
  refreshBtn.disabled = true;
  const originalText = refreshBtn.textContent;
  refreshBtn.textContent = 'Refreshing…';

  try {
    const response = await apiRequest('/api/videos');
    const videos = Array.isArray(response)
      ? response
      : response?.data || response?.items || response?.results || [];
    renderVideos(videos);
    refreshBtn.textContent = 'Updated ✔';
  } catch (error) {
    renderVideos([]);
    showJson(details, { error: error.payload || error.message });
    refreshBtn.textContent = 'Failed ✖';
  } finally {
    setTimeout(() => {
      refreshBtn.textContent = originalText;
      refreshBtn.disabled = false;
    }, 1500);
    isRefreshing = false;
  }
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(createForm);
  const promptValue = `${formData.get('prompt') ?? ''}`.trim();

  if (!promptValue) {
    alert('Prompt is required.');
    return;
  }

  formData.set('prompt', promptValue);

  const modelValue = `${formData.get('model') ?? ''}`.trim();
  if (modelValue) {
    formData.set('model', modelValue);
  } else {
    formData.delete('model');
  }

  const sizeValue = `${formData.get('size') ?? ''}`.trim();
  if (sizeValue) {
    formData.set('size', sizeValue);
  } else {
    formData.set('size', DEFAULT_SIZE);
  }

  const secondsValue = `${formData.get('seconds') ?? ''}`.trim();
  if (secondsValue) {
    formData.set('seconds', secondsValue);
  } else {
    formData.delete('seconds');
  }

  const referenceFile = formData.get('input_reference');
  if (referenceFile instanceof File && referenceFile.size === 0) {
    formData.delete('input_reference');
  }

  try {
    const result = await apiRequest('/api/videos', {
      method: 'POST',
      body: formData,
    });
    showJson(createResult, result);
    await refreshVideos();
  } catch (error) {
    showJson(createResult, { status: error.status, error: error.payload || error.message });
  }
});

refreshBtn.addEventListener('click', refreshVideos);

async function init() {
  try {
    await apiRequest('/api/health');
    envIndicator.textContent = 'ready';
  } catch (_error) {
    envIndicator.textContent = 'offline';
  }

  await refreshVideos();
  // Auto-refresh every 20 seconds
  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      refreshVideos();
    }, 20000);
  }
}

init();
