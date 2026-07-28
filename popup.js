let cropper = null;
let currentImage = null;
let currentFile = null;
let selectedPreset = null;
let customOutputSize = null;
let scaleX = 1;
let scaleY = 1;
let cropSyncFrame = null;
let customSizeApplyTimer = null;
let downloadInProgress = false;

const imageInput = document.getElementById('imageInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadSection = document.getElementById('uploadSection');
const cropSection = document.getElementById('cropSection');
const headerActions = document.getElementById('headerActions');
const image = document.getElementById('image');
const downloadBtn = document.getElementById('downloadBtn');
const downloadBtnLabel = document.getElementById('downloadBtnLabel');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');
const flipHBtn = document.getElementById('flipHBtn');
const flipVBtn = document.getElementById('flipVBtn');
const ratioButtons = document.querySelectorAll('.btn-ratio');
const freeRatioButton = document.querySelector('[data-ratio="free"]');
const freeSizePanel = document.getElementById('freeSizePanel');
const cropWidthInput = document.getElementById('cropWidthInput');
const cropHeightInput = document.getElementById('cropHeightInput');
const sizeError = document.getElementById('sizeError');
const cropModeLabel = document.getElementById('cropModeLabel');
const cropSizeBadge = document.getElementById('cropSizeBadge');
const sizeInputs = [cropWidthInput, cropHeightInput];

function openImagePicker() {
  imageInput.value = '';
  imageInput.click();
}

uploadBtn.addEventListener('click', openImagePicker);
uploadNewBtn.addEventListener('click', openImagePicker);

imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    handleImageUpload(file);
  }
});

function handleImageUpload(file) {
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type)) {
    window.alert('当前格式无法在浏览器中保持原格式导出，请上传 JPG、PNG 或 WebP 图片。');
    imageInput.value = '';
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    cancelPendingSizeApply();
    if (cropSyncFrame !== null) {
      window.cancelAnimationFrame(cropSyncFrame);
      cropSyncFrame = null;
    }
    setDownloadState(false);
    currentFile = file;
    currentImage = event.target.result;
    image.src = currentImage;
    uploadSection.hidden = true;
    cropSection.hidden = false;
    headerActions.hidden = false;
    resetCropMode();
    initCropper();
  };

  reader.onerror = () => {
    imageInput.value = '';
    window.alert('图片读取失败，请重新选择文件。');
  };

  reader.readAsDataURL(file);
}

function initCropper() {
  if (cropper) {
    cropper.destroy();
  }

  cropper = new Cropper(image, {
    viewMode: 1,
    dragMode: 'move',
    aspectRatio: NaN,
    autoCropArea: 0.8,
    restore: false,
    guides: true,
    center: true,
    highlight: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
    ready() {
      syncCropSize(cropper.getData());
    },
    crop(event) {
      scheduleCropSizeSync(event.detail);
    },
  });
}

function scheduleCropSizeSync(cropData) {
  if (cropSyncFrame !== null) {
    window.cancelAnimationFrame(cropSyncFrame);
  }

  cropSyncFrame = window.requestAnimationFrame(() => {
    cropSyncFrame = null;
    syncCropSize(cropData);
  });
}

function syncCropSize(cropData) {
  if (!cropData) return;

  const width = Math.max(1, Math.round(cropData.width || 0));
  const height = Math.max(1, Math.round(cropData.height || 0));

  if (selectedPreset) {
    cropSizeBadge.textContent = `${selectedPreset.width} × ${selectedPreset.height} px 导出`;
  } else if (customOutputSize) {
    cropSizeBadge.textContent = `${customOutputSize.width} × ${customOutputSize.height} px 导出`;
  } else {
    cropSizeBadge.textContent = `${width} × ${height} px`;
  }

  if (!freeSizePanel.hidden) {
    if (document.activeElement !== cropWidthInput) {
      cropWidthInput.value = customOutputSize ? customOutputSize.width : width;
    }
    if (document.activeElement !== cropHeightInput) {
      cropHeightInput.value = customOutputSize ? customOutputSize.height : height;
    }
  }
}

function setActiveRatioButton(activeButton) {
  ratioButtons.forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function getModeName(button) {
  const label = button.querySelector('.preset-name, span');
  return label ? label.textContent.trim() : button.textContent.trim();
}

function selectCropMode(button, updateCropper = true) {
  setActiveRatioButton(button);
  clearSizeError();
  customOutputSize = null;

  const presetWidth = Number(button.dataset.width);
  const presetHeight = Number(button.dataset.height);
  const hasPreset = Number.isFinite(presetWidth) && Number.isFinite(presetHeight);
  const isFree = button.dataset.ratio === 'free';
  const modeName = getModeName(button);

  selectedPreset = hasPreset
    ? { width: presetWidth, height: presetHeight }
    : null;
  freeSizePanel.hidden = !isFree;

  if (hasPreset) {
    cropModeLabel.textContent = `${modeName} · 证件照`;
    cropSizeBadge.textContent = `${presetWidth} × ${presetHeight} px 导出`;
  } else if (isFree) {
    cropModeLabel.textContent = '自由裁切';
  } else {
    cropModeLabel.textContent = `${modeName} 比例`;
  }

  if (!cropper || !updateCropper) return;

  const ratio = hasPreset
    ? presetWidth / presetHeight
    : button.dataset.ratio;
  cropper.setAspectRatio(isFree ? NaN : Number(ratio));
  scheduleCropSizeSync(cropper.getData());
}

ratioButtons.forEach((button) => {
  button.addEventListener('click', () => {
    cancelPendingSizeApply();
    selectCropMode(button);
  });
});

function showSizeError(message) {
  sizeError.textContent = message;
  sizeError.hidden = false;
  sizeInputs.forEach((input) => input.setAttribute('aria-invalid', 'true'));
}

function clearSizeError() {
  sizeError.textContent = '';
  sizeError.hidden = true;
  sizeInputs.forEach((input) => input.removeAttribute('aria-invalid'));
}

function cancelPendingSizeApply() {
  if (customSizeApplyTimer !== null) {
    window.clearTimeout(customSizeApplyTimer);
    customSizeApplyTimer = null;
  }
}

function scheduleCustomSizeApply() {
  cancelPendingSizeApply();
  customSizeApplyTimer = window.setTimeout(() => {
    customSizeApplyTimer = null;
    applyCustomSize();
  }, 300);
}

function applyCustomSize() {
  if (!cropper) return;

  cancelPendingSizeApply();

  const widthValue = Number(cropWidthInput.value);
  const heightValue = Number(cropHeightInput.value);

  if (
    !Number.isInteger(widthValue)
    || !Number.isInteger(heightValue)
    || widthValue < 1
    || heightValue < 1
  ) {
    showSizeError('请输入大于 0 的整数像素尺寸。');
    return;
  }

  if (widthValue > 4096 || heightValue > 4096) {
    showSizeError('导出尺寸的宽高不能超过 4096 px。');
    return;
  }

  clearSizeError();
  selectCropMode(freeRatioButton);
  customOutputSize = { width: widthValue, height: heightValue };
  cropper.setAspectRatio(widthValue / heightValue);
  cropModeLabel.textContent = '自由裁切 · 自定义输出';
  cropSizeBadge.textContent = `${widthValue} × ${heightValue} px 导出`;

  cropWidthInput.value = String(widthValue);
  cropHeightInput.value = String(heightValue);
  window.requestAnimationFrame(() => syncCropSize(cropper.getData()));
}

sizeInputs.forEach((input) => {
  input.addEventListener('input', () => {
    clearSizeError();
    scheduleCustomSizeApply();
  });
  input.addEventListener('change', applyCustomSize);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCustomSize();
    }
  });
});

rotateLeftBtn.addEventListener('click', () => {
  if (cropper) {
    cropper.rotate(-90);
  }
});

rotateRightBtn.addEventListener('click', () => {
  if (cropper) {
    cropper.rotate(90);
  }
});

flipHBtn.addEventListener('click', () => {
  if (cropper) {
    scaleX = -scaleX;
    cropper.scaleX(scaleX);
  }
});

flipVBtn.addEventListener('click', () => {
  if (cropper) {
    scaleY = -scaleY;
    cropper.scaleY(scaleY);
  }
});

function setDownloadState(isLoading) {
  downloadInProgress = isLoading;
  downloadBtn.disabled = isLoading;
  downloadBtnLabel.textContent = isLoading ? '导出中…' : '下载';
}

downloadBtn.addEventListener('click', () => {
  if (!cropper || !currentFile || downloadInProgress) return;

  setDownloadState(true);

  const canvasOptions = {
    maxWidth: 4096,
    maxHeight: 4096,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  };

  const outputSize = selectedPreset || customOutputSize;
  if (outputSize) {
    canvasOptions.width = outputSize.width;
    canvasOptions.height = outputSize.height;
  }
  if (currentFile.type === 'image/jpeg') {
    canvasOptions.fillColor = '#fff';
  }

  let canvas;
  try {
    canvas = cropper.getCroppedCanvas(canvasOptions);
  } catch (error) {
    setDownloadState(false);
    window.alert('图片导出失败，请缩小裁切范围后重试。');
    return;
  }

  if (!canvas) {
    setDownloadState(false);
    window.alert('图片导出失败，请重新选择裁切区域。');
    return;
  }

  const extensionsByMime = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
  };
  const mimeType = currentFile.type;
  const originalExtension = currentFile.name.split('.').pop().toLowerCase();
  const allowedExtensions = extensionsByMime[mimeType];
  const extension = allowedExtensions.includes(originalExtension)
    ? originalExtension
    : allowedExtensions[0];
  const originalBaseName = currentFile.name.replace(/\.[^.]+$/, '') || 'image';

  canvas.toBlob((blob) => {
    setDownloadState(false);

    if (!blob || blob.type !== mimeType) {
      window.alert('当前浏览器无法保持该图片格式，请更换 Chrome 最新版或使用 JPG、PNG、WebP。');
      return;
    }

    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `${originalBaseName}-cropped.${extension}`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, mimeType, mimeType === 'image/jpeg' || mimeType === 'image/webp' ? 0.95 : undefined);
});

function resetCropMode() {
  selectedPreset = null;
  customOutputSize = null;
  scaleX = 1;
  scaleY = 1;
  freeSizePanel.hidden = false;
  cropModeLabel.textContent = '自由裁切';
  cropSizeBadge.textContent = '准备中';
  cropWidthInput.value = '';
  cropHeightInput.value = '';
  clearSizeError();
  setActiveRatioButton(freeRatioButton);
}
