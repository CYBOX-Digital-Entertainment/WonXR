# WonXR Hotspot Plan v0.2 precise

v0.1에서 일부 박스가 원래 구역보다 밖으로 튀어나온 부분을 줄이고, 실제 교리도 칸 안쪽 기준으로 다시 맞춘 버전입니다.

## 기준

- 기준 이미지: 1000 x 1415 px
- 좌표 원점: top-left
- 제공 좌표: pixel 좌표 + normalized 좌표
- 시각 하이라이트: v0.2 precise 좌표 사용 권장
- 터치 판정: 모바일 편의상 코드에서 hitAreaPadding을 별도 적용 권장

## 포함 파일

- gyorido_hotspot_plan_v0_2_precise_numbered.png
  - 번호 중심의 정확도 확인용 설계 이미지입니다.

- gyorido_hotspot_plan_v0_2_precise_labeled.png
  - 번호와 제목이 함께 들어간 참고 이미지입니다.

- hotspot_legend_v0_2.png
  - 번호별 구역명 범례입니다.

- gyorido_hotspot_overlay_v0_2_precise_transparent.png
  - hotspot 박스만 있는 투명 PNG입니다.

- doctrine_sections.json
  - 앱에 바로 넣기 좋은 기본 파일명입니다.

- doctrine_sections_v0_2_precise.json
  - v0.2 precise 명시 버전입니다.

- hotspot_coordinates_v0_2_precise.csv
  - 좌표 확인용 CSV입니다.

- doctrine_content_template_v0_2.md
  - 교무님 검수용 원고 템플릿입니다.

- codex_next_prompt_hotspot_interaction_v0_2.txt
  - Codex에게 다음 구현을 시킬 때 사용할 프롬프트입니다.

## 메모

지금 단계에서는 Max/Blender 3D 모델이 필요하지 않습니다.
Three.js에서 Plane/Box/Line으로 선택 구역 하이라이트와 설명 카드를 먼저 구현하세요.
