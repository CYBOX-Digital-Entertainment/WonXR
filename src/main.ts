import './styles.css';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

const TARGET_MIND_PATH = 'targets/gyorido_empty.mind';
const OVERLAY_IMAGE_PATH = 'overlays/gyorido_text_overlay.png';
const TARGET_WIDTH = 1;
const TARGET_HEIGHT = 1415 / 1000;

const OVERLAY_SCALE_X = 1.0;
const OVERLAY_SCALE_Y = 1.0;
const OVERLAY_OFFSET_X = 0.0;
const OVERLAY_OFFSET_Y = 0.0;
const OVERLAY_ROTATION_Z = 0.0;

const POSITION_SMOOTHING = 0.18;
const ROTATION_SMOOTHING = 0.18;
const SCALE_SMOOTHING = 0.18;
const LOST_HOLD_MS = 400;

const TRACKING_FILTER_MIN_CF = 0.001;
const TRACKING_FILTER_BETA = 50;
const TRACKING_WARMUP_TOLERANCE = 5;
const TRACKING_MISS_TOLERANCE = 10;

const CALIBRATION_STORAGE_KEY = 'wonxr-overlay-calibration';
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const queryParams = new URLSearchParams(window.location.search);
const isCalibrationMode = queryParams.get('cal') === '1';

type OverlayCalibration = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  rotationZ: number;
};

type CalibrationField = keyof OverlayCalibration;

const neutralCalibration: OverlayCalibration = {
  scaleX: OVERLAY_SCALE_X,
  scaleY: OVERLAY_SCALE_Y,
  offsetX: OVERLAY_OFFSET_X,
  offsetY: OVERLAY_OFFSET_Y,
  rotationZ: OVERLAY_ROTATION_Z,
};

const calibrationParamByField: Record<CalibrationField, string> = {
  scaleX: 'sx',
  scaleY: 'sy',
  offsetX: 'ox',
  offsetY: 'oy',
  rotationZ: 'rz',
};

function parseFiniteNumber(value: string | null, fallback: number) {
  if (value === null) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNumberParam(name: string, fallback: number) {
  return parseFiniteNumber(queryParams.get(name), fallback);
}

function readUnitNumberParam(name: string, fallback: number) {
  const value = readNumberParam(name, fallback);
  return Math.min(Math.max(value, 0), 1);
}

function readNonNegativeNumberParam(name: string, fallback: number) {
  return Math.max(readNumberParam(name, fallback), 0);
}

function readStoredCalibration() {
  if (!isCalibrationMode) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<Record<CalibrationField, unknown>>;
    const stored: Partial<OverlayCalibration> = {};

    for (const field of Object.keys(neutralCalibration) as CalibrationField[]) {
      const value = parsed[field];

      if (typeof value === 'number' && Number.isFinite(value)) {
        stored[field] = value;
      }
    }

    return stored;
  } catch (error) {
    console.warn('Failed to read overlay calibration from localStorage.', error);
    return {};
  }
}

const storedCalibration = readStoredCalibration();

function readCalibrationValue(field: CalibrationField, fallback: number) {
  const paramName = calibrationParamByField[field];

  if (queryParams.has(paramName)) {
    return readNumberParam(paramName, fallback);
  }

  return storedCalibration[field] ?? fallback;
}

const overlayCalibration: OverlayCalibration = {
  scaleX: readCalibrationValue('scaleX', OVERLAY_SCALE_X),
  scaleY: readCalibrationValue('scaleY', OVERLAY_SCALE_Y),
  offsetX: readCalibrationValue('offsetX', OVERLAY_OFFSET_X),
  offsetY: readCalibrationValue('offsetY', OVERLAY_OFFSET_Y),
  rotationZ: readCalibrationValue('rotationZ', OVERLAY_ROTATION_Z),
};

const smoothingSettings = {
  position: readUnitNumberParam('ps', POSITION_SMOOTHING),
  rotation: readUnitNumberParam('rs', ROTATION_SMOOTHING),
  scale: readUnitNumberParam('ss', SCALE_SMOOTHING),
};

const trackingSettings = {
  filterMinCF: readNonNegativeNumberParam('mincf', TRACKING_FILTER_MIN_CF),
  filterBeta: readNonNegativeNumberParam('beta', TRACKING_FILTER_BETA),
  warmupTolerance: readNonNegativeNumberParam('warmup', TRACKING_WARMUP_TOLERANCE),
  missTolerance: readNonNegativeNumberParam('miss', TRACKING_MISS_TOLERANCE),
};

const lostHoldMs = readNonNegativeNumberParam('hold', LOST_HOLD_MS);

console.log('WonXR AR config', {
  targetMindPath: TARGET_MIND_PATH,
  targetMindUrl: assetUrl(TARGET_MIND_PATH),
  overlayPath: OVERLAY_IMAGE_PATH,
  overlayUrl: assetUrl(OVERLAY_IMAGE_PATH),
  calibration: {
    ox: overlayCalibration.offsetX,
    oy: overlayCalibration.offsetY,
    sx: overlayCalibration.scaleX,
    sy: overlayCalibration.scaleY,
    rz: overlayCalibration.rotationZ,
  },
  tracking: trackingSettings,
  smoothing: smoothingSettings,
  holdMs: lostHoldMs,
});

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <div id="ar-container" class="ar-container" aria-hidden="true"></div>

  <main class="ui-overlay">
    <section class="intro-panel" aria-live="polite">
      <p class="eyebrow">WonXR</p>
      <h1>교리도 그림을 비춰주세요</h1>
      <p id="message" class="message">카메라를 시작하면 교리도 인식을 준비합니다.</p>
    </section>

    <button id="start-button" class="start-button" type="button">카메라 시작</button>

    <aside id="calibration-panel" class="calibration-panel${isCalibrationMode ? '' : ' hidden'}" aria-label="오버레이 보정">
      <div class="calibration-header">
        <strong>Cal</strong>
        <span id="calibration-values"></span>
      </div>
      <div class="calibration-grid">
        <button type="button" data-cal-field="offsetX" data-cal-delta="-0.002">X-</button>
        <button type="button" data-cal-field="offsetX" data-cal-delta="0.002">X+</button>
        <button type="button" data-cal-field="offsetY" data-cal-delta="-0.002">Y-</button>
        <button type="button" data-cal-field="offsetY" data-cal-delta="0.002">Y+</button>
        <button type="button" data-cal-field="scaleX" data-cal-delta="-0.005">SX-</button>
        <button type="button" data-cal-field="scaleX" data-cal-delta="0.005">SX+</button>
        <button type="button" data-cal-field="scaleY" data-cal-delta="-0.005">SY-</button>
        <button type="button" data-cal-field="scaleY" data-cal-delta="0.005">SY+</button>
        <button type="button" data-cal-field="rotationZ" data-cal-delta="-0.002">R-</button>
        <button type="button" data-cal-field="rotationZ" data-cal-delta="0.002">R+</button>
      </div>
      <div class="calibration-actions">
        <button type="button" data-cal-action="reset">Reset</button>
        <button type="button" data-cal-action="copy">Copy URL</button>
      </div>
    </aside>

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
const uiOverlay = requireElement<HTMLElement>('.ui-overlay');
const startButton = requireElement<HTMLButtonElement>('#start-button');
const statusText = requireElement<HTMLSpanElement>('#status-text');
const statusDot = requireElement<HTMLSpanElement>('#status-dot');
const message = requireElement<HTMLParagraphElement>('#message');
const calibrationValues = requireElement<HTMLSpanElement>('#calibration-values');
const calibrationButtons = document.querySelectorAll<HTMLButtonElement>('[data-cal-field]');
const calibrationActionButtons = document.querySelectorAll<HTMLButtonElement>('[data-cal-action]');

let mindarThree: MindARThree | undefined;
let hasStarted = false;
let overlayPlane: THREE.Mesh | undefined;

type StatusTone = 'waiting' | 'ready' | 'found' | 'error';

function setStatus(text: string, tone: StatusTone, detail?: string) {
  statusText.textContent = text;
  statusDot.className = `status-dot ${tone}`;

  if (detail) {
    message.textContent = detail;
  }
}

function setUiCompact(isCompact: boolean) {
  uiOverlay.classList.toggle('compact', isCompact);
}

function formatCalibrationValue(value: number) {
  return Number(value.toFixed(5)).toString();
}

function updateCalibrationDisplay() {
  calibrationValues.textContent =
    `X ${formatCalibrationValue(overlayCalibration.offsetX)} ` +
    `Y ${formatCalibrationValue(overlayCalibration.offsetY)} ` +
    `SX ${formatCalibrationValue(overlayCalibration.scaleX)} ` +
    `SY ${formatCalibrationValue(overlayCalibration.scaleY)} ` +
    `R ${formatCalibrationValue(overlayCalibration.rotationZ)}`;
}

function persistCalibration() {
  try {
    window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(overlayCalibration));
  } catch (error) {
    console.warn('Failed to save overlay calibration to localStorage.', error);
  }
}

function applyOverlayCalibration(shouldPersist = false) {
  if (overlayPlane) {
    overlayPlane.scale.set(overlayCalibration.scaleX, overlayCalibration.scaleY, 1);
    overlayPlane.position.set(overlayCalibration.offsetX, overlayCalibration.offsetY, 0.001);
    overlayPlane.rotation.z = overlayCalibration.rotationZ;
  }

  updateCalibrationDisplay();

  if (shouldPersist) {
    persistCalibration();
  }
}

function changeCalibration(field: CalibrationField, delta: number) {
  const nextValue = overlayCalibration[field] + delta;
  const isScaleField = field === 'scaleX' || field === 'scaleY';
  overlayCalibration[field] = Number((isScaleField ? Math.max(nextValue, 0.1) : nextValue).toFixed(5));
  applyOverlayCalibration(true);
}

function resetCalibration() {
  Object.assign(overlayCalibration, neutralCalibration);
  applyOverlayCalibration(true);
}

function buildCalibrationUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('cal', '1');
  url.searchParams.set('ox', formatCalibrationValue(overlayCalibration.offsetX));
  url.searchParams.set('oy', formatCalibrationValue(overlayCalibration.offsetY));
  url.searchParams.set('sx', formatCalibrationValue(overlayCalibration.scaleX));
  url.searchParams.set('sy', formatCalibrationValue(overlayCalibration.scaleY));
  url.searchParams.set('rz', formatCalibrationValue(overlayCalibration.rotationZ));
  return url.toString();
}

async function copyCalibrationUrl() {
  const url = buildCalibrationUrl();

  try {
    await navigator.clipboard.writeText(url);
    setStatus('보정 URL 복사됨', 'ready', '현재 보정값이 포함된 주소를 복사했습니다.');
  } catch (error) {
    console.error('Failed to copy calibration URL.', error);
    setStatus('보정 URL 복사 실패', 'error', url);
  }
}

function canUseCamera() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function isAllowedCameraContext() {
  return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function assertArLayersCreated() {
  const videos = Array.from(arContainer.querySelectorAll('video'));
  const canvases = Array.from(arContainer.querySelectorAll('canvas'));
  const children = Array.from(arContainer.children).map((element) => ({
    tag: element.tagName.toLowerCase(),
    className: element.className,
    childCount: element.childElementCount,
  }));

  console.log('WonXR AR layer check', {
    videoCount: videos.length,
    canvasCount: canvases.length,
    children,
  });

  if (videos.length === 0) {
    throw new Error('카메라 영상 요소가 생성되지 않았습니다.');
  }

  if (canvases.length === 0) {
    throw new Error('AR 렌더링 canvas가 생성되지 않았습니다.');
  }
}

async function loadOverlayTexture() {
  const loader = new THREE.TextureLoader();
  const texture = await loader.loadAsync(assetUrl(OVERLAY_IMAGE_PATH));
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
  setUiCompact(false);
  startButton.disabled = true;
  startButton.textContent = '카메라 준비 중';
  setStatus('다시 교리도를 비춰주세요', 'ready', '카메라 권한을 요청합니다.');

  try {
    const overlayTexture = await loadOverlayTexture();

    mindarThree = new MindARThree({
      container: arContainer,
      imageTargetSrc: assetUrl(TARGET_MIND_PATH),
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
      // filterMinCF: lower values can reduce jitter but may slow the response.
      filterMinCF: trackingSettings.filterMinCF,
      // filterBeta: affects motion lag compensation.
      filterBeta: trackingSettings.filterBeta,
      // warmupTolerance/missTolerance stabilize found/lost state transitions.
      warmupTolerance: trackingSettings.warmupTolerance,
      missTolerance: trackingSettings.missTolerance,
    });

    const { renderer, scene, camera } = mindarThree;
    const anchor = mindarThree.addAnchor(0);
    const stableGroup = new THREE.Group();
    const targetPosition = new THREE.Vector3();
    const targetQuaternion = new THREE.Quaternion();
    const targetScale = new THREE.Vector3();

    let isTargetFound = false;
    let isStableInitialized = false;
    let lastSeenAt = 0;
    let foundAt = 0;
    let statusMode: 'waiting' | 'smoothing' | 'found' = 'waiting';

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    stableGroup.visible = false;
    scene.add(stableGroup);

    const overlayGeometry = new THREE.PlaneGeometry(TARGET_WIDTH, TARGET_HEIGHT);
    const overlayMaterial = new THREE.MeshBasicMaterial({
      map: overlayTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    overlayPlane = new THREE.Mesh(overlayGeometry, overlayMaterial);
    overlayPlane.renderOrder = 10;
    stableGroup.add(overlayPlane);
    applyOverlayCalibration();

    anchor.onTargetFound = () => {
      const now = performance.now();
      isTargetFound = true;
      foundAt = now;
      lastSeenAt = now;
      stableGroup.visible = true;
      setUiCompact(true);
      statusMode = 'smoothing';
      setStatus('인식됨  안정화 중', 'found', '추적 위치를 부드럽게 보정하고 있습니다.');
    };

    anchor.onTargetLost = () => {
      isTargetFound = false;

      if (stableGroup.visible) {
        statusMode = 'smoothing';
        setStatus('인식됨  안정화 중', 'found', '순간적인 추적 끊김을 보정하고 있습니다.');
      }
    };

    await mindarThree.start();
    assertArLayersCreated();

    startButton.classList.add('hidden');
    setStatus('다시 교리도를 비춰주세요', 'waiting', '카메라 화면 안에 교리도 그림이 들어오도록 맞춰주세요.');

    renderer.setAnimationLoop(() => {
      const now = performance.now();

      if (isTargetFound) {
        anchor.group.updateMatrixWorld(true);
        anchor.group.matrixWorld.decompose(targetPosition, targetQuaternion, targetScale);

        if (!isStableInitialized) {
          stableGroup.position.copy(targetPosition);
          stableGroup.quaternion.copy(targetQuaternion);
          stableGroup.scale.copy(targetScale);
          isStableInitialized = true;
        } else {
          stableGroup.position.lerp(targetPosition, smoothingSettings.position);
          stableGroup.quaternion.slerp(targetQuaternion, smoothingSettings.rotation);
          stableGroup.scale.lerp(targetScale, smoothingSettings.scale);
        }

        lastSeenAt = now;
        stableGroup.visible = true;

        if (statusMode !== 'found' && now - foundAt > 700) {
          statusMode = 'found';
          setStatus('인식됨', 'found', '교리도 오버레이를 표시하고 있습니다.');
        }
      } else if (stableGroup.visible && now - lastSeenAt > lostHoldMs) {
        stableGroup.visible = false;
        isStableInitialized = false;
        statusMode = 'waiting';
        setUiCompact(false);
        setStatus('다시 교리도를 비춰주세요', 'waiting', '교리도 그림이 화면 안에 들어오도록 맞춰주세요.');
      }

      renderer.render(scene, camera);
    });
  } catch (error) {
    try {
      mindarThree?.stop();
    } catch (stopError) {
      console.error('Failed to stop MindAR after start error.', stopError);
    }

    mindarThree = undefined;
    overlayPlane = undefined;
    hasStarted = false;
    setUiCompact(false);
    startButton.disabled = false;
    startButton.textContent = '다시 시도';

    const detail = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    const title = detail.includes('영상 요소')
      ? '카메라 영상 생성 실패'
      : detail.toLowerCase().includes('camera') || detail.toLowerCase().includes('permission')
        ? '카메라 시작 실패'
        : 'AR 시작 실패';

    setStatus(title, 'error', detail);
    console.error(error);
  }
}

for (const button of calibrationButtons) {
  button.addEventListener('click', () => {
    const field = button.dataset.calField as CalibrationField | undefined;
    const delta = Number(button.dataset.calDelta);

    if (!field || !(field in overlayCalibration) || !Number.isFinite(delta)) {
      return;
    }

    changeCalibration(field, delta);
  });
}

for (const button of calibrationActionButtons) {
  button.addEventListener('click', () => {
    if (button.dataset.calAction === 'reset') {
      resetCalibration();
    }

    if (button.dataset.calAction === 'copy') {
      void copyCalibrationUrl();
    }
  });
}

window.addEventListener('beforeunload', () => {
  mindarThree?.stop();
});

updateCalibrationDisplay();

startButton.addEventListener('click', () => {
  void startAR();
});
