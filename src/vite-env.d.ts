/// <reference types="vite/client" />

declare module 'mind-ar/dist/mindar-image-three.prod.js' {
  import type * as THREE from 'three';

  type MindARThreeOptions = {
    container: HTMLElement;
    imageTargetSrc: string;
    uiLoading?: 'yes' | 'no';
    uiScanning?: 'yes' | 'no';
    uiError?: 'yes' | 'no';
    maxTrack?: number;
    filterMinCF?: number;
    filterBeta?: number;
  };

  type MindARAnchor = {
    group: THREE.Group;
    onTargetFound?: () => void;
    onTargetLost?: () => void;
  };

  export class MindARThree {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;

    constructor(options: MindARThreeOptions);
    addAnchor(targetIndex: number): MindARAnchor;
    start(): Promise<void>;
    stop(): void;
  }
}
