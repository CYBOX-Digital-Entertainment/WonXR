export const TARGET_IMAGE_WIDTH = 1000;
export const TARGET_IMAGE_HEIGHT = 1415;
export const TARGET_ASPECT = TARGET_IMAGE_HEIGHT / TARGET_IMAGE_WIDTH;
export const TARGET_WIDTH = 1;
export const TARGET_HEIGHT = TARGET_ASPECT;

export type NormalizedHotspot = {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
};

export function getTargetPlaneFromImageDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      imageWidth: TARGET_IMAGE_WIDTH,
      imageHeight: TARGET_IMAGE_HEIGHT,
      aspect: TARGET_ASPECT,
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
    };
  }

  return {
    imageWidth: width,
    imageHeight: height,
    aspect: height / width,
    width: TARGET_WIDTH,
    height: height / width,
  };
}

export function hotspotToPlaneRect(hotspot: NormalizedHotspot, targetWidth: number, targetHeight: number, padding = 0) {
  return {
    centerX: (hotspot.nx + hotspot.nw / 2 - 0.5) * targetWidth,
    centerY: (0.5 - (hotspot.ny + hotspot.nh / 2)) * targetHeight,
    width: hotspot.nw * targetWidth + padding * 2,
    height: hotspot.nh * targetHeight + padding * 2,
  };
}
