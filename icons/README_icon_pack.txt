# WonXR PWA Icon Pack

이 패키지는 1024x1024 WonXR 아이콘을 기반으로 만든 PWA / iOS Home Screen / Android WebAPK 대응 아이콘 세트입니다.

## iOS / Safari
- `apple-touch-icon.png`는 iPhone 홈 화면 추가용입니다.
- iOS 26의 색상/틴트/투명 아이콘 효과는 OS 사용자 설정 영역입니다. 웹앱은 고품질 `apple-touch-icon`과 manifest icon을 제공하는 방식으로 대응합니다.

## Android / PWA
- `maskable-*`는 Android 적응형 마스크 대응용입니다.
- `monochrome-*`는 Android themed/dynamic icon 지원 환경에서 단색 아이콘으로 쓰이도록 준비한 파일입니다.
- 실제 반영 여부는 Android 런처, Chrome/WebAPK, 브라우저 버전에 따라 달라질 수 있습니다.

## 배치
- `favicon.ico` → `public/favicon.ico`
- 나머지 PNG/SVG 아이콘 → `public/icons/`
- `manifest.webmanifest.example` 내용을 `public/manifest.webmanifest`에 반영
- `index_head_icon_snippet.html` 내용을 `index.html` head에 반영
