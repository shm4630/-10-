# 비플페이 지도

구획 이름과 동 이름을 입력하면 그 구역의 식당 지도를 만들고, 사용자가 비플페이 가능 여부를 표시하는 서비스.

- 배포 주소: https://daegu10mi.vercel.app (Vercel 프로젝트 `daegu10mi`)
- 지도: 오픈스트리트맵 + Leaflet
- 구획 경계: Nominatim(오픈스트리트맵)
- 식당 정보: 소상공인시장진흥공단 상가(상권)정보 API (`server/collect.js`)
- 저장과 실시간 반영: Supabase
- 식당 필터링과 자연어 검색: Gemini (키가 없으면 업종 코드와 단어 일치로 동작)

## 남은 설정

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행한다.
2. Vercel 프로젝트의 Production 환경변수에 아래 값을 넣는다.
   - `VITE_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (비밀 키)
   - `GEMINI_API_KEY` (비밀 키)
3. 다시 배포한다. `VITE_` 값은 빌드할 때 들어가므로 재배포가 필요하다.

관리자 비밀번호는 이 폴더의 `.env.local`에 있는 `ADMIN_PASSWORD`이다.

## 로컬 실행

```bash
npm install
npm run dev
```
