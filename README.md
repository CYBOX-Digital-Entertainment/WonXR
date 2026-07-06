# WonXR 교리도 WebAR Prototype

WonXR은 원불교 교리도 이미지를 인식하여 교리 구조를 증강현실로 보여주는 공모전용 WebAR 프로토타입입니다.
기본 타깃은 v2 패턴이 들어간 `gyorido_empty_v2.mind`이며, 구역을 터치하면 선택 영역이 3D 블록처럼 떠오르고 하단 설명 카드가 표시됩니다.

## Official Links

Main demo:

```text
https://cybox-digital-entertainment.github.io/WonXR/
```

Debug:

```text
https://cybox-digital-entertainment.github.io/WonXR/?mode=debug
```

공식 사용 링크는 위 두 개만 사용합니다.

## User Test Flow

1. v2 패턴이 들어간 교리도 출력물을 책상이나 클립보드 위에 평평하게 둡니다.
2. Main demo를 iPhone Safari 또는 Android Chrome/Samsung Internet에서 엽니다.
3. 카메라 권한을 허용합니다.
4. 중앙의 실제 교리도 타깃 이미지 기반 흑백 pulsing guide에 교리도 전체를 맞춥니다.
5. 인식 후 `스캔 종료` 버튼이 나타나면 위치가 맞는지 확인하고 누릅니다.
6. 배치가 완료되면 원하는 구역을 터치합니다.
7. 선택 구역의 raised 3D block과 하단 설명 카드가 나타나는지 확인합니다.
8. 위치가 어긋나면 `재스캔`을 누르고 다시 맞춥니다.
9. 3D 느낌은 20-35도 정도의 완만한 각도에서 확인하고, 너무 낮은 측면 각도는 피합니다.

카메라 테스트는 HTTPS가 적용된 GitHub Pages 주소에서 진행해야 합니다.

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

Android adaptive/themed icon 지원은 런처와 브라우저 WebAPK 지원에 따라 달라집니다.
iOS 아이콘 색상/틴트 효과는 iOS 설정에 의해 달라질 수 있으며, 앱은 Home Screen용 아이콘을 제공합니다.

## Visual Style / Font

UI는 iPhone 사용을 우선 고려한 Liquid Glass-inspired 스타일을 사용합니다.
카메라 화면 위에서 읽히도록 glass panel에는 blur, saturate, border highlight, strong fallback background를 함께 적용합니다.

한둥근돋움 / WON Dotum이 시스템에 설치되어 있으면 우선 사용됩니다.
웹 배포용 폰트 임베딩은 별도 라이선스 확인 후 진행하며, 현재 저장소에는 폰트 파일을 포함하지 않습니다.

## Local Development

```bash
npm install
npm run dev
```

로컬 개발 서버는 기본적으로 `http://localhost:5173/`에서 실행됩니다.
카메라는 HTTPS 또는 localhost 보안 컨텍스트에서만 사용할 수 있습니다.

## Build

```bash
npm run build
```

빌드 결과는 `dist/`에 생성됩니다.
프로덕션 빌드의 Vite base는 GitHub Pages 저장소 이름을 고려해 `/WonXR/`로 설정되어 있습니다.

## GitHub Pages Deployment

현재 배포는 `gh-pages` 브랜치 배포 방식입니다.
`.github/workflows/deploy.yml`이 `main` 브랜치 push 시 `npm ci`, `npm run build`를 실행하고, `dist/` 내용을 `gh-pages` 브랜치 루트로 배포합니다.

GitHub 저장소 설정:

1. `Settings` > `Pages`로 이동합니다.
2. `Build and deployment`의 `Source`를 `Deploy from a branch`로 선택합니다.
3. `Branch`는 `gh-pages`, `Folder`는 `/root`로 선택합니다.

## PWA Icons

PWA 아이콘은 `public/icons/`에 있습니다.

- `icon-192.png`, `icon-512.png`: 일반 앱 아이콘
- `apple-touch-icon.png`: iOS Home Screen 아이콘
- `maskable-192.png`, `maskable-512.png`: Android maskable 아이콘
- `monochrome-192.png`, `monochrome-512.png`: Android themed icon 지원용
- `android-adaptive-icon-background.png`, `android-adaptive-icon-foreground.png`: future Android/native reference

`public/manifest.webmanifest`와 `public/sw.js`가 기본 PWA 설치와 앱 shell 캐시를 제공합니다.

## Developer Options

공식 링크는 Main과 Debug 두 개만 사용합니다.
내부 테스트용 query parameter는 다음을 지원합니다.

- `target`: `v2` 기본값, `v1`은 기존 빈 교리도 타깃
- `profile`: `smooth`, `responsive`, `locked`
- `lock`: `1`이면 고정 시연 모드
- `elev`, `depth`: 선택 3D block 높이와 두께
- `hitpad`: 모바일 터치 판정 여백
- `cal`: 오버레이 보정 패널

## WebAR Stability Strategy

- MindAR: 현재 구현의 image tracking 엔진입니다. tracking config를 조정할 수 있으며 MIT License입니다.
- Three.js: AR 위 3D 렌더링과 raised block 표시를 담당합니다. MIT License입니다.
- AR.js: marker/image tracking 대안 실험 후보입니다. 현재 main bundle에는 추가하지 않고, 필요하면 별도 브랜치에서 비교합니다.
- WebXR: iPhone Safari WebAR의 직접 대체가 아니므로 현재 기본 경로가 아닙니다. Android/ARCore 호환 브라우저 실험은 추후 검토할 수 있습니다.

여러 AR 엔진을 main bundle에 동시에 넣지 않고, 현재 MindAR + Three.js 파이프라인을 우선 개선합니다.

## File Structure

```text
public/
  data/doctrine_sections.json
  targets/
    gyorido_empty.png
    gyorido_empty.mind
    gyorido_empty_v2.png
    gyorido_empty_v2.mind
  overlays/gyorido_text_overlay.png
  icons/
  manifest.webmanifest
  sw.js
src/
  compatibility.ts
  main.ts
  styles.css
index.html
vite.config.ts
```

## Licenses

Direct dependencies:

- Three.js: MIT License
- MindAR: MIT License
- Vite: MIT License
- TypeScript: Apache License 2.0
- @types/three: MIT License

Repository: https://github.com/CYBOX-Digital-Entertainment/WonXR
