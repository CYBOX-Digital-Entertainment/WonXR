import './styles.css';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { formatFeatureSupport, getCompatibilityReport } from './compatibility';
import { loadDoctrineSections as loadDoctrineSectionsFromUrl, type DoctrineSection } from './ar/sectionData';
import {
  TARGET_ASPECT,
  TARGET_HEIGHT,
  TARGET_IMAGE_HEIGHT,
  TARGET_IMAGE_WIDTH,
  TARGET_WIDTH,
  getTargetPlaneFromImageDimensions,
  hotspotToPlaneRect,
} from './ar/targetGeometry';
import {
  TARGET_EMPTY_GUIDE_IMAGE_PATH,
  TARGET_HANJA_IMAGE_PATH,
  TARGET_HANJA_MIND_PATH,
  TARGET_IMAGE_PATH,
  TARGET_IMAGE_V2_PATH,
  TARGET_MIND_PATH,
  TARGET_MIND_V2_PATH,
  TARGET_MULTI_MIND_PATH,
  TARGET_ORIGINAL_IMAGE_PATH,
  TARGET_ORIGINAL_MIND_PATH,
  getModeForTargetIndex as getModeForTargetIndexFromModes,
  getRequestedTargetMindPath as getRequestedTargetMindPathForMode,
  getRequestedTargetMode,
  getScanGuideImagePath,
  getTargetImagePath,
  type TargetMode,
} from './ar/targetModes';
import {
  readNonNegativeNumberParam as readNonNegativeQueryParam,
  readNumberParam as readNumberQueryParam,
  readUnitNumberParam as readUnitQueryParam,
} from './utils/query';

type AppBuildInfo = {
  version: string;
  build: string;
  buildTime: string;
  commit: string;
  note?: string;
};

declare const __WONXR_BUILD_INFO__: AppBuildInfo;

const APP_BUILD: AppBuildInfo =
  typeof __WONXR_BUILD_INFO__ === 'object'
    ? __WONXR_BUILD_INFO__
    : {
        version: '0.0.0',
        build: 'dev',
        buildTime: 'development',
        commit: 'development',
        note: 'WonXR WebAR prototype',
      };

const OVERLAY_IMAGE_PATH = 'overlays/gyorido_text_overlay.png';
const HOTSPOT_DATA_PATH = 'data/doctrine_sections.json';

const OVERLAY_SCALE_X = 1.0;
const OVERLAY_SCALE_Y = 1.0;
const OVERLAY_OFFSET_X = 0.0;
const OVERLAY_OFFSET_Y = 0.0;
const OVERLAY_ROTATION_Z = 0.0;
const HIT_AREA_PADDING = 0.012;
const ELEVATION_Z = 0.055;
const MAX_ELEVATION_Z = 0.12;
const BOX_DEPTH = 0.045;
const TOP_OPACITY = 0.95;
const SIDE_OPACITY = 0.82;
const HIGHLIGHT_OPACITY = 0.2;
const OUTLINE_OPACITY = 1.0;
const SELECTION_ANIMATION_MS = 260;
const MAIN_SECTION_FILL_OPACITY = 0.16;
const MAIN_SECTION_OUTLINE_OPACITY = 0.74;
const ORIGINAL_TEXT_OVERLAY_OPACITY = 0.15;
const HANJA_TEXT_OVERLAY_OPACITY = 1;
// The Hanja scripture scan has a different content ratio/layout from the Korean/empty diagrams.
// Preserve these target-specific overlay values unless the Hanja calibration is intentionally redone.
const HANJA_CONTENT_SCALE_X = 0.985;
const HANJA_CONTENT_SCALE_Y = 1.077;
const HANJA_CONTENT_OFFSET_X = -0.002;
const HANJA_CONTENT_OFFSET_Y = -0.032;
const HANJA_CONTENT_ROTATION_Z = 0;

const POSITION_SMOOTHING = 0.12;
const ROTATION_SMOOTHING = 0.12;
const SCALE_SMOOTHING = 0.12;
const POSITION_DEADBAND = 0.0015;
const ROTATION_DEADBAND = 0.0015;
const SCALE_DEADBAND = 0.0015;
const MAX_POSITION_DELTA = 0.08;
const MAX_SCALE_DELTA = 0.1;
const MAX_ROTATION_DELTA = 0.25;
const LOST_HOLD_MS = 1200;
const FADE_OUT_MS = 250;
const RESCAN_SUPPRESS_MS = 1400;

const TRACKING_FILTER_MIN_CF = 0.001;
const TRACKING_FILTER_BETA = 30;
const TRACKING_WARMUP_TOLERANCE = 5;
const TRACKING_MISS_TOLERANCE = 12;

const CALIBRATION_STORAGE_KEY = 'wonxr-overlay-calibration';
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const versionedAssetUrl = (path: string) => `${assetUrl(path)}?v=${encodeURIComponent(APP_BUILD.build)}`;
const queryParams = new URLSearchParams(window.location.search);
const isFullDebugMode = queryParams.get('mode') === 'debug';
const isCalibrationMode = queryParams.get('cal') === '1';
const isDebugMode = isFullDebugMode || queryParams.get('debug') === '1';
const isHotspotMode = isFullDebugMode || queryParams.get('hotspots') === '1';
const requestedTargetMode = getRequestedTargetMode(queryParams);

function getRequestedTargetMindPath() {
  return getRequestedTargetMindPathForMode(requestedTargetMode);
}

function getModeForTargetIndex(targetIndex: number): TargetMode {
  return getModeForTargetIndexFromModes(requestedTargetMode, activeTargetMode, targetIndex);
}

function getTextOverlayOpacity(mode: TargetMode) {
  // Text and section overlays intentionally differ by target mode. Do not normalize
  // Hanja/original/empty modes blindly; their source images carry different content.
  if (mode === 'hanja') {
    return HANJA_TEXT_OVERLAY_OPACITY;
  }

  if (mode === 'original') {
    return ORIGINAL_TEXT_OVERLAY_OPACITY;
  }

  return 1;
}

const scanGuideImagePath = getScanGuideImagePath();
const requestedProfile = queryParams.get('profile');
const trackingProfile = requestedProfile === 'responsive' ? requestedProfile : 'smooth';
const mainSectionOverlay = queryParams.get('sections') !== '0';

type OverlayCalibration = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  rotationZ: number;
};

type CalibrationField = keyof OverlayCalibration;
type ContentTransform = OverlayCalibration;

type TrackingProfile = 'smooth' | 'responsive';

type AppState = 'scan' | 'tracking' | 'hold' | 'lost';

type ProfileSettings = {
  positionSmoothing: number;
  rotationSmoothing: number;
  scaleSmoothing: number;
  positionDeadband: number;
  rotationDeadband: number;
  scaleDeadband: number;
  lostHoldMs: number;
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
  return readNumberQueryParam(queryParams, name, fallback);
}

function readUnitNumberParam(name: string, fallback: number) {
  return readUnitQueryParam(queryParams, name, fallback);
}

function readNonNegativeNumberParam(name: string, fallback: number) {
  return readNonNegativeQueryParam(queryParams, name, fallback);
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

const neutralContentTransform: ContentTransform = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  rotationZ: 0,
};

const hanjaContentTransform: ContentTransform = {
  scaleX: readNumberParam('hsx', HANJA_CONTENT_SCALE_X),
  scaleY: readNumberParam('hsy', HANJA_CONTENT_SCALE_Y),
  offsetX: readNumberParam('hox', HANJA_CONTENT_OFFSET_X),
  offsetY: readNumberParam('hoy', HANJA_CONTENT_OFFSET_Y),
  rotationZ: readNumberParam('hrz', HANJA_CONTENT_ROTATION_Z),
};

function getContentTransformForMode(mode: TargetMode): ContentTransform {
  // Hanja uses a separate content transform because its scanned book diagram does not
  // share the exact same crop/aspect as the previous empty/Korean target images.
  return mode === 'hanja' ? hanjaContentTransform : neutralContentTransform;
}

const profileDefaults: Record<TrackingProfile, ProfileSettings> = {
  smooth: {
    positionSmoothing: POSITION_SMOOTHING,
    rotationSmoothing: ROTATION_SMOOTHING,
    scaleSmoothing: SCALE_SMOOTHING,
    positionDeadband: POSITION_DEADBAND,
    rotationDeadband: ROTATION_DEADBAND,
    scaleDeadband: SCALE_DEADBAND,
    lostHoldMs: LOST_HOLD_MS,
  },
  responsive: {
    positionSmoothing: 0.25,
    rotationSmoothing: 0.25,
    scaleSmoothing: 0.25,
    positionDeadband: 0.0005,
    rotationDeadband: 0.0005,
    scaleDeadband: 0.0005,
    lostHoldMs: 400,
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
const hitAreaPadding = readNonNegativeNumberParam('hitpad', HIT_AREA_PADDING);
const selectionElevation = Math.min(readNonNegativeNumberParam('elev', ELEVATION_Z), MAX_ELEVATION_Z);
const selectionDepth = Math.min(readNonNegativeNumberParam('depth', BOX_DEPTH), MAX_ELEVATION_Z);
const compatibilityReport = getCompatibilityReport();
let activeTargetImageWidth = TARGET_IMAGE_WIDTH;
let activeTargetImageHeight = TARGET_IMAGE_HEIGHT;
let activeTargetAspect = TARGET_ASPECT;
let activeTargetWidth = TARGET_WIDTH;
let activeTargetHeight = TARGET_HEIGHT;

function setActiveTargetPlaneDimensions(width: number, height: number) {
  const plane = getTargetPlaneFromImageDimensions(width, height);
  activeTargetImageWidth = plane.imageWidth;
  activeTargetImageHeight = plane.imageHeight;
  activeTargetAspect = plane.aspect;
  activeTargetWidth = plane.width;
  activeTargetHeight = plane.height;
}

console.log('WonXR AR config', {
  mode: isFullDebugMode ? 'debug' : 'demo',
  targetMode: requestedTargetMode,
  targetMindPath: getRequestedTargetMindPath(),
  targetMindUrl: versionedAssetUrl(getRequestedTargetMindPath()),
  scanGuidePath: scanGuideImagePath,
  scanGuideUrl: versionedAssetUrl(scanGuideImagePath),
  overlayPath: OVERLAY_IMAGE_PATH,
  overlayUrl: versionedAssetUrl(OVERLAY_IMAGE_PATH),
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
  hotspots: {
    enabled: isHotspotMode,
    mainSectionOverlay,
    dataPath: HOTSPOT_DATA_PATH,
    dataUrl: versionedAssetUrl(HOTSPOT_DATA_PATH),
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

  <main class="ui-overlay" data-state="scan">
    <section class="intro-panel top-ui-layer" aria-live="polite">
      <p class="eyebrow">WonXR</p>
      <h1 id="intro-title">교리도 그림을 비춰주세요</h1>
      <p id="message" class="message">카메라를 시작하면 교리도 인식을 준비합니다.</p>
    </section>

    <section id="scan-guide" class="scan-guide scan-guide-layer" aria-hidden="true">
      <img id="scan-guide-image" src="${versionedAssetUrl(scanGuideImagePath)}" alt="" />
      <p>교리도 전체가 이 영역에 들어오게 비춰주세요</p>
    </section>

    <button id="start-button" class="start-button" type="button">스캔 시작</button>
    <div id="ar-bottom-controls" class="bottom-controls">
      <button id="placement-button" class="placement-button hidden" type="button">다시 스캔</button>
    </div>
    <button id="info-button" class="info-button" type="button">정보</button>

    <section id="update-banner" class="update-banner hidden" role="status">
      <span>새 버전이 있습니다. 업데이트하려면 새로고침하세요.</span>
      <button id="update-button" type="button">업데이트</button>
    </section>

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
      <div class="debug-cache-actions">
        <button id="debug-update-check" class="sensor-button" type="button">업데이트 확인</button>
        <button id="debug-cache-reset" class="sensor-button" type="button">캐시 초기화 후 새로고침</button>
        <button id="debug-sw-update" class="sensor-button" type="button">서비스워커 업데이트</button>
      </div>
      <pre id="debug-content"></pre>
    </section>

    <section id="section-card" class="section-card info-card-layer info-card hidden" aria-live="polite">
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
        <dt>Planner / Developer</dt>
        <dd>Song MinSoo</dd>
        <dt>Project status</dt>
        <dd>Prototype for Won-Buddhism content contest</dd>
      </dl>
      <p>교리 설명 본문은 현재 작성 예정이며, 원불교 교무님 검수 후 반영 예정입니다.</p>
      <p>이 앱은 교리도 인식을 위해 카메라를 사용합니다. 카메라 영상은 서버로 업로드하지 않으며, 브라우저 내 이미지 인식과 AR 표시 용도로만 사용됩니다.</p>
      <p>웹버전은 이미지 타깃 기반 AR입니다. 기본적으로 인식 안정성을 위해 v2 교리도 타깃을 사용합니다. 향후 교전 속 원본 교리도 이미지 인식과 Android ARCore 기반 버전을 추가로 검토합니다.</p>
      <h3>Font notice</h3>
      <p>한둥근돋움 / WON Dotum이 설치된 환경에서는 해당 서체를 우선 사용합니다. 웹 배포용 폰트 임베딩은 라이선스 확인 후 적용 예정입니다.</p>
      <h3>홈 화면에 추가</h3>
      <p>iPhone: Safari로 접속한 뒤 공유 버튼을 누르고 홈 화면에 추가를 선택하세요. 홈 화면 앱 모드에서 카메라가 열리지 않으면 Safari에서 직접 열어주세요.</p>
      <p>Android: Chrome 또는 Samsung Internet에서 앱 설치 또는 홈 화면에 추가를 선택하세요. Android adaptive/themed icon 지원은 런처와 브라우저 WebAPK 지원에 따라 달라집니다.</p>
      <p>iOS 아이콘 색상/틴트 효과는 iOS 설정에 의해 달라질 수 있으며, 앱은 Home Screen용 아이콘을 제공합니다.</p>
      <h3>앱이 업데이트되지 않을 때</h3>
      <p>새 버전이 배포되었는데도 이전 화면이 보이면 reset.html 또는 정보 화면의 캐시 초기화를 사용하세요. iPhone 홈 화면 앱에서 계속 이전 버전이 보이면 Safari에서 직접 열어 다시 시도해주세요.</p>
      <button id="about-cache-reset" class="cache-reset-button" type="button">캐시 초기화 후 새로고침</button>
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
const scanGuide = requireElement<HTMLElement>('#scan-guide');
const scanGuideImage = requireElement<HTMLImageElement>('#scan-guide-image');
const startButton = requireElement<HTMLButtonElement>('#start-button');
const bottomControls = requireElement<HTMLDivElement>('#ar-bottom-controls');
const placementButton = requireElement<HTMLButtonElement>('#placement-button');
const infoButton = requireElement<HTMLButtonElement>('#info-button');
const updateBanner = requireElement<HTMLElement>('#update-banner');
const updateButton = requireElement<HTMLButtonElement>('#update-button');
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
const debugUpdateCheck = requireElement<HTMLButtonElement>('#debug-update-check');
const debugCacheReset = requireElement<HTMLButtonElement>('#debug-cache-reset');
const debugSwUpdate = requireElement<HTMLButtonElement>('#debug-sw-update');
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
const aboutCacheReset = requireElement<HTMLButtonElement>('#about-cache-reset');
const calibrationButtons = document.querySelectorAll<HTMLButtonElement>('[data-cal-field]');
const calibrationActionButtons = document.querySelectorAll<HTMLButtonElement>('[data-cal-action]');
let scanGuideFallbackUsed = false;
let activeScanGuideImagePath = scanGuideImagePath;

scanGuideImage.addEventListener('error', () => {
  if (scanGuideFallbackUsed || scanGuideImagePath === TARGET_EMPTY_GUIDE_IMAGE_PATH) {
    return;
  }

  scanGuideFallbackUsed = true;
  activeScanGuideImagePath = TARGET_EMPTY_GUIDE_IMAGE_PATH;
  scanGuideImage.src = versionedAssetUrl(activeScanGuideImagePath);
});

let mindarThree: MindARThree | undefined;
let hasStarted = false;
let overlayContentGroup: THREE.Group | undefined;
let overlayPlane: THREE.Mesh | undefined;
let selectionGroup: THREE.Group | undefined;
let selectionTextureSource: THREE.Texture | undefined;
let arRootRef: THREE.Group | undefined;
let activeSectionId = '';
let activeSectionTitle = '';
let lastTouchedSectionId = '';
let lastTouchedSectionTitle = '';
let activeTargetMode: TargetMode = requestedTargetMode;
let activeTargetFallbackUsed = false;
let activeTargetMindPath = getRequestedTargetMindPath();
let activeContentMode: TargetMode = requestedTargetMode === 'multi' ? 'hanja' : requestedTargetMode;
let textOverlayOpacity = getTextOverlayOpacity(activeContentMode);
let recognizedTargetIndex = Number.NaN;
let currentAppState: AppState = 'scan';
let mindarStartSucceeded = false;
let lastErrorMessage = '';
let lastTouchWarning = '';
let currentFps = 0;
let lastFrameAt = performance.now();
let loadedSectionCount = 0;
let shouldShowScanGuide = true;
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
let serviceWorkerRegistrationState = '-';
let serviceWorkerControllerStatus = 'no';
let serviceWorkerWaitingStatus = 'no';
let manifestStatus = 'not checked';
let latestBuildInfo: AppBuildInfo | undefined;
let lastUpdateCheckTime = '-';
let updateAvailable = false;
let cacheNamesStatus = '-';
let lastCacheResetTime = '-';
let serviceWorkerUpdateStatus = 'not checked';
let sensorPermissionState = 'not requested';
let deviceOrientationLabel = '-';
let arPosePosition = new THREE.Vector3();
let arPoseQuaternion = new THREE.Quaternion();
let arPoseScale = new THREE.Vector3(1, 1, 1);
let currentTargetPosition = new THREE.Vector3();
let currentTargetQuaternion = new THREE.Quaternion();
let currentTargetScale = new THREE.Vector3(1, 1, 1);
let rescanCount = 0;
let lastRescanReason = '';
let rescanCurrentAR: (reason?: string) => void = () => undefined;

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
  TARGET_IMAGE_V2_PATH,
  TARGET_MIND_PATH,
  TARGET_IMAGE_PATH,
  TARGET_EMPTY_GUIDE_IMAGE_PATH,
  TARGET_ORIGINAL_MIND_PATH,
  TARGET_ORIGINAL_IMAGE_PATH,
  TARGET_HANJA_MIND_PATH,
  TARGET_HANJA_IMAGE_PATH,
  TARGET_MULTI_MIND_PATH,
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

function updatePlacementButton() {
  if ((currentAppState === 'tracking' || currentAppState === 'hold' || currentAppState === 'lost') && !infoCardOpen) {
    placementButton.textContent = '다시 스캔';
    placementButton.disabled = false;
    placementButton.classList.remove('hidden');
    return;
  }

  placementButton.disabled = true;
  placementButton.classList.add('hidden');
}

function setAppState(nextState: AppState, status: string, tone: StatusTone, detail: string) {
  currentAppState = nextState;
  const isCompact = nextState === 'tracking' || nextState === 'hold' || (nextState === 'lost' && !shouldShowScanGuide);
  const shouldPreserveSelectedStatus =
    infoCardOpen && activeSectionTitle !== '' && (nextState === 'tracking' || nextState === 'hold');
  setUiCompact(isCompact);
  introTitle.textContent = isCompact ? 'WonXR' : '교리도 그림을 비춰주세요';
  scanGuide.classList.toggle('hidden', nextState !== 'scan' || !shouldShowScanGuide);
  scanGuide.classList.toggle('fading', false);
  uiOverlay.dataset.state = nextState;
  updatePlacementButton();
  setStatus(shouldPreserveSelectedStatus ? `선택됨: ${activeSectionTitle}` : status, tone, detail);
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
        const response = await fetch(versionedAssetUrl(path), { cache: 'no-store', method: 'HEAD' });
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

function getReloadMode() {
  // The public root has previously shown a blank page without an explicit mode.
  // Keep ?mode=main as the normal reload target until root-mode parity is verified.
  return isFullDebugMode ? 'debug' : 'main';
}

function getCacheBustUrl(reason: 'cacheBust' | 'v' = 'cacheBust') {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set('mode', getReloadMode());
  url.searchParams.set(reason, Date.now().toString());
  return url.toString();
}

function isNewerBuild(latest: AppBuildInfo) {
  return latest.build !== APP_BUILD.build || latest.buildTime !== APP_BUILD.buildTime || latest.commit !== APP_BUILD.commit;
}

async function refreshCacheDiagnostics() {
  serviceWorkerControllerStatus = navigator.serviceWorker?.controller ? 'yes' : 'no';

  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      cacheNamesStatus = cacheNames.length > 0 ? cacheNames.join(', ') : '(none)';
    } catch (error) {
      cacheNamesStatus = error instanceof Error ? `error: ${error.message}` : 'error';
    }
  } else {
    cacheNamesStatus = 'unsupported';
  }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
      serviceWorkerRegistrationState =
        registration?.installing?.state || registration?.waiting?.state || registration?.active?.state || 'none';
      serviceWorkerWaitingStatus = registration?.waiting ? 'yes' : 'no';
    } catch (error) {
      serviceWorkerRegistrationState = error instanceof Error ? `error: ${error.message}` : 'error';
    }
  }
}

function setUpdateBannerVisible(isVisible: boolean) {
  updateBanner.classList.toggle('hidden', !isVisible);
}

async function checkForAppUpdate(showStatus = false) {
  lastUpdateCheckTime = new Date().toISOString();

  try {
    const versionUrl = `${assetUrl('version.json')}?ts=${Date.now()}`;
    const response = await fetch(versionUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`version.json ${response.status}`);
    }

    latestBuildInfo = (await response.json()) as AppBuildInfo;
    updateAvailable = isNewerBuild(latestBuildInfo);
    setUpdateBannerVisible(updateAvailable);

    if (showStatus) {
      setStatus(updateAvailable ? '새 버전이 있습니다' : '최신 버전입니다', updateAvailable ? 'ready' : 'found');
    }
  } catch (error) {
    serviceWorkerUpdateStatus = error instanceof Error ? `version check error: ${error.message}` : 'version check error';
  }

  await refreshCacheDiagnostics();
}

async function clearWonxrStorageAndCaches() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.toLowerCase().includes('wonxr') || name.includes('WonXR'))
        .map((name) => caches.delete(name)),
    );
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.scope.includes(import.meta.env.BASE_URL) || registration.scope.includes('/WonXR/'))
        .map((registration) => registration.unregister()),
    );
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.toLowerCase().includes('wonxr') || key === CALIBRATION_STORAGE_KEY) {
        storage.removeItem(key);
      }
    }
  }
}

async function resetCacheAndReload() {
  lastCacheResetTime = new Date().toISOString();
  serviceWorkerUpdateStatus = 'manual cache reset requested';
  window.alert('앱 캐시를 초기화하고 새로고침합니다.');
  await clearWonxrStorageAndCaches();
  window.location.href = getCacheBustUrl('cacheBust');
}

function requestWaitingWorkerActivation(registration: ServiceWorkerRegistration) {
  const waitingWorker = registration.waiting;

  if (!waitingWorker) {
    return false;
  }

  window.sessionStorage.setItem('wonxr-sw-reload-on-controllerchange', '1');
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  serviceWorkerWaitingStatus = 'yes';
  serviceWorkerUpdateStatus = 'waiting worker asked to skip waiting';
  return true;
}

async function requestServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) {
    serviceWorkerUpdateStatus = 'unsupported';
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    if (!registration) {
      serviceWorkerUpdateStatus = 'no registration';
      return;
    }

    await registration.update();
    serviceWorkerUpdateStatus = requestWaitingWorkerActivation(registration) ? serviceWorkerUpdateStatus : 'update checked';
    await refreshCacheDiagnostics();
  } catch (error) {
    serviceWorkerUpdateStatus = error instanceof Error ? `update error: ${error.message}` : 'update error';
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    serviceWorkerStatus = 'unsupported';
    return;
  }

  try {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (window.sessionStorage.getItem('wonxr-sw-reload-on-controllerchange') !== '1') {
        serviceWorkerControllerStatus = navigator.serviceWorker.controller ? 'yes' : 'no';
        return;
      }

      window.sessionStorage.removeItem('wonxr-sw-reload-on-controllerchange');
      window.location.href = getCacheBustUrl('v');
    });

    const registration = await navigator.serviceWorker.register(assetUrl('sw.js'), {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    });
    serviceWorkerStatus = registration.active ? 'active' : 'registered';
    serviceWorkerRegistrationState =
      registration.installing?.state || registration.waiting?.state || registration.active?.state || 'registered';
    requestWaitingWorkerActivation(registration);
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;

      if (!newWorker) {
        return;
      }

      serviceWorkerUpdateStatus = 'update found';
      newWorker.addEventListener('statechange', () => {
        serviceWorkerRegistrationState = newWorker.state;

        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          requestWaitingWorkerActivation(registration);
        }
      });
    });
    await registration.update();
    await refreshCacheDiagnostics();
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
    setStatus('세로 화면에서 더 안정적으로 작동합니다', 'ready', '교리도를 화면 안에 유지하면 더 안정적으로 보입니다.');
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
  arRootRef = undefined;
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
  lastOrientationChangeTime = performance.now();

  window.clearTimeout(orientationRestartTimer);
  orientationRestartTimer = window.setTimeout(() => {
    void restartAR(reason);
  }, 300);
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
  const contentTransform = getContentTransformForMode(activeContentMode);
  const combinedScaleX = overlayCalibration.scaleX * contentTransform.scaleX;
  const combinedScaleY = overlayCalibration.scaleY * contentTransform.scaleY;
  const combinedOffsetX = overlayCalibration.offsetX + contentTransform.offsetX;
  const combinedOffsetY = overlayCalibration.offsetY + contentTransform.offsetY;
  const combinedRotationZ = overlayCalibration.rotationZ + contentTransform.rotationZ;

  if (overlayContentGroup) {
    overlayContentGroup.scale.set(combinedScaleX, combinedScaleY, 1);
    overlayContentGroup.position.set(combinedOffsetX, combinedOffsetY, 0.001);
    overlayContentGroup.rotation.z = combinedRotationZ;
  } else if (overlayPlane) {
    overlayPlane.scale.set(combinedScaleX, combinedScaleY, 1);
    overlayPlane.position.set(combinedOffsetX, combinedOffsetY, 0.001);
    overlayPlane.rotation.z = combinedRotationZ;
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

async function resolveTargetMindPath(): Promise<{ path: string; mode: TargetMode }> {
  const requestedTargetMindPath = getRequestedTargetMindPath();
  activeTargetFallbackUsed = false;

  if (requestedTargetMode === 'v1') {
    return { path: TARGET_MIND_PATH, mode: 'v1' as TargetMode };
  }

  try {
    const response = await fetch(versionedAssetUrl(requestedTargetMindPath), { cache: 'no-store', method: 'HEAD' });

    if (response.ok) {
      return { path: requestedTargetMindPath, mode: requestedTargetMode };
    }
  } catch (error) {
    console.warn('Failed to check requested target file. Falling back to v2 target.', error);
  }

  console.warn(`Target file not found: ${requestedTargetMindPath}. Falling back to ${TARGET_MIND_V2_PATH}.`);
  activeTargetFallbackUsed = true;
  return { path: TARGET_MIND_V2_PATH, mode: 'v2' as TargetMode };
}

async function loadDoctrineSections() {
  return loadDoctrineSectionsFromUrl(versionedAssetUrl(HOTSPOT_DATA_PATH));
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

function formatDomRect(element: Element) {
  const rect = element.getBoundingClientRect();
  return `x ${Math.round(rect.left)}, y ${Math.round(rect.top)}, w ${Math.round(rect.width)}, h ${Math.round(rect.height)}`;
}

function isBottomControlsUnexpectedlyHigh() {
  const rect = bottomControls.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.55;
}

function formatMatrix(matrix: THREE.Matrix4) {
  return matrix.elements.map((value) => value.toFixed(3)).join(', ');
}

function updateDebugPanel(stats: PoseStats) {
  if (!isDebugMode) {
    return;
  }

  arRootRef?.updateMatrixWorld(true);
  const bottomControlsUnexpected = isBottomControlsUnexpectedlyHigh();
  const guideAspect =
    scanGuideImage.naturalWidth > 0 ? scanGuideImage.naturalHeight / scanGuideImage.naturalWidth : Number.NaN;

  debugContent.textContent = [
    '[general]',
    `app mode: ${stats.appState}`,
    `target found: ${stats.found ? 'yes' : 'no'}`,
    `current target mode: ${stats.targetVersion}`,
    `loaded target file: ${activeTargetMindPath}`,
    `fallback used: ${stats.fallbackUsed ? 'yes' : 'no'}`,
    `recognized target index: ${Number.isFinite(recognizedTargetIndex) ? recognizedTargetIndex : '-'}`,
    `content mode: ${activeContentMode}`,
    `hanja image loaded: ${assetLoadStatus[TARGET_HANJA_IMAGE_PATH] ?? '-'}`,
    `hanja mind loaded: ${assetLoadStatus[TARGET_HANJA_MIND_PATH] ?? '-'}`,
    `profile: ${stats.profile}`,
    `active section: ${stats.activeSectionId || '-'} ${stats.activeSectionTitle || ''}`,
    `last touched: ${stats.lastTouchedSectionId || '-'} ${stats.lastTouchedSectionTitle || ''}`,
    `info card open: ${infoCardOpen ? 'yes' : 'no'}`,
    `last select time: ${lastSelectTime ? Math.round(lastSelectTime).toString() : '-'}`,
    `last close reason: ${lastCloseReason || '-'}`,
    `last pointer target: ${lastPointerTarget || '-'}`,
    `close blocked by debounce: ${closeBlockedByDebounce ? 'yes' : 'no'}`,
    '',
    '[image target]',
    `arRoot visible: ${arRootRef?.visible ? 'yes' : 'no'}`,
    `arRoot pos: ${formatDebugNumber(arPosePosition.x)}, ${formatDebugNumber(arPosePosition.y)}, ${formatDebugNumber(arPosePosition.z)}`,
    `arRoot rot z: ${formatDebugNumber(getQuaternionZDegrees(arPoseQuaternion))}deg`,
    `arRoot scale: ${formatDebugNumber(getScaleScalar(arPoseScale))}`,
    `target pos: ${formatDebugNumber(currentTargetPosition.x)}, ${formatDebugNumber(currentTargetPosition.y)}, ${formatDebugNumber(currentTargetPosition.z)}`,
    `target rot z: ${formatDebugNumber(getQuaternionZDegrees(currentTargetQuaternion))}deg`,
    `target scale: ${formatDebugNumber(getScaleScalar(currentTargetScale))}`,
    `rescan count: ${rescanCount}`,
    `last rescan reason: ${lastRescanReason || '-'}`,
    `target plane: ${activeTargetWidth} x ${activeTargetHeight}`,
    `overlay plane: ${activeTargetWidth} x ${activeTargetHeight}`,
    `target image pixels: ${activeTargetImageWidth} x ${activeTargetImageHeight}`,
    `target aspect: ${activeTargetAspect}`,
    `scan guide aspect: ${formatDebugNumber(guideAspect)}`,
    `hotspot coordinate aspect: ${activeTargetAspect}`,
    `calibration ox/oy/sx/sy/rz: ${overlayCalibration.offsetX}/${overlayCalibration.offsetY}/${overlayCalibration.scaleX}/${overlayCalibration.scaleY}/${overlayCalibration.rotationZ}`,
    `content transform x/y/sx/sy/rz: ${getContentTransformForMode(activeContentMode).offsetX}/${getContentTransformForMode(activeContentMode).offsetY}/${getContentTransformForMode(activeContentMode).scaleX}/${getContentTransformForMode(activeContentMode).scaleY}/${getContentTransformForMode(activeContentMode).rotationZ}`,
    `text overlay opacity: ${textOverlayOpacity}`,
    `section overlay visible: ${mainSectionOverlay ? 'yes' : 'no'}`,
    `arRoot matrix: ${arRootRef ? formatMatrix(arRootRef.matrixWorld) : '-'}`,
    '',
    '[button/ui]',
    `bottom button: ${placementButton.classList.contains('hidden') ? '-' : placementButton.textContent?.trim() || '-'}`,
    `bottom controls rect: ${formatDomRect(bottomControls)}`,
    `bottom controls moved unexpectedly: ${bottomControlsUnexpected ? 'yes' : 'no'}`,
    `info card open: ${infoCardOpen ? 'yes' : 'no'}`,
    `last close reason: ${lastCloseReason || '-'}`,
    '',
    '[scan guide]',
    `guide source image: ${activeScanGuideImagePath}`,
    `guide img src: ${scanGuideImage.currentSrc || scanGuideImage.src || '-'}`,
    `guide fallback used: ${scanGuideFallbackUsed ? 'yes' : 'no'}`,
    `guide visible: ${scanGuide.classList.contains('hidden') ? 'no' : 'yes'}`,
    `guide opacity: ${getComputedStyle(scanGuide).opacity}`,
    `uses empty gyorido guide: ${activeScanGuideImagePath === TARGET_EMPTY_GUIDE_IMAGE_PATH ? 'yes' : 'no'}`,
    `uses fake geometry: no`,
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
    `current app version: ${APP_BUILD.version}`,
    `current build: ${APP_BUILD.build}`,
    `current buildTime: ${APP_BUILD.buildTime}`,
    `current commit: ${APP_BUILD.commit}`,
    `latest version: ${latestBuildInfo?.version ?? '-'}`,
    `latest build: ${latestBuildInfo?.build ?? '-'}`,
    `latest buildTime: ${latestBuildInfo?.buildTime ?? '-'}`,
    `latest commit: ${latestBuildInfo?.commit ?? '-'}`,
    `update available: ${updateAvailable ? 'yes' : 'no'}`,
    `last update check: ${lastUpdateCheckTime}`,
    `last cache reset: ${lastCacheResetTime}`,
    `display mode: ${getDisplayMode()}`,
    `ios standalone: ${getIosStandalone() ? 'yes' : 'no'}`,
    `service worker: ${serviceWorkerStatus}`,
    `service worker supported: ${'serviceWorker' in navigator ? 'yes' : 'no'}`,
    `service worker controller: ${serviceWorkerControllerStatus}`,
    `service worker registration state: ${serviceWorkerRegistrationState}`,
    `service worker waiting: ${serviceWorkerWaitingStatus}`,
    `service worker update: ${serviceWorkerUpdateStatus}`,
    `cache names: ${cacheNamesStatus}`,
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

function getTargetCornerPoints() {
  return [
    new THREE.Vector3(-activeTargetWidth / 2, activeTargetHeight / 2, 0),
    new THREE.Vector3(activeTargetWidth / 2, activeTargetHeight / 2, 0),
    new THREE.Vector3(activeTargetWidth / 2, -activeTargetHeight / 2, 0),
    new THREE.Vector3(-activeTargetWidth / 2, -activeTargetHeight / 2, 0),
  ];
}

function projectCorners(matrix: THREE.Matrix4, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
  const rect = renderer.domElement.getBoundingClientRect();

  return getTargetCornerPoints().map((corner) => {
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
  const texture = await loader.loadAsync(versionedAssetUrl(OVERLAY_IMAGE_PATH));
  texture.encoding = THREE.sRGBEncoding;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function loadImageDimensions(path: string): Promise<{ width: number; height: number; path: string }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        path,
      });
    };

    image.onerror = () => reject(new Error(`Failed to load target image: ${path}`));
    image.src = versionedAssetUrl(path);
  });
}

async function applyActiveTargetPlaneFromImage(mode: TargetMode) {
  const imagePath = getTargetImagePath(mode);

  try {
    const imageInfo = await loadImageDimensions(imagePath);
    setActiveTargetPlaneDimensions(imageInfo.width, imageInfo.height);
    return imageInfo;
  } catch (error) {
    console.warn('Failed to read target image dimensions. Using default 1000:1415 plane.', error);
    setActiveTargetPlaneDimensions(TARGET_IMAGE_WIDTH, TARGET_IMAGE_HEIGHT);
    return {
      width: TARGET_IMAGE_WIDTH,
      height: TARGET_IMAGE_HEIGHT,
      path: TARGET_IMAGE_PATH,
    };
  }
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
  context.font = '700 34px "WON Dotum", "한둥근돋움", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
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
  return hotspotToPlaneRect(section.hotspot, activeTargetWidth, activeTargetHeight, padding);
}

function getSectionColor(section: DoctrineSection) {
  const color = new THREE.Color();
  color.setStyle(section.color ?? '#6ee7b7');
  return color;
}

function createAlignmentDebugGroup() {
  const group = new THREE.Group();
  group.visible = isDebugMode;

  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0xf2c400,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
  });
  const halfWidth = activeTargetWidth / 2;
  const halfHeight = activeTargetHeight / 2;
  const z = 0.016;
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfWidth, halfHeight, z),
    new THREE.Vector3(halfWidth, halfHeight, z),
    new THREE.Vector3(halfWidth, -halfHeight, z),
    new THREE.Vector3(-halfWidth, -halfHeight, z),
  ]);
  const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
  outline.renderOrder = 60;
  group.add(outline);

  const crossMaterial = new THREE.LineBasicMaterial({
    color: 0x004ef2,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
  });
  const crossLength = 0.08;
  const horizontal = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-crossLength, 0, z + 0.001),
      new THREE.Vector3(crossLength, 0, z + 0.001),
    ]),
    crossMaterial,
  );
  const vertical = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -crossLength, z + 0.001),
      new THREE.Vector3(0, crossLength, z + 0.001),
    ]),
    crossMaterial,
  );
  horizontal.renderOrder = 61;
  vertical.renderOrder = 61;
  group.add(horizontal, vertical);

  const cornerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cornerSize = 0.025;
  const cornerPositions = [
    [-halfWidth, halfHeight],
    [halfWidth, halfHeight],
    [halfWidth, -halfHeight],
    [-halfWidth, -halfHeight],
  ] as const;

  for (const [x, y] of cornerPositions) {
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(cornerSize, cornerSize), cornerMaterial);
    marker.position.set(x, y, z + 0.002);
    marker.renderOrder = 62;
    group.add(marker);
  }

  return group;
}

function createHotspotDebugGroup(sections: DoctrineSection[]) {
  const group = new THREE.Group();
  const mainOverlayGroup = new THREE.Group();
  const debugGroup = new THREE.Group();
  const hitGroup = new THREE.Group();
  const sectionHitMeshes: THREE.Mesh[] = [];
  mainOverlayGroup.visible = mainSectionOverlay;
  debugGroup.visible = isHotspotMode;

  sections.forEach((section, index) => {
    const color = getSectionColor(section);
    const { centerX, centerY, width, height } = getSectionRect(section);
    const hitRect = getSectionRect(section, hitAreaPadding);

    const mainSectionGroup = new THREE.Group();
    mainSectionGroup.position.set(centerX, centerY, 0.011);
    const mainFillMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: MAIN_SECTION_FILL_OPACITY,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mainFill = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mainFillMaterial);
    mainFill.renderOrder = 14;
    mainSectionGroup.add(mainFill);
    const mainOutlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2, height / 2, 0.001),
      new THREE.Vector3(width / 2, height / 2, 0.001),
      new THREE.Vector3(width / 2, -height / 2, 0.001),
      new THREE.Vector3(-width / 2, -height / 2, 0.001),
    ]);
    const mainOutlineMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: MAIN_SECTION_OUTLINE_OPACITY,
      depthTest: false,
      depthWrite: false,
    });
    const mainOutline = new THREE.LineLoop(mainOutlineGeometry, mainOutlineMaterial);
    mainOutline.renderOrder = 15;
    mainSectionGroup.add(mainOutline);
    mainOverlayGroup.add(mainSectionGroup);

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

  group.add(mainOverlayGroup);
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
    color: '#F2C400',
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
  updatePlacementButton();
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
  updatePlacementButton();

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
  updatePlacementButton();
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
  startButton.textContent = '스캔 준비 중';
  setAppState('scan', '교리도를 화면 중앙에 맞춰 비춰주세요', 'ready', '카메라 권한을 요청합니다.');

  try {
    const [overlayTexture, doctrineSections, targetMind] = await Promise.all([
      loadOverlayTexture(),
      loadDoctrineSections(),
      resolveTargetMindPath(),
    ]);

    console.log('WonXR target and hotspot data resolved', {
      targetMindPath: targetMind.path,
      targetMode: targetMind.mode,
      sections: doctrineSections.length,
    });
    activeTargetMode = targetMind.mode;
    activeTargetMindPath = targetMind.path;
    const targetImageInfo = await applyActiveTargetPlaneFromImage(activeTargetMode);
    activeContentMode = activeTargetMode === 'multi' ? getModeForTargetIndex(0) : activeTargetMode;
    activeScanGuideImagePath = getScanGuideImagePath();
    scanGuideImage.src = versionedAssetUrl(activeScanGuideImagePath);
    textOverlayOpacity = getTextOverlayOpacity(activeContentMode);
    console.log('WonXR target image plane resolved', {
      targetImagePath: targetImageInfo.path,
      targetImageWidth: targetImageInfo.width,
      targetImageHeight: targetImageInfo.height,
      targetAspect: activeTargetAspect,
      targetPlaneWidth: activeTargetWidth,
      targetPlaneHeight: activeTargetHeight,
      contentMode: activeContentMode,
      contentTransform: getContentTransformForMode(activeContentMode),
      textOverlayOpacity,
    });
    loadedSectionCount = doctrineSections.length;
    selectionTextureSource = overlayTexture;

    mindarThree = new MindARThree({
      container: arContainer,
      imageTargetSrc: versionedAssetUrl(targetMind.path),
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
    const targetIndices = activeTargetMode === 'multi' ? [0, 1, 2] : [0];
    const anchors = targetIndices.map((targetIndex) => ({
      targetIndex,
      anchor: mindarThree!.addAnchor(targetIndex),
    }));
    let activeAnchorRoot = anchors[0].anchor.group;
    const arRoot = new THREE.Group();
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
      profile: trackingProfile,
      targetVersion: activeTargetMode,
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
    let lastGoodScaleScalar = 1;
    let overlayOpacity = 0;
    let lastSeenAt = 0;
    let hasWarnedLowAngle = false;
    let suppressTrackingUntil = 0;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    // This WebAR build is image-target AR. The root follows the visible MindAR target
    // with smoothing and only holds briefly on target loss; true world anchoring is for
    // a future native/ARCore implementation, not this iPhone Safari web version.
    arRoot.visible = false;
    arRootRef = arRoot;
    scene.add(arRoot);
    overlayContentGroup = new THREE.Group();
    arRoot.add(overlayContentGroup);

    const overlayGeometry = new THREE.PlaneGeometry(activeTargetWidth, activeTargetHeight);
    const overlayMaterial = new THREE.MeshBasicMaterial({
      map: overlayTexture,
      transparent: true,
      opacity: overlayOpacity * textOverlayOpacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    overlayPlane = new THREE.Mesh(overlayGeometry, overlayMaterial);
    overlayPlane.renderOrder = 10;
    overlayContentGroup.add(overlayPlane);
    overlayContentGroup.add(createAlignmentDebugGroup());
    const { group: hotspotDebugGroup, hitMeshes: hotspotHitMeshes } = createHotspotDebugGroup(doctrineSections);
    hitMeshes.splice(0, hitMeshes.length, ...hotspotHitMeshes);
    poseStats.hitMeshCount = hitMeshes.length;
    overlayContentGroup.add(hotspotDebugGroup);
    hotspotPointerCleanup?.();
    hotspotPointerCleanup = setupHotspotPointer(
      camera,
      hitMeshes,
      () => (currentAppState === 'tracking' || currentAppState === 'hold') && arRoot.visible,
      selectSection,
    );
    applyOverlayCalibration();

    rescanCurrentAR = (reason = 'user rescan') => {
      const now = performance.now();
      rescanCount += 1;
      lastRescanReason = reason;
      shouldShowScanGuide = true;
      isStableInitialized = false;
      hasLastGoodPose = false;
      lastGoodScaleScalar = 1;
      recognizedTargetIndex = Number.NaN;
      overlayOpacity = 0;
      suppressTrackingUntil = now + RESCAN_SUPPRESS_MS;
      clearSelectedSection(false, reason);
      arRoot.visible = false;
      setAppState('scan', '다시 교리도를 비춰주세요', 'waiting', '교리도 전체가 이 영역에 들어오게 비춰주세요');
    };

    for (const { targetIndex, anchor } of anchors) {
      anchor.onTargetFound = () => {
        const now = performance.now();
        const nextContentMode = getModeForTargetIndex(targetIndex);
        activeAnchorRoot = anchor.group;
        recognizedTargetIndex = targetIndex;
        activeContentMode = nextContentMode;
        textOverlayOpacity = getTextOverlayOpacity(activeContentMode);
        applyOverlayCalibration();
        isTargetFound = true;
        poseStats.foundCount += 1;
        lastSeenAt = now;
        if (hasLastGoodPose) {
          arRoot.visible = true;
        }
      };

      anchor.onTargetLost = () => {
        if (recognizedTargetIndex !== targetIndex) {
          return;
        }

        isTargetFound = false;
        poseStats.lostCount += 1;

        if (arRoot.visible) {
          setAppState('hold', '인식 유지 중', 'ready', '웹버전은 교리도가 화면 안에 있을 때 가장 안정적입니다.');
        } else {
          setAppState('lost', '다시 교리도를 비춰주세요', 'waiting', '교리도 전체가 이 영역에 들어오게 비춰주세요');
        }
      };
    }

    await mindarThree.start();
    mindarStartSucceeded = true;
    assertArLayersCreated();

    startButton.classList.add('hidden');
    setAppState('scan', '교리도를 화면 중앙에 맞춰 비춰주세요', 'waiting', '교리도 전체가 이 영역에 들어오게 비춰주세요');

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

      if (isTargetFound && now >= suppressTrackingUntil) {
        activeAnchorRoot.updateMatrixWorld(true);
        rawMatrix.copy(activeAnchorRoot.matrixWorld);
        rawMatrix.decompose(targetPosition, targetQuaternion, targetScale);
        hasRawPose = true;

        poseStats.found = true;
        poseStats.rawCenterX = targetPosition.x;
        poseStats.rawCenterY = targetPosition.y;
        poseStats.rawScale = getScaleScalar(targetScale);
        poseStats.rawRotationDeg = getQuaternionZDegrees(targetQuaternion);
        currentTargetPosition.copy(targetPosition);
        currentTargetQuaternion.copy(targetQuaternion);
        currentTargetScale.copy(targetScale);

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
          shouldShowScanGuide = false;
          arRoot.position.copy(lastGoodPosition);
          arRoot.quaternion.copy(lastGoodQuaternion);
          arRoot.scale.copy(lastGoodScale);
          isStableInitialized = true;
          overlayOpacity = 1;
          arRoot.visible = true;
          setAppState('tracking', '인식됨  구역을 터치하세요', 'found', '교리도를 화면 안에 유지하면 더 안정적으로 보입니다.');
        } else if (acceptedPose) {
          shouldShowScanGuide = false;
          const stableDelta = getPoseDelta(
            lastGoodPosition,
            lastGoodQuaternion,
            lastGoodScale,
            arRoot.position,
            arRoot.quaternion,
            arRoot.scale,
          );

          if (stableDelta.position > deadbandSettings.position) {
            arRoot.position.lerp(lastGoodPosition, smoothingSettings.position);
          }

          if (stableDelta.rotation > deadbandSettings.rotation) {
            arRoot.quaternion.slerp(lastGoodQuaternion, smoothingSettings.rotation);
          }

          if (stableDelta.scale > deadbandSettings.scale) {
            arRoot.scale.lerp(lastGoodScale, smoothingSettings.scale);
          }

          overlayOpacity += (1 - overlayOpacity) * 0.25;
          arRoot.visible = true;

          if (currentAppState !== 'tracking') {
            setAppState('tracking', '인식됨  구역을 터치하세요', 'found', '교리도를 화면 안에 유지하면 더 안정적으로 보입니다.');
          }
        }

        if (hasLastGoodPose) {
          arRoot.visible = true;
          arPosePosition.copy(arRoot.position);
          arPoseQuaternion.copy(arRoot.quaternion);
          arPoseScale.copy(arRoot.scale);
        }
      } else {
        poseStats.found = false;
      }

      if (hasLastGoodPose && !acceptedPose && now >= suppressTrackingUntil) {
        const elapsedSinceGoodPose = now - lastSeenAt;

        if (elapsedSinceGoodPose <= lostHoldMs) {
          arRoot.visible = true;
          overlayOpacity = Math.max(overlayOpacity, 0.72);

          if (!isTargetFound && currentAppState !== 'hold') {
            setAppState('hold', '인식 유지 중', 'ready', '웹버전은 교리도가 화면 안에 있을 때 가장 안정적입니다.');
          }
        } else {
          overlayOpacity = 0;
          arRoot.visible = false;
          isStableInitialized = false;
          hasLastGoodPose = false;

          if (currentAppState !== 'lost') {
            setAppState('lost', '다시 교리도를 비춰주세요', 'waiting', '교리도 전체가 이 영역에 들어오게 비춰주세요');
          }
        }
      } else if (now < suppressTrackingUntil) {
        overlayOpacity = 0;
        arRoot.visible = false;
        poseStats.found = false;
        poseStats.holdRemainingMs = Math.max(suppressTrackingUntil - now, 0);
      }

      overlayMaterial.opacity = overlayOpacity * textOverlayOpacity;
      const visibleRoot = arRoot;
      const rawStableDelta = hasRawPose
        ? getPoseDelta(targetPosition, targetQuaternion, targetScale, visibleRoot.position, visibleRoot.quaternion, visibleRoot.scale)
        : { position: Number.NaN, rotation: Number.NaN, scale: Number.NaN };
      stableEuler.setFromQuaternion(visibleRoot.quaternion, 'XYZ');
      stableNormal.set(0, 0, 1).applyQuaternion(visibleRoot.quaternion).normalize();
      camera.getWorldDirection(cameraDirection).normalize();
      const viewingDot = Math.abs(THREE.MathUtils.clamp(stableNormal.dot(cameraDirection), -1, 1));
      const viewingAngleDeg = THREE.MathUtils.radToDeg(Math.acos(viewingDot));
      const holdRemainingMs = hasLastGoodPose && !isTargetFound ? Math.max(lostHoldMs - (now - lastSeenAt), 0) : 0;
      const videoExists = arContainer.querySelector('video') !== null;
      const canvasExists = arContainer.querySelector('canvas') !== null;
      const warningMessages = [
        activeTargetFallbackUsed ? 'target fallback used' : '',
        !videoExists ? 'no video element' : '',
        !canvasExists ? 'no canvas element' : '',
        isBottomControlsUnexpectedlyHigh() ? 'rescan button not in bottom controls' : '',
        scanGuideFallbackUsed ? 'scan guide target image fallback used' : '',
        scanGuideImage.complete && scanGuideImage.naturalWidth === 0 ? 'scan guide source missing' : '',
        scanGuide.querySelector('svg') ? 'scan guide using fallback/fake geometry' : '',
        overlayCalibration.offsetX !== 0 ||
        overlayCalibration.offsetY !== 0 ||
        overlayCalibration.scaleX !== 1 ||
        overlayCalibration.scaleY !== 1 ||
        overlayCalibration.rotationZ !== 0
          ? 'overlay alignment offset non-neutral'
          : '',
        poseStats.rejectedFrames > 12 ? 'pose outlier too frequent' : '',
        poseStats.lostCount > 4 ? 'target lost too often' : '',
        currentAppState === 'hold' ? 'target lost: holding last image-target pose briefly' : '',
        lastOrientationChangeTime ? 'orientation changed' : '',
        viewingAngleDeg > 50 && visibleRoot.visible ? 'viewing angle too low' : '',
        !overlayTexture ? 'overlay not loaded' : '',
        doctrineSections.length === 0 ? 'doctrine_sections.json not loaded' : '',
        hitMeshes.length === 0 ? 'no hotspot hit meshes' : '',
        interactionDebug.pointerDownCount > 0 && interactionDebug.lastRaycastHitCount === 0 && !interactionDebug.lastPointerIgnoredByUi
          ? 'no raycast hits after touch'
          : '',
        interactionDebug.lastPointerIgnoredByUi ? 'UI blocking touch' : '',
        lastTouchWarning,
      ].filter(Boolean);

      if (!activeSectionId && visibleRoot.visible && viewingAngleDeg > 50 && !hasWarnedLowAngle) {
        hasWarnedLowAngle = true;
        setStatus('웹AR에서는 너무 낮은 각도에서 인식이 불안정할 수 있습니다', 'found', '조금 더 위에서 비춰주세요');
      } else if (viewingAngleDeg <= 35) {
        hasWarnedLowAngle = false;
      }

      poseStats.appState = currentAppState;
      poseStats.smoothedCenterX = visibleRoot.position.x;
      poseStats.smoothedCenterY = visibleRoot.position.y;
      poseStats.smoothedScale = getScaleScalar(visibleRoot.scale);
      poseStats.smoothedRotationDeg = getQuaternionZDegrees(visibleRoot.quaternion);
      poseStats.targetVersion = activeTargetMode;
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
      poseStats.stablePositionX = visibleRoot.position.x;
      poseStats.stablePositionY = visibleRoot.position.y;
      poseStats.stablePositionZ = visibleRoot.position.z;
      poseStats.stableRotationX = THREE.MathUtils.radToDeg(stableEuler.x);
      poseStats.stableRotationY = THREE.MathUtils.radToDeg(stableEuler.y);
      poseStats.stableRotationZ = THREE.MathUtils.radToDeg(stableEuler.z);
      poseStats.stableScaleX = visibleRoot.scale.x;
      poseStats.stableScaleY = visibleRoot.scale.y;
      poseStats.stableScaleZ = visibleRoot.scale.z;
      poseStats.viewingAngleDeg = viewingAngleDeg;
      poseStats.videoExists = videoExists;
      poseStats.canvasExists = canvasExists;
      poseStats.rendererPixelRatio = renderer.getPixelRatio();
      poseStats.fps = currentFps;
      poseStats.lastErrorMessage = lastErrorMessage;
      poseStats.warningMessages = warningMessages;
      updateSelectionAnimation();
      updateDebugPanel(poseStats);
      updateDebugCorners(hasRawPose ? rawMatrix : undefined, visibleRoot, camera, renderer);

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
    arRootRef = undefined;
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
aboutCacheReset.addEventListener('click', () => {
  void resetCacheAndReload();
});

updateButton.addEventListener('click', () => {
  void resetCacheAndReload();
});

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

debugUpdateCheck.addEventListener('click', () => {
  void checkForAppUpdate(true);
});

debugCacheReset.addEventListener('click', () => {
  void resetCacheAndReload();
});

debugSwUpdate.addEventListener('click', () => {
  void requestServiceWorkerUpdate();
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
void checkForAppUpdate(false);
void refreshCacheDiagnostics();

startButton.addEventListener('click', () => {
  void startAR();
});

placementButton.addEventListener('click', () => {
  rescanCurrentAR('user rescan');
});
