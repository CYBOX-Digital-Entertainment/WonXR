# WonXR 교리도 WebAR Prototype

WonXR은 원불교 교리도 이미지를 인식하여 교리 구조를 증강현실로 보여주는 공모전용 WebAR 프로토타입입니다.

## Official Links

Main demo:

```text
https://cybox-digital-entertainment.github.io/WonXR/?mode=main
```

Debug:

```text
https://cybox-digital-entertainment.github.io/WonXR/?mode=debug
```

공식 테스트 링크는 위 두 개만 사용합니다.

## User Test Flow

1. 교리도 타깃을 책상이나 클립보드 위에 평평하게 둡니다.
2. Main demo를 iPhone Safari 또는 Android Chrome/Samsung Internet에서 엽니다.
3. 카메라 권한을 허용합니다.
4. 화면 중앙의 empty 교리도 스타일 pulsing guide에 맞춰 교리도 전체가 화면 안에 들어오게 비춥니다.
5. 인식 후에는 인쇄된 교리도가 카메라 화면 안에 계속 보이도록 유지합니다.
6. 교리도 구역을 터치해 3D 하이라이트와 설명 카드를 확인합니다.
7. 인식이 끊기면 `다시 스캔`을 눌러 처음부터 다시 맞춥니다.

이 WebAR 버전은 image-target tracking 기반입니다. 인쇄된 교리도가 카메라 화면 안에 있을 때 가장 안정적으로 작동합니다. 카메라가 타깃을 벗어난 뒤에도 실제 공간에 고정되는 world-anchor 방식은 향후 Android ARCore/native 버전에서 검토합니다.

## Local Development

```bash
npm install
npm run dev
npm run build
```

Vite production base는 GitHub Pages 경로에 맞춰 `/WonXR/`를 사용합니다.

## npm install note

This project currently uses `.npmrc` with `ignore-scripts=true`.
This is intended to avoid unnecessary or problematic dependency install scripts during the WebAR prototype build.
When adding new packages, check whether the package requires a `postinstall` script or native build step.
If a future dependency requires install scripts, review this setting before changing it.

## Safari / PWA stale version troubleshooting

If Safari or iPhone Home Screen keeps showing an old version:

1. Try:

```text
https://cybox-digital-entertainment.github.io/WonXR/?mode=main&cacheBust=현재시간
```

2. If still old, try:

```text
https://cybox-digital-entertainment.github.io/WonXR/reset.html
```

3. If still old on iPhone Home Screen:
   - remove the Home Screen icon
   - open the Safari URL directly
   - add it to Home Screen again

4. If the old service worker is aggressively serving stale HTML, the reset page may not work until Safari fetches the updated service worker. This project now uses service-worker-level cache cleanup to reduce that issue in future deployments.

Future loaded versions also include an About/Debug cache reset button, but already-stuck old clients may need `reset.html` or the cache-busted URL above.

Main/Debug entry now also runs an early cache purge before the app bundle loads. The official URL may redirect once with `cacheReady=1&cacheBust=...`; this is expected and prevents Safari/PWA from keeping old WonXR caches.

## iPhone Home Screen

iPhone:

1. Safari로 Main demo를 엽니다.
2. 공유 버튼을 누릅니다.
3. `홈 화면에 추가`를 선택합니다.
4. 홈 화면 아이콘으로 실행합니다.

홈 화면 앱 모드에서 카메라가 열리지 않으면 Safari에서 직접 열어주세요.

Android:

1. Chrome 또는 Samsung Internet으로 접속합니다.
2. 메뉴에서 `앱 설치` 또는 `홈 화면에 추가`를 선택합니다.

Android adaptive/themed icon 지원은 런처와 브라우저 WebAPK 지원에 따라 달라집니다. iOS 아이콘 색상/틴트 효과는 iOS 설정에 의해 달라질 수 있습니다.

## Developer Options

Advanced query parameters remain internal developer tools. They are not official public URLs.

- `target`: `multi`, `v2`, `v1`, `original`, `hanja`
- `mode`: `main`, `debug`
- `sections`: `0` disables the main colored section overlay
- `cal`, `ox`, `oy`, `sx`, `sy`, `rz`: overlay calibration
- `hsx`, `hsy`, `hox`, `hoy`, `hrz`: Hanja-specific content calibration

The initial scan guide intentionally remains an empty gyorido-style guide because the app may recognize multiple target types before the active target is known.

## Hanja / Original Target Setup

Hanja target support is internal. To refresh the Hanja target:

1. Save the target image as `public/targets/gyorido_hanja.png`.
2. Compile it with the MindAR Image Targets Compiler.
3. Save the generated file as `public/targets/gyorido_hanja.mind`.
4. Test internally with `?target=hanja` or the debug URL.

For Korean original text target support, use `public/targets/gyorido_original.png` and `public/targets/gyorido_original.mind`.

## Deployment

This repository deploys GitHub Pages through the `gh-pages` branch.

GitHub Pages settings must be:

- Source: Deploy from a branch
- Branch: `gh-pages`
- Folder: `/root`

Do not use GitHub Actions Pages source for this repository because `actions/deploy-pages` repeatedly fails here.

The active workflow is `.github/workflows/deploy.yml` and deploys `dist` with `peaceiris/actions-gh-pages@v4`.

## Repository Asset Note

Temporary working asset folders from earlier experiments should not be restored. If `userfiles/` remains, treat it as local source/reference material, not runtime app assets.

## Open Source Notices

- Three.js - MIT License
- MindAR - MIT License
- Vite - MIT License
- TypeScript - Apache License 2.0
- `@types/three` - MIT License
