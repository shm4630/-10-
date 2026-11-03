# 비플페이 지도

구획 이름과 동 이름을 입력하면 그 구역의 식당 지도를 만들고, 사용자가 비플페이 가능 여부를 표시하는 서비스.

- 배포 주소: https://daegu10mi.vercel.app (Vercel 프로젝트 `daegu10mi`)
- 지도: 오픈스트리트맵 + Leaflet
- 구획 경계: Nominatim(오픈스트리트맵)
- 식당 정보: 소상공인시장진흥공단 상가(상권)정보 API (`server/collect.js`)
- 저장과 실시간 반영: Supabase
- 식당 필터링과 자연어 검색: Gemini (키가 없으면 업종 코드와 단어 일치로 동작)

사이트에 들어가면 가장 최근 구획의 지도가 바로 뜬다. 로그인과 비밀번호는 없으며, 누구나 새 구획을 만들 수 있다.

## 설정

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행한다.
2. `ZONE_WRITE_TOKEN`으로 쓸 임의의 문자열을 정하고, 그 해시를 `private.settings`에 넣는다(`schema.sql`의 안내 참고).
3. Vercel 프로젝트의 Production 환경변수에 `.env.example`의 값을 넣는다. `GEMINI_API_KEY`는 선택이다.
4. 다시 배포한다. 환경변수는 배포할 때 적용된다.

## 로컬 실행

```bash
npm install
npm run dev
```
