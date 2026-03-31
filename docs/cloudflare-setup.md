# Cloudflare Pages 설정 가이드

알카노이드 프로젝트를 Cloudflare Pages에 배포하기 위한 빌드 설정입니다. Cloudflare 대시보드에서 다음 정보를 입력해주세요.

1.  **Project name**: `arkanoidgame` (또는 원하시는 프로젝트 이름)
2.  **Production branch**: `main`
3.  **Build settings**:
    *   **Framework preset**: `Vite` (또는 `React`를 선택하고 수동 설정)
    *   **Build command**: `npm run build`
    *   **Build output directory**: `dist`

위 설정을 입력하신 후 "Save and Deploy" 버튼을 클릭하시면 됩니다.
