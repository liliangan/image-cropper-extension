let cropper = null;
let currentImage = null;
let currentFile = null;
let selectedPreset = null;
let scaleX = 1;
let scaleY = 1;
let cropSyncFrame = null;
let cropCenterFrame = null;
let imageInitFrame = null;
let imageLoadToken = 0;
let customRatioApplyTimer = null;
let downloadInProgress = false;
let editorHasImage = false;

const imageInput = document.getElementById('imageInput');
const image = document.getElementById('image');
const imageContainer = document.getElementById('imageContainer');
const canvasEmptyState = document.getElementById('canvasEmptyState');
const canvasEmptyStateTitle = document.getElementById('canvasEmptyStateTitle');
const canvasEmptyStateLabel = document.getElementById('canvasEmptyStateLabel');
const downloadBtn = document.getElementById('downloadBtn');
const downloadBtnLabel = document.getElementById('downloadBtnLabel');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const cropSpecsBtn = document.getElementById('cropSpecsBtn');
const cropSpecsMenu = document.getElementById('cropSpecsMenu');
const cropSpecsCloseBtn = document.getElementById('cropSpecsCloseBtn');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');
const flipHBtn = document.getElementById('flipHBtn');
const flipVBtn = document.getElementById('flipVBtn');
const ratioButtons = document.querySelectorAll('.btn-ratio');
const freeRatioButton = document.getElementById('freeRatioButton');
const fixedRatioButton = document.getElementById('fixedRatioButton');
const customRatioInputs = document.getElementById('customRatioInputs');
const customRatioWidthInput = document.getElementById('customRatioWidthInput');
const customRatioHeightInput = document.getElementById('customRatioHeightInput');
const sizeError = document.getElementById('sizeError');
const cropModeLabel = document.getElementById('cropModeLabel');
const cropSizeBadge = document.getElementById('cropSizeBadge');
const sizeInputs = [customRatioWidthInput, customRatioHeightInput];
const canvasToolButtons = [cropSpecsBtn, rotateLeftBtn, rotateRightBtn, flipHBtn, flipVBtn];
const cropResizeActions = new Set(['e', 'w', 's', 'n', 'ne', 'nw', 'se', 'sw']);

function openImagePicker() {
  imageInput.value = '';
  imageInput.click();
}

uploadNewBtn.addEventListener('click', openImagePicker);

function setCropSpecsMenuOpen(isOpen, restoreFocus = false) {
  const shouldOpen = Boolean(isOpen && editorHasImage && !cropSpecsBtn.disabled);
  cropSpecsMenu.hidden = !shouldOpen;
  cropSpecsBtn.setAttribute('aria-expanded', String(shouldOpen));

  if (shouldOpen) {
    window.requestAnimationFrame(() => {
      const activeOption = cropSpecsMenu.querySelector('.btn-ratio[aria-pressed="true"]:not(:disabled)');
      (activeOption || freeRatioButton).focus();
    });
  } else if (restoreFocus && !cropSpecsBtn.disabled) {
    cropSpecsBtn.focus();
  }
}

cropSpecsBtn.addEventListener('click', () => {
  setCropSpecsMenuOpen(cropSpecsMenu.hidden);
});

cropSpecsCloseBtn.addEventListener('click', () => {
  setCropSpecsMenuOpen(false, true);
});

document.addEventListener('click', (event) => {
  if (
    cropSpecsMenu.hidden
    || cropSpecsMenu.contains(event.target)
    || cropSpecsBtn.contains(event.target)
  ) {
    return;
  }

  setCropSpecsMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !cropSpecsMenu.hidden) {
    event.preventDefault();
    setCropSpecsMenuOpen(false, true);
  }
});

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

  const loadToken = ++imageLoadToken;
  cancelPendingImageInitialization();
  cancelPendingCustomRatioApply();
  cancelPendingCropCentering();
  if (cropSyncFrame !== null) {
    window.cancelAnimationFrame(cropSyncFrame);
    cropSyncFrame = null;
  }
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  currentFile = null;
  currentImage = null;
  image.removeAttribute('src');
  resetCropMode();
  setDownloadState(false);
  setEditorState('loading');

  const reader = new FileReader();

  reader.onload = (event) => {
    if (loadToken !== imageLoadToken) return;

    currentFile = file;
    currentImage = event.target.result;
    image.alt = `${file.name} 的裁切预览`;
    loadImageBeforeCropper(currentImage, loadToken);
  };

  reader.onerror = () => {
    if (loadToken !== imageLoadToken) return;
    resetEditorAfterImageError('图片读取失败，请重新选择文件。');
  };

  reader.readAsDataURL(file);
}

function setEditorState(state) {
  const isReady = state === 'ready';
  editorHasImage = isReady;
  imageContainer.dataset.state = state;
  canvasEmptyState.hidden = isReady;

  if (!isReady) {
    setCropSpecsMenuOpen(false);
  }

  const controlsDisabled = !isReady;
  canvasToolButtons.forEach((button) => {
    button.disabled = controlsDisabled;
  });
  ratioButtons.forEach((button) => {
    button.disabled = controlsDisabled;
  });
  sizeInputs.forEach((input) => {
    input.disabled = controlsDisabled;
  });

  if (state === 'loading') {
    canvasEmptyStateTitle.textContent = '正在加载图片…';
    canvasEmptyStateLabel.textContent = '正在准备裁切画布';
    cropModeLabel.textContent = '加载中';
    cropSizeBadge.textContent = '加载中…';
  } else if (state === 'ready') {
    cropModeLabel.textContent = '自由裁切';
  } else if (state === 'empty') {
    canvasEmptyStateTitle.textContent = '还没有图片';
    canvasEmptyStateLabel.textContent = '点击右上角“上传”选择 JPG、PNG 或 WebP';
    cropModeLabel.textContent = '等待图片';
    cropSizeBadge.textContent = '未选择图片';
  }

  downloadBtn.disabled = !editorHasImage || downloadInProgress;
}

function resetEditorAfterImageError(message) {
  cancelPendingImageInitialization();
  cancelPendingCropCentering();
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  currentFile = null;
  currentImage = null;
  imageInput.value = '';
  image.removeAttribute('src');
  image.alt = '待裁切图片';
  resetCropMode();
  setDownloadState(false);
  setEditorState('empty');
  window.alert(message);
}

function cancelPendingImageInitialization() {
  image.onload = null;
  image.onerror = null;
  if (imageInitFrame !== null) {
    window.cancelAnimationFrame(imageInitFrame);
    imageInitFrame = null;
  }
}

function loadImageBeforeCropper(imageUrl, loadToken) {
  let imageReady = false;

  const initializeWhenLayoutIsReady = () => {
    if (
      imageReady
      || loadToken !== imageLoadToken
      || !image.naturalWidth
      || !image.naturalHeight
    ) {
      return;
    }

    imageReady = true;
    image.onload = null;
    image.onerror = null;
    imageInitFrame = window.requestAnimationFrame(() => {
      imageInitFrame = window.requestAnimationFrame(() => {
        imageInitFrame = null;
        if (loadToken === imageLoadToken) {
          initCropper(loadToken);
        }
      });
    });
  };

  image.removeAttribute('src');
  image.onload = initializeWhenLayoutIsReady;
  image.onerror = () => {
    if (loadToken !== imageLoadToken) return;

    imageReady = true;
    image.onload = null;
    image.onerror = null;
    resetEditorAfterImageError('图片解码失败，请重新选择图片。');
  };

  image.src = imageUrl;
  if (image.complete && image.naturalWidth && image.naturalHeight) {
    initializeWhenLayoutIsReady();
  }
}

function selectFullImage() {
  if (!cropper) return;

  const canvasData = cropper.getCanvasData();
  if (
    !Number.isFinite(canvasData.left)
    || !Number.isFinite(canvasData.top)
    || !Number.isFinite(canvasData.width)
    || !Number.isFinite(canvasData.height)
  ) {
    return;
  }

  cropper.setCropBoxData({
    left: canvasData.left,
    top: canvasData.top,
    width: canvasData.width,
    height: canvasData.height,
  });
  syncCropSize(cropper.getData());
}

function initCropper(loadToken) {
  if (cropper) {
    cropper.destroy();
  }

  cropper = new Cropper(image, {
    viewMode: 1,
    dragMode: 'move',
    aspectRatio: NaN,
    autoCropArea: 1,
    restore: true,
    guides: true,
    center: true,
    highlight: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
    ready() {
      if (loadToken !== imageLoadToken) return;
      selectFullImage();
      setEditorState('ready');
    },
    crop(event) {
      scheduleCropSizeSync(event.detail);
    },
    cropend(event) {
      if (cropResizeActions.has(event.detail.action)) {
        scheduleCropCentering();
      }
    },
    zoom() {
      scheduleCropCentering();
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
  } else {
    cropSizeBadge.textContent = `${width} × ${height} px`;
  }
}

function cancelPendingCropCentering() {
  if (cropCenterFrame !== null) {
    window.cancelAnimationFrame(cropCenterFrame);
    cropCenterFrame = null;
  }
}

function centerCropBoxAndCanvas(activeCropper) {
  const containerData = activeCropper.getContainerData();
  const cropBoxData = activeCropper.getCropBoxData();

  if (
    !Number.isFinite(containerData.width)
    || !Number.isFinite(containerData.height)
    || !Number.isFinite(cropBoxData.left)
    || !Number.isFinite(cropBoxData.top)
    || !Number.isFinite(cropBoxData.width)
    || !Number.isFinite(cropBoxData.height)
  ) {
    return;
  }

  const centeredLeft = (containerData.width - cropBoxData.width) / 2;
  const centeredTop = (containerData.height - cropBoxData.height) / 2;
  const offsetX = centeredLeft - cropBoxData.left;
  const offsetY = centeredTop - cropBoxData.top;

  if (Math.abs(offsetX) < 0.5 && Math.abs(offsetY) < 0.5) return;

  // Move the crop box and image canvas together so the selected image content
  // stays unchanged while the crop frame returns to the visual center.
  activeCropper.cropBoxData.left += offsetX;
  activeCropper.cropBoxData.top += offsetY;
  activeCropper.canvasData.left += offsetX;
  activeCropper.canvasData.top += offsetY;
  activeCropper.renderCanvas(true);
  activeCropper.renderCropBox();
  scheduleCropSizeSync(activeCropper.getData());
}

function scheduleCropCentering() {
  if (!cropper) return;

  cancelPendingCropCentering();
  const activeCropper = cropper;
  cropCenterFrame = window.requestAnimationFrame(() => {
    cropCenterFrame = null;
    if (cropper === activeCropper) {
      centerCropBoxAndCanvas(activeCropper);
    }
  });
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

function setFreeAspectRatioPreservingCropBox() {
  if (!cropper) return;

  const cropBoxData = cropper.getCropBoxData();
  cropper.setAspectRatio(NaN);

  if (
    Number.isFinite(cropBoxData.width)
    && Number.isFinite(cropBoxData.height)
    && cropBoxData.width > 0
    && cropBoxData.height > 0
  ) {
    cropper.setCropBoxData(cropBoxData);
  }
}

function clearCustomRatioInputs() {
  cancelPendingCustomRatioApply();
  customRatioWidthInput.value = '';
  customRatioHeightInput.value = '';
  clearSizeError();
}

function activateFreeModePreservingCustomRatio() {
  selectedPreset = null;
  setActiveRatioButton(freeRatioButton);
  cropModeLabel.textContent = '自由裁切';

  if (cropper) {
    setFreeAspectRatioPreservingCropBox();
    scheduleCropSizeSync(cropper.getData());
  }
}

function selectCropMode(button, updateCropper = true) {
  cancelPendingCropCentering();
  clearCustomRatioInputs();
  setActiveRatioButton(button);

  const presetWidth = Number(button.dataset.width);
  const presetHeight = Number(button.dataset.height);
  const hasPreset = Number.isFinite(presetWidth) && Number.isFinite(presetHeight);
  const isFree = button.dataset.ratio === 'free';
  const modeName = getModeName(button);

  selectedPreset = hasPreset
    ? { width: presetWidth, height: presetHeight }
    : null;

  if (hasPreset) {
    cropModeLabel.textContent = `${modeName} · 证件照`;
    cropSizeBadge.textContent = `${presetWidth} × ${presetHeight} px 导出`;
  } else if (isFree) {
    cropModeLabel.textContent = '自由裁切';
  } else {
    cropModeLabel.textContent = `${modeName} 比例`;
  }

  if (!cropper || !updateCropper) return;

  if (isFree) {
    setFreeAspectRatioPreservingCropBox();
    scheduleCropSizeSync(cropper.getData());
    return;
  }

  const ratio = hasPreset
    ? presetWidth / presetHeight
    : button.dataset.ratio;
  cropper.setAspectRatio(Number(ratio));
  scheduleCropSizeSync(cropper.getData());
}

ratioButtons.forEach((button) => {
  button.addEventListener('click', () => {
    cancelPendingCustomRatioApply();

    if (button === fixedRatioButton) {
      const widthText = customRatioWidthInput.value.trim();
      const heightText = customRatioHeightInput.value.trim();

      if (widthText && heightText) {
        applyCustomRatio();
      } else {
        const inputToFocus = widthText ? customRatioHeightInput : customRatioWidthInput;
        window.requestAnimationFrame(() => inputToFocus.focus());
      }
      return;
    }

    selectCropMode(button);
    setCropSpecsMenuOpen(false, true);
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

function cancelPendingCustomRatioApply() {
  if (customRatioApplyTimer !== null) {
    window.clearTimeout(customRatioApplyTimer);
    customRatioApplyTimer = null;
  }
}

function scheduleCustomRatioApply() {
  cancelPendingCustomRatioApply();
  customRatioApplyTimer = window.setTimeout(() => {
    customRatioApplyTimer = null;
    applyCustomRatio();
  }, 300);
}

function applyCustomRatio() {
  if (!cropper) return false;

  cancelPendingCropCentering();
  cancelPendingCustomRatioApply();

  const widthText = customRatioWidthInput.value.trim();
  const heightText = customRatioHeightInput.value.trim();

  if (!widthText || !heightText) {
    clearSizeError();
    if (fixedRatioButton.classList.contains('active')) {
      activateFreeModePreservingCustomRatio();
    }
    return false;
  }

  const widthValue = Number(widthText);
  const heightValue = Number(heightText);

  if (
    !Number.isInteger(widthValue)
    || !Number.isInteger(heightValue)
    || widthValue < 1
    || heightValue < 1
  ) {
    showSizeError('请输入大于 0 的整数像素值，用于设定比例。');
    if (fixedRatioButton.classList.contains('active')) {
      activateFreeModePreservingCustomRatio();
    }
    return false;
  }

  clearSizeError();
  selectedPreset = null;
  setActiveRatioButton(fixedRatioButton);
  cropper.setAspectRatio(widthValue / heightValue);

  let first = widthValue;
  let second = heightValue;
  while (second !== 0) {
    [first, second] = [second, first % second];
  }
  cropModeLabel.textContent = `固定比例 · ${widthValue / first}:${heightValue / first}`;
  scheduleCropSizeSync(cropper.getData());
  return true;
}

sizeInputs.forEach((input) => {
  input.addEventListener('input', () => {
    clearSizeError();
    scheduleCustomRatioApply();
  });
  input.addEventListener('change', applyCustomRatio);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCustomRatio();
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
  downloadBtn.disabled = !editorHasImage || isLoading;
  downloadBtn.classList.toggle('is-loading', isLoading);
  downloadBtnLabel.textContent = isLoading ? '导出中…' : '下载';
}

downloadBtn.addEventListener('click', () => {
  if (!editorHasImage || !cropper || !currentFile || downloadInProgress) return;

  setDownloadState(true);

  const canvasOptions = {
    maxWidth: 4096,
    maxHeight: 4096,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  };

  if (selectedPreset) {
    canvasOptions.width = selectedPreset.width;
    canvasOptions.height = selectedPreset.height;
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
      window.alert('当前浏览器无法保持该图片格式，请升级浏览器或改用 JPG、PNG、WebP。');
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
  scaleX = 1;
  scaleY = 1;
  cancelPendingCropCentering();
  clearCustomRatioInputs();
  cropModeLabel.textContent = '自由裁切';
  cropSizeBadge.textContent = '准备中';
  setActiveRatioButton(freeRatioButton);
}

setEditorState('empty');
