// ===== Lumi Converter - app.js =====

// Format definitions per type
const FORMATS = {
  video: {
    accept: 'video/*',
    input: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp'],
    output: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'gif'],
    icon: '🎬',
    label: 'AVI · MOV · MKV · MP4 · WEBM · FLV · WMV',
    quality: true,
  },
  audio: {
    accept: 'audio/*',
    input: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'],
    output: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'],
    icon: '🎵',
    label: 'MP3 · WAV · OGG · FLAC · AAC · M4A',
    quality: true,
  },
  image: {
    accept: 'image/*',
    input: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff', 'ico'],
    output: ['jpg', 'png', 'webp', 'bmp', 'gif'],
    icon: '🖼️',
    label: 'JPG · PNG · WEBP · BMP · GIF · TIFF',
    quality: false,
  },
};

// Quality presets
const QUALITY_PRESETS = {
  video: {
    high:   ['-crf', '18', '-preset', 'slow'],
    medium: ['-crf', '23', '-preset', 'medium'],
    low:    ['-crf', '28', '-preset', 'fast'],
  },
  audio: {
    high:   ['-b:a', '320k'],
    medium: ['-b:a', '192k'],
    low:    ['-b:a', '128k'],
  },
  image: {
    high:   ['-q:v', '2'],
    medium: ['-q:v', '5'],
    low:    ['-q:v', '10'],
  },
};

// State
let currentType = 'video';
let selectedFile = null;
let ffmpeg = null;
let ffmpegLoaded = false;
let outputURL = null;

// DOM refs
const typeTabs      = document.querySelectorAll('.tab');
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const dropIcon      = document.getElementById('dropIcon');
const dropFormats   = document.getElementById('dropFormats');
const fileCard      = document.getElementById('fileCard');
const fileThumb     = document.getElementById('fileThumb');
const fileNameEl    = document.getElementById('fileName');
const fileSizeEl    = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFile');
const outputFormat  = document.getElementById('outputFormat');
const quality       = document.getElementById('quality');
const qualityGroup  = document.getElementById('qualityGroup');
const convertBtn    = document.getElementById('convertBtn');
const progressCard  = document.getElementById('progressCard');
const progressLabel = document.getElementById('progressLabel');
const progressFill  = document.getElementById('progressFill');
const progressPct   = document.getElementById('progressPercent');
const resultCard    = document.getElementById('resultCard');
const previewArea   = document.getElementById('previewArea');
const downloadBtn   = document.getElementById('downloadBtn');
const newConvBtn    = document.getElementById('newConversion');
const errorCard     = document.getElementById('errorCard');
const errorMsg      = document.getElementById('errorMsg');
const retryBtn      = document.getElementById('retryBtn');

// ===== Tab switching =====
typeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    typeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentType = tab.dataset.type;
    updateTypeUI();
    resetAll();
  });
});

function updateTypeUI() {
  const cfg = FORMATS[currentType];
  dropIcon.textContent = cfg.icon;
  dropFormats.textContent = cfg.label;
  fileInput.accept = cfg.accept;
  populateOutputFormats();
  qualityGroup.style.display = cfg.quality ? 'flex' : 'none';
}

function populateOutputFormats() {
  const formats = FORMATS[currentType].output;
  outputFormat.innerHTML = '<option value="">-- Select Format --</option>';
  formats.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f.toUpperCase();
    outputFormat.appendChild(opt);
  });
}

// ===== Drag & Drop =====
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

dropZone.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-browse')) return;
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// ===== File Handling =====
function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const allowed = FORMATS[currentType].input;

  if (!allowed.includes(ext)) {
    showError(`"${ext.toUpperCase()}" format is not supported for ${currentType} conversion.\nSupported: ${allowed.join(', ').toUpperCase()}`);
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatSize(file.size);
  fileThumb.textContent = FORMATS[currentType].icon;

  dropZone.style.display = 'none';
  fileCard.style.display = 'block';
  hideAll(['progressCard', 'resultCard', 'errorCard']);
  updateConvertBtn();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

outputFormat.addEventListener('change', updateConvertBtn);

function updateConvertBtn() {
  convertBtn.disabled = !outputFormat.value;
}

removeFileBtn.addEventListener('click', resetAll);

function resetAll() {
  selectedFile = null;
  fileInput.value = '';
  outputFormat.value = '';
  convertBtn.disabled = true;
  dropZone.style.display = 'block';
  hideAll(['fileCard', 'progressCard', 'resultCard', 'errorCard']);
  if (outputURL) {
    URL.revokeObjectURL(outputURL);
    outputURL = null;
  }
}

// ===== FFmpeg Init =====
async function loadFFmpeg() {
  if (ffmpegLoaded) return;

  setProgress(5, 'Loading Lumi engine...');

  try {
    const { FFmpeg } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/esm/index.js');
    const { toBlobURL, fetchFile: ff } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js');

    window._lumiFF = ff;

    ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.round(Math.min(progress, 1) * 100);
      setProgress(10 + pct * 0.85, `Converting... ${pct}%`);
    });

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    // Try jsdelivr first, fallback to unpkg
    let coreURL, wasmURL;
    try {
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
      coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
      wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
    } catch {
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
      wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
    }

    await ffmpeg.load({ coreURL, wasmURL });

    ffmpegLoaded = true;
    setProgress(10, 'Engine ready!');
  } catch (err) {
    console.error(err);
    throw new Error('Failed to load conversion engine. Please check your internet connection and try again.');
  }
}

// ===== Conversion =====
convertBtn.addEventListener('click', startConversion);

async function startConversion() {
  if (!selectedFile || !outputFormat.value) return;

  const inputExt   = selectedFile.name.split('.').pop().toLowerCase();
  const outputExt  = outputFormat.value;
  const inputName  = `input.${inputExt}`;
  const outputName = `output.${outputExt}`;
  const qualVal    = quality.value;

  fileCard.style.display = 'none';
  progressCard.style.display = 'block';
  hideAll(['resultCard', 'errorCard']);
  setProgress(0, 'Preparing...');

  try {
    await loadFFmpeg();

    setProgress(10, 'Reading file...');
    const fetchFile = window._lumiFF;
    const fileData = await fetchFile(selectedFile);
    await ffmpeg.writeFile(inputName, fileData);

    setProgress(15, 'Starting conversion...');

    const args = buildArgs(inputName, outputName, outputExt, qualVal);
    await ffmpeg.exec(args);

    setProgress(97, 'Finalizing...');
    const data = await ffmpeg.readFile(outputName);
    const mimeType = getMimeType(outputExt);
    const blob = new Blob([data.buffer], { type: mimeType });
    outputURL = URL.createObjectURL(blob);

    // Cleanup ffmpeg virtual FS
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    setProgress(100, 'Done!');
    setTimeout(() => showResult(outputURL, outputExt), 400);

  } catch (err) {
    console.error(err);
    showError(err.message || 'Conversion failed. Please try a different format or file.');
  }
}

function buildArgs(inputName, outputName, outputExt, qualVal) {
  const args = ['-i', inputName];

  if (currentType === 'video') {
    if (outputExt === 'gif') {
      args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-loop', '0');
    } else {
      const qArgs = QUALITY_PRESETS.video[qualVal] || QUALITY_PRESETS.video.medium;
      args.push(...qArgs, '-c:v', 'libx264', '-c:a', 'aac');
    }
  } else if (currentType === 'audio') {
    const qArgs = QUALITY_PRESETS.audio[qualVal] || QUALITY_PRESETS.audio.medium;
    args.push(...qArgs);
    if (outputExt === 'ogg') args.push('-c:a', 'libvorbis');
    else if (outputExt === 'flac') args.push('-c:a', 'flac');
    else args.push('-c:a', 'libmp3lame');
  } else if (currentType === 'image') {
    const qArgs = QUALITY_PRESETS.image[qualVal] || QUALITY_PRESETS.image.medium;
    args.push(...qArgs);
  }

  args.push(outputName);
  return args;
}

function getMimeType(ext) {
  const map = {
    mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo',
    mov: 'video/quicktime', mkv: 'video/x-matroska', gif: 'image/gif',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', bmp: 'image/bmp',
  };
  return map[ext] || 'application/octet-stream';
}

// ===== Progress =====
function setProgress(pct, label) {
  progressFill.style.width = pct + '%';
  progressPct.textContent = Math.round(pct) + '%';
  progressLabel.textContent = label;
}

// ===== Show Result =====
function showResult(url, ext) {
  progressCard.style.display = 'none';
  resultCard.style.display = 'block';
  previewArea.innerHTML = '';

  if (currentType === 'video' || ext === 'gif') {
    const el = document.createElement(ext === 'gif' ? 'img' : 'video');
    el.src = url;
    if (ext !== 'gif') { el.controls = true; el.preload = 'metadata'; }
    previewArea.appendChild(el);
  } else if (currentType === 'audio') {
    const el = document.createElement('audio');
    el.src = url;
    el.controls = true;
    previewArea.appendChild(el);
  } else if (currentType === 'image') {
    const el = document.createElement('img');
    el.src = url;
    previewArea.appendChild(el);
  }

  const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
  downloadBtn.href = url;
  downloadBtn.download = `${baseName}_lumi.${ext}`;
}

// ===== Error =====
function showError(msg) {
  progressCard.style.display = 'none';
  fileCard.style.display = 'none';
  errorCard.style.display = 'block';
  errorMsg.textContent = msg;
}

retryBtn.addEventListener('click', () => {
  errorCard.style.display = 'none';
  dropZone.style.display = 'block';
  selectedFile = null;
  fileInput.value = '';
});

newConvBtn.addEventListener('click', () => {
  resultCard.style.display = 'none';
  resetAll();
});

// ===== Helpers =====
function hideAll(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ===== Init =====
updateTypeUI();
