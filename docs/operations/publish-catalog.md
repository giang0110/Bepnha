# Xuất bản catalog lên production

Chuỗi này chạy **trên máy của bạn**, không chạy trong phiên Claude. Hai lý do: bước 9B cần khoá
service-role của production để đọc, và khoá đó phải ở lại chỗ bạn kiểm soát; ngoài ra mạng ra ngoài
trong phiên agent bị chặn.

## Điều kiện trước

1. **Bạn là admin.** Quyền admin không nằm ở bảng nào trong repo — nó đọc từ
   `auth.users.raw_app_meta_data->>'role' = 'admin'` (xem `private.assert_catalog_admin`). Đặt trên
   Supabase Dashboard → Authentication → chọn user → sửa **App Metadata** thành `{"role":"admin"}`.
2. **Catalog `ready`.** Kiểm lại trước khi làm bất cứ gì:
   ```bash
   npm run catalog:sheet -- import --dir docs/catalog/staging --out /tmp/pack.json
   npm run catalog:validate -- --input /tmp/pack.json
   ```
   Phải thấy `"valid": true` và `"ready": true`. Nếu không, **dừng** — các bước sau đều từ chối.
3. **Sao lưu.** Bước 6 (PITR/backup) nên xong trước, vì chuỗi này ghi thật và không có nút hoàn tác.

## Bước 1 — Resolve (đọc production)

Đối chiếu mọi mã trong pack với dữ liệu production thật, và chụp lại một ảnh snapshot có hash.

```bash
# PowerShell
$env:SUPABASE_URL = "https://vkrqzwlpneocgjwhqbsl.supabase.co"
$env:SUPABASE_SECRET_KEY = "<service-role key>"
npm run catalog:resolve -- --input /tmp/pack.json --output /tmp/manifest.json
```

```bash
# bash
SUPABASE_URL="https://vkrqzwlpneocgjwhqbsl.supabase.co" \
SUPABASE_SECRET_KEY="<service-role key>" \
npm run catalog:resolve -- --input /tmp/pack.json --output /tmp/manifest.json
```

Bước này **chỉ SELECT**, không ghi gì. Nó chạy lại kiểm định 9A trước và từ chối truy vấn production
nếu pack chưa `valid` và `ready`.

Sau bước này **xoá biến môi trường chứa secret key** — các bước còn lại không cần nó.

## Bước 2 — Plan (offline)

```bash
npm run catalog:plan -- --input /tmp/pack.json --manifest /tmp/manifest.json --output /tmp/plan.json
```

Hoàn toàn offline, không chạm mạng. Cùng một cặp pack + manifest luôn cho ra cùng một plan.

## Bước 3 — Xem plan sẽ làm gì

```bash
npm run catalog:execute -- --plan /tmp/plan.json --journal /tmp/journal.json --dry-run
```

In ra số thao tác theo từng loại, **không gửi gì và không ghi journal**. Đọc kỹ con số này trước khi
sang bước 4: đây là lần cuối bạn nhìn thấy toàn cảnh trước khi có gì đó được ghi thật.

## Bước 4 — Thực thi

Lấy access token của chính bạn (không phải service-role key). Sau khi đăng nhập vào ứng dụng, mở
DevTools → Console:

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith("-auth-token"))))
  .access_token
```

```bash
# PowerShell
$env:BEPNHA_ADMIN_ENDPOINT = "https://bepnhatoi.vercel.app/api/admin/catalog"
$env:BEPNHA_ADMIN_ACCESS_TOKEN = "<access token>"
npm run catalog:execute -- --plan /tmp/plan.json --journal /tmp/journal.json
```

Token Supabase hết hạn khoảng một giờ. Nếu chạy quá lâu và gặp `401 UNAUTHORIZED`, lấy token mới rồi
chạy lại với `--resume`.

## Nếu đứt giữa chừng

`journal.json` được ghi lại sau **mỗi** lần cấp UUID và **mỗi** thao tác hoàn tất, nên mất mạng hay
Ctrl-C đều để lại một tệp tiếp tục được:

```bash
npm run catalog:execute -- --plan /tmp/plan.json --journal /tmp/journal.json --resume
```

**Đừng chạy lại từ đầu với một journal mới.** Các thao tác `create_*` không idempotent — chạy lại từ
đầu sẽ tạo bản sao thứ hai của mọi thực phẩm đã tạo. Công cụ từ chối ghi đè một journal đã có nếu
thiếu `--resume`, chính là để chặn việc đó.

Một lỗi cần xử lý bằng tay chứ không phải bằng `--resume` ngay: thông báo _"the write may or may not
have been applied"_. Nó nghĩa là yêu cầu đi ra nhưng không có câu trả lời về — lệnh đó có thể đã
được áp dụng. Vào Supabase kiểm tra thao tác đó trước khi tiếp tục.

## Tại sao đi qua `/api/admin/catalog` chứ không ghi thẳng database

Khoá service-role ở lại trên server. Bạn xác thực bằng token của chính mình, server kiểm tra bạn có
phải admin, và mọi thao tác ghi vào `admin_audit_log` **gắn tên một con người** chứ không phải một
bí mật dùng chung. Mười hai loại thao tác của plan khớp đúng mười hai action mà endpoint nhận, nên
mỗi thao tác là đúng một request.

## Ý nghĩa các mã lỗi hay gặp

| Mã                           | Nghĩa                               | Làm gì                                 |
| ---------------------------- | ----------------------------------- | -------------------------------------- |
| `401 UNAUTHORIZED`           | token sai hoặc hết hạn              | lấy token mới, `--resume`              |
| `403 ADMIN_REQUIRED`         | user chưa có `role: admin`          | xem Điều kiện trước, mục 1             |
| `409 STALE_CATALOG_REVISION` | production đã đổi kể từ lúc resolve | chạy lại từ **Bước 1** với journal mới |
| `422 PUBLICATION_INCOMPLETE` | bản ghi chưa đủ dữ liệu để publish  | lỗi dữ liệu, dừng và báo               |
| `400 VALIDATION_FAILED`      | payload sai hình dạng               | lỗi công cụ, dừng và báo               |
| `503 CATALOG_UNAVAILABLE`    | server hoặc database không sẵn sàng | kiểm tra Supabase rồi `--resume`       |
