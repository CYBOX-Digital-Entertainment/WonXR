# WonXR gyorido_empty v2 margin-safe

이 버전은 이전 recommended 버전에서 교리도 본문/칸을 침범하던 문제를 수정한 것입니다.

## 핵심 변경

- 패턴을 교리도 본문, 중앙 칸, 세로문, 하단 제목에 겹치지 않도록 네 외곽 여백에만 배치했습니다.
- 실제 프린트용 파일과 패턴 오버레이 PNG를 따로 제공합니다.
- 패턴은 네 모서리마다 서로 다른 비대칭 형태로 만들어 MindAR 이미지 추적 특징점을 늘리는 목적입니다.

## 포함 파일

- gyorido_empty_v2_margin_safe.png
  - 실제 프린트 및 MindAR 컴파일에 사용할 추천 파일입니다.

- gyorido_empty_v2_margin_safe_pattern_overlay.png
  - 패턴만 있는 투명 PNG입니다. 다른 작업에도 재사용할 수 있습니다.

- gyorido_empty_v2_pattern_overlay_preview.png
  - 투명 오버레이를 회색 배경 위에 얹은 확인용 이미지입니다.

- gyorido_empty_v2_margin_safe_overlap_guide.png
  - 빨간 박스로 교리도 침범 금지 영역을 표시한 검수용 가이드 이미지입니다.
  - 이 파일은 프린트/MindAR 컴파일용이 아닙니다.

## 사용 방법

1. `gyorido_empty_v2_margin_safe.png`를 A4로 인쇄합니다.
2. 같은 `gyorido_empty_v2_margin_safe.png`를 MindAR Image Targets Compiler에 넣어 `.mind`를 생성합니다.
3. 생성된 파일 이름을 `gyorido_empty_v2.mind`로 바꿉니다.
4. 프로젝트에 다음처럼 배치합니다.

```text
public/targets/gyorido_empty_v2.png
public/targets/gyorido_empty_v2.mind
```

`gyorido_empty_v2.png`에는 이 ZIP의 `gyorido_empty_v2_margin_safe.png`를 복사해서 넣으면 됩니다.

## 주의

실제로 프린트하는 이미지와 MindAR 컴파일에 넣는 이미지는 반드시 같아야 합니다.
패턴 오버레이만 따로 컴파일하면 안 됩니다.
