import { removeBackground } from '@imgly/background-removal';

/** 向父页面报告主体模型加载进度，便于首次使用时展示处理状态。 */
function reportProgress(requestId, key, current, total) {
  if (!total || !key.startsWith('fetch:')) {
    return;
  }

  const progress = Math.min(100, Math.round((current / total) * 100));
  window.parent.postMessage({ type: 'background-removal-progress', requestId, progress }, '*');
}

/** 在 CSP 放宽的沙箱中运行 ONNX 主体抠图模型，并将透明 PNG 返回给主页面。 */
async function processBackgroundRemoval(message) {
  try {
    const imageBlob = new Blob([message.imageBuffer], { type: message.imageType });
    const foregroundBlob = await removeBackground(imageBlob, {
      model: 'isnet_fp16',
      proxyToWorker: false,
      fetchArgs: {
        cache: 'force-cache',
      },
      output: {
        format: 'image/png',
        quality: 1,
      },
      progress: (key, current, total) => reportProgress(message.requestId, key, current, total),
    });
    const imageBuffer = await foregroundBlob.arrayBuffer();
    window.parent.postMessage({
      type: 'background-removal-result',
      requestId: message.requestId,
      imageBuffer,
    }, '*', [imageBuffer]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '智能抠图处理失败。';
    window.parent.postMessage({
      type: 'background-removal-error',
      requestId: message.requestId,
      error: errorMessage,
    }, '*');
  }
}

/** 接收主页面传入的图片二进制数据，并按请求类型启动沙箱任务。 */
function handleSandboxMessage(event) {
  if (!event.data || event.data.type !== 'remove-background') {
    return;
  }

  processBackgroundRemoval(event.data);
}

window.addEventListener('message', handleSandboxMessage);
window.parent.postMessage({ type: 'background-removal-ready' }, '*');
