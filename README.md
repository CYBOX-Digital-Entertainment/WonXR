# WonXR 교리도 WebAR MVP

Vite + TypeScript + Three.js + MindAR 기반 WebAR MVP입니다.
카메라가 `gyorido_empty.mind` 타깃을 인식하면 같은 비율의 투명 PNG 오버레이를 타깃 위에 표시합니다.

## 실행 방법

```bash
npm install
npm run dev
```

로컬 개발 서버는 기본적으로 `http://localhost:5173/`에서 실행됩니다.
카메라는 HTTPS 또는 localhost 보안 컨텍스트에서만 사용할 수 있습니다.
실제 모바일 카메라 테스트는 HTTPS가 적용된 GitHub Pages 배포 주소에서 진행하는 것을 권장합니다.

## 빌드

```bash
npm run build
```

빌드 결과는 `dist/`에 생성됩니다.
프로덕션 빌드의 Vite base는 GitHub Pages 저장소 이름을 고려해 `/WonXR/`로 설정되어 있습니다.
로컬 개발 서버에서는 `/` 경로로 동작합니다.

## GitHub Pages 배포

이 프로젝트는 `.github/workflows/deploy.yml` GitHub Actions workflow로 배포합니다.

1. GitHub 저장소의 `Settings` > `Pages`로 이동합니다.
2. `Build and deployment`의 `Source`를 `GitHub Actions`로 설정합니다.
3. `main` 브랜치에 push하면 workflow가 자동 실행됩니다.
4. workflow는 `npm ci`, `npm run build`를 실행한 뒤 `dist/` 폴더를 GitHub Pages에 배포합니다.
5. 현재 배포 주소는 `https://cybox-digital-entertainment.github.io/WonXR/`입니다.

수동으로 다시 배포해야 할 때는 GitHub의 `Actions` 탭에서 `Deploy GitHub Pages` workflow를 선택한 뒤 `Run workflow`를 실행합니다.
배포 단계가 일시적으로 실패하면 같은 workflow run을 재실행하거나 `Run workflow`로 수동 재배포할 수 있습니다.

## 파일 구조

```text
public/
  targets/
    gyorido_empty.png
    gyorido_empty.mind
  overlays/
    gyorido_text_overlay.png
src/
  main.ts
  styles.css
  vite-env.d.ts
index.html
vite.config.ts
```

## 구현 메모

- `gyorido_empty.png`와 `gyorido_text_overlay.png`는 `1000x1415` 동일 비율입니다.
- 오버레이 평면은 MindAR 타깃 폭 `1`, 높이 `1.415`로 표시합니다.
- 투명 PNG를 그대로 사용하며 리사이즈나 크롭은 하지 않습니다.
- `mind-ar` 패키지는 브라우저 실행에 필요 없는 `canvas` 네이티브 빌드 의존성을 포함합니다. Windows/Node 22 환경에서 설치 실패가 날 수 있어 프로젝트 `.npmrc`에서 설치 스크립트를 건너뛰도록 설정했습니다.
