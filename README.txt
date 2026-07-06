현재 작업 경로는 C:\Users\minsi\VSC_Projects\WonXR 이다.
이 폴더 자체를 프로젝트 루트로 사용한다.
새 하위 폴더 won-ar, WonXR 등을 추가로 만들지 말라.

목표:
Vite + TypeScript 기반 WebAR MVP를 만든다.
카메라가 gyorido_empty.png를 인식하면, 같은 위치와 비율에 gyorido_text_overlay.png를 AR 오버레이로 표시하여 빈 교리도가 gyorido_original.png처럼 보이게 한다.

기술:
- Vite
- TypeScript
- Three.js
- MindAR image tracking

초기 작업:
1. 현재 폴더에 package.json이 없으면 `npm create vite@latest . -- --template vanilla-ts`로 Vite 프로젝트를 현재 폴더에 생성한다.
2. 이미 package.json이 있으면 기존 프로젝트를 유지하고 필요한 파일만 수정한다.
3. 필요한 패키지를 설치한다.
   - three
   - mind-ar

파일 배치:
현재 루트에 있는 다음 파일을 사용한다.
- gyorido_empty.png
- gyorido_empty.mind
- gyorido_text_overlay.png

최종 배치:
public/targets/gyorido_empty.png
public/targets/gyorido_empty.mind
public/overlays/gyorido_text_overlay.png

동작:
1. 시작 화면에 “교리도 그림을 비춰주세요” 표시
2. 카메라 권한 요청
3. public/targets/gyorido_empty.mind 타깃 인식
4. 타깃 위에 public/overlays/gyorido_text_overlay.png를 평면 Plane으로 표시
5. 타깃을 놓치면 오버레이 숨김
6. 화면 하단에 “인식됨 / 다시 교리도를 비춰주세요” 상태 표시
7. 카메라 권한 실패, HTTPS가 아닌 환경, 타깃 미인식 상태 안내를 넣는다.

중요:
- gyorido_empty.png와 gyorido_text_overlay.png는 같은 해상도와 비율을 가진다.
- overlay는 원본 비율 1000:1415에 맞춰 표시한다.
- 배경은 투명 PNG 그대로 사용한다.
- 이미지를 새로 리사이즈하거나 크롭하지 않는다.
- 첫 단계에서는 3D 모델을 만들지 말고 투명 PNG 오버레이 AR만 구현한다.
- 모바일 세로 화면 기준으로 UI를 작성한다.
- GitHub Pages 배포가 가능하도록 Vite base 설정을 넣는다.
- GitHub 저장소 이름은 WonXR로 배포될 가능성을 고려해 production base는 /WonXR/ 로 설정한다.
- 단, 로컬 개발 npm run dev에서는 / 경로로 정상 작동해야 한다.
- npm run build가 성공해야 한다.
- 작업 완료 후 README.md에 실행 방법, GitHub Pages 배포 방법, 파일 구조를 정리한다.

====

gyorido AR assets

- gyorido_empty.png: printed image target candidate
- gyorido_text_overlay.png: transparent text-only overlay extracted from gyorido_original.png
- gyorido_preview_empty_plus_overlay.png: preview of empty diagram + overlay

Recommended MVP:
1. Compile gyorido_empty.png as the image target in MindAR.
2. When target is recognized, render gyorido_text_overlay.png on a plane aligned to the target.
3. Later, add clickable/touch hotspots for each doctrine section.
