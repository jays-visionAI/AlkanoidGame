# 알카노이드 (Arkanoid Game)

React + TypeScript + Vite로 만든 클래식 알카노이드 게임

## 🕹️ 플레이 방법

- **화살표 키** 또는 **A/D**: 패들 이동
- **스페이스바**: 게임 시작/일시정지

## 🚀 배포

### GitHub Pages
1. Settings > Pages로 이동
2. Source를 "GitHub Actions"로 선택
3. main 브랜치에 푸시하면 자동 배포

### Cloudflare Pages
1. Cloudflare Dashboard > Pages로 이동
2. "Connect to Git" 선택
3. repository 연결 후 자동 배포

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
public/          # 정적 파일 (Cloudflare 설정)
.github/        # GitHub Actions 설정
```