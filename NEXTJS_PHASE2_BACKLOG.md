# Next.js Phase 2 Backlog

## Muc tieu

Phase 2 tap trung dua app moi tu muc v1 chay on dinh len muc san sang dung noi bo va de mo rong production.

## Uu tien 1 - Auth va session [COMPLETED]

- Da them login that cho `frontend-next`
- Da xac thuc backend bang JWT
- Da bao ve route bang `AuthProvider`
- Da chuan hoa logout va persistence state bang Zustand

## Uu tien 2 - Admin va cau hinh [COMPLETED]

- Da bien `/admin` thanh khu van hanh that
- Da quan ly model mac dinh va danh sach model kha dung
- Da quan ly labels theo model
- Da quan ly nguong clinical flags
- Mapping nhom chan doan hien dang duoc giu o contract backend/system info

## Uu tien 3 - Reporting va xuat ket qua [COMPLETED]

- Da co PDF export cho ket qua phan tich
- Da co PDF export cho lich su da luu
- Da co history detail de xem lai payload va summary
- Da chuan hoa file naming cho report o frontend

## Uu tien 4 - Dashboard nang cao [COMPLETED]

- Da them bo loc lich su theo ngay, model, mode
- Da giu confidence trend tren dashboard moi
- Da them stale/loading messaging ro rang hon
- Da them deep-link tu dashboard sang chi tiet ca phan tich

## Uu tien 5 - Chat luong va kiem thu [COMPLETED]

- Da bo sung test backend cho auth, admin, history detail va system info
- Da giu smoke/lint/typecheck/build xanh cho `frontend-next`
- Da tiep tuc cover contract chinh giua Next.js va FastAPI qua schema + pytest
- Error handling cho upload/backend/auth tiep tuc dung chung `ApiError`

## Ưu tiên 6 - Vận hành và production [COMPLETED]

- Đã viết `DEPLOY_GUIDE.md` hướng dẫn triển khai đầy đủ (dev, production, reverse proxy)
- Đã chuẩn hoá `.env.example` với annotation rõ ràng cho dev/staging/production
- Đã bổ sung cấu hình Nginx và Apache (XAMPP) mẫu cho reverse proxy
- Đã thêm bảng xử lý sự cố thường gặp
- Đã cập nhật `.gitignore` toàn diện cho cả Python lẫn Next.js

## Ưu tiên 7 - Dọn dẹp frontend cũ [COMPLETED]

- Đã xoá thư mục `_inspect_hema_ai_zip/` (artifact giải nén tạm)
- Đã xoá file `hema-ai_-hematology-analysis-system.zip`
- Đã xoá 5 file SVG template mặc định Next.js (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`)
- Đã cập nhật `.gitignore` để loại trừ `_inspect_*/`, `*.zip`, `frontend-next/.next/`, `tsconfig.tsbuildinfo`
- Đã cập nhật README với cây thư mục đầy đủ và annotation tiếng Việt có dấu
- Đã chuyển toàn bộ text UI sang tiếng Việt có dấu (navbar, sidebar, header, analysis, dashboard, admin, guide)
