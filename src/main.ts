import './styles.css';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

const TARGET_ASPECT_RATIO = 1415 / 1000;
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <main class="ar-shell">
    <div id="ar-container" class="ar-container" aria-hidden="true"></div>

    <section class="intro-panel" aria-live="polite">
      <p class="eyebrow">WonXR</p>
      <h1>교리도 그림을 비춰주세요</h1>
      <p id="message" class="message">카메라를 시작하면 교리도 인식을 준비합니다.</p>
    </section>

    <button id="start-button" class="start-button" type="button">카메라 시작</button>

    <div class="status-panel" role="status" aria-live="polite">
      <span id="status-dot" class="status-dot waiting"></span>
      <span id="status-text">다시 교리도를 비춰주세요</span>
    </div>
  </main>
`;

function requireElement<TElement extends Element>(selector: string) {
  const element = document.querySelector<TElement>(selector);

  if (!element) {
    throw new Error(`Required UI element was not found: ${selector}`);
  }

  return element;
}

const arContainer = requireElement<HTMLDivElement>('#ar-container');
const startButton = requireElement<HTMLButtonElement>('#start-button');
const statusText = requireElement<HTMLSpanElement>('#status-text');
const statusDot = requireElement<HTMLSpanElement>('#status-dot');
const message = requireElement<HTMLParagraphElement>('#message');

let mindarThree: MindARThree | undefined;
let hasStarted = false;

type StatusTone = 'waiting' | 'ready' | 'found' | 'error';

function setStatus(text: string, tone: StatusTone, detail?: string) {
  statusText.textContent = text;
  statusDot.className = `status-dot ${tone}`;

  if (detail) {
    message.textContent = detail;
  }
}

function canUseCamera() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function isAllowedCameraContext() {
  return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

async function loadOverlayTexture() {
  const loader = new THREE.TextureLoader();
  const texture = await loader.loadAsync(assetUrl('overlays/gyorido_text_overlay.png'));
  texture.encoding = THREE.sRGBEncoding;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

async function startAR() {
  if (hasStarted) {
    return;
  }

  if (!canUseCamera()) {
    setStatus('카메라를 사용할 수 없습니다', 'error', '이 브라우저는 카메라 접근을 지원하지 않습니다.');
    return;
  }

  if (!isAllowedCameraContext()) {
    setStatus('HTTPS 환경이 필요합니다', 'error', '카메라 권한은 HTTPS 또는 localhost에서만 요청할 수 있습니다.');
    return;
  }

  hasStarted = true;
  startButton.disabled = true;
  startButton.textContent = '카메라 준비 중';
  setStatus('다시 교리도를 비춰주세요', 'ready', '카메라 권한을 요청합니다.');

  try {
    const overlayTexture = await loadOverlayTexture();

    mindarThree = new MindARThree({
      container: arContainer,
      imageTargetSrc: assetUrl('targets/gyorido_empty.mind'),
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
    });

    const { renderer, scene, camera } = mindarThree;
    const anchor = mindarThree.addAnchor(0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    const overlayGeometry = new THREE.PlaneGeometry(1, TARGET_ASPECT_RATIO);
    const overlayMaterial = new THREE.MeshBasicMaterial({
      map: overlayTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const overlay = new THREE.Mesh(overlayGeometry, overlayMaterial);
    overlay.visible = false;
    overlay.renderOrder = 10;
    anchor.group.add(overlay);

    anchor.onTargetFound = () => {
      overlay.visible = true;
      setStatus('인식됨', 'found', '교리도 오버레이를 표시하고 있습니다.');
    };

    anchor.onTargetLost = () => {
      overlay.visible = false;
      setStatus('다시 교리도를 비춰주세요', 'waiting', '교리도 그림이 화면 안에 들어오도록 맞춰주세요.');
    };

    await mindarThree.start();

    startButton.classList.add('hidden');
    setStatus('다시 교리도를 비춰주세요', 'waiting', '교리도 그림이 화면 안에 들어오도록 맞춰주세요.');

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  } catch (error) {
    hasStarted = false;
    startButton.disabled = false;
    startButton.textContent = '다시 시도';

    const detail = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    setStatus('카메라 권한 실패', 'error', detail);
    console.error(error);
  }
}

window.addEventListener('beforeunload', () => {
  mindarThree?.stop();
});

startButton.addEventListener('click', () => {
  void startAR();
});
