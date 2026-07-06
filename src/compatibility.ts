export type BrowserInfo = {
  name: string;
  version: string;
  os: string;
  osVersion: string;
  isIos: boolean;
  isAndroid: boolean;
  isUnsupportedBrowser: boolean;
};

export type FeatureSupport = {
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  webgl: boolean;
  webgl2: boolean;
  webAssembly: boolean;
  worker: boolean;
  animationFrame: boolean;
  pointerOrTouch: boolean;
};

export type CompatibilityReport = {
  browser: BrowserInfo;
  features: FeatureSupport;
  supported: boolean;
  warning: string;
  blockingReason: string;
  recommendedBrowser: string;
};

function matchVersion(userAgent: string, pattern: RegExp) {
  const match = userAgent.match(pattern);
  return match?.[1]?.replace(/_/g, '.') ?? '';
}

function detectBrowser(): BrowserInfo {
  const userAgent = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  const isAndroid = /Android/.test(userAgent);
  const os = isIos ? 'iOS' : isAndroid ? 'Android' : /Windows/.test(userAgent) ? 'Windows' : /Mac OS X/.test(userAgent) ? 'macOS' : 'Other';
  const osVersion = isIos
    ? matchVersion(userAgent, /OS ([\d_]+)/)
    : isAndroid
      ? matchVersion(userAgent, /Android ([\d.]+)/)
      : matchVersion(userAgent, /(?:Windows NT|Mac OS X) ([\d_.]+)/);

  if (/MSIE|Trident/.test(userAgent)) {
    return { name: 'Internet Explorer', version: matchVersion(userAgent, /(?:MSIE |rv:)([\d.]+)/), os, osVersion, isIos, isAndroid, isUnsupportedBrowser: true };
  }

  if (/Opera Mini/.test(userAgent)) {
    return { name: 'Opera Mini', version: matchVersion(userAgent, /Opera Mini\/([\d.]+)/), os, osVersion, isIos, isAndroid, isUnsupportedBrowser: true };
  }

  if (/SamsungBrowser/.test(userAgent)) {
    return { name: 'Samsung Internet', version: matchVersion(userAgent, /SamsungBrowser\/([\d.]+)/), os, osVersion, isIos, isAndroid, isUnsupportedBrowser: false };
  }

  if (/CriOS|Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) {
    return { name: isIos ? 'Chrome iOS' : 'Chrome', version: matchVersion(userAgent, /(?:CriOS|Chrome)\/([\d.]+)/), os, osVersion, isIos, isAndroid, isUnsupportedBrowser: false };
  }

  if (/Edg\//.test(userAgent)) {
    return { name: 'Edge', version: matchVersion(userAgent, /Edg\/([\d.]+)/), os, osVersion, isIos, isAndroid, isUnsupportedBrowser: false };
  }

  if (/Safari/.test(userAgent)) {
    return { name: isIos ? 'iOS Safari' : 'Safari', version: matchVersion(userAgent, /Version\/([\d.]+)/), os, osVersion, isIos, isAndroid, isUnsupportedBrowser: false };
  }

  return { name: 'Other', version: '', os, osVersion, isIos, isAndroid, isUnsupportedBrowser: false };
}

function checkWebGl() {
  const canvas = document.createElement('canvas');
  const webgl2 = Boolean(canvas.getContext('webgl2'));
  const webgl = webgl2 || Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  return { webgl, webgl2 };
}

export function getCompatibilityReport(): CompatibilityReport {
  const browser = detectBrowser();
  const webglSupport = checkWebGl();
  const features: FeatureSupport = {
    secureContext: window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1',
    mediaDevices: Boolean(navigator.mediaDevices),
    getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    webgl: webglSupport.webgl,
    webgl2: webglSupport.webgl2,
    webAssembly: typeof WebAssembly === 'object',
    worker: typeof Worker !== 'undefined',
    animationFrame: typeof window.requestAnimationFrame === 'function',
    pointerOrTouch: typeof PointerEvent !== 'undefined' || 'ontouchstart' in window,
  };

  const recommendedBrowser = browser.isIos
    ? 'iPhone에서는 최신 Safari를 사용해주세요.'
    : browser.isAndroid
      ? 'Android에서는 최신 Chrome 또는 Samsung Internet을 사용해주세요.'
      : '최신 Chrome, Safari, Edge를 사용해주세요.';

  if (browser.isUnsupportedBrowser) {
    return {
      browser,
      features,
      supported: false,
      warning: '',
      blockingReason: `${browser.name}은 WebAR 카메라 기능을 지원하지 않습니다.`,
      recommendedBrowser,
    };
  }

  const missingFeature = [
    !features.secureContext ? 'HTTPS 보안 연결이 필요합니다.' : '',
    !features.mediaDevices || !features.getUserMedia ? '카메라 API를 사용할 수 없습니다.' : '',
    !features.webgl ? 'WebGL을 사용할 수 없습니다.' : '',
    !features.webAssembly ? 'WebAssembly를 사용할 수 없습니다.' : '',
    !features.worker ? 'Web Worker를 사용할 수 없습니다.' : '',
    !features.animationFrame ? 'requestAnimationFrame을 사용할 수 없습니다.' : '',
    !features.pointerOrTouch ? '터치 또는 포인터 이벤트를 사용할 수 없습니다.' : '',
  ].find(Boolean);

  if (missingFeature) {
    return {
      browser,
      features,
      supported: false,
      warning: '',
      blockingReason: missingFeature,
      recommendedBrowser,
    };
  }

  const majorVersion = Number.parseInt(browser.version.split('.')[0] ?? '', 10);
  const warning =
    Number.isFinite(majorVersion) &&
    ((browser.name === 'iOS Safari' && majorVersion < 15) ||
      (browser.name === 'Chrome' && majorVersion < 90) ||
      (browser.name === 'Samsung Internet' && majorVersion < 15))
      ? '이 브라우저 버전은 지원하지 않습니다. 최신 버전으로 업데이트해주세요.'
      : '';

  return {
    browser,
    features,
    supported: true,
    warning,
    blockingReason: '',
    recommendedBrowser,
  };
}

export function formatFeatureSupport(features: FeatureSupport) {
  return Object.entries(features)
    .map(([name, supported]) => `${name}: ${supported ? 'yes' : 'no'}`)
    .join('\n');
}
