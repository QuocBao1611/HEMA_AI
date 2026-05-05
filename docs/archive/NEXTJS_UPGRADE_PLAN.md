# Ke Hoach Nang Cap He Thong Sang Next.js

## Muc tieu

Nang cap he thong hien tai thanh mot web app hoan chinh voi:

- Frontend moi su dung `Next.js` + `TypeScript`
- Backend AI giu tren `FastAPI`
- Database tiep tuc su dung `MySQL`
- Kien truc tach biet frontend/backend de de van hanh, test va mo rong

## Nguyen tac thuc hien

- Khong rewrite toan bo trong 1 lan
- Giu `backend/` on dinh va hoat dong trong suot qua trinh migrate
- Di tru tung module tu frontend cu sang `frontend-next/`
- Sau khi hoan thanh moi buoc:
  - cap nhat file nay
  - doc lai file nay truoc khi lam buoc tiep theo
  - chi di tiep neu buoc vua xong van dung voi muc tieu tong the

## Kien truc muc tieu

```text
testModel/
├── backend/
├── frontend-next/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (workspace)/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── compare/page.tsx
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── guide/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── admin/
│   │   │   ├── login/
│   │   │   ├── globals.css
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   ├── analysis/
│   │   │   ├── compare/
│   │   │   └── dashboard/
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   ├── api/
│   │   │   ├── constants/
│   │   │   ├── utils/
│   │   │   └── validators/
│   │   ├── providers/
│   │   ├── stores/
│   │   ├── types/
│   │   └── schemas/
│   ├── .env.local
│   ├── package.json
│   └── tsconfig.json
└── NEXTJS_UPGRADE_PLAN.md
```

## Thu vien de xuat

- `next`
- `react`
- `typescript`
- `tailwindcss`
- `shadcn/ui`
- `@tanstack/react-query`
- `zod`
- `react-hook-form`
- `react-dropzone`
- `zustand`
- `recharts`
- `sonner`
- `lucide-react`

## Bien moi truong du kien

File: `frontend-next/.env.local`

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Pham vi v1

Ban v1 can co:

- Trang phan tich anh smear
- Trang so sanh nhieu model
- Trang dashboard va lich su phan tich
- Trang guide / huong dan
- Shared layout, menu, toast, loading, error states
- API client typed ket noi FastAPI
- Cac type va schema ro rang cho du lieu phan tich

Chua lam ngay trong dot dau:

- Auth day du
- Admin hoan chinh
- Phan quyen chi tiet
- Bao cao PDF nang cao
- Monitoring / deploy production hoan chinh

## Lo trinh thuc hien

### Buoc 1 - Khoi tao nen tang Next.js

Muc tieu:

- Tao `frontend-next/`
- Cai dat `Next.js + TypeScript`
- Them cac thu vien cot loi
- Cau hinh env co ban
- Dung bo khung thu muc theo kien truc muc tieu

Trang thai: `completed`

Ket qua:

- Da tao `frontend-next/` bang `Next.js + TypeScript + App Router + Tailwind`
- Da cai dat cac thu vien nen:
  - `@tanstack/react-query`
  - `zod`
  - `react-hook-form`
  - `react-dropzone`
  - `zustand`
  - `recharts`
  - `sonner`
  - `lucide-react`
  - `clsx`
  - `class-variance-authority`
  - `tailwind-merge`
- Da tao `frontend-next/.env.local` va `.env.example`
- Da dung bo khung thu muc cho app moi theo huong da chot
- Da don dep cac file sinh tu dong khong can thiet trong app moi:
  - xoa nested `.git`
  - xoa `.next`
  - xoa `AGENTS.md`
  - xoa `CLAUDE.md`
- Da kiem tra `lint` va `typecheck` deu pass

Van de / Luu y:

- Tren may hien tai, PowerShell bi chan `npm.ps1`, vi vay can dung `npm.cmd` khi chay lenh npm trong shell nay
- Frontend cu van duoc giu nguyen trong `frontend/`, nhung tu gio phan phat trien moi se dua tren `frontend-next/`

### Buoc 2 - Dung khung he thong frontend

Muc tieu:

- Tao App Router pages co ban
- Tao layout chung
- Tao UI foundation
- Tao providers cho query/toast
- Tao API client va kieu du lieu co ban

Trang thai: `completed`

Ket qua:

- Da thay bo template mac dinh cua Next.js bang app shell moi
- Da tao route group `(workspace)` cho:
  - `/`
  - `/compare`
  - `/dashboard`
  - `/guide`
- Da tao placeholder routes cho:
  - `/login`
  - `/admin`
- Da dung root layout moi voi font, metadata va global styling moi
- Da tao sidebar, header va card/button foundation cho app moi
- Da them providers:
  - `QueryProvider`
  - `AppProviders`
  - `Toaster`
- Da tao API foundation:
  - `src/lib/api/client.ts`
  - `src/types/api.ts`
  - `src/schemas/api.ts`
- Da xoa `src/app/page.tsx` template cu de tranh logic mac dinh cua Next.js anh huong bo khung moi
- Da kiem tra:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  deu pass

Van de / Luu y:

- Route hien tai moi dung app shell va placeholder content, chua gan API that cho module phan tich
- Frontend moi da tach khoi frontend cu o muc cau truc, nhung chua bat dau migrate nghiep vu upload/analyze

### Buoc 3 - Migrate module Phan tich

Muc tieu:

- Upload anh
- Goi `/info`, `/predict`, `/analyze`
- Hien thi ket qua, metric, clinical flags
- Xu ly loading, error, retry

Trang thai: `completed`

Ket qua:

- Da thay trang `/` placeholder bang flow phan tich that trong `frontend-next`
- Da noi `GET /info` de tai:
  - model mac dinh
  - danh sach model
  - trang thai database
- Da noi:
  - `POST /predict`
  - `POST /analyze`
- Da tao luong upload anh moi bang `react-dropzone`
- Da them validate file upload rieng
- Da tao typed API layer cho module phan tich
- Da tao:
  - metric cards
  - predict result list
  - analyze result table theo tab
  - clinical flags
- Da dua clinical flag logic sang frontend moi thay vi DOM script cu
- Da giu module moi tach khoi frontend cu, khong copy nguyen khoi `home-page.js`
- Da kiem tra:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  deu pass

Van de / Luu y:

- Ket qua route `/` hien da co logic that, nhung chua co PDF export va chua dong bo lich su voi dashboard moi trong UI layer
- Phan compare, dashboard va guide van dang o muc scaffold / placeholder route

### Buoc 4 - Migrate module So sanh model

Muc tieu:

- Goi `/compare-models`
- Chon model
- Preview anh
- Hien thi comparison rows va highlights

Trang thai: `completed`

Ket qua:

- Da thay route `/compare` placeholder bang flow so sanh model that
- Da noi `POST /compare-models`
- Da dung upload preview rieng cho compare
- Da tao co che chon nhieu model trong workspace moi
- Da khoi tao danh sach model mac dinh dua tren `/info`
- Da hien thi:
  - status compare
  - summary highlights
  - shared detection summary
  - bang comparison rows
- Da them typed API va schema cho compare response
- Da giu compare module tach khoi `compare-page.js` cu, khong copy DOM logic cu sang frontend moi
- Da kiem tra:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  deu pass

Van de / Luu y:

- Compare da hoat dong tren UI moi, nhung dashboard moi chua hien du lieu dong bo sau khi compare trong giao dien
- Guide va dashboard van can duoc migrate tiep de hoan chinh v1

### Buoc 5 - Migrate Dashboard va History

Muc tieu:

- Goi `/health`, `/history`
- Hien thi summary cards
- Hien thi danh sach ca phan tich gan day
- Refresh state sau khi co lan phan tich moi

Trang thai: `completed`

Ket qua:

- Da thay route `/dashboard` placeholder bang dashboard va history that
- Da noi:
  - `GET /health`
  - `GET /history`
- Da tao dashboard snapshot query de lay du lieu van hanh tu backend
- Da hien thi:
  - summary cards
  - status banner
  - health snapshot
  - history feed
  - confidence trend chart
- Da them co che refresh tay va auto-refresh khi workspace phat sinh su kien moi
- Da giu dashboard module tach khoi `dashboard-page.js` cu, khong copy imperative DOM logic sang app moi
- Da kiem tra:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  deu pass

Van de / Luu y:

- Dashboard da dong bo du lieu van hanh that, nhung guide route van chua migrate noi dung that
- PDF export va auth/admin chua nam trong phase hien tai

### Buoc 6 - Hoan thien Guide va shared experience

Muc tieu:

- Chuyen guide sang Next.js
- Hoan thien menu, responsiveness, empty states
- Dong bo style va trai nghiem nguoi dung

Trang thai: `completed`

Ket qua:

- Da thay route `/guide` placeholder bang noi dung guide that duoc migrate tu frontend cu
- Da giu lai cac noi dung huong dan cot loi:
  - chuan bi anh
  - chay phan tich
  - so sanh model
  - cach hieu ket qua
  - FAQ
- Da them FAQ accordion trong app moi
- Da them CTA lien ket guide voi route phan tich va compare that
- Da cai thien shared experience tren mobile:
  - them quick navigation row trong header
  - giam phu thuoc vao nut menu trang tri
- Da giu guide module tach khoi `guide.html` va `guide-page.js` cu, khong dua DOM imperative sang app moi
- Da kiem tra:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  deu pass

Van de / Luu y:

- Cac route chinh cua v1 da co noi dung that, nhung PDF export, auth va admin van chua nam trong phase hien tai
- Buoc tiep theo nen la mot vong kiem thu / polish tong the truoc khi mo rong them phase 2

### Buoc 7 - Kiem thu va chuan bi mo rong

Muc tieu:

- Test smoke cac route chinh
- Kiem tra ket noi backend
- Chuan hoa typing
- Lap danh sach viec cho phase 2: auth, admin, reports

Trang thai: `completed`

Ket qua:

- Da xac nhan smoke test backend tren `http://127.0.0.1:8000`:
  - `GET /health` tra `200`
  - `GET /info` tra `200`
  - database bao `ready: true`
- Da xac nhan smoke test production frontend tren `http://127.0.0.1:3000`:
  - `GET /` tra `200`
  - `GET /compare` tra `200`
  - `GET /dashboard` tra `200`
  - `GET /guide` tra `200`
- Da chay lai:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `pytest -q`
  deu pass
- Da tao backlog mo rong phase 2 trong `NEXTJS_PHASE2_BACKLOG.md`
- Da xac nhan v1 moi da co day du cac route chinh tren Next.js va van ket noi dung voi FastAPI backend hien tai

Van de / Luu y:

- Trong moi truong hien tai, backend dang duoc mot process Python san co giu o cong `8000`; can giu cach khoi dong nhat quan khi chuyen sang workflow chinh thuc
- App moi da san sang cho vong hoan thien tiep theo, nhung auth, admin that, PDF export va deploy production van thuoc phase 2

### Buoc 8 - Don dep frontend cu

Muc tieu:

- Cat backend khoi `frontend/` legacy
- Chuyen backend sang vai tro API-only ro rang hon
- Go bo file HTML/CSS/JS cu khong con la nguon chay chinh
- Cap nhat tai lieu de entrypoint moi la `frontend-next/`

Trang thai: `completed`

Ket qua:

- Da cat backend khoi frontend legacy:
  - bo `pages_router`
  - bo mount static `/assets`
  - bo cac `FRONTEND_*` path trong backend
- Da them root endpoint API-only `GET /` de backend khong con phuc vu HTML cu
- Da cap nhat CORS cho luong dev voi Next.js:
  - `http://127.0.0.1:3000`
  - `http://localhost:3000`
- Da cap nhat `.env` va `.env.example` theo CORS moi
- Da cap nhat README de entrypoint moi la `frontend-next/`
- Da xoa thu muc `frontend/` legacy khoi repo
- Da restart backend local tren cong `8000` de dong bo voi code moi
- Da kiem tra lai:
  - `GET /` tra payload API mode
  - `GET /health` tra `200`
  - `pytest -q` pass `11` tests
  - `frontend-next` `lint`, `typecheck`, `build` deu pass

Van de / Luu y:

- Tu thoi diem nay, backend duoc xem la API-only; route giao dien chinh nam o `frontend-next`
- Neu can mot entrypoint thong nhat qua XAMPP/Apache, nen lam o phase tiep theo bang reverse proxy hoac deploy flow ro rang hon

### Buoc 9 - Hoan thien Auth va session

Muc tieu:

- Khoa route theo session that
- Chuan hoa JWT flow va thong tin nguoi dung
- Hien thi trang thai dang nhap / dang xuat trong app shell
- Bo sung test backend cho auth

Trang thai: `completed`

Ket qua:

- Da hoan thien login JWT voi:
  - `POST /auth/login`
  - `GET /auth/me`
- Da bo sung `AuthProvider` de:
  - cho hydrate xong moi gate route
  - verify lai session bang `getMe()`
  - redirect dung giua `/login` va workspace
- Da luu session bang Zustand persist va hien thi user trong app shell
- Da don lai login page cho flow auth that
- Da bo sung test backend cho:
  - login
  - current user
  - admin role gate

Van de / Luu y:

- Session hien tai duoc xac thuc bang JWT local; chua co refresh token flow
- Role hien tai tap trung vao `admin` va `user`, chua mo rong phan quyen chi tiet hon

### Buoc 10 - Hoan thien Admin va cau hinh

Muc tieu:

- Bien `/admin` thanh khu van hanh that
- Quan ly model mac dinh
- Quan ly labels theo model
- Quan ly nguong clinical flags

Trang thai: `completed`

Ket qua:

- Da mo rong backend admin:
  - `GET /admin/overview`
  - `GET /admin/models`
  - `POST /admin/models/default`
  - `GET /admin/labels`
  - `PUT /admin/labels`
  - `GET /admin/clinical-flags`
  - `PUT /admin/clinical-flags`
- Da lam `/admin` thanh giao dien van hanh that tren Next.js
- Da cho phep:
  - doi model mac dinh
  - sua labels theo model
  - bat/tat va sua nguong clinical flags
- Da luu default model vao database thay vi chi doi runtime tam thoi
- Da giu giao dien admin theo visual do-den Hema AI, khong tach khoi language hien tai

Van de / Luu y:

- Mapping nhom chan doan hien van duoc giu o contract backend thay vi mot editor rieng
- Admin console hien tap trung vao model, labels va flags; chua mo rong sang user management

### Buoc 11 - Reporting va history chi tiet

Muc tieu:

- Co history detail de xem lai ket qua
- Co deep-link tu dashboard sang chi tiet ban ghi
- Co PDF export cho ket qua phan tich va lich su

Trang thai: `completed`

Ket qua:

- Da them `GET /history/{id}` de tai chi tiet ban ghi
- Da them PDF export client-side cho:
  - ket qua phan tich moi
  - ban ghi lich su
- Da dung report utility dung chung cho:
  - `predict`
  - `analyze`
  - `compare_models`
- Da dua clinical flags vao report khi payload la `analyze`

Van de / Luu y:

- PDF hien duoc tao o frontend bang `jspdf`, tap trung vao report van hanh noi bo
- Chua co template bao cao benh vien / ky ten / dinh dang in an nang cao

### Buoc 12 - Nang cap dashboard va trai nghiem phase 2

Muc tieu:

- Bo loc theo model, mode va khoang thoi gian
- Empty state / stale state ro rang hon
- Dong bo admin, dashboard va workspace qua data refresh

Trang thai: `completed`

Ket qua:

- Da nang cap dashboard voi bo loc:
  - model
  - mode
  - khoang ngay
- Da them deep-link detail bang `?record=<id>`
- Da hien thi history detail voi:
  - summary cards
  - request payload
  - result payload
  - export PDF
- Da giu chart va empty/loading/stale state ro rang hon
- Da cap nhat app shell copy de phan anh dung phase 2 va giu visual do-den Hema AI

Van de / Luu y:

- History detail hien uu tien van hanh va debugging; chua co viewer rich cho anh goc hay overlay box
- Dashboard hien tai van duoc query theo snapshot, chua chay realtime stream

### Buoc 13 - Kiem thu va chot phase 2

Muc tieu:

- Bo sung test cho auth/admin/history detail
- Chay lai lint, typecheck, build, pytest
- Cap nhat backlog va README theo trang thai phase 2 moi

Trang thai: `completed`

Ket qua:

- Da bo sung test backend cho:
  - auth login + me
  - admin gate + admin models
  - history detail
  - clinical flag rules trong `/info`
- Da chay lai:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `pytest -q`
  deu pass
- Da nang tong test pass len `16`
- Da cap nhat:
  - `README.md`
  - `NEXTJS_PHASE2_BACKLOG.md`
  - file ke hoach nay

Van de / Luu y:

- Cac hang muc logging/monitoring/deploy production van la lop follow-up sau phase 2
- Phase 2 da hoan thien theo pham vi auth, admin, report, dashboard va test cho app moi

## Cach cap nhat trang thai

Moi khi xong 1 buoc, cap nhat:

- `Trang thai: completed`
- Ghi them muc `Ket qua`
- Ghi them muc `Van de / Luu y`
- Doc lai toan bo file truoc khi sang buoc tiep theo

## Quy tac dieu huong

Neu trong qua trinh lam co thay doi ky thuat lon, phai sua file ke hoach truoc, sau do moi sua code.
