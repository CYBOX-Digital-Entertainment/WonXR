# WonXR 교리도 WebAR MVP

Vite + TypeScript + Three.js + MindAR 기반 WebAR 프로토타입입니다.
기본 타깃은 v2 패턴이 들어간 `gyorido_empty_v2.mind`이며, 타깃을 인식하면 교리도 텍스트 오버레이를 표시합니다.
구역을 터치하면 선택 영역이 낮은 3D 패널처럼 떠오르고, 화면 하단에 설명 카드가 표시됩니다.

## 공식 테스트 URL

메인 데모:

```text
https://cybox-digital-entertainment.github.io/WonXR/
```

디버그 모드:

```text
https://cybox-digital-entertainment.github.io/WonXR/?mode=debug
```

메인 데모에서는 디버그 숫자와 hotspot 테두리를 숨깁니다.
`?mode=debug`는 hotspot 표시, 추적 진단, 파일 로드 상태, 기기/브라우저 정보를 함께 표시합니다.

## 모바일 테스트 시나리오

1. v2 패턴이 들어간 출력물을 책상이나 클립보드 위에 평평하게 둡니다.
2. 처음에는 위쪽/정면에서 교리도 전체가 화면에 들어오게 비춥니다.
3. 인식 후 `구역을 터치해 설명을 확인하세요`가 보이면 원하는 구역을 터치합니다.
4. 선택 구역의 3D 하이라이트와 하단 설명 카드가 나타나는지 확인합니다.
5. 3D 느낌은 20-35도 정도의 완만한 각도에서 확인하고, 너무 낮은 측면 각도는 피합니다.
6. 화면에 `조금 더 위에서 비춰주세요`가 나오면 카메라를 조금 더 위에서 비춥니다.

카메라 테스트는 HTTPS가 적용된 GitHub Pages 주소에서 진행해야 합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

로컬 개발 서버는 기본적으로 `http://localhost:5173/`에서 실행됩니다.
카메라는 HTTPS 또는 localhost 보안 컨텍스트에서만 사용할 수 있습니다.

## 빌드

```bash
npm run build
```

빌드 결과는 `dist/`에 생성됩니다.
프로덕션 빌드의 Vite base는 GitHub Pages 저장소 이름을 고려해 `/WonXR/`로 설정되어 있습니다.

## GitHub Pages 배포

현재 배포는 `gh-pages` 브랜치 배포 방식입니다.
`.github/workflows/deploy.yml`이 `main` 브랜치 push 시 `npm ci`, `npm run build`를 실행하고, `dist/` 내용을 `gh-pages` 브랜치 루트로 배포합니다.

GitHub 저장소 설정:

1. `Settings` > `Pages`로 이동합니다.
2. `Build and deployment`의 `Source`를 `Deploy from a branch`로 선택합니다.
3. `Branch`는 `gh-pages`, `Folder`는 `/root`로 선택합니다.

기존 GitHub Actions Source 방식은 `deploy-pages` 단계에서 반복 실패했기 때문에 사용하지 않습니다.

## 개발자 옵션

공식 테스트 링크는 위의 두 개만 사용합니다.
아래 query parameter는 내부 조정과 문제 분석용으로만 유지합니다.

- `target`: `v2` 기본값, `v1`은 기존 빈 교리도 타깃 테스트용
- `profile`: `smooth`, `responsive`, `locked`
- `lock`: `1`이면 고정 시연 모드 활성화
- `debug`, `hotspots`, `cal`: 개별 디버그/보정 모드
- `ox`, `oy`, `sx`, `sy`, `rz`: 오버레이 위치, 크기, 회전 보정
- `ps`, `rs`, `ss`, `hold`: pose smoothing과 lost hold 조정
- `hitpad`: 모바일 터치 판정 여백 조정
- `elev`: 선택 하이라이트 상승 높이 조정

## 파일 구조

```text
public/
  data/
    doctrine_sections.json
  targets/
    gyorido_empty.png
    gyorido_empty.mind
    gyorido_empty_v2.png
    gyorido_empty_v2.mind
  overlays/
    gyorido_text_overlay.png
src/
  main.ts
  styles.css
index.html
vite.config.ts
```

`doctrine_sections.json`의 `hotspot.nx`, `ny`, `nw`, `nh` 값은 1000 x 1415 원본 이미지 기준 normalized 좌표입니다.
기본 타깃은 v2이며, v2 파일을 불러오지 못하면 앱은 v1 타깃으로 fallback합니다. fallback 여부는 디버그 모드에서 확인할 수 있습니다.
