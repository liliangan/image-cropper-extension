// popup.js
var cropper = null;
var currentImage = null;
var currentFile = null;
var selectedPreset = null;
var scaleX = 1;
var scaleY = 1;
var cropSyncFrame = null;
var cropCenterFrame = null;
var imageInitFrame = null;
var imageLoadToken = 0;
var customRatioApplyTimer = null;
var downloadInProgress = false;
var editorHasImage = false;
var hasBackgroundReplacement = false;
var selectedBackgroundColor = "#ffffff";
var foregroundImage = null;
var isBackgroundRemovalInProgress = false;
var isBackgroundRemovalSandboxReady = false;
var resolveBackgroundRemovalSandboxReady = null;
var backgroundRemovalSandboxReadyTimeout = null;
var backgroundRemovalRequest = null;
var backgroundRemovalRequestId = 0;
var capturedPhotoStorageKey = "capturedIdPhoto";
var imageInput = document.getElementById("imageInput");
var image = document.getElementById("image");
var imageContainer = document.getElementById("imageContainer");
var canvasEmptyState = document.getElementById("canvasEmptyState");
var canvasEmptyStateTitle = document.getElementById("canvasEmptyStateTitle");
var canvasEmptyStateLabel = document.getElementById("canvasEmptyStateLabel");
var downloadBtn = document.getElementById("downloadBtn");
var downloadBtnLabel = document.getElementById("downloadBtnLabel");
var uploadNewBtn = document.getElementById("uploadNewBtn");
var cropSpecsBtn = document.getElementById("cropSpecsBtn");
var cropSpecsMenu = document.getElementById("cropSpecsMenu");
var cropSpecsCloseBtn = document.getElementById("cropSpecsCloseBtn");
var rotateLeftBtn = document.getElementById("rotateLeftBtn");
var rotateRightBtn = document.getElementById("rotateRightBtn");
var flipHBtn = document.getElementById("flipHBtn");
var flipVBtn = document.getElementById("flipVBtn");
var ratioButtons = document.querySelectorAll(".btn-ratio");
var freeRatioButton = document.getElementById("freeRatioButton");
var fixedRatioButton = document.getElementById("fixedRatioButton");
var customRatioInputs = document.getElementById("customRatioInputs");
var customRatioWidthInput = document.getElementById("customRatioWidthInput");
var customRatioHeightInput = document.getElementById("customRatioHeightInput");
var sizeError = document.getElementById("sizeError");
var cropModeLabel = document.getElementById("cropModeLabel");
var cropSizeBadge = document.getElementById("cropSizeBadge");
var sizeInputs = [customRatioWidthInput, customRatioHeightInput];
var canvasToolButtons = [cropSpecsBtn, rotateLeftBtn, rotateRightBtn, flipHBtn, flipVBtn];
var cropResizeActions = /* @__PURE__ */ new Set(["e", "w", "s", "n", "ne", "nw", "se", "sw"]);
var openCameraBtn = document.getElementById("openCameraBtn");
var makeIdPhotoBtn = document.getElementById("makeIdPhotoBtn");
var makeIdPhotoBtnLabel = document.getElementById("makeIdPhotoBtnLabel");
var backgroundRemovalFrame = document.getElementById("backgroundRemovalFrame");
var idPhotoPanel = document.getElementById("idPhotoPanel");
var resetBackgroundButton = document.getElementById("resetBackgroundButton");
var backgroundSwatches = document.querySelectorAll(".background-swatch");
function openImagePicker() {
  imageInput.value = "";
  imageInput.click();
}
function openCamera() {
  window.open(chrome.runtime.getURL("camera.html"), "_blank");
}
uploadNewBtn.addEventListener("click", openImagePicker);
openCameraBtn.addEventListener("click", openCamera);
makeIdPhotoBtn.addEventListener("click", makeIdPhoto);
resetBackgroundButton.addEventListener("click", restoreOriginalImage);
window.addEventListener("message", handleBackgroundRemovalMessage);
window.addEventListener("focus", loadCapturedPhoto);
backgroundSwatches.forEach((button) => {
  button.addEventListener("click", () => {
    selectedBackgroundColor = button.dataset.background;
    setActiveBackgroundSwatch(button);
    if (hasBackgroundReplacement) {
      applyBackgroundReplacement();
    }
  });
});
function setCropSpecsMenuOpen(isOpen, restoreFocus = false) {
  const shouldOpen = Boolean(isOpen && editorHasImage && !cropSpecsBtn.disabled);
  cropSpecsMenu.hidden = !shouldOpen;
  cropSpecsBtn.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) {
    window.requestAnimationFrame(() => {
      const activeOption = cropSpecsMenu.querySelector('.btn-ratio[aria-pressed="true"]:not(:disabled)');
      (activeOption || freeRatioButton).focus();
    });
  } else if (restoreFocus && !cropSpecsBtn.disabled) {
    cropSpecsBtn.focus();
  }
}
cropSpecsBtn.addEventListener("click", () => {
  setCropSpecsMenuOpen(cropSpecsMenu.hidden);
});
cropSpecsCloseBtn.addEventListener("click", () => {
  setCropSpecsMenuOpen(false, true);
});
document.addEventListener("click", (event) => {
  if (cropSpecsMenu.hidden || cropSpecsMenu.contains(event.target) || cropSpecsBtn.contains(event.target)) {
    return;
  }
  setCropSpecsMenuOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (!cropSpecsMenu.hidden) {
    event.preventDefault();
    setCropSpecsMenuOpen(false, true);
  }
});
imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    handleImageUpload(file);
  }
});
function handleImageUpload(file) {
  const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!supportedTypes.includes(file.type)) {
    window.alert("\u5F53\u524D\u683C\u5F0F\u65E0\u6CD5\u5728\u6D4F\u89C8\u5668\u4E2D\u4FDD\u6301\u539F\u683C\u5F0F\u5BFC\u51FA\uFF0C\u8BF7\u4E0A\u4F20 JPG\u3001PNG \u6216 WebP \u56FE\u7247\u3002");
    imageInput.value = "";
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
  image.removeAttribute("src");
  resetCropMode();
  setDownloadState(false);
  setEditorState("loading");
  const reader = new FileReader();
  reader.onload = (event) => {
    if (loadToken !== imageLoadToken) return;
    currentFile = file;
    currentImage = event.target.result;
    image.alt = `${file.name} \u7684\u88C1\u5207\u9884\u89C8`;
    loadImageBeforeCropper(currentImage, loadToken);
  };
  reader.onerror = () => {
    if (loadToken !== imageLoadToken) return;
    resetEditorAfterImageError("\u56FE\u7247\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6587\u4EF6\u3002");
  };
  reader.readAsDataURL(file);
}
function setEditorState(state) {
  const isReady = state === "ready";
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
  if (state === "loading") {
    canvasEmptyStateTitle.textContent = "\u6B63\u5728\u52A0\u8F7D\u56FE\u7247\u2026";
    canvasEmptyStateLabel.textContent = "\u6B63\u5728\u51C6\u5907\u88C1\u5207\u753B\u5E03";
    cropModeLabel.textContent = "\u52A0\u8F7D\u4E2D";
    cropSizeBadge.textContent = "\u52A0\u8F7D\u4E2D\u2026";
  } else if (state === "ready") {
    cropModeLabel.textContent = "\u81EA\u7531\u88C1\u5207";
  } else if (state === "empty") {
    canvasEmptyStateTitle.textContent = "\u8FD8\u6CA1\u6709\u56FE\u7247";
    canvasEmptyStateLabel.textContent = "\u70B9\u51FB\u53F3\u4E0A\u89D2\u201C\u4E0A\u4F20\u201D\u9009\u62E9 JPG\u3001PNG \u6216 WebP";
    cropModeLabel.textContent = "\u7B49\u5F85\u56FE\u7247";
    cropSizeBadge.textContent = "\u672A\u9009\u62E9\u56FE\u7247";
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
  resetIdPhotoState();
  imageInput.value = "";
  image.removeAttribute("src");
  image.alt = "\u5F85\u88C1\u5207\u56FE\u7247";
  resetCropMode();
  setDownloadState(false);
  setEditorState("empty");
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
    if (imageReady || loadToken !== imageLoadToken || !image.naturalWidth || !image.naturalHeight) {
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
  image.removeAttribute("src");
  image.onload = initializeWhenLayoutIsReady;
  image.onerror = () => {
    if (loadToken !== imageLoadToken) return;
    imageReady = true;
    image.onload = null;
    image.onerror = null;
    resetEditorAfterImageError("\u56FE\u7247\u89E3\u7801\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u56FE\u7247\u3002");
  };
  image.src = imageUrl;
  if (image.complete && image.naturalWidth && image.naturalHeight) {
    initializeWhenLayoutIsReady();
  }
}
function setIdPhotoMakerState(isEnabled) {
  makeIdPhotoBtn.disabled = !isEnabled || isBackgroundRemovalInProgress;
}
function resetIdPhotoState() {
  hasBackgroundReplacement = false;
  foregroundImage = null;
  selectedBackgroundColor = "#ffffff";
  makeIdPhotoBtnLabel.textContent = "\u5236\u4F5C";
  idPhotoPanel.hidden = true;
  setActiveBackgroundSwatch(document.querySelector('.background-swatch[data-background="#ffffff"]'));
}
function setActiveBackgroundSwatch(activeButton) {
  backgroundSwatches.forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}
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
      reject(new Error("\u900F\u660E\u4EBA\u50CF\u56FE\u5C42\u52A0\u8F7D\u5931\u8D25\u3002"));
    };
    foreground.src = objectUrl;
  });
}
function waitForBackgroundRemovalSandbox() {
  if (isBackgroundRemovalSandboxReady) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    backgroundRemovalSandboxReadyTimeout = window.setTimeout(() => {
      resolveBackgroundRemovalSandboxReady = null;
      reject(new Error("\u667A\u80FD\u62A0\u56FE\u6A21\u5757\u52A0\u8F7D\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u6269\u5C55\u540E\u91CD\u8BD5\u3002"));
    }, 1e4);
    resolveBackgroundRemovalSandboxReady = resolve;
  });
}
async function requestBackgroundRemoval() {
  if (!currentFile) {
    throw new Error("\u672A\u627E\u5230\u5F85\u5904\u7406\u56FE\u7247\u3002");
  }
  await waitForBackgroundRemovalSandbox();
  const imageBuffer = await currentFile.arrayBuffer();
  const requestId = ++backgroundRemovalRequestId;
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      backgroundRemovalRequest = null;
      reject(new Error("\u667A\u80FD\u62A0\u56FE\u5904\u7406\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002"));
    }, 12e4);
    backgroundRemovalRequest = { requestId, resolve, reject, timeoutId };
    backgroundRemovalFrame.contentWindow.postMessage({
      type: "remove-background",
      requestId,
      imageBuffer,
      imageType: currentFile.type
    }, "*", [imageBuffer]);
  });
}
function handleBackgroundRemovalMessage(event) {
  if (event.source !== backgroundRemovalFrame.contentWindow || !event.data) {
    return;
  }
  const message = event.data;
  if (message.type === "background-removal-ready") {
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
  if (message.type === "background-removal-progress") {
    makeIdPhotoBtnLabel.textContent = `\u52A0\u8F7D\u6A21\u578B ${message.progress}%`;
    return;
  }
  window.clearTimeout(backgroundRemovalRequest.timeoutId);
  const pendingRequest = backgroundRemovalRequest;
  backgroundRemovalRequest = null;
  if (message.type === "background-removal-result") {
    pendingRequest.resolve(new Blob([message.imageBuffer], { type: "image/png" }));
    return;
  }
  pendingRequest.reject(new Error(message.error || "\u667A\u80FD\u62A0\u56FE\u5904\u7406\u5931\u8D25\u3002"));
}
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
    console.error("\u8BFB\u53D6\u62CD\u6444\u7167\u7247\u5931\u8D25\uFF1A", error);
  }
}
function refineForegroundEdge(foreground) {
  const edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = foreground.naturalWidth;
  edgeCanvas.height = foreground.naturalHeight;
  const edgeContext = edgeCanvas.getContext("2d");
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
function getMinimumNeighborAlpha(alphaValues, width, pixelIndex) {
  const offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  let minimumAlpha = 255;
  offsets.forEach((offset) => {
    minimumAlpha = Math.min(minimumAlpha, alphaValues[pixelIndex + offset]);
  });
  return minimumAlpha;
}
function loadForegroundImageFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    const refinedForeground = new Image();
    refinedForeground.onload = () => resolve(refinedForeground);
    refinedForeground.onerror = () => reject(new Error("\u4EBA\u7269\u8FB9\u7F18\u4FEE\u6B63\u5931\u8D25\u3002"));
    refinedForeground.src = canvas.toDataURL("image/png");
  });
}
async function makeIdPhoto() {
  if (!editorHasImage || !currentImage || isBackgroundRemovalInProgress) return;
  isBackgroundRemovalInProgress = true;
  makeIdPhotoBtnLabel.textContent = "\u5904\u7406\u4E2D\u2026";
  setIdPhotoMakerState(false);
  try {
    const foregroundBlob = await requestBackgroundRemoval();
    const rawForegroundImage = await loadForegroundImage(foregroundBlob);
    foregroundImage = await refineForegroundEdge(rawForegroundImage);
    hasBackgroundReplacement = true;
    idPhotoPanel.hidden = false;
    makeIdPhotoBtnLabel.textContent = "\u91CD\u65B0\u5236\u4F5C";
    applyBackgroundReplacement();
  } catch (error) {
    console.error("\u667A\u80FD\u62A0\u56FE\u5931\u8D25\uFF1A", error);
    makeIdPhotoBtnLabel.textContent = "\u5236\u4F5C";
    window.alert("\u667A\u80FD\u62A0\u56FE\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u6269\u5C55\u6743\u9650\u540E\u91CD\u8BD5\u3002");
  } finally {
    isBackgroundRemovalInProgress = false;
    setIdPhotoMakerState(editorHasImage);
  }
}
function applyBackgroundReplacement() {
  if (!foregroundImage || !cropper) return;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = foregroundImage.naturalWidth;
  outputCanvas.height = foregroundImage.naturalHeight;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) return;
  outputContext.fillStyle = selectedBackgroundColor;
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(foregroundImage, 0, 0);
  cropper.replace(outputCanvas.toDataURL("image/png"), true);
}
function restoreOriginalImage() {
  if (!cropper || !currentImage) return;
  cropper.replace(currentImage, true);
  hasBackgroundReplacement = false;
  foregroundImage = null;
  selectedBackgroundColor = "#ffffff";
  idPhotoPanel.hidden = true;
  makeIdPhotoBtnLabel.textContent = "\u5236\u4F5C";
  setActiveBackgroundSwatch(document.querySelector('.background-swatch[data-background="#ffffff"]'));
}
function selectFullImage() {
  if (!cropper) return;
  const canvasData = cropper.getCanvasData();
  if (!Number.isFinite(canvasData.left) || !Number.isFinite(canvasData.top) || !Number.isFinite(canvasData.width) || !Number.isFinite(canvasData.height)) {
    return;
  }
  cropper.setCropBoxData({
    left: canvasData.left,
    top: canvasData.top,
    width: canvasData.width,
    height: canvasData.height
  });
  syncCropSize(cropper.getData());
}
function initCropper(loadToken) {
  if (cropper) {
    cropper.destroy();
  }
  cropper = new Cropper(image, {
    viewMode: 1,
    dragMode: "move",
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
      setEditorState("ready");
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
    }
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
    cropSizeBadge.textContent = `${selectedPreset.width} \xD7 ${selectedPreset.height} px \u5BFC\u51FA`;
  } else {
    cropSizeBadge.textContent = `${width} \xD7 ${height} px`;
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
  if (!Number.isFinite(containerData.width) || !Number.isFinite(containerData.height) || !Number.isFinite(cropBoxData.left) || !Number.isFinite(cropBoxData.top) || !Number.isFinite(cropBoxData.width) || !Number.isFinite(cropBoxData.height)) {
    return;
  }
  const centeredLeft = (containerData.width - cropBoxData.width) / 2;
  const centeredTop = (containerData.height - cropBoxData.height) / 2;
  const offsetX = centeredLeft - cropBoxData.left;
  const offsetY = centeredTop - cropBoxData.top;
  if (Math.abs(offsetX) < 0.5 && Math.abs(offsetY) < 0.5) return;
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
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}
function getModeName(button) {
  const label = button.querySelector(".preset-name, span");
  return label ? label.textContent.trim() : button.textContent.trim();
}
function setFreeAspectRatioPreservingCropBox() {
  if (!cropper) return;
  const cropBoxData = cropper.getCropBoxData();
  cropper.setAspectRatio(NaN);
  if (Number.isFinite(cropBoxData.width) && Number.isFinite(cropBoxData.height) && cropBoxData.width > 0 && cropBoxData.height > 0) {
    cropper.setCropBoxData(cropBoxData);
  }
}
function clearCustomRatioInputs() {
  cancelPendingCustomRatioApply();
  customRatioWidthInput.value = "";
  customRatioHeightInput.value = "";
  clearSizeError();
}
function activateFreeModePreservingCustomRatio() {
  selectedPreset = null;
  setActiveRatioButton(freeRatioButton);
  cropModeLabel.textContent = "\u81EA\u7531\u88C1\u5207";
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
  const isFree = button.dataset.ratio === "free";
  const modeName = getModeName(button);
  selectedPreset = hasPreset ? { width: presetWidth, height: presetHeight } : null;
  if (hasPreset) {
    cropModeLabel.textContent = `${modeName} \xB7 \u8BC1\u4EF6\u7167`;
    cropSizeBadge.textContent = `${presetWidth} \xD7 ${presetHeight} px \u5BFC\u51FA`;
  } else if (isFree) {
    cropModeLabel.textContent = "\u81EA\u7531\u88C1\u5207";
  } else {
    cropModeLabel.textContent = `${modeName} \u6BD4\u4F8B`;
  }
  if (!cropper || !updateCropper) return;
  if (isFree) {
    setFreeAspectRatioPreservingCropBox();
    scheduleCropSizeSync(cropper.getData());
    return;
  }
  const ratio = hasPreset ? presetWidth / presetHeight : button.dataset.ratio;
  cropper.setAspectRatio(Number(ratio));
  scheduleCropSizeSync(cropper.getData());
}
ratioButtons.forEach((button) => {
  button.addEventListener("click", () => {
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
  sizeInputs.forEach((input) => input.setAttribute("aria-invalid", "true"));
}
function clearSizeError() {
  sizeError.textContent = "";
  sizeError.hidden = true;
  sizeInputs.forEach((input) => input.removeAttribute("aria-invalid"));
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
    if (fixedRatioButton.classList.contains("active")) {
      activateFreeModePreservingCustomRatio();
    }
    return false;
  }
  const widthValue = Number(widthText);
  const heightValue = Number(heightText);
  if (!Number.isInteger(widthValue) || !Number.isInteger(heightValue) || widthValue < 1 || heightValue < 1) {
    showSizeError("\u8BF7\u8F93\u5165\u5927\u4E8E 0 \u7684\u6574\u6570\u50CF\u7D20\u503C\uFF0C\u7528\u4E8E\u8BBE\u5B9A\u6BD4\u4F8B\u3002");
    if (fixedRatioButton.classList.contains("active")) {
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
  cropModeLabel.textContent = `\u56FA\u5B9A\u6BD4\u4F8B \xB7 ${widthValue / first}:${heightValue / first}`;
  scheduleCropSizeSync(cropper.getData());
  return true;
}
sizeInputs.forEach((input) => {
  input.addEventListener("input", () => {
    clearSizeError();
    scheduleCustomRatioApply();
  });
  input.addEventListener("change", applyCustomRatio);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCustomRatio();
    }
  });
});
rotateLeftBtn.addEventListener("click", () => {
  if (cropper) {
    cropper.rotate(-90);
  }
});
rotateRightBtn.addEventListener("click", () => {
  if (cropper) {
    cropper.rotate(90);
  }
});
flipHBtn.addEventListener("click", () => {
  if (cropper) {
    scaleX = -scaleX;
    cropper.scaleX(scaleX);
  }
});
flipVBtn.addEventListener("click", () => {
  if (cropper) {
    scaleY = -scaleY;
    cropper.scaleY(scaleY);
  }
});
function setDownloadState(isLoading) {
  downloadInProgress = isLoading;
  downloadBtn.disabled = !editorHasImage || isLoading;
  downloadBtn.classList.toggle("is-loading", isLoading);
  downloadBtnLabel.textContent = isLoading ? "\u5BFC\u51FA\u4E2D\u2026" : "\u4E0B\u8F7D";
}
downloadBtn.addEventListener("click", () => {
  if (!editorHasImage || !cropper || !currentFile || downloadInProgress) return;
  setDownloadState(true);
  const canvasOptions = {
    maxWidth: 4096,
    maxHeight: 4096,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high"
  };
  if (selectedPreset) {
    canvasOptions.width = selectedPreset.width;
    canvasOptions.height = selectedPreset.height;
  }
  if (currentFile.type === "image/jpeg") {
    canvasOptions.fillColor = "#fff";
  }
  let canvas;
  try {
    canvas = cropper.getCroppedCanvas(canvasOptions);
  } catch (error) {
    setDownloadState(false);
    window.alert("\u56FE\u7247\u5BFC\u51FA\u5931\u8D25\uFF0C\u8BF7\u7F29\u5C0F\u88C1\u5207\u8303\u56F4\u540E\u91CD\u8BD5\u3002");
    return;
  }
  if (!canvas) {
    setDownloadState(false);
    window.alert("\u56FE\u7247\u5BFC\u51FA\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u88C1\u5207\u533A\u57DF\u3002");
    return;
  }
  const extensionsByMime = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"]
  };
  const mimeType = currentFile.type;
  const originalExtension = currentFile.name.split(".").pop().toLowerCase();
  const allowedExtensions = extensionsByMime[mimeType];
  const extension = allowedExtensions.includes(originalExtension) ? originalExtension : allowedExtensions[0];
  const originalBaseName = currentFile.name.replace(/\.[^.]+$/, "") || "image";
  const outputSuffix = hasBackgroundReplacement ? "-id-photo" : "-cropped";
  canvas.toBlob((blob) => {
    setDownloadState(false);
    if (!blob || blob.type !== mimeType) {
      window.alert("\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u4FDD\u6301\u8BE5\u56FE\u7247\u683C\u5F0F\uFF0C\u8BF7\u5347\u7EA7\u6D4F\u89C8\u5668\u6216\u6539\u7528 JPG\u3001PNG\u3001WebP\u3002");
      return;
    }
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `${originalBaseName}${outputSuffix}.${extension}`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }, mimeType, mimeType === "image/jpeg" || mimeType === "image/webp" ? 0.95 : void 0);
});
function resetCropMode() {
  selectedPreset = null;
  scaleX = 1;
  scaleY = 1;
  cancelPendingCropCentering();
  clearCustomRatioInputs();
  cropModeLabel.textContent = "\u81EA\u7531\u88C1\u5207";
  cropSizeBadge.textContent = "\u51C6\u5907\u4E2D";
  setActiveRatioButton(freeRatioButton);
}
setEditorState("empty");
loadCapturedPhoto();
