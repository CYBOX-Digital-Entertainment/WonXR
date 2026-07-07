export const TARGET_MIND_PATH = 'targets/gyorido_empty.mind';
export const TARGET_MIND_V2_PATH = 'targets/gyorido_empty_v2.mind';
export const TARGET_IMAGE_PATH = 'targets/gyorido_empty.png';
export const TARGET_EMPTY_GUIDE_IMAGE_PATH = 'targets/gyorido_empty_guide.png';
export const TARGET_IMAGE_V2_PATH = 'targets/gyorido_empty_v2.png';
export const TARGET_ORIGINAL_MIND_PATH = 'targets/gyorido_original.mind';
export const TARGET_ORIGINAL_IMAGE_PATH = 'targets/gyorido_original.png';
export const TARGET_HANJA_MIND_PATH = 'targets/gyorido_hanja.mind';
export const TARGET_HANJA_IMAGE_PATH = 'targets/gyorido_hanja.png';
export const TARGET_MULTI_MIND_PATH = 'targets/gyorido_multi.mind';

export type TargetMode = 'v2' | 'v1' | 'original' | 'hanja' | 'multi';

export const MULTI_TARGET_MODES = ['hanja', 'original', 'v1'] as const;

export function getRequestedTargetMode(params: URLSearchParams): TargetMode {
  const targetParam = params.get('target');
  return targetParam === 'v1' ||
    targetParam === 'v2' ||
    targetParam === 'original' ||
    targetParam === 'hanja' ||
    targetParam === 'multi'
    ? targetParam
    : 'multi';
}

export function getRequestedTargetMindPath(mode: TargetMode) {
  if (mode === 'v1') {
    return TARGET_MIND_PATH;
  }

  if (mode === 'original') {
    return TARGET_ORIGINAL_MIND_PATH;
  }

  if (mode === 'hanja') {
    return TARGET_HANJA_MIND_PATH;
  }

  if (mode === 'multi') {
    return TARGET_MULTI_MIND_PATH;
  }

  return TARGET_MIND_V2_PATH;
}

export function getTargetImagePath(mode: TargetMode) {
  if (mode === 'multi' || mode === 'hanja') {
    return TARGET_HANJA_IMAGE_PATH;
  }

  if (mode === 'original') {
    return TARGET_ORIGINAL_IMAGE_PATH;
  }

  if (mode === 'v1') {
    return TARGET_IMAGE_PATH;
  }

  return TARGET_IMAGE_V2_PATH;
}

export function getScanGuideImagePath() {
  // The first scan guide is intentionally generic/empty-style because multi-target
  // recognition may resolve Hanja, original, or empty diagrams only after tracking starts.
  return TARGET_EMPTY_GUIDE_IMAGE_PATH;
}

export function getModeForTargetIndex(requestedMode: TargetMode, activeMode: TargetMode, targetIndex: number): TargetMode {
  if (requestedMode !== 'multi' && activeMode !== 'multi') {
    return activeMode;
  }

  return MULTI_TARGET_MODES[targetIndex] ?? 'hanja';
}
