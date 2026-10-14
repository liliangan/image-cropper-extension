let cameraStream = null;
let cameraCountdownTimer = null;
let cameraCountdownValue = 0;

const capturedPhotoStorageKey = 'capturedIdPhoto';
const cameraPreview = document.getElementById('cameraPreview');
const cameraVideo = document.getElementById('cameraVideo');
const cameraStatus = document.getElementById('cameraStatus');
const cameraCountdown = document.getElementById('cameraCountdown');
const captureCameraBtn = document.getElementById('captureCameraBtn');
const countdownCameraBtn = document.getElementById('countdownCameraBtn');
const retryCameraBtn = document.getElementById('retryCameraBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');

/** 启动独立页面的摄像头预览，并让浏览器在顶层扩展页面显示授权请求。 */
async function startCamera() {
  stopCameraStream();
  cancelCameraCountdown();
  cameraPreview.classList.remove('is-ready');
  retryCameraBtn.hidden = true;
  setCameraControlsEnabled(false);
  setCameraStatus('正在请求摄像头权限…');

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    cameraPreview.classList.add('is-ready');
    setCameraControlsEnabled(true);
  } catch (error) {
    setCameraStatus(getCameraErrorMessage(error));
    retryCameraBtn.hidden = false;
  }
}

/** 将媒体设备错误映射为用户可执行的处理说明。 */
function getCameraErrorMessage(error) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return '摄像头权限被拒绝。请确认 macOS“系统设置 > 隐私与安全性 > 摄像头”已允许 Google Chrome，然后点击重新请求权限。';
  }

  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return '未检测到可用摄像头，请连接设备后重试。';
  }

  if (error instanceof DOMException && error.name === 'NotReadableError') {
    return '摄像头正被其他应用占用，请关闭占用后重试。';
  }

  return '无法启动摄像头，请检查设备和系统权限。';
}

/** 更新摄像头页面中的状态信息。 */
function setCameraStatus(message) {
  cameraStatus.textContent = message;
}

/** 根据预览状态启用或禁用拍照与延时拍照操作。 */
function setCameraControlsEnabled(isEnabled) {
  captureCameraBtn.disabled = !isEnabled;
  countdownCameraBtn.disabled = !isEnabled;
}

/** 停止摄像头流并释放硬件资源。 */
function stopCameraStream() {
  if (!cameraStream) {
    return;
  }

  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraVideo.pause();
  cameraVideo.srcObject = null;
}

/** 清理倒计时状态，避免离开页面后仍然触发拍照。 */
function cancelCameraCountdown() {
  if (cameraCountdownTimer !== null) {
    window.clearTimeout(cameraCountdownTimer);
    cameraCountdownTimer = null;
  }

  cameraCountdownValue = 0;
  cameraCountdown.hidden = true;
  cameraCountdown.textContent = '';
}

/** 启动三秒倒计时拍摄。 */
function startCameraCountdown() {
  if (!cameraStream || cameraCountdownTimer !== null) {
    return;
  }

  cameraCountdownValue = 3;
  cameraCountdown.hidden = false;
  cameraCountdown.textContent = String(cameraCountdownValue);
  setCameraControlsEnabled(false);
  advanceCameraCountdown();
}

/** 推进倒计时并在归零时执行照片保存。 */
function advanceCameraCountdown() {
  cameraCountdownTimer = window.setTimeout(() => {
    cameraCountdownValue -= 1;
    if (cameraCountdownValue > 0) {
      cameraCountdown.textContent = String(cameraCountdownValue);
      advanceCameraCountdown();
      return;
    }

    cameraCountdownTimer = null;
    cameraCountdown.hidden = true;
    saveCameraPhoto();
  }, 1000);
}

/** 将视频帧保存到扩展本地存储，供编辑页在跳转后自动读取。 */
function saveCameraPhoto() {
  if (!cameraStream || !cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    return;
  }

  cancelCameraCountdown();
  setCameraControlsEnabled(false);
  setCameraStatus('正在导入编辑器…');
  const canvas = document.createElement('canvas');
  const outputSize = getCameraOutputSize(cameraVideo.videoWidth, cameraVideo.videoHeight);
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext('2d');
  if (!context) {
    setCameraStatus('照片生成失败，请重新拍摄。');
    setCameraControlsEnabled(true);
    return;
  }

  context.drawImage(
    cameraVideo,
    0,
    0,
    cameraVideo.videoWidth,
    cameraVideo.videoHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  canvas.toBlob(async (blob) => {
    await storeCapturedPhoto(blob);
  }, 'image/jpeg', 0.9);
}

/** 将拍摄尺寸限制为适合临时扩展存储的分辨率，同时保留证件照编辑所需清晰度。 */
function getCameraOutputSize(width, height) {
  const maxDimension = 1280;
  const longestSide = Math.max(width, height);
  if (longestSide <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longestSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** 将拍摄结果写入本地扩展存储，并在当前标签页直接跳转到编辑器。 */
async function storeCapturedPhoto(blob) {
  if (!blob) {
    setCameraStatus('照片生成失败，请重新拍摄。');
    setCameraControlsEnabled(true);
    return;
  }

  try {
    const dataUrl = await blobToDataUrl(blob);
    await chrome.storage.local.set({
      [capturedPhotoStorageKey]: {
        dataUrl,
        fileName: `id-photo-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      },
    });
    stopCameraStream();
    window.location.replace(chrome.runtime.getURL('popup.html'));
  } catch (error) {
    setCameraStatus('照片保存失败，请重新拍摄。');
    setCameraControlsEnabled(true);
    console.error('保存拍摄照片失败：', error);
  }
}

/** 将图像二进制转换为可存入扩展本地存储的 Data URL。 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('照片编码失败。'));
    reader.readAsDataURL(blob);
  });
}

retryCameraBtn.addEventListener('click', startCamera);
captureCameraBtn.addEventListener('click', saveCameraPhoto);
countdownCameraBtn.addEventListener('click', startCameraCountdown);
closeCameraBtn.addEventListener('click', () => window.close());
window.addEventListener('beforeunload', stopCameraStream);

startCamera();
