import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const projectUrl = new URL('../', import.meta.url);
const dependencyUrl = new URL('node_modules/@imgly/background-removal/dist/index.mjs', projectUrl);
const runtimeUrl = new URL('runtime/onnxruntime-web/', projectUrl);
const onnxRuntimeUrl = new URL('node_modules/onnxruntime-web/dist/', projectUrl);

const originalWasmSetup = `  const baseFilePath = useWebGPU ? "/onnxruntime-web/ort-wasm-simd-threaded.jsep" : "/onnxruntime-web/ort-wasm-simd-threaded";
  const wasmPath = await loadAsUrl(\`${'${baseFilePath}'}.wasm\`, config);
  const mjsPath = await loadAsUrl(\`${'${baseFilePath}'}.mjs\`, config);
  ort2.env.wasm.wasmPaths = {
    mjs: mjsPath,
    wasm: wasmPath
  };`;

const extensionWasmSetup = `  const runtimeBaseUrl = new URL("./runtime/onnxruntime-web/", import.meta.url);
  ort2.env.wasm.wasmPaths = {
    mjs: new URL("ort-wasm-simd-threaded.mjs", runtimeBaseUrl).toString(),
    wasm: new URL("ort-wasm-simd-threaded.wasm", runtimeBaseUrl).toString()
  };`;

const originalThreadSetup = 'ort2.env.wasm.numThreads = maxNumThreads();';
const extensionThreadSetup = 'ort2.env.wasm.numThreads = 1;';

/** 为扩展内的 ONNX 执行环境准备本地 WASM 运行时文件。 */
async function copyOnnxRuntimeFiles() {
  await mkdir(runtimeUrl, { recursive: true });
  await Promise.all([
    copyFile(new URL('ort-wasm-simd-threaded.mjs', onnxRuntimeUrl), new URL('ort-wasm-simd-threaded.mjs', runtimeUrl)),
    copyFile(new URL('ort-wasm-simd-threaded.wasm', onnxRuntimeUrl), new URL('ort-wasm-simd-threaded.wasm', runtimeUrl)),
  ]);
}

/** 将依赖默认的 blob 运行时路径替换为扩展本地资源路径，满足 MV3 的 CSP 要求。 */
async function patchBackgroundRemovalDependency() {
  const dependencyPath = fileURLToPath(dependencyUrl);
  const source = await readFile(dependencyPath, 'utf8');
  let patchedSource = source;

  if (patchedSource.includes(originalWasmSetup)) {
    patchedSource = patchedSource.replace(originalWasmSetup, extensionWasmSetup);
  } else if (!patchedSource.includes(extensionWasmSetup)) {
    throw new Error('未找到可替换的 @imgly/background-removal WASM 初始化代码。');
  }

  if (patchedSource.includes(originalThreadSetup)) {
    patchedSource = patchedSource.replace(originalThreadSetup, extensionThreadSetup);
  } else if (!patchedSource.includes(extensionThreadSetup)) {
    throw new Error('未找到可替换的 @imgly/background-removal 线程配置。');
  }

  if (patchedSource === source) {
    return;
  }

  await writeFile(dependencyPath, patchedSource, 'utf8');
}

await copyOnnxRuntimeFiles();
await patchBackgroundRemovalDependency();
