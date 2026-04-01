# 알카노이드 (Arkanoid Game)

React + TypeScript + Vite로 만든 클래식 알카노이드 게임

## 🎮 플레이

**실시간 게임:** https://jays-visionai.github.io/AlkanoidGame/

### 조작법
- **화살표 키** 또는 **A/D**: 패들 이동
- **스페이스바**: 게임 시작/일시정지
- **모바일**: 화면 좌우 터치로 패들 이동

## 🚀 자동 배포

main 브랜치에 푸시하면 GitHub Actions가 자동으로 빌드하고 배포합니다.

## 🛠️ 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
```

## 📁 구조

```
src/App.tsx      # 메인 게임 컴포넌트
src/index.css    # 스타일
public/          # 정적 파일
.github/         # GitHub Actions 설정
```
