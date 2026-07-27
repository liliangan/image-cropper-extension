let cropper = null;
let currentImage = null;
let currentFile = null;
let selectedPreset = null;

// DOM元素
const imageInput = document.getElementById('imageInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadSection = document.getElementById('uploadSection');
const cropSection = document.getElementById('cropSection');
const image = document.getElementById('image');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');
const flipHBtn = document.getElementById('flipHBtn');
const flipVBtn = document.getElementById('flipVBtn');
const ratioButtons = document.querySelectorAll('.btn-ratio');

// 上传按钮点击
uploadBtn.addEventListener('click', () => {
  imageInput.click();
});

// 文件选择处理
imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handleImageUpload(file);
  }
});

// 处理图片上传
function handleImageUpload(file) {
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type)) {
    window.alert('当前格式无法在浏览器中保持原格式导出，请上传 JPG、PNG 或 WebP 图片。');
    imageInput.value = '';
    return;
  }

  currentFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImage = e.target.result;
    image.src = currentImage;
    uploadSection.style.display = 'none';
    cropSection.style.display = 'block';
    initCropper();
  };
  reader.readAsDataURL(file);
}

// 初始化Cropper
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
  });
}

// 比例按钮点击
ratioButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    ratioButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    selectedPreset = btn.dataset.width && btn.dataset.height
      ? { width: Number(btn.dataset.width), height: Number(btn.dataset.height) }
      : null;
    const ratio = selectedPreset
      ? selectedPreset.width / selectedPreset.height
      : btn.dataset.ratio;
    if (cropper) {
      if (ratio === 'free') {
        cropper.setAspectRatio(NaN);
      } else {
        cropper.setAspectRatio(parseFloat(ratio));
      }
    }
  });
});

// 旋转和翻转功能
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

let scaleX = 1;
let scaleY = 1;

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

// 下载裁切后的图片
downloadBtn.addEventListener('click', () => {
  if (!cropper || !currentFile) return;

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

  const canvas = cropper.getCroppedCanvas(canvasOptions);
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
    if (!blob || blob.type !== mimeType) {
      window.alert('当前浏览器无法保持该图片格式，请更换 Chrome 最新版或使用 JPG、PNG、WebP。');
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${originalBaseName}-cropped.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, mimeType, mimeType === 'image/jpeg' || mimeType === 'image/webp' ? 0.95 : undefined);
});

// 重置
resetBtn.addEventListener('click', () => {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  image.src = '';
  currentImage = null;
  currentFile = null;
  selectedPreset = null;
  imageInput.value = '';
  cropSection.style.display = 'none';
  uploadSection.style.display = 'block';
  ratioButtons.forEach(b => b.classList.remove('active'));
  scaleX = 1;
  scaleY = 1;
});
