const createForm = document.querySelector('#create-form');
const createResult = document.querySelector('#create-result');
const refreshBtn = document.querySelector('#refresh-btn');
const videosTableBody = document.querySelector('#videos-table tbody');
const details = document.querySelector('#details');
const envIndicator = document.querySelector('#env-indicator');

const DEFAULT_MODEL = 'sora-2';
const DEFAULT_SIZE = '1280x720';

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

function resolveCreated(video) {
  const ts = video?.created_at || video?.created || video?.createdAt;
  if (!ts) return '–';
  try {
    return new Date(ts).toLocaleString();
  } catch (_error) {
    return ts;
  }
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
  }
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(createForm);
  const payload = {};

  formData.forEach((value, key) => {
    if (value === '') return;
    if (key === 'duration') {
      payload[key] = Number(value);
      return;
    }
    payload[key] = value;
  });

  if (!payload.prompt) {
    alert('Prompt is required.');
    return;
  }

  if (!payload.model) {
    payload.model = DEFAULT_MODEL;
  }

  if (!payload.size) {
    payload.size = DEFAULT_SIZE;
  }

  try {
    const result = await apiRequest('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
}

init();
