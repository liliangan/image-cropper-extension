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
let hasBackgroundReplacement = false;
let selectedBackgroundColor = '#ffffff';
let foregroundImage = null;
let isBackgroundRemovalInProgress = false;
let isBackgroundRemovalSandboxReady = false;
let resolveBackgroundRemovalSandboxReady = null;
let backgroundRemovalSandboxReadyTimeout = null;
let backgroundRemovalRequest = null;
let backgroundRemovalRequestId = 0;

const capturedPhotoStorageKey = 'capturedIdPhoto';

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
const openCameraBtn = document.getElementById('openCameraBtn');
const makeIdPhotoBtn = document.getElementById('makeIdPhotoBtn');
const makeIdPhotoBtnLabel = document.getElementById('makeIdPhotoBtnLabel');
const backgroundRemovalFrame = document.getElementById('backgroundRemovalFrame');
const idPhotoPanel = document.getElementById('idPhotoPanel');
const resetBackgroundButton = document.getElementById('resetBackgroundButton');
const backgroundSwatches = document.querySelectorAll('.background-swatch');

/** 打开本地文件选择器，让用户选择待裁剪或制作证件照的图片。 */
function openImagePicker() {
  imageInput.value = '';
  imageInput.click();
}

/** 在独立的扩展页面中请求并预览摄像头，避免工具栏弹窗的媒体权限限制。 */
function openCamera() {
  window.open(chrome.runtime.getURL('camera.html'), '_blank');
}

uploadNewBtn.addEventListener('click', openImagePicker);

openCameraBtn.addEventListener('click', openCamera);
makeIdPhotoBtn.addEventListener('click', makeIdPhoto);
resetBackgroundButton.addEventListener('click', restoreOriginalImage);
window.addEventListener('message', handleBackgroundRemovalMessage);
window.addEventListener('focus', loadCapturedPhoto);

backgroundSwatches.forEach((button) => {
  button.addEventListener('click', () => {
    selectedBackgroundColor = button.dataset.background;
    setActiveBackgroundSwatch(button);
    if (hasBackgroundReplacement) {
      applyBackgroundReplacement();
    }
  });
});

/** 控制裁切规格浮层的开闭，并在关闭后按需恢复焦点。 */
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
  if (event.key !== 'Escape') {
    return;
  }

  if (!cropSpecsMenu.hidden) {
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

/** 校验并读取用户选择的图片，为新的编辑会话重置裁切和证件照状态。 */
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
  resetIdPhotoState();
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

/** 根据图片加载状态同步编辑器、裁切工具和证件照工具的可用性。 */
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
  setIdPhotoMakerState(isReady);

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

/** 在图片读取或解码失败时清空编辑器，并恢复为可重新上传的状态。 */
function resetEditorAfterImageError(message) {
  cancelPendingImageInitialization();
  cancelPendingCropCentering();
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  currentFile = null;
  currentImage = null;
  resetIdPhotoState();
  imageInput.value = '';
  image.removeAttribute('src');
  image.alt = '待裁切图片';
  resetCropMode();
  setDownloadState(false);
  setEditorState('empty');
  window.alert(message);
}

/** 取消上一次图片加载遗留的事件和渲染帧，避免旧图片覆盖当前会话。 */
function cancelPendingImageInitialization() {
  image.onload = null;
  image.onerror = null;
  if (imageInitFrame !== null) {
    window.cancelAnimationFrame(imageInitFrame);
    imageInitFrame = null;
  }
}

/** 等待原始图片完成解码后，在布局稳定时初始化裁切器。 */
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

/** 根据编辑器状态切换一键制作按钮，避免图片未就绪或重复执行时触发分割任务。 */
function setIdPhotoMakerState(isEnabled) {
  makeIdPhotoBtn.disabled = !isEnabled || isBackgroundRemovalInProgress;
}

/** 重置证件照制作状态，确保新图片不会复用上一次 AI 分割得到的人像图层。 */
function resetIdPhotoState() {
  hasBackgroundReplacement = false;
  foregroundImage = null;
  selectedBackgroundColor = '#ffffff';
  makeIdPhotoBtnLabel.textContent = '制作';
  idPhotoPanel.hidden = true;
  setActiveBackgroundSwatch(document.querySelector('.background-swatch[data-background="#ffffff"]'));
}

/** 设置当前选中的背景色选项，并同步无障碍选中状态。 */
function setActiveBackgroundSwatch(activeButton) {
  backgroundSwatches.forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

/** 将 AI 返回的透明 PNG 加载为图像对象，便于不重复运行模型地切换背景颜色。 */
function loadForegroundImage(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const foreground = new Image();

    foreground.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(foreground);
    };
    foreground.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('透明人像图层加载失败。'));
    };
    foreground.src = objectUrl;
  });
}

/** 等待抠图沙箱加载完成，避免在模型运行页尚未就绪时发送图片数据。 */
function waitForBackgroundRemovalSandbox() {
  if (isBackgroundRemovalSandboxReady) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    backgroundRemovalSandboxReadyTimeout = window.setTimeout(() => {
      resolveBackgroundRemovalSandboxReady = null;
      reject(new Error('智能抠图模块加载超时，请重新加载扩展后重试。'));
    }, 10000);
    resolveBackgroundRemovalSandboxReady = resolve;
  });
}

/** 将当前图片交给沙箱执行 AI 抠图，并接收透明 PNG 结果。 */
async function requestBackgroundRemoval() {
  if (!currentFile) {
    throw new Error('未找到待处理图片。');
  }

  await waitForBackgroundRemovalSandbox();
  const imageBuffer = await currentFile.arrayBuffer();
  const requestId = ++backgroundRemovalRequestId;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      backgroundRemovalRequest = null;
      reject(new Error('智能抠图处理超时，请检查网络后重试。'));
    }, 120000);

    backgroundRemovalRequest = { requestId, resolve, reject, timeoutId };
    backgroundRemovalFrame.contentWindow.postMessage({
      type: 'remove-background',
      requestId,
      imageBuffer,
      imageType: currentFile.type,
    }, '*', [imageBuffer]);
  });
}

/** 接收沙箱的就绪、下载进度和抠图结果，仅接受本扩展沙箱页发出的消息。 */
function handleBackgroundRemovalMessage(event) {
  if (event.source !== backgroundRemovalFrame.contentWindow || !event.data) {
    return;
  }

  const message = event.data;
  if (message.type === 'background-removal-ready') {
    isBackgroundRemovalSandboxReady = true;
    if (resolveBackgroundRemovalSandboxReady) {
      window.clearTimeout(backgroundRemovalSandboxReadyTimeout);
      backgroundRemovalSandboxReadyTimeout = null;
      resolveBackgroundRemovalSandboxReady();
      resolveBackgroundRemovalSandboxReady = null;
    }
    return;
  }

  if (!backgroundRemovalRequest || message.requestId !== backgroundRemovalRequest.requestId) {
    return;
  }

  if (message.type === 'background-removal-progress') {
    makeIdPhotoBtnLabel.textContent = `加载模型 ${message.progress}%`;
    return;
  }

  window.clearTimeout(backgroundRemovalRequest.timeoutId);
  const pendingRequest = backgroundRemovalRequest;
  backgroundRemovalRequest = null;

  if (message.type === 'background-removal-result') {
    pendingRequest.resolve(new Blob([message.imageBuffer], { type: 'image/png' }));
    return;
  }

  pendingRequest.reject(new Error(message.error || '智能抠图处理失败。'));
}

/** 读取独立摄像头页保存的照片，并将其带回既有编辑器流程。 */
async function loadCapturedPhoto() {
  try {
    const storedData = await chrome.storage.local.get(capturedPhotoStorageKey);
    const capturedPhoto = storedData[capturedPhotoStorageKey];
    if (!capturedPhoto) {
      return;
    }

    await chrome.storage.local.remove(capturedPhotoStorageKey);
    const response = await fetch(capturedPhoto.dataUrl);
    const blob = await response.blob();
    const file = new File([blob], capturedPhoto.fileName, { type: capturedPhoto.mimeType });
    handleImageUpload(file);
  } catch (error) {
    console.error('读取拍摄照片失败：', error);
  }
}

/** 收紧主体蒙版的半透明边缘，避免在背景替换后出现明显的锯齿轮廓。 */
function refineForegroundEdge(foreground) {
  const edgeCanvas = document.createElement('canvas');
  edgeCanvas.width = foreground.naturalWidth;
  edgeCanvas.height = foreground.naturalHeight;
  const edgeContext = edgeCanvas.getContext('2d');
  if (!edgeContext) {
    return Promise.resolve(foreground);
  }

  edgeContext.drawImage(foreground, 0, 0);
  const imageData = edgeContext.getImageData(0, 0, edgeCanvas.width, edgeCanvas.height);
  const alphaValues = new Uint8ClampedArray(imageData.data.length / 4);
  for (let pixelIndex = 0; pixelIndex < alphaValues.length; pixelIndex += 1) {
    alphaValues[pixelIndex] = imageData.data[pixelIndex * 4 + 3];
  }

  for (let y = 1; y < edgeCanvas.height - 1; y += 1) {
    for (let x = 1; x < edgeCanvas.width - 1; x += 1) {
      const pixelIndex = y * edgeCanvas.width + x;
      const dataIndex = pixelIndex * 4;
      const alpha = alphaValues[pixelIndex];
      if (alpha === 0 || alpha === 255) {
        continue;
      }

      const neighboringAlpha = getMinimumNeighborAlpha(alphaValues, edgeCanvas.width, pixelIndex);
      const refinedAlpha = Math.min(alpha, neighboringAlpha + 32);
      if (refinedAlpha === alpha) {
        continue;
      }

      imageData.data[dataIndex + 3] = refinedAlpha;
    }
  }

  edgeContext.putImageData(imageData, 0, 0);
  return loadForegroundImageFromCanvas(edgeCanvas);
}

/** 获取指定像素周围八个像素的最小透明度，用于识别主体轮廓最外侧的色边。 */
function getMinimumNeighborAlpha(alphaValues, width, pixelIndex) {
  const offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  let minimumAlpha = 255;
  offsets.forEach((offset) => {
    minimumAlpha = Math.min(minimumAlpha, alphaValues[pixelIndex + offset]);
  });
  return minimumAlpha;
}

/** 将完成边缘修正的画布重新解码为图像对象，供背景合成流程复用。 */
function loadForegroundImageFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    const refinedForeground = new Image();
    refinedForeground.onload = () => resolve(refinedForeground);
    refinedForeground.onerror = () => reject(new Error('人物边缘修正失败。'));
    refinedForeground.src = canvas.toDataURL('image/png');
  });
}

/** 运行浏览器端高精度 AI 人像分割，首用时下载并缓存模型，完成后默认合成白色背景。 */
async function makeIdPhoto() {
  if (!editorHasImage || !currentImage || isBackgroundRemovalInProgress) return;

  isBackgroundRemovalInProgress = true;
  makeIdPhotoBtnLabel.textContent = '处理中…';
  setIdPhotoMakerState(false);

  try {
    const foregroundBlob = await requestBackgroundRemoval();

    const rawForegroundImage = await loadForegroundImage(foregroundBlob);
    foregroundImage = await refineForegroundEdge(rawForegroundImage);
    hasBackgroundReplacement = true;
    idPhotoPanel.hidden = false;
    makeIdPhotoBtnLabel.textContent = '重新制作';
    applyBackgroundReplacement();
  } catch (error) {
    console.error('智能抠图失败：', error);
    makeIdPhotoBtnLabel.textContent = '制作';
    window.alert('智能抠图失败，请检查网络、扩展权限后重试。');
  } finally {
    isBackgroundRemovalInProgress = false;
    setIdPhotoMakerState(editorHasImage);
  }
}

/** 使用已生成的透明人像图层和当前背景色合成预览，不会再次下载或运行 AI 模型。 */
function applyBackgroundReplacement() {
  if (!foregroundImage || !cropper) return;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = foregroundImage.naturalWidth;
  outputCanvas.height = foregroundImage.naturalHeight;
  const outputContext = outputCanvas.getContext('2d');

  if (!outputContext) return;

  outputContext.fillStyle = selectedBackgroundColor;
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(foregroundImage, 0, 0);
  cropper.replace(outputCanvas.toDataURL('image/png'), true);
}

/** 恢复用户上传或拍摄的原图，并关闭已完成 AI 分割后显示的背景选择条。 */
function restoreOriginalImage() {
  if (!cropper || !currentImage) return;

  cropper.replace(currentImage, true);
  hasBackgroundReplacement = false;
  foregroundImage = null;
  selectedBackgroundColor = '#ffffff';
  idPhotoPanel.hidden = true;
  makeIdPhotoBtnLabel.textContent = '制作';
  setActiveBackgroundSwatch(document.querySelector('.background-swatch[data-background="#ffffff"]'));
}

/** 将裁切框扩展为完整图片，作为新图片导入后的默认选区。 */
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

/** 创建裁切器并绑定裁切尺寸同步、选区居中等交互行为。 */
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

/** 将连续的裁切事件合并到下一帧，减少尺寸标签的重复更新。 */
function scheduleCropSizeSync(cropData) {
  if (cropSyncFrame !== null) {
    window.cancelAnimationFrame(cropSyncFrame);
  }

  cropSyncFrame = window.requestAnimationFrame(() => {
    cropSyncFrame = null;
    syncCropSize(cropData);
  });
}

/** 按当前裁切状态刷新画布右侧的像素尺寸提示。 */
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

/** 取消等待执行的裁切框居中任务。 */
function cancelPendingCropCentering() {
  if (cropCenterFrame !== null) {
    window.cancelAnimationFrame(cropCenterFrame);
    cropCenterFrame = null;
  }
}

/** 同步移动裁切框和图片画布，使调整后的选区回到视觉中心。 */
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

/** 在下一帧执行裁切框居中，避免和 Cropper 的内部渲染竞争。 */
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

/** 更新规格按钮的选中状态，确保同时只有一种裁切比例生效。 */
function setActiveRatioButton(activeButton) {
  ratioButtons.forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

/** 获取裁切规格按钮的展示名称，用于更新当前编辑状态。 */
function getModeName(button) {
  const label = button.querySelector('.preset-name, span');
  return label ? label.textContent.trim() : button.textContent.trim();
}

/** 取消固定比例，同时保持当前裁切框的位置和尺寸不突变。 */
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

/** 清空自定义比例输入与校验提示。 */
function clearCustomRatioInputs() {
  cancelPendingCustomRatioApply();
  customRatioWidthInput.value = '';
  customRatioHeightInput.value = '';
  clearSizeError();
}

/** 当固定比例输入无效时回到自由裁切，并保留用户当前选区。 */
function activateFreeModePreservingCustomRatio() {
  selectedPreset = null;
  setActiveRatioButton(freeRatioButton);
  cropModeLabel.textContent = '自由裁切';

  if (cropper) {
    setFreeAspectRatioPreservingCropBox();
    scheduleCropSizeSync(cropper.getData());
  }
}

/** 应用用户选中的自由、常用比例或证件照尺寸规格。 */
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

/** 显示自定义比例的字段内校验错误。 */
function showSizeError(message) {
  sizeError.textContent = message;
  sizeError.hidden = false;
  sizeInputs.forEach((input) => input.setAttribute('aria-invalid', 'true'));
}

/** 清除自定义比例的字段内校验错误。 */
function clearSizeError() {
  sizeError.textContent = '';
  sizeError.hidden = true;
  sizeInputs.forEach((input) => input.removeAttribute('aria-invalid'));
}

/** 取消尚未执行的自定义比例防抖任务。 */
function cancelPendingCustomRatioApply() {
  if (customRatioApplyTimer !== null) {
    window.clearTimeout(customRatioApplyTimer);
    customRatioApplyTimer = null;
  }
}

/** 在用户暂停输入后自动应用自定义比例。 */
function scheduleCustomRatioApply() {
  cancelPendingCustomRatioApply();
  customRatioApplyTimer = window.setTimeout(() => {
    customRatioApplyTimer = null;
    applyCustomRatio();
  }, 300);
}

/** 校验自定义宽高并将其换算为裁切器的固定比例。 */
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

/** 切换导出按钮的禁用与加载状态，避免重复导出。 */
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
  const outputSuffix = hasBackgroundReplacement ? '-id-photo' : '-cropped';

  canvas.toBlob((blob) => {
    setDownloadState(false);

    if (!blob || blob.type !== mimeType) {
      window.alert('当前浏览器无法保持该图片格式，请升级浏览器或改用 JPG、PNG、WebP。');
      return;
    }

    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `${originalBaseName}${outputSuffix}.${extension}`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, mimeType, mimeType === 'image/jpeg' || mimeType === 'image/webp' ? 0.95 : undefined);
});

/** 恢复裁切比例、翻转状态和尺寸提示的默认值。 */
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
loadCapturedPhoto();
