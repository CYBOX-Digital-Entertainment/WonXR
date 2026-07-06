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

## 오버레이 위치 보정

오버레이 위치와 크기는 URL query parameter로 임시 보정할 수 있습니다.
값을 생략하면 코드의 기본 보정값을 사용합니다.

기본 테스트 주소:

```text
https://cybox-digital-entertainment.github.io/WonXR/
```

모바일 보정 모드:

```text
https://cybox-digital-entertainment.github.io/WonXR/?cal=1
```

보정 모드에서는 화면 하단의 작은 패널로 `ox`, `oy`, `sx`, `sy`, `rz` 값을 즉시 조정할 수 있습니다.
조정값은 브라우저 `localStorage`에 저장되며, `Copy URL` 버튼으로 현재 보정값이 포함된 URL을 복사할 수 있습니다.

수동 보정 예시:

```text
https://cybox-digital-entertainment.github.io/WonXR/?ox=0.01&oy=-0.02&sx=1.02&sy=0.98&rz=0.01
```

- `ox`: 오버레이 X 위치 보정
- `oy`: 오버레이 Y 위치 보정
- `sx`: 오버레이 X 배율
- `sy`: 오버레이 Y 배율
- `rz`: 오버레이 Z축 회전 보정, 라디안 단위

스무딩 조정 예시:

```text
https://cybox-digital-entertainment.github.io/WonXR/?ps=0.10&rs=0.10&ss=0.10&hold=800
```

- `ps`: 위치 보간 계수
- `rs`: 회전 보간 계수
- `ss`: 스케일 보간 계수
- `pdb`: 위치 deadband
- `rdb`: 회전 deadband
- `sdb`: 스케일 deadband
- `mpd`: 한 프레임 최대 위치 변화 허용값
- `msd`: 한 프레임 최대 스케일 변화 허용값
- `mrd`: 한 프레임 최대 회전 변화 허용값, 라디안 단위
- `hold`: 타깃을 잠깐 놓쳤을 때 오버레이를 유지하는 시간, 밀리초 단위
- `mincf`: MindAR filterMinCF
- `beta`: MindAR filterBeta
- `warmup`: MindAR warmupTolerance
- `miss`: MindAR missTolerance
- `lock`: `1`이면 고정 시연 모드를 활성화
- `profile`: `smooth`, `responsive`, `locked`

추적 안정화 테스트 URL:

```text
https://cybox-digital-entertainment.github.io/WonXR/?profile=smooth
https://cybox-digital-entertainment.github.io/WonXR/?profile=locked&lock=1
```

hotspot 디버그:

```text
https://cybox-digital-entertainment.github.io/WonXR/?hotspots=1
```

전체 디버그:

```text
https://cybox-digital-entertainment.github.io/WonXR/?debug=1&hotspots=1
```

수동 보정 + 디버그:

```text
https://cybox-digital-entertainment.github.io/WonXR/?cal=1&debug=1
```

디버그 모드:

```text
https://cybox-digital-entertainment.github.io/WonXR/?debug=1
```

디버그 모드는 화면에 target found/lost, raw center, smoothed center, raw/smoothed scale, raw/smoothed rotation, rejected frame count를 표시합니다.
파란 선은 raw target plane, 붉은 선은 smoothed overlay plane입니다.
검출 pose가 튀는지, 오버레이 적용이 틀어지는지 구분할 때 사용합니다.

outlier 판정값도 URL로 조정할 수 있습니다.

```text
https://cybox-digital-entertainment.github.io/WonXR/?debug=1&mpd=0.08&msd=0.10&mrd=0.25
```

## GitHub Pages 배포

이 프로젝트는 `.github/workflows/deploy.yml` workflow로 `dist/` 빌드 결과를 `gh-pages` 브랜치 루트에 배포합니다.
기존 GitHub Actions Source 방식은 `actions/deploy-pages` 단계가 반복 실패했기 때문에 사용하지 않습니다.

1. GitHub 저장소의 `Settings` > `Pages`로 이동합니다.
2. `Build and deployment`의 `Source`를 `Deploy from a branch`로 설정합니다.
3. `Branch`는 `gh-pages`, `Folder`는 `/root`로 선택합니다.
4. `main` 브랜치에 push하면 workflow가 `npm ci`, `npm run build`를 실행합니다.
5. workflow는 `dist/` 폴더 내용을 `gh-pages` 브랜치 루트로 push합니다.
6. 배포 주소는 `https://cybox-digital-entertainment.github.io/WonXR/`입니다.

수동으로 다시 배포해야 할 때는 GitHub의 `Actions` 탭에서 `Deploy Vite app to gh-pages branch` workflow를 선택한 뒤 `Run workflow`를 실행합니다.

## 파일 구조

```text
public/
  data/
    doctrine_sections.json
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
- 현재 기본 타깃 파일은 `public/targets/gyorido_empty.mind`입니다. 코드에서는 `TARGET_MIND_PATH` 상수로 분리되어 있어 이후 `gyorido_empty_v2.mind`로 쉽게 바꿀 수 있습니다.
- `?target=v2`를 붙이면 `public/targets/gyorido_empty_v2.mind`를 먼저 시도하고, 파일이 없으면 기본 `gyorido_empty.mind`로 fallback합니다.
- 현재 `gyorido_empty.png`는 빈 공간이 많아 추적 jitter가 있을 수 있습니다. 필요하면 비대칭 마커가 추가된 `gyorido_empty_v2.png`를 새로 프린트하고 MindAR 컴파일러로 `gyorido_empty_v2.mind`를 생성해 교체합니다.
- v0.2 precise hotspot 데이터는 `public/data/doctrine_sections.json`에 있습니다. `?hotspots=1`에서만 AR 위에 hotspot debug 사각형과 라벨을 표시합니다.
- `mind-ar` 패키지는 브라우저 실행에 필요 없는 `canvas` 네이티브 빌드 의존성을 포함합니다. Windows/Node 22 환경에서 설치 실패가 날 수 있어 프로젝트 `.npmrc`에서 설치 스크립트를 건너뛰도록 설정했습니다.
