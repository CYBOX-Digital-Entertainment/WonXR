import './styles.css';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { formatFeatureSupport, getCompatibilityReport } from './compatibility';

const TARGET_MIND_PATH = 'targets/gyorido_empty.mind';
const TARGET_MIND_V2_PATH = 'targets/gyorido_empty_v2.mind';
const OVERLAY_IMAGE_PATH = 'overlays/gyorido_text_overlay.png';
const HOTSPOT_DATA_PATH = 'data/doctrine_sections.json';
const TARGET_WIDTH = 1;
const TARGET_HEIGHT = 1415 / 1000;

const OVERLAY_SCALE_X = 1.0;
const OVERLAY_SCALE_Y = 1.0;
const OVERLAY_OFFSET_X = 0.0;
const OVERLAY_OFFSET_Y = 0.0;
const OVERLAY_ROTATION_Z = 0.0;
const HIT_AREA_PADDING = 0.012;
const ELEVATION_Z = 0.065;
const MAX_ELEVATION_Z = 0.12;
const BOX_DEPTH = 0.06;
const TOP_OPACITY = 0.95;
const SIDE_OPACITY = 0.78;
const HIGHLIGHT_OPACITY = 0.2;
const OUTLINE_OPACITY = 1.0;
const SELECTION_ANIMATION_MS = 260;
const FOUND_TO_EXPLORE_MS = 150;
const MIN_FOUND_FRAMES_FOR_EXPLORE = 1;

const POSITION_SMOOTHING = 0.1;
const ROTATION_SMOOTHING = 0.1;
const SCALE_SMOOTHING = 0.1;
const POSITION_DEADBAND = 0.0015;
const ROTATION_DEADBAND = 0.0015;
const SCALE_DEADBAND = 0.0015;
const MAX_POSITION_DELTA = 0.08;
const MAX_SCALE_DELTA = 0.1;
const MAX_ROTATION_DELTA = 0.25;
const LOST_HOLD_MS = 1200;
const FADE_OUT_MS = 250;
const STABLE_LOCK_FRAMES = 20;
const LOCK_BREAK_POSITION_DELTA = 0.06;
const LOCK_BREAK_ROTATION_DELTA = 0.2;

const TRACKING_FILTER_MIN_CF = 0.001;
const TRACKING_FILTER_BETA = 30;
const TRACKING_WARMUP_TOLERANCE = 5;
const TRACKING_MISS_TOLERANCE = 12;

const CALIBRATION_STORAGE_KEY = 'wonxr-overlay-calibration';
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const queryParams = new URLSearchParams(window.location.search);
const isFullDebugMode = queryParams.get('mode') === 'debug';
const isCalibrationMode = queryParams.get('cal') === '1';
const isDebugMode = isFullDebugMode || queryParams.get('debug') === '1';
const isHotspotMode = isFullDebugMode || queryParams.get('hotspots') === '1';
const requestedTargetVersion = queryParams.get('target') === 'v1' ? 'v1' : 'v2';
const requestedProfile = queryParams.get('profile');
const trackingProfile = requestedProfile === 'responsive' || requestedProfile === 'locked' ? requestedProfile : 'smooth';

type OverlayCalibration = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  rotationZ: number;
};

type CalibrationField = keyof OverlayCalibration;

type TrackingProfile = 'smooth' | 'responsive' | 'locked';

type AppState = 'scan' | 'tracking' | 'explore' | 'holding' | 'lost';

type ProfileSettings = {
  positionSmoothing: number;
  rotationSmoothing: number;
  scaleSmoothing: number;
  positionDeadband: number;
  rotationDeadband: number;
  scaleDeadband: number;
  lostHoldMs: number;
  lockDefault: boolean;
};

type DoctrineSection = {
  id: string;
  title: string;
  subtitle?: string;
  children?: string[];
  content?: string;
  color?: string;
  hotspot: {
    nx: number;
    ny: number;
    nw: number;
    nh: number;
  };
};

type DoctrineSectionsPayload = {
  sections: DoctrineSection[];
};

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

const profileDefaults: Record<TrackingProfile, ProfileSettings> = {
  smooth: {
    positionSmoothing: POSITION_SMOOTHING,
    rotationSmoothing: ROTATION_SMOOTHING,
    scaleSmoothing: SCALE_SMOOTHING,
    positionDeadband: POSITION_DEADBAND,
    rotationDeadband: ROTATION_DEADBAND,
    scaleDeadband: SCALE_DEADBAND,
    lostHoldMs: LOST_HOLD_MS,
    lockDefault: false,
  },
  responsive: {
    positionSmoothing: 0.25,
    rotationSmoothing: 0.25,
    scaleSmoothing: 0.25,
    positionDeadband: 0.0005,
    rotationDeadband: 0.0005,
    scaleDeadband: 0.0005,
    lostHoldMs: 400,
    lockDefault: false,
  },
  locked: {
    positionSmoothing: 0.06,
    rotationSmoothing: 0.06,
    scaleSmoothing: 0.06,
    positionDeadband: POSITION_DEADBAND,
    rotationDeadband: ROTATION_DEADBAND,
    scaleDeadband: SCALE_DEADBAND,
    lostHoldMs: 1200,
    lockDefault: true,
  },
};

const activeProfileDefaults = profileDefaults[trackingProfile];

const smoothingSettings = {
  // Lower values are smoother but respond more slowly to real camera motion.
  position: readUnitNumberParam('ps', activeProfileDefaults.positionSmoothing),
  // Lower values are smoother but respond more slowly to real camera motion.
  rotation: readUnitNumberParam('rs', activeProfileDefaults.rotationSmoothing),
  // Lower values are smoother but respond more slowly to real camera motion.
  scale: readUnitNumberParam('ss', activeProfileDefaults.scaleSmoothing),
};

const deadbandSettings = {
  position: readNonNegativeNumberParam('pdb', activeProfileDefaults.positionDeadband),
  rotation: readNonNegativeNumberParam('rdb', activeProfileDefaults.rotationDeadband),
  scale: readNonNegativeNumberParam('sdb', activeProfileDefaults.scaleDeadband),
};

const trackingSettings = {
  filterMinCF: readNonNegativeNumberParam('mincf', TRACKING_FILTER_MIN_CF),
  filterBeta: readNonNegativeNumberParam('beta', TRACKING_FILTER_BETA),
  warmupTolerance: readNonNegativeNumberParam('warmup', TRACKING_WARMUP_TOLERANCE),
  missTolerance: readNonNegativeNumberParam('miss', TRACKING_MISS_TOLERANCE),
};

const lostHoldMs = readNonNegativeNumberParam('hold', activeProfileDefaults.lostHoldMs);
const fadeOutMs = readNonNegativeNumberParam('fade', FADE_OUT_MS);
const outlierSettings = {
  position: readNonNegativeNumberParam('mpd', MAX_POSITION_DELTA),
  scale: readNonNegativeNumberParam('msd', MAX_SCALE_DELTA),
  rotation: readNonNegativeNumberParam('mrd', MAX_ROTATION_DELTA),
};
const lockSettings = {
  enabled: queryParams.has('lock') ? queryParams.get('lock') === '1' : activeProfileDefaults.lockDefault,
  stableFrames: Math.max(1, Math.round(readNonNegativeNumberParam('lockframes', STABLE_LOCK_FRAMES))),
  breakPosition: readNonNegativeNumberParam('lbp', LOCK_BREAK_POSITION_DELTA),
  breakRotation: readNonNegativeNumberParam('lbr', LOCK_BREAK_ROTATION_DELTA),
};
const hitAreaPadding = readNonNegativeNumberParam('hitpad', HIT_AREA_PADDING);
const selectionElevation = Math.min(readNonNegativeNumberParam('elev', ELEVATION_Z), MAX_ELEVATION_Z);
const selectionDepth = Math.min(readNonNegativeNumberParam('depth', BOX_DEPTH), MAX_ELEVATION_Z);
const compatibilityReport = getCompatibilityReport();

console.log('WonXR AR config', {
  mode: isFullDebugMode ? 'debug' : 'demo',
  targetVersion: requestedTargetVersion,
  targetMindPath: getRequestedTargetMindPath(),
  targetMindUrl: assetUrl(getRequestedTargetMindPath()),
  overlayPath: OVERLAY_IMAGE_PATH,
  overlayUrl: assetUrl(OVERLAY_IMAGE_PATH),
  calibration: {
    ox: overlayCalibration.offsetX,
    oy: overlayCalibration.offsetY,
    sx: overlayCalibration.scaleX,
    sy: overlayCalibration.scaleY,
    rz: overlayCalibration.rotationZ,
  },
  profile: trackingProfile,
  tracking: trackingSettings,
  smoothing: smoothingSettings,
  deadband: deadbandSettings,
  outlier: outlierSettings,
  lock: lockSettings,
  hotspots: {
    enabled: isHotspotMode,
    dataPath: HOTSPOT_DATA_PATH,
    dataUrl: assetUrl(HOTSPOT_DATA_PATH),
    hitAreaPadding,
  },
  selection: {
    elevation: selectionElevation,
    boxDepth: selectionDepth,
  },
  holdMs: lostHoldMs,
  fadeOutMs,
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
      <h1 id="intro-title">교리도 그림을 비춰주세요</h1>
      <p id="message" class="message">카메라를 시작하면 교리도 인식을 준비합니다.</p>
    </section>

    <button id="start-button" class="start-button" type="button">카메라 시작</button>
    <button id="info-button" class="info-button" type="button">정보</button>

    <section id="compatibility-panel" class="compatibility-panel hidden" role="alert">
      <strong id="compatibility-title">AR을 시작할 수 없습니다</strong>
      <p id="compatibility-message"></p>
      <p id="compatibility-recommendation"></p>
      <button id="compatibility-info-button" type="button">개발자 정보 / 라이선스 보기</button>
    </section>

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

    <svg id="debug-overlay" class="debug-overlay${isDebugMode ? '' : ' hidden'}" aria-hidden="true">
      <polyline id="debug-target-corners" class="debug-line debug-line-target" points=""></polyline>
      <polyline id="debug-overlay-corners" class="debug-line debug-line-overlay" points=""></polyline>
    </svg>

    <button id="debug-fab" class="debug-fab${isDebugMode ? '' : ' hidden'}" type="button">Debug</button>
    <section id="debug-panel" class="debug-panel${isDebugMode ? '' : ' hidden'}">
      <div class="debug-header">
        <strong>Debug</strong>
        <div class="debug-actions">
          <button id="debug-toggle" class="debug-toggle" type="button">Collapse</button>
          <button id="debug-hide" class="debug-hide" type="button">Hide</button>
        </div>
      </div>
      <button id="sensor-button" class="sensor-button" type="button">기기 센서 허용</button>
      <pre id="debug-content"></pre>
    </section>

    <section id="section-card" class="section-card hidden" aria-live="polite">
      <div class="section-card-header">
        <div>
          <p id="section-card-kicker" class="section-card-kicker">선택 구역</p>
          <h2 id="section-card-title"></h2>
        </div>
        <button id="section-card-close" class="section-card-close" type="button" aria-label="설명 닫기">닫기</button>
      </div>
      <p id="section-card-subtitle" class="section-card-subtitle"></p>
      <div id="section-card-children" class="section-card-children"></div>
      <p id="section-card-content" class="section-card-content"></p>
      <p class="section-card-note">교무님 검수 후 내용 입력 예정</p>
    </section>

    <section id="about-panel" class="about-panel hidden" aria-live="polite">
      <div class="about-header">
        <div>
          <p class="section-card-kicker">About</p>
          <h2>WonXR 교리도 AR</h2>
        </div>
        <button id="about-close" class="section-card-close" type="button">닫기</button>
      </div>
      <p>원불교 교리도 이미지를 인식하여 교리 구조를 증강현실로 보여주는 공모전용 WebAR 프로토타입입니다.</p>
      <dl>
        <dt>Developer</dt>
        <dd>CYBOX Digital Entertainment</dd>
        <dt>Developer / Planner</dt>
        <dd>Song MinSoo</dd>
        <dt>Project status</dt>
        <dd>Prototype for Won-Buddhism content contest</dd>
      </dl>
      <p>교리 설명 본문은 현재 작성 예정이며, 원불교 교무님 검수 후 반영 예정입니다.</p>
      <p>이 앱은 교리도 인식을 위해 카메라를 사용합니다. 카메라 영상은 서버로 업로드하지 않으며, 브라우저 내 이미지 인식과 AR 표시 용도로만 사용됩니다.</p>
      <h3>홈 화면에 추가</h3>
      <p>iPhone: Safari로 접속한 뒤 공유 버튼을 누르고 홈 화면에 추가를 선택하세요. 홈 화면 앱 모드에서 카메라가 열리지 않으면 Safari에서 직접 열어주세요.</p>
      <p>Android: Chrome 또는 Samsung Internet에서 앱 설치 또는 홈 화면에 추가를 선택하세요. Android adaptive/themed icon 지원은 런처와 브라우저 WebAPK 지원에 따라 달라집니다.</p>
      <p>iOS 아이콘 색상/틴트 효과는 iOS 설정에 의해 달라질 수 있으며, 앱은 Home Screen용 아이콘을 제공합니다.</p>
      <h3>Open source notices</h3>
      <ul>
        <li><a href="https://github.com/mrdoob/three.js/blob/dev/LICENSE" target="_blank" rel="noreferrer">Three.js - MIT License</a></li>
        <li><a href="https://github.com/hiukim/mind-ar-js/blob/master/LICENSE" target="_blank" rel="noreferrer">MindAR - MIT License</a></li>
        <li><a href="https://github.com/vitejs/vite/blob/main/LICENSE" target="_blank" rel="noreferrer">Vite - MIT License</a></li>
        <li><a href="https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt" target="_blank" rel="noreferrer">TypeScript - Apache License 2.0</a></li>
        <li>@types/three - MIT License</li>
      </ul>
      <p><a href="https://github.com/CYBOX-Digital-Entertainment/WonXR" target="_blank" rel="noreferrer">GitHub repository</a></p>
    </section>

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
const introTitle = requireElement<HTMLHeadingElement>('#intro-title');
const startButton = requireElement<HTMLButtonElement>('#start-button');
const infoButton = requireElement<HTMLButtonElement>('#info-button');
const statusText = requireElement<HTMLSpanElement>('#status-text');
const statusDot = requireElement<HTMLSpanElement>('#status-dot');
const message = requireElement<HTMLParagraphElement>('#message');
const compatibilityPanel = requireElement<HTMLElement>('#compatibility-panel');
const compatibilityTitle = requireElement<HTMLElement>('#compatibility-title');
const compatibilityMessage = requireElement<HTMLParagraphElement>('#compatibility-message');
const compatibilityRecommendation = requireElement<HTMLParagraphElement>('#compatibility-recommendation');
const compatibilityInfoButton = requireElement<HTMLButtonElement>('#compatibility-info-button');
const calibrationValues = requireElement<HTMLSpanElement>('#calibration-values');
const debugFab = requireElement<HTMLButtonElement>('#debug-fab');
const debugPanel = requireElement<HTMLElement>('#debug-panel');
const debugToggle = requireElement<HTMLButtonElement>('#debug-toggle');
const debugHide = requireElement<HTMLButtonElement>('#debug-hide');
const sensorButton = requireElement<HTMLButtonElement>('#sensor-button');
const debugContent = requireElement<HTMLPreElement>('#debug-content');
const debugOverlay = requireElement<SVGSVGElement>('#debug-overlay');
const debugTargetCorners = requireElement<SVGPolylineElement>('#debug-target-corners');
const debugOverlayCorners = requireElement<SVGPolylineElement>('#debug-overlay-corners');
const sectionCard = requireElement<HTMLElement>('#section-card');
const sectionCardKicker = requireElement<HTMLParagraphElement>('#section-card-kicker');
const sectionCardTitle = requireElement<HTMLHeadingElement>('#section-card-title');
const sectionCardSubtitle = requireElement<HTMLParagraphElement>('#section-card-subtitle');
const sectionCardChildren = requireElement<HTMLDivElement>('#section-card-children');
const sectionCardContent = requireElement<HTMLParagraphElement>('#section-card-content');
const sectionCardClose = requireElement<HTMLButtonElement>('#section-card-close');
const aboutPanel = requireElement<HTMLElement>('#about-panel');
const aboutClose = requireElement<HTMLButtonElement>('#about-close');
const calibrationButtons = document.querySelectorAll<HTMLButtonElement>('[data-cal-field]');
const calibrationActionButtons = document.querySelectorAll<HTMLButtonElement>('[data-cal-action]');

let mindarThree: MindARThree | undefined;
let hasStarted = false;
let overlayContentGroup: THREE.Group | undefined;
let overlayPlane: THREE.Mesh | undefined;
let selectionGroup: THREE.Group | undefined;
let selectionTextureSource: THREE.Texture | undefined;
let activeSectionId = '';
let activeSectionTitle = '';
let lastTouchedSectionId = '';
let lastTouchedSectionTitle = '';
let activeTargetVersion = requestedTargetVersion;
let activeTargetFallbackUsed = false;
let currentAppState: AppState = 'scan';
let mindarStartSucceeded = false;
let lastErrorMessage = '';
let lastTouchWarning = '';
let currentFps = 0;
let lastFrameAt = performance.now();
let loadedSectionCount = 0;
const hitMeshes: THREE.Mesh[] = [];
let hotspotPointerCleanup: (() => void) | undefined;
let infoCardOpen = false;
let lastSelectTime = 0;
let lastCloseReason = '';
let lastPointerTarget = '';
let closeBlockedByDebounce = false;
let activeRenderer: THREE.WebGLRenderer | undefined;
let activeCamera: THREE.Camera | undefined;
let orientationRestartCount = 0;
let lastOrientationChangeTime = 0;
let lastRestartReason = '';
let orientationRestartTimer = 0;
let serviceWorkerStatus = 'not registered';
let manifestStatus = 'not checked';
let sensorPermissionState = 'not requested';
let deviceOrientationLabel = '-';

const interactionDebug = {
  pointerDownCount: 0,
  lastPointerX: Number.NaN,
  lastPointerY: Number.NaN,
  lastPointerIgnoredByUi: false,
  lastPointerIgnoredReason: '',
  lastPointerNdcX: Number.NaN,
  lastPointerNdcY: Number.NaN,
  lastRaycastHitCount: 0,
  lastHitSectionId: '',
  lastHitSectionTitle: '',
  lastPointerMessage: '',
};

const debugAssetPaths = [
  TARGET_MIND_V2_PATH,
  'targets/gyorido_empty_v2.png',
  TARGET_MIND_PATH,
  'targets/gyorido_empty.png',
  OVERLAY_IMAGE_PATH,
  HOTSPOT_DATA_PATH,
  'manifest.webmanifest',
  'favicon.ico',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/maskable-512.png',
  'icons/monochrome-512.png',
];
const assetLoadStatus: Record<string, string> = Object.fromEntries(
  debugAssetPaths.map((path) => [path, isDebugMode ? 'pending' : 'not checked']),
);

type PoseStats = {
  appState: AppState;
  found: boolean;
  locked: boolean;
  lockMode: boolean;
  profile: TrackingProfile;
  targetVersion: string;
  fallbackUsed: boolean;
  holdMs: number;
  holdRemainingMs: number;
  rawCenterX: number;
  rawCenterY: number;
  smoothedCenterX: number;
  smoothedCenterY: number;
  rawScale: number;
  smoothedScale: number;
  rawRotationDeg: number;
  smoothedRotationDeg: number;
  rejectedFrames: number;
  lastRejectReason: string;
  foundCount: number;
  lostCount: number;
  activeSectionId: string;
  activeSectionTitle: string;
  lastTouchedSectionId: string;
  lastTouchedSectionTitle: string;
  hitMeshCount: number;
  rawStableDeltaPosition: number;
  rawStableDeltaRotation: number;
  rawStableDeltaScale: number;
  stablePositionX: number;
  stablePositionY: number;
  stablePositionZ: number;
  stableRotationX: number;
  stableRotationY: number;
  stableRotationZ: number;
  stableScaleX: number;
  stableScaleY: number;
  stableScaleZ: number;
  viewingAngleDeg: number;
  videoExists: boolean;
  canvasExists: boolean;
  rendererPixelRatio: number;
  fps: number;
  lastErrorMessage: string;
  warningMessages: string[];
};

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

function setAppState(nextState: AppState, status: string, tone: StatusTone, detail: string) {
  currentAppState = nextState;
  const isCompact = nextState === 'tracking' || nextState === 'explore' || nextState === 'holding';
  setUiCompact(isCompact);
  introTitle.textContent = isCompact ? 'WonXR' : '교리도 그림을 비춰주세요';
  setStatus(status, tone, detail);
}

function getBrowserGuess() {
  const userAgent = navigator.userAgent;

  if (/iPad|iPhone|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/CriOS|FxiOS/.test(userAgent)) {
    return 'iOS Safari';
  }

  if (/Android/.test(userAgent) && /Chrome/.test(userAgent)) {
    return 'Android Chrome';
  }

  return 'other';
}

async function checkDebugAssets() {
  if (!isDebugMode) {
    return;
  }

  await Promise.all(
    debugAssetPaths.map(async (path) => {
      try {
        const response = await fetch(assetUrl(path), { method: 'HEAD' });
        assetLoadStatus[path] = response.ok ? 'ok' : `failed ${response.status}`;
      } catch (error) {
        assetLoadStatus[path] = error instanceof Error ? `error: ${error.message}` : 'error';
      }
    }),
  );
}

function openAboutPanel() {
  aboutPanel.classList.remove('hidden');
}

function closeAboutPanel() {
  aboutPanel.classList.add('hidden');
}

function showCompatibilityBlock(reason: string, recommendation: string, title = 'AR을 시작할 수 없습니다') {
  compatibilityTitle.textContent = title;
  compatibilityMessage.textContent = `${reason} 현재 브라우저: ${compatibilityReport.browser.name} ${compatibilityReport.browser.version || ''}`;
  compatibilityRecommendation.textContent = recommendation;
  compatibilityPanel.classList.remove('hidden');
  startButton.disabled = true;
  setStatus(title, 'error', reason);
}

function applyInitialCompatibilityGate() {
  if (compatibilityReport.supported) {
    if (compatibilityReport.warning) {
      setStatus('브라우저 업데이트 권장', 'ready', compatibilityReport.warning);
    }

    return;
  }

  showCompatibilityBlock(compatibilityReport.blockingReason, compatibilityReport.recommendedBrowser, '지원하지 않는 브라우저입니다');
}

function getDisplayMode() {
  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return 'fullscreen';
  }

  if (window.matchMedia('(display-mode: standalone)').matches) {
    return 'standalone';
  }

  return 'browser';
}

function getIosStandalone() {
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

async function checkManifestStatus() {
  try {
    const response = await fetch(assetUrl('manifest.webmanifest'), { method: 'HEAD' });
    manifestStatus = response.ok ? 'loaded' : `failed ${response.status}`;
  } catch (error) {
    manifestStatus = error instanceof Error ? `error: ${error.message}` : 'error';
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    serviceWorkerStatus = 'unsupported';
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(assetUrl('sw.js'), {
      scope: import.meta.env.BASE_URL,
    });
    serviceWorkerStatus = registration.active ? 'active' : 'registered';
  } catch (error) {
    serviceWorkerStatus = error instanceof Error ? `error: ${error.message}` : 'error';
  }
}

function getOrientationLabel() {
  const screenOrientation = screen.orientation?.type ?? '';
  const viewport = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  return screenOrientation ? `${screenOrientation} (${viewport})` : viewport;
}

function updateRendererForViewport() {
  activeRenderer?.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  activeRenderer?.setSize(window.innerWidth, window.innerHeight);

  if (activeCamera && 'aspect' in activeCamera && 'updateProjectionMatrix' in activeCamera) {
    const camera = activeCamera as THREE.PerspectiveCamera;
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
  }
}

function showOrientationGuidance() {
  if (window.innerWidth > window.innerHeight) {
    setStatus('세로 화면에서 더 안정적으로 작동합니다', 'ready', '세로 화면으로 돌아오면 다시 스캔합니다.');
  }
}

async function restartAR(reason: string) {
  if (!hasStarted || !mindarThree) {
    return;
  }

  orientationRestartCount += 1;
  lastRestartReason = reason;
  lastOrientationChangeTime = performance.now();
  lastCloseReason = activeSectionId ? `orientation restart: ${reason}` : lastCloseReason;
  setAppState('scan', '다시 스캔 중', 'ready', '기기 방향 변경 후 AR을 다시 준비합니다.');
  clearSelectedSection(false, `orientation restart: ${reason}`);
  hotspotPointerCleanup?.();
  hotspotPointerCleanup = undefined;

  try {
    activeRenderer?.setAnimationLoop(null);
    await mindarThree.stop();
  } catch (error) {
    console.warn('Failed to stop MindAR for orientation restart.', error);
  }

  mindarThree = undefined;
  activeRenderer = undefined;
  activeCamera = undefined;
  overlayContentGroup = undefined;
  overlayPlane = undefined;
  selectionGroup = undefined;
  selectionTextureSource = undefined;
  hitMeshes.splice(0, hitMeshes.length);
  hasStarted = false;
  mindarStartSucceeded = false;
  arContainer.innerHTML = '';

  window.setTimeout(() => {
    if (!compatibilityReport.supported) {
      return;
    }

    void startAR();
  }, 300);
}

function scheduleOrientationRestart(reason: string) {
  updateRendererForViewport();
  showOrientationGuidance();
  window.clearTimeout(orientationRestartTimer);
  orientationRestartTimer = window.setTimeout(() => {
    void restartAR(reason);
  }, 450);
}

async function requestDeviceSensorPermission() {
  const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };

  try {
    if (typeof orientationEvent.requestPermission === 'function') {
      sensorPermissionState = await orientationEvent.requestPermission();
    } else {
      sensorPermissionState = 'not required';
    }
  } catch (error) {
    sensorPermissionState = error instanceof Error ? `error: ${error.message}` : 'error';
  }
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
  if (overlayContentGroup) {
    overlayContentGroup.scale.set(overlayCalibration.scaleX, overlayCalibration.scaleY, 1);
    overlayContentGroup.position.set(overlayCalibration.offsetX, overlayCalibration.offsetY, 0.001);
    overlayContentGroup.rotation.z = overlayCalibration.rotationZ;
  } else if (overlayPlane) {
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

async function hasAnyCameraDevice() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return true;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === 'videoinput');
    return videoInputs.length > 0 || devices.length === 0;
  } catch {
    return true;
  }
}

function getCameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '이 기기에는 사용할 수 있는 카메라가 없어 AR 기능을 실행할 수 없습니다.';
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.';
  }

  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
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

function getRequestedTargetMindPath() {
  return requestedTargetVersion === 'v1' ? TARGET_MIND_PATH : TARGET_MIND_V2_PATH;
}

async function resolveTargetMindPath() {
  const requestedTargetMindPath = getRequestedTargetMindPath();
  activeTargetFallbackUsed = false;

  if (requestedTargetMindPath === TARGET_MIND_PATH) {
    return { path: TARGET_MIND_PATH, version: 'v1' };
  }

  try {
    const response = await fetch(assetUrl(requestedTargetMindPath), { method: 'HEAD' });

    if (response.ok) {
      return { path: requestedTargetMindPath, version: 'v2' };
    }
  } catch (error) {
    console.warn('Failed to check v2 target file. Falling back to default target.', error);
  }

  console.warn(`Target file not found: ${requestedTargetMindPath}. Falling back to ${TARGET_MIND_PATH}.`);
  activeTargetFallbackUsed = true;
  return { path: TARGET_MIND_PATH, version: 'v1' };
}

async function loadDoctrineSections() {
  const response = await fetch(assetUrl(HOTSPOT_DATA_PATH));

  if (!response.ok) {
    throw new Error(`Failed to load hotspot data: ${response.status}`);
  }

  const payload = (await response.json()) as DoctrineSectionsPayload;
  return Array.isArray(payload.sections) ? payload.sections : [];
}

function getScaleScalar(scale: THREE.Vector3) {
  return (Math.abs(scale.x) + Math.abs(scale.y)) / 2;
}

function getQuaternionZDegrees(quaternion: THREE.Quaternion) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return THREE.MathUtils.radToDeg(euler.z);
}

function isFiniteVector3(vector: THREE.Vector3) {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function getPoseRejectReason(
  rawPosition: THREE.Vector3,
  rawQuaternion: THREE.Quaternion,
  rawScale: THREE.Vector3,
  lastGoodPosition: THREE.Vector3,
  lastGoodQuaternion: THREE.Quaternion,
  lastGoodScaleScalar: number,
) {
  if (!isFiniteVector3(rawPosition) || !isFiniteVector3(rawScale)) {
    return 'non-finite pose';
  }

  const rawScaleScalar = getScaleScalar(rawScale);

  if (!Number.isFinite(rawScaleScalar) || rawScaleScalar <= 0) {
    return 'invalid scale';
  }

  const scaleDelta = Math.abs(rawScaleScalar / Math.max(lastGoodScaleScalar, 0.0001) - 1);
  const rotationDelta = lastGoodQuaternion.angleTo(rawQuaternion);
  const positionDelta = rawPosition.distanceTo(lastGoodPosition);

  if (scaleDelta > outlierSettings.scale) {
    return `scale ${scaleDelta.toFixed(3)}`;
  }

  if (rotationDelta > outlierSettings.rotation) {
    return `rotation ${rotationDelta.toFixed(3)}rad`;
  }

  if (positionDelta > outlierSettings.position) {
    return `position ${positionDelta.toFixed(3)}`;
  }

  return '';
}

function getPoseDelta(
  positionA: THREE.Vector3,
  quaternionA: THREE.Quaternion,
  scaleA: THREE.Vector3,
  positionB: THREE.Vector3,
  quaternionB: THREE.Quaternion,
  scaleB: THREE.Vector3,
) {
  return {
    position: positionA.distanceTo(positionB),
    rotation: quaternionA.angleTo(quaternionB),
    scale: Math.abs(getScaleScalar(scaleA) / Math.max(getScaleScalar(scaleB), 0.0001) - 1),
  };
}

function formatDebugNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return value.toFixed(3);
}

function formatDebugMilliseconds(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return `${Math.max(0, Math.round(value))}ms`;
}

function formatAssetStatuses() {
  return debugAssetPaths.map((path) => `${path}: ${assetLoadStatus[path] ?? '-'}`).join('\n');
}

function updateDebugPanel(stats: PoseStats) {
  if (!isDebugMode) {
    return;
  }

  debugContent.textContent = [
    '[general]',
    `app mode: ${stats.appState}`,
    `target found: ${stats.found ? 'yes' : 'no'}`,
    `current target: ${stats.targetVersion}`,
    `fallback used: ${stats.fallbackUsed ? 'yes' : 'no'}`,
    `profile: ${stats.profile}`,
    `lock mode: ${stats.lockMode ? 'on' : 'off'}`,
    `locked: ${stats.locked ? 'yes' : 'no'}`,
    `active section: ${stats.activeSectionId || '-'} ${stats.activeSectionTitle || ''}`,
    `last touched: ${stats.lastTouchedSectionId || '-'} ${stats.lastTouchedSectionTitle || ''}`,
    `info card open: ${infoCardOpen ? 'yes' : 'no'}`,
    `last select time: ${lastSelectTime ? Math.round(lastSelectTime).toString() : '-'}`,
    `last close reason: ${lastCloseReason || '-'}`,
    `last pointer target: ${lastPointerTarget || '-'}`,
    `close blocked by debounce: ${closeBlockedByDebounce ? 'yes' : 'no'}`,
    '',
    '[interaction]',
    `pointerdown count: ${interactionDebug.pointerDownCount}`,
    `last pointer: ${formatDebugNumber(interactionDebug.lastPointerX)}, ${formatDebugNumber(interactionDebug.lastPointerY)}`,
    `ignored by UI: ${interactionDebug.lastPointerIgnoredByUi ? 'yes' : 'no'} ${interactionDebug.lastPointerIgnoredReason || ''}`,
    `pointer ndc: ${formatDebugNumber(interactionDebug.lastPointerNdcX)}, ${formatDebugNumber(interactionDebug.lastPointerNdcY)}`,
    `loaded sections: ${loadedSectionCount}`,
    `hit meshes: ${stats.hitMeshCount}`,
    `last raycast hits: ${interactionDebug.lastRaycastHitCount}`,
    `last hit section: ${interactionDebug.lastHitSectionId || '-'} ${interactionDebug.lastHitSectionTitle || ''}`,
    `active section: ${stats.activeSectionId || '-'} ${stats.activeSectionTitle || ''}`,
    `pointer note: ${interactionDebug.lastPointerMessage || '-'}`,
    '',
    '[tracking]',
    `found count: ${stats.foundCount}`,
    `lost count: ${stats.lostCount}`,
    `lost hold remaining: ${formatDebugMilliseconds(stats.holdRemainingMs)}`,
    `discarded outliers: ${stats.rejectedFrames}`,
    `recent outlier: ${stats.lastRejectReason || '-'}`,
    `ps/rs/ss: ${smoothingSettings.position}/${smoothingSettings.rotation}/${smoothingSettings.scale}`,
    `deadband: ${deadbandSettings.position}/${deadbandSettings.rotation}/${deadbandSettings.scale}`,
    `hold: ${stats.holdMs}ms`,
    `elevation: ${selectionElevation}`,
    '',
    '[pose]',
    `raw center: ${formatDebugNumber(stats.rawCenterX)}, ${formatDebugNumber(stats.rawCenterY)}`,
    `smooth center: ${formatDebugNumber(stats.smoothedCenterX)}, ${formatDebugNumber(stats.smoothedCenterY)}`,
    `raw scale / smooth: ${formatDebugNumber(stats.rawScale)} / ${formatDebugNumber(stats.smoothedScale)}`,
    `raw rot / smooth: ${formatDebugNumber(stats.rawRotationDeg)}deg / ${formatDebugNumber(stats.smoothedRotationDeg)}deg`,
    `stable pos: ${formatDebugNumber(stats.stablePositionX)}, ${formatDebugNumber(stats.stablePositionY)}, ${formatDebugNumber(stats.stablePositionZ)}`,
    `stable rot: ${formatDebugNumber(stats.stableRotationX)}, ${formatDebugNumber(stats.stableRotationY)}, ${formatDebugNumber(stats.stableRotationZ)}`,
    `stable scale: ${formatDebugNumber(stats.stableScaleX)}, ${formatDebugNumber(stats.stableScaleY)}, ${formatDebugNumber(stats.stableScaleZ)}`,
    `raw-stable delta: p ${formatDebugNumber(stats.rawStableDeltaPosition)}, r ${formatDebugNumber(stats.rawStableDeltaRotation)}, s ${formatDebugNumber(stats.rawStableDeltaScale)}`,
    `viewing angle approx: ${formatDebugNumber(stats.viewingAngleDeg)}deg`,
    `orientation: ${getOrientationLabel()}`,
    `visual viewport: ${
      window.visualViewport
        ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}`
        : '-'
    }`,
    `last orientation change: ${lastOrientationChangeTime ? Math.round(performance.now() - lastOrientationChangeTime) + 'ms ago' : '-'}`,
    `restart count: ${orientationRestartCount}`,
    `last restart reason: ${lastRestartReason || '-'}`,
    `device orientation: ${deviceOrientationLabel}`,
    `sensor permission: ${sensorPermissionState}`,
    '',
    '[device/browser]',
    `browser: ${compatibilityReport.browser.name} ${compatibilityReport.browser.version || ''}`,
    `browser guess: ${getBrowserGuess()}`,
    `os: ${compatibilityReport.browser.os} ${compatibilityReport.browser.osVersion || ''}`,
    `platform: ${navigator.platform}`,
    `viewport: ${window.innerWidth}x${window.innerHeight}`,
    `screen: ${window.screen.width}x${window.screen.height}`,
    `dpr: ${window.devicePixelRatio}`,
    `url: ${window.location.href}`,
    `query: ${window.location.search || '-'}`,
    `userAgent: ${navigator.userAgent}`,
    '',
    '[features]',
    formatFeatureSupport(compatibilityReport.features),
    '',
    '[pwa]',
    `display mode: ${getDisplayMode()}`,
    `ios standalone: ${getIosStandalone() ? 'yes' : 'no'}`,
    `service worker: ${serviceWorkerStatus}`,
    `manifest: ${manifestStatus}`,
    '',
    '[camera/rendering]',
    `mindar start success: ${mindarStartSucceeded ? 'yes' : 'no'}`,
    `video exists: ${stats.videoExists ? 'yes' : 'no'}`,
    `canvas exists: ${stats.canvasExists ? 'yes' : 'no'}`,
    `renderer pixel ratio: ${formatDebugNumber(stats.rendererPixelRatio)}`,
    `fps estimate: ${formatDebugNumber(stats.fps)}`,
    `last error: ${stats.lastErrorMessage || '-'}`,
    '',
    '[assets]',
    formatAssetStatuses(),
    '',
    '[warnings]',
    stats.warningMessages.length > 0 ? stats.warningMessages.join('\n') : '-',
  ].join('\n');
}

const targetCornerPoints = [
  new THREE.Vector3(-TARGET_WIDTH / 2, TARGET_HEIGHT / 2, 0),
  new THREE.Vector3(TARGET_WIDTH / 2, TARGET_HEIGHT / 2, 0),
  new THREE.Vector3(TARGET_WIDTH / 2, -TARGET_HEIGHT / 2, 0),
  new THREE.Vector3(-TARGET_WIDTH / 2, -TARGET_HEIGHT / 2, 0),
];

function projectCorners(matrix: THREE.Matrix4, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
  const rect = renderer.domElement.getBoundingClientRect();

  return targetCornerPoints.map((corner) => {
    const projected = corner.clone().applyMatrix4(matrix).project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  });
}

function setDebugPolyline(polyline: SVGPolylineElement, points: Array<{ x: number; y: number }>) {
  const closedPoints = [...points, points[0]];
  polyline.setAttribute('points', closedPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '));
}

function clearDebugPolylines() {
  if (!isDebugMode) {
    return;
  }

  debugTargetCorners.setAttribute('points', '');
  debugOverlayCorners.setAttribute('points', '');
}

function updateDebugCorners(
  rawMatrix: THREE.Matrix4 | undefined,
  stableGroup: THREE.Group,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
) {
  if (!isDebugMode) {
    return;
  }

  debugOverlay.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);

  if (rawMatrix) {
    setDebugPolyline(debugTargetCorners, projectCorners(rawMatrix, camera, renderer));
  } else {
    debugTargetCorners.setAttribute('points', '');
  }

  stableGroup.updateMatrixWorld(true);
  overlayPlane?.updateMatrixWorld(true);

  if (overlayPlane && stableGroup.visible) {
    setDebugPolyline(debugOverlayCorners, projectCorners(overlayPlane.matrixWorld, camera, renderer));
  } else {
    debugOverlayCorners.setAttribute('points', '');
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

function createLabelSprite(text: string, color: THREE.Color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Label canvas context was not available.');
  }

  context.fillStyle = 'rgba(5, 8, 12, 0.72)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${color.getHexString()}`;
  context.lineWidth = 8;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = '#ffffff';
  context.font = '700 34px system-ui, -apple-system, Segoe UI, sans-serif';
  context.textBaseline = 'middle';
  context.fillText(text, 22, canvas.height / 2, canvas.width - 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.18, 0.045, 1);
  sprite.renderOrder = 24;
  return sprite;
}

function getSectionRect(section: DoctrineSection, padding = 0) {
  const width = section.hotspot.nw * TARGET_WIDTH + padding * 2;
  const height = section.hotspot.nh * TARGET_HEIGHT + padding * 2;
  const centerX = (section.hotspot.nx + section.hotspot.nw / 2 - 0.5) * TARGET_WIDTH;
  const centerY = (0.5 - (section.hotspot.ny + section.hotspot.nh / 2)) * TARGET_HEIGHT;
  return { centerX, centerY, width, height };
}

function getSectionColor(section: DoctrineSection) {
  const color = new THREE.Color();
  color.setStyle(section.color ?? '#6ee7b7');
  return color;
}

function createHotspotDebugGroup(sections: DoctrineSection[]) {
  const group = new THREE.Group();
  const debugGroup = new THREE.Group();
  const hitGroup = new THREE.Group();
  const sectionHitMeshes: THREE.Mesh[] = [];
  debugGroup.visible = isHotspotMode;

  sections.forEach((section, index) => {
    const color = getSectionColor(section);
    const { centerX, centerY, width, height } = getSectionRect(section);
    const hitRect = getSectionRect(section, hitAreaPadding);
    const sectionGroup = new THREE.Group();
    sectionGroup.position.set(centerX, centerY, 0.004);

    const debugFillMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const debugFill = new THREE.Mesh(new THREE.PlaneGeometry(width, height), debugFillMaterial);
    debugFill.renderOrder = 20;
    sectionGroup.add(debugFill);

    const hitMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.001,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hitMesh = new THREE.Mesh(new THREE.PlaneGeometry(hitRect.width, hitRect.height), hitMaterial);
    hitMesh.position.set(hitRect.centerX, hitRect.centerY, 0.01);
    hitMesh.renderOrder = 30;
    hitMesh.userData.section = section;
    hitGroup.add(hitMesh);
    sectionHitMeshes.push(hitMesh);

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfWidth, halfHeight, 0.002),
      new THREE.Vector3(halfWidth, halfHeight, 0.002),
      new THREE.Vector3(halfWidth, -halfHeight, 0.002),
      new THREE.Vector3(-halfWidth, -halfHeight, 0.002),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    });
    const outline = new THREE.LineLoop(lineGeometry, lineMaterial);
    outline.renderOrder = 22;
    sectionGroup.add(outline);

    const label = createLabelSprite(`${index + 1}. ${section.title}`, color);
    label.position.set(0, halfHeight + 0.028, 0.006);
    sectionGroup.add(label);
    debugGroup.add(sectionGroup);
  });

  group.add(hitGroup);
  group.add(debugGroup);

  return { group, hitMeshes: sectionHitMeshes };
}

function setupHotspotPointer(
  camera: THREE.Camera,
  hitMeshes: THREE.Mesh[],
  isInteractionEnabled: () => boolean,
  onSelect: (section: DoctrineSection) => void,
) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const handlePointerDown = (event: PointerEvent) => {
      interactionDebug.pointerDownCount += 1;
      interactionDebug.lastPointerX = event.clientX;
      interactionDebug.lastPointerY = event.clientY;
      interactionDebug.lastPointerIgnoredByUi = false;
      interactionDebug.lastPointerIgnoredReason = '';
      interactionDebug.lastRaycastHitCount = 0;
      interactionDebug.lastPointerMessage = '';
      pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
      interactionDebug.lastPointerNdcX = pointer.x;
      interactionDebug.lastPointerNdcY = pointer.y;
      const target = event.target;
      lastPointerTarget = target instanceof Element ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}` : String(target);

      if (
        target instanceof Element &&
        target.closest('.debug-panel, .debug-fab, .calibration-panel, .section-card, .about-panel, .compatibility-panel, button')
      ) {
        interactionDebug.lastPointerIgnoredByUi = true;
        interactionDebug.lastPointerIgnoredReason = 'ui control';
        interactionDebug.lastPointerMessage = 'ignored: UI';
        lastTouchWarning = 'UI blocking touch';
        return;
      }

      if (!isInteractionEnabled()) {
        interactionDebug.lastPointerMessage = 'ignored: interaction disabled';
        lastTouchWarning = 'interaction disabled: no target pose visible';
        return;
      }

      for (const mesh of hitMeshes) {
        mesh.updateWorldMatrix(true, false);
      }

      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(hitMeshes, false);
      interactionDebug.lastRaycastHitCount = hits.length;
      const [hit] = hits;
      const section = hit?.object.userData.section as DoctrineSection | undefined;

      if (!section) {
        interactionDebug.lastHitSectionId = '';
        interactionDebug.lastHitSectionTitle = '';
        interactionDebug.lastPointerMessage = hitMeshes.length === 0 ? 'no hit meshes' : 'no hotspot hit';
        lastTouchWarning = hitMeshes.length === 0 ? 'No hotspot hit meshes created' : 'no raycast hits after touch';
        console.log('WonXR hotspot pointer no hit', {
          x: event.clientX,
          y: event.clientY,
          ndcX: pointer.x,
          ndcY: pointer.y,
          hitMeshes: hitMeshes.length,
          hits: hits.length,
          appState: currentAppState,
        });
        return;
      }

      lastTouchWarning = '';
      interactionDebug.lastHitSectionId = section.id;
      interactionDebug.lastHitSectionTitle = section.title;
      interactionDebug.lastPointerMessage = 'hit';
      console.log('WonXR hotspot selected', { id: section.id, title: section.title });
      event.stopPropagation();
      onSelect(section);
  };

  window.addEventListener('pointerdown', handlePointerDown, { passive: true });
  return () => window.removeEventListener('pointerdown', handlePointerDown);
}

function createSelectionGroup(section: DoctrineSection) {
  const color = getSectionColor(section);
  const { centerX, centerY, width, height } = getSectionRect(section);
  const group = new THREE.Group();
  group.position.set(centerX, centerY, 0.006);
  group.scale.setScalar(0.98);
  group.userData.startTime = performance.now();

  const highlightMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: HIGHLIGHT_OPACITY,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const highlightPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), highlightMaterial);
  highlightPlane.position.z = -selectionDepth + 0.002;
  highlightPlane.renderOrder = 40;
  group.add(highlightPlane);

  const backingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const topBacking = new THREE.Mesh(new THREE.PlaneGeometry(width, height), backingMaterial);
  topBacking.position.z = 0.001;
  topBacking.renderOrder = 43;
  group.add(topBacking);

  const croppedTexture = selectionTextureSource?.clone();

  if (croppedTexture) {
    croppedTexture.offset.set(section.hotspot.nx, 1 - section.hotspot.ny - section.hotspot.nh);
    croppedTexture.repeat.set(section.hotspot.nw, section.hotspot.nh);
    croppedTexture.needsUpdate = true;
  }

  const topMaterial = new THREE.MeshBasicMaterial({
    map: croppedTexture,
    color: croppedTexture ? 0xffffff : color,
    transparent: true,
    opacity: TOP_OPACITY,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const topSurface = new THREE.Mesh(new THREE.PlaneGeometry(width, height), topMaterial);
  topSurface.position.z = 0.004;
  topSurface.renderOrder = 45;
  group.add(topSurface);

  const sideMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: SIDE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const wallThickness = Math.max(0.006, Math.min(width, height) * 0.045);
  const topWall = new THREE.Mesh(new THREE.BoxGeometry(width, wallThickness, selectionDepth), sideMaterial);
  topWall.position.set(0, height / 2 + wallThickness / 2, -selectionDepth / 2);
  topWall.renderOrder = 42;
  group.add(topWall);

  const bottomWall = new THREE.Mesh(new THREE.BoxGeometry(width, wallThickness, selectionDepth), sideMaterial);
  bottomWall.position.set(0, -height / 2 - wallThickness / 2, -selectionDepth / 2);
  bottomWall.renderOrder = 42;
  group.add(bottomWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, selectionDepth), sideMaterial);
  leftWall.position.set(-width / 2 - wallThickness / 2, 0, -selectionDepth / 2);
  leftWall.renderOrder = 42;
  group.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, selectionDepth), sideMaterial);
  rightWall.position.set(width / 2 + wallThickness / 2, 0, -selectionDepth / 2);
  rightWall.renderOrder = 42;
  group.add(rightWall);

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfWidth, halfHeight, 0.008),
    new THREE.Vector3(halfWidth, halfHeight, 0.008),
    new THREE.Vector3(halfWidth, -halfHeight, 0.008),
    new THREE.Vector3(-halfWidth, -halfHeight, 0.008),
  ]);
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: '#facc15',
    transparent: true,
    opacity: OUTLINE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
  outline.renderOrder = 44;
  group.add(outline);

  const label = createLabelSprite(section.title, color);
  label.position.set(0, halfHeight + 0.045, 0.03);
  label.scale.set(0.24, 0.06, 1);
  group.add(label);

  return group;
}

function updateSelectionAnimation() {
  if (!selectionGroup) {
    return;
  }

  const startTime = Number(selectionGroup.userData.startTime ?? performance.now());
  const progress = Math.min((performance.now() - startTime) / SELECTION_ANIMATION_MS, 1);
  const easedProgress = 1 - (1 - progress) ** 3;
  selectionGroup.position.z = THREE.MathUtils.lerp(0.006, selectionElevation, easedProgress);
  const scale = THREE.MathUtils.lerp(0.98, 1, easedProgress);
  selectionGroup.scale.setScalar(scale);
}

function showSectionCard(section: DoctrineSection) {
  sectionCard.classList.remove('hidden');
  infoCardOpen = true;
  sectionCardKicker.textContent = '선택 구역';
  sectionCardTitle.textContent = section.title;
  sectionCardSubtitle.textContent = section.subtitle ?? '';
  sectionCardChildren.innerHTML = '';

  for (const child of section.children ?? []) {
    const badge = document.createElement('span');
    badge.className = 'section-card-badge';
    badge.textContent = child;
    sectionCardChildren.appendChild(badge);
  }

  const content = section.content?.trim() || '작성 예정';
  sectionCardContent.textContent = content === '작성 예정' ? '교무님 검수 후 내용 입력 예정' : content;
}

function clearSelectedSection(updateStatus = true, reason = 'close button') {
  if (activeSectionId && performance.now() - lastSelectTime < 250 && reason === 'outside click') {
    closeBlockedByDebounce = true;
    return;
  }

  closeBlockedByDebounce = false;
  lastCloseReason = reason;
  activeSectionId = '';
  activeSectionTitle = '';
  infoCardOpen = false;
  sectionCard.classList.add('hidden');
  selectionGroup?.removeFromParent();
  selectionGroup = undefined;

  if (updateStatus) {
    const isLostOrScanning = currentAppState === 'scan' || currentAppState === 'lost';
    const status = isLostOrScanning ? '다시 교리도를 비춰주세요' : '구역을 터치해 설명을 확인하세요';
    setStatus(status, isLostOrScanning ? 'waiting' : 'found', '구역을 터치해 설명을 확인하세요');
  }
}

function selectSection(section: DoctrineSection) {
  if (activeSectionId === section.id) {
    return;
  }

  lastSelectTime = performance.now();
  closeBlockedByDebounce = false;
  lastCloseReason = '';
  activeSectionId = section.id;
  activeSectionTitle = section.title;
  lastTouchedSectionId = section.id;
  lastTouchedSectionTitle = section.title;
  selectionGroup?.removeFromParent();
  selectionGroup = createSelectionGroup(section);
  overlayContentGroup?.add(selectionGroup);
  showSectionCard(section);
  setUiCompact(true);
  setStatus(`선택됨: ${section.title}`, 'found', section.subtitle ?? '선택한 구역 정보를 표시합니다.');
}

async function startAR() {
  if (hasStarted) {
    return;
  }

  if (!compatibilityReport.supported) {
    showCompatibilityBlock(compatibilityReport.blockingReason, compatibilityReport.recommendedBrowser, '지원하지 않는 브라우저입니다');
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

  if (!(await hasAnyCameraDevice())) {
    showCompatibilityBlock(
      '이 기기에는 사용할 수 있는 카메라가 없어 AR 기능을 실행할 수 없습니다.',
      compatibilityReport.recommendedBrowser,
      '카메라를 찾을 수 없습니다',
    );
    return;
  }

  hasStarted = true;
  lastErrorMessage = '';
  startButton.disabled = true;
  startButton.textContent = '카메라 준비 중';
  setAppState('scan', '교리도 전체가 화면에 들어오게 비춰주세요', 'ready', '카메라 권한을 요청합니다.');

  try {
    const [overlayTexture, doctrineSections, targetMind] = await Promise.all([
      loadOverlayTexture(),
      loadDoctrineSections(),
      resolveTargetMindPath(),
    ]);

    console.log('WonXR target and hotspot data resolved', {
      targetMindPath: targetMind.path,
      targetVersion: targetMind.version,
      sections: doctrineSections.length,
    });
    activeTargetVersion = targetMind.version;
    loadedSectionCount = doctrineSections.length;
    selectionTextureSource = overlayTexture;

    mindarThree = new MindARThree({
      container: arContainer,
      imageTargetSrc: assetUrl(targetMind.path),
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
    activeRenderer = renderer;
    activeCamera = camera;
    const anchor = mindarThree.addAnchor(0);
    const stableGroup = new THREE.Group();
    const targetPosition = new THREE.Vector3();
    const targetQuaternion = new THREE.Quaternion();
    const targetScale = new THREE.Vector3();
    const rawMatrix = new THREE.Matrix4();
    const lastGoodPosition = new THREE.Vector3();
    const lastGoodQuaternion = new THREE.Quaternion();
    const lastGoodScale = new THREE.Vector3(1, 1, 1);
    const stableEuler = new THREE.Euler();
    const stableNormal = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    const poseStats: PoseStats = {
      appState: currentAppState,
      found: false,
      locked: false,
      lockMode: lockSettings.enabled,
      profile: trackingProfile,
      targetVersion: activeTargetVersion,
      fallbackUsed: activeTargetFallbackUsed,
      holdMs: lostHoldMs,
      holdRemainingMs: 0,
      rawCenterX: Number.NaN,
      rawCenterY: Number.NaN,
      smoothedCenterX: Number.NaN,
      smoothedCenterY: Number.NaN,
      rawScale: Number.NaN,
      smoothedScale: Number.NaN,
      rawRotationDeg: Number.NaN,
      smoothedRotationDeg: Number.NaN,
      rejectedFrames: 0,
      lastRejectReason: '',
      foundCount: 0,
      lostCount: 0,
      activeSectionId: '',
      activeSectionTitle: '',
      lastTouchedSectionId: '',
      lastTouchedSectionTitle: '',
      hitMeshCount: 0,
      rawStableDeltaPosition: Number.NaN,
      rawStableDeltaRotation: Number.NaN,
      rawStableDeltaScale: Number.NaN,
      stablePositionX: Number.NaN,
      stablePositionY: Number.NaN,
      stablePositionZ: Number.NaN,
      stableRotationX: Number.NaN,
      stableRotationY: Number.NaN,
      stableRotationZ: Number.NaN,
      stableScaleX: Number.NaN,
      stableScaleY: Number.NaN,
      stableScaleZ: Number.NaN,
      viewingAngleDeg: Number.NaN,
      videoExists: false,
      canvasExists: false,
      rendererPixelRatio: Math.min(window.devicePixelRatio, 2),
      fps: 0,
      lastErrorMessage: '',
      warningMessages: [],
    };

    let isTargetFound = false;
    let isStableInitialized = false;
    let hasLastGoodPose = false;
    let isPoseLocked = false;
    let stableFrameCount = 0;
    let foundFrameCount = 0;
    let lastGoodScaleScalar = 1;
    let overlayOpacity = 0;
    let lastSeenAt = 0;
    let foundAt = 0;
    let hasWarnedLowAngle = false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    stableGroup.visible = false;
    scene.add(stableGroup);
    overlayContentGroup = new THREE.Group();
    stableGroup.add(overlayContentGroup);

    const overlayGeometry = new THREE.PlaneGeometry(TARGET_WIDTH, TARGET_HEIGHT);
    const overlayMaterial = new THREE.MeshBasicMaterial({
      map: overlayTexture,
      transparent: true,
      opacity: overlayOpacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    overlayPlane = new THREE.Mesh(overlayGeometry, overlayMaterial);
    overlayPlane.renderOrder = 10;
    overlayContentGroup.add(overlayPlane);
    const { group: hotspotDebugGroup, hitMeshes: hotspotHitMeshes } = createHotspotDebugGroup(doctrineSections);
    hitMeshes.splice(0, hitMeshes.length, ...hotspotHitMeshes);
    poseStats.hitMeshCount = hitMeshes.length;
    overlayContentGroup.add(hotspotDebugGroup);
    hotspotPointerCleanup?.();
    hotspotPointerCleanup = setupHotspotPointer(
      camera,
      hitMeshes,
      () => isTargetFound || stableGroup.visible || currentAppState === 'holding',
      selectSection,
    );
    applyOverlayCalibration();

    anchor.onTargetFound = () => {
      const now = performance.now();
      isTargetFound = true;
      poseStats.foundCount += 1;
      foundFrameCount = 0;
      foundAt = now;
      lastSeenAt = now;
      stableGroup.visible = hasLastGoodPose;
      setAppState('tracking', '구역을 터치해 설명을 확인하세요', 'found', '구역을 터치해 설명을 확인하세요');
    };

    anchor.onTargetLost = () => {
      isTargetFound = false;
      poseStats.lostCount += 1;

      if (stableGroup.visible) {
        setAppState('holding', '인식 유지 중  구역을 터치할 수 있습니다', 'found', '조금 더 위에서 비춰주세요');
      }
    };

    await mindarThree.start();
    mindarStartSucceeded = true;
    assertArLayersCreated();

    startButton.classList.add('hidden');
    setAppState('scan', '교리도 전체가 화면에 들어오게 비춰주세요', 'waiting', '교리도 전체가 화면에 들어오게 비춰주세요');

    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const frameDelta = now - lastFrameAt;

      if (frameDelta > 0) {
        const instantFps = 1000 / frameDelta;
        currentFps = currentFps === 0 ? instantFps : currentFps * 0.9 + instantFps * 0.1;
      }

      lastFrameAt = now;
      let acceptedPose = false;
      let hasRawPose = false;

      if (isTargetFound) {
        anchor.group.updateMatrixWorld(true);
        rawMatrix.copy(anchor.group.matrixWorld);
        rawMatrix.decompose(targetPosition, targetQuaternion, targetScale);
        hasRawPose = true;

        poseStats.found = true;
        poseStats.rawCenterX = targetPosition.x;
        poseStats.rawCenterY = targetPosition.y;
        poseStats.rawScale = getScaleScalar(targetScale);
        poseStats.rawRotationDeg = getQuaternionZDegrees(targetQuaternion);
        foundFrameCount += 1;

        const rejectReason = hasLastGoodPose
          ? getPoseRejectReason(
              targetPosition,
              targetQuaternion,
              targetScale,
              lastGoodPosition,
              lastGoodQuaternion,
              lastGoodScaleScalar,
            )
          : '';

        if (rejectReason) {
          poseStats.rejectedFrames += 1;
          poseStats.lastRejectReason = rejectReason;
        } else {
          lastGoodPosition.copy(targetPosition);
          lastGoodQuaternion.copy(targetQuaternion);
          lastGoodScale.copy(targetScale);
          lastGoodScaleScalar = Math.max(getScaleScalar(targetScale), 0.0001);
          hasLastGoodPose = true;
          lastSeenAt = now;
          acceptedPose = true;
          poseStats.lastRejectReason = '';
        }

        if (acceptedPose && !isStableInitialized) {
          stableGroup.position.copy(lastGoodPosition);
          stableGroup.quaternion.copy(lastGoodQuaternion);
          stableGroup.scale.copy(lastGoodScale);
          isStableInitialized = true;
          stableFrameCount = 0;
          overlayOpacity = 1;
        } else if (acceptedPose) {
          const stableDelta = getPoseDelta(
            lastGoodPosition,
            lastGoodQuaternion,
            lastGoodScale,
            stableGroup.position,
            stableGroup.quaternion,
            stableGroup.scale,
          );

          if (
            isPoseLocked &&
            (stableDelta.position > lockSettings.breakPosition || stableDelta.rotation > lockSettings.breakRotation)
          ) {
            isPoseLocked = false;
            stableFrameCount = 0;
          }

          if (isPoseLocked) {
            overlayOpacity += (1 - overlayOpacity) * 0.25;
          } else {
            const didMovePosition = stableDelta.position > deadbandSettings.position;
            const didMoveRotation = stableDelta.rotation > deadbandSettings.rotation;
            const didMoveScale = stableDelta.scale > deadbandSettings.scale;

            if (didMovePosition) {
              stableGroup.position.lerp(lastGoodPosition, smoothingSettings.position);
            }

            if (didMoveRotation) {
              stableGroup.quaternion.slerp(lastGoodQuaternion, smoothingSettings.rotation);
            }

            if (didMoveScale) {
              stableGroup.scale.lerp(lastGoodScale, smoothingSettings.scale);
            }

            const isQuietFrame = !didMovePosition && !didMoveRotation && !didMoveScale;
            stableFrameCount = lockSettings.enabled && isQuietFrame ? stableFrameCount + 1 : 0;

            if (lockSettings.enabled && stableFrameCount >= lockSettings.stableFrames) {
              isPoseLocked = true;
            }

            overlayOpacity += (1 - overlayOpacity) * 0.25;
          }
        }

        if (hasLastGoodPose) {
          stableGroup.visible = true;
        }

        if (
          hasLastGoodPose &&
          currentAppState === 'tracking' &&
          (now - foundAt >= FOUND_TO_EXPLORE_MS || foundFrameCount >= MIN_FOUND_FRAMES_FOR_EXPLORE)
        ) {
          setAppState('explore', '구역을 터치해 설명을 확인하세요', 'found', '구역을 터치해 설명을 확인하세요');
        }
      } else {
        poseStats.found = false;
      }

      if (hasLastGoodPose && !acceptedPose) {
        const elapsedSinceGoodPose = now - lastSeenAt;

        if (elapsedSinceGoodPose <= lostHoldMs) {
          stableGroup.visible = true;
          overlayOpacity = Math.max(overlayOpacity, 1);

          if (!isTargetFound && currentAppState !== 'holding') {
            setAppState('holding', '인식 유지 중  구역을 터치할 수 있습니다', 'found', '조금 더 위에서 비춰주세요');
          }
        } else {
          overlayOpacity = 0;
          stableGroup.visible = false;
          isStableInitialized = false;
          hasLastGoodPose = false;
            clearSelectedSection(false, 'target lost timeout');

          if (currentAppState !== 'lost') {
            setAppState('lost', '다시 교리도를 비춰주세요', 'waiting', '교리도 전체가 화면에 들어오게 비춰주세요');
          }
        }
      }

      overlayMaterial.opacity = overlayOpacity;
      const rawStableDelta = hasRawPose
        ? getPoseDelta(targetPosition, targetQuaternion, targetScale, stableGroup.position, stableGroup.quaternion, stableGroup.scale)
        : { position: Number.NaN, rotation: Number.NaN, scale: Number.NaN };
      stableEuler.setFromQuaternion(stableGroup.quaternion, 'XYZ');
      stableNormal.set(0, 0, 1).applyQuaternion(stableGroup.quaternion).normalize();
      camera.getWorldDirection(cameraDirection).normalize();
      const viewingDot = Math.abs(THREE.MathUtils.clamp(stableNormal.dot(cameraDirection), -1, 1));
      const viewingAngleDeg = THREE.MathUtils.radToDeg(Math.acos(viewingDot));
      const holdRemainingMs = hasLastGoodPose && !isTargetFound ? Math.max(lostHoldMs - (now - lastSeenAt), 0) : 0;
      const videoExists = arContainer.querySelector('video') !== null;
      const canvasExists = arContainer.querySelector('canvas') !== null;
      const warningMessages = [
        activeTargetFallbackUsed ? 'fallback to v1' : '',
        !videoExists ? 'no video element' : '',
        !canvasExists ? 'no canvas element' : '',
        poseStats.rejectedFrames > 12 ? 'pose outlier too frequent' : '',
        poseStats.lostCount > 4 ? 'target lost too often' : '',
        viewingAngleDeg > 65 && stableGroup.visible ? 'viewing angle too low' : '',
        !overlayTexture ? 'overlay not loaded' : '',
        doctrineSections.length === 0 ? 'doctrine_sections.json not loaded' : '',
        hitMeshes.length === 0 ? 'no hotspot hit meshes' : '',
        interactionDebug.pointerDownCount > 0 && interactionDebug.lastRaycastHitCount === 0 && !interactionDebug.lastPointerIgnoredByUi
          ? 'no raycast hits after touch'
          : '',
        interactionDebug.lastPointerIgnoredByUi ? 'UI blocking touch' : '',
        lastTouchWarning,
      ].filter(Boolean);

      if (!activeSectionId && stableGroup.visible && viewingAngleDeg > 65 && !hasWarnedLowAngle) {
        hasWarnedLowAngle = true;
        setStatus('조금 더 위에서 비춰주세요', 'found', '구역을 터치해 설명을 확인하세요');
      } else if (viewingAngleDeg <= 55) {
        hasWarnedLowAngle = false;
      }

      poseStats.appState = currentAppState;
      poseStats.smoothedCenterX = stableGroup.position.x;
      poseStats.smoothedCenterY = stableGroup.position.y;
      poseStats.smoothedScale = getScaleScalar(stableGroup.scale);
      poseStats.smoothedRotationDeg = getQuaternionZDegrees(stableGroup.quaternion);
      poseStats.locked = isPoseLocked;
      poseStats.lockMode = lockSettings.enabled;
      poseStats.targetVersion = activeTargetVersion;
      poseStats.fallbackUsed = activeTargetFallbackUsed;
      poseStats.holdRemainingMs = holdRemainingMs;
      poseStats.hitMeshCount = hitMeshes.length;
      poseStats.activeSectionId = activeSectionId;
      poseStats.activeSectionTitle = activeSectionTitle;
      poseStats.lastTouchedSectionId = lastTouchedSectionId;
      poseStats.lastTouchedSectionTitle = lastTouchedSectionTitle;
      poseStats.rawStableDeltaPosition = rawStableDelta.position;
      poseStats.rawStableDeltaRotation = rawStableDelta.rotation;
      poseStats.rawStableDeltaScale = rawStableDelta.scale;
      poseStats.stablePositionX = stableGroup.position.x;
      poseStats.stablePositionY = stableGroup.position.y;
      poseStats.stablePositionZ = stableGroup.position.z;
      poseStats.stableRotationX = THREE.MathUtils.radToDeg(stableEuler.x);
      poseStats.stableRotationY = THREE.MathUtils.radToDeg(stableEuler.y);
      poseStats.stableRotationZ = THREE.MathUtils.radToDeg(stableEuler.z);
      poseStats.stableScaleX = stableGroup.scale.x;
      poseStats.stableScaleY = stableGroup.scale.y;
      poseStats.stableScaleZ = stableGroup.scale.z;
      poseStats.viewingAngleDeg = viewingAngleDeg;
      poseStats.videoExists = videoExists;
      poseStats.canvasExists = canvasExists;
      poseStats.rendererPixelRatio = renderer.getPixelRatio();
      poseStats.fps = currentFps;
      poseStats.lastErrorMessage = lastErrorMessage;
      poseStats.warningMessages = warningMessages;
      updateSelectionAnimation();
      updateDebugPanel(poseStats);
      updateDebugCorners(hasRawPose ? rawMatrix : undefined, stableGroup, camera, renderer);

      renderer.render(scene, camera);
    });
  } catch (error) {
    try {
      mindarThree?.stop();
    } catch (stopError) {
      console.error('Failed to stop MindAR after start error.', stopError);
    }

    mindarThree = undefined;
    mindarStartSucceeded = false;
    activeRenderer = undefined;
    activeCamera = undefined;
    hotspotPointerCleanup?.();
    hotspotPointerCleanup = undefined;
    overlayContentGroup = undefined;
    overlayPlane = undefined;
    selectionGroup = undefined;
    hasStarted = false;
    setUiCompact(false);
    startButton.disabled = false;
    startButton.classList.remove('hidden');
    startButton.textContent = '다시 시도';

    const detail = getCameraErrorMessage(error);
    lastErrorMessage = detail;
    const title = detail.includes('영상 요소')
      ? '카메라 영상 생성 실패'
      : detail.includes('권한') || detail.includes('카메라') || detail.toLowerCase().includes('camera') || detail.toLowerCase().includes('permission')
        ? '카메라 시작 실패'
        : 'AR 시작 실패';

    if (detail.includes('카메라가 없어')) {
      showCompatibilityBlock(detail, compatibilityReport.recommendedBrowser, '카메라를 찾을 수 없습니다');
    }

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

sectionCardClose.addEventListener('click', () => {
  clearSelectedSection(true, 'close button');
});

infoButton.addEventListener('click', openAboutPanel);
compatibilityInfoButton.addEventListener('click', openAboutPanel);
aboutClose.addEventListener('click', closeAboutPanel);

debugToggle.addEventListener('click', () => {
  debugPanel.classList.toggle('collapsed');
  debugToggle.textContent = debugPanel.classList.contains('collapsed') ? 'Expand' : 'Collapse';
});

debugHide.addEventListener('click', () => {
  debugPanel.classList.add('user-hidden');
});

debugFab.addEventListener('click', () => {
  debugPanel.classList.remove('user-hidden');
});

sensorButton.addEventListener('click', () => {
  void requestDeviceSensorPermission();
});

window.addEventListener('resize', () => {
  updateRendererForViewport();
  showOrientationGuidance();
});

window.addEventListener('orientationchange', () => {
  scheduleOrientationRestart('orientationchange');
});

screen.orientation?.addEventListener('change', () => {
  scheduleOrientationRestart('screen.orientation change');
});

window.visualViewport?.addEventListener('resize', () => {
  updateRendererForViewport();
});

window.addEventListener('deviceorientation', (event) => {
  deviceOrientationLabel = `alpha ${formatDebugNumber(event.alpha ?? Number.NaN)}, beta ${formatDebugNumber(
    event.beta ?? Number.NaN,
  )}, gamma ${formatDebugNumber(event.gamma ?? Number.NaN)}`;
});

window.addEventListener('beforeunload', () => {
  mindarThree?.stop();
});

updateCalibrationDisplay();
applyInitialCompatibilityGate();
void checkDebugAssets();
void checkManifestStatus();
void registerServiceWorker();

startButton.addEventListener('click', () => {
  void startAR();
});
