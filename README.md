# WonXR 교리도 WebAR Prototype

WonXR은 원불교 교리도 이미지를 인식하여 교리 구조를 증강현실로 보여주는 공모전용 WebAR 프로토타입입니다.
한글이건 한자이건 상관없이 교리도가 카메라 화면 안에 보이는 동안 구역을 터치하면 선택 영역이 3D 블록처럼 떠오르고 하단 설명 카드가 표시됩니다.

## Official Links

Main demo:

```text
https://cybox-digital-entertainment.github.io/WonXR/?mode=main
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
4. 중앙의 empty 교리도 기준 흑백 pulsing guide에 교리도 전체를 맞춥니다.
5. 인식 후에도 인쇄된 교리도가 카메라 화면 안에 계속 보이도록 유지합니다.
6. 원하는 구역을 터치합니다.
7. 선택 구역의 raised 3D block과 하단 설명 카드가 나타나는지 확인합니다.
8. 인식이 끊기면 `다시 스캔`을 누르고 교리도를 다시 화면 안에 맞춥니다.
9. 3D 느낌은 20-35도 정도의 완만한 각도에서 확인하고, 너무 낮은 측면 각도는 피합니다.

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
iOS 아이콘 색상/틴트 효과는 iOS 설정에 의해 달라질 수 있습니다.
