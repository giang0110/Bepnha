# Xuất bản catalog lên production

Chuỗi này chạy **trên máy của bạn**, không chạy trong phiên Claude. Hai lý do: bước 9B cần khoá
service-role của production để đọc, và khoá đó phải ở lại chỗ bạn kiểm soát; ngoài ra mạng ra ngoài
trong phiên agent bị chặn.

## Chỗ đặt tệp trung gian

Chuỗi này sinh bốn tệp: `pack.json`, `manifest.json`, `plan.json`, `journal.json`. Đặt chúng ở một
thư mục **ngoài repo** — `journal.json` chứa UUID của production nên không nên lỡ commit, và nó phải
sống sót qua cả lần chạy bị đứt, nên đừng để trong thư mục tạm của hệ điều hành.

```powershell
# PowerShell — đặt một lần, dùng cho mọi bước bên dưới
$run = "D:/IT/bepnha-catalog-run"
New-Item -ItemType Directory -Force -Path $run | Out-Null
```

```bash
# bash
run="$HOME/bepnha-catalog-run" && mkdir -p "$run"
```

Dùng dấu `/` kể cả trên Windows: Node nhận bình thường, và tránh việc `\` bị diễn giải lại khi đi
qua npm. Mọi lệnh bên dưới dùng `$run`, nên PowerShell và bash chạy cùng một dòng.

## Điều kiện trước

1. **Bạn là admin.** Quyền admin không nằm ở bảng nào trong repo — nó đọc từ
   `auth.users.raw_app_meta_data ->> 'role' = 'admin'` (xem `private.assert_catalog_admin`). Cấp
   trong Supabase Dashboard → SQL Editor:

   ```sql
   update auth.users
   set raw_app_meta_data =
         coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
   where email = 'nguoi-van-hanh@example.com';

   select email, raw_app_meta_data ->> 'role' as role
   from auth.users
   where email = 'nguoi-van-hanh@example.com';
   ```

   **Phải dùng `||` để trộn, không được dùng `=` để gán đè.** Cột này đã chứa sẵn `provider` và
   `providers`; ghi đè sẽ xoá chúng và có thể làm hỏng đăng nhập của chính tài khoản đó.

   Không cần đăng xuất rồi vào lại: `/api/admin/catalog` xác minh bằng `supabase.auth.getUser(token)`,
   tức hỏi lại Supabase Auth chứ không giải mã JWT cũ tại chỗ.

   **Gỡ quyền sau khi xuất bản xong** — đây là quyền ghi thẳng vào catalog production:

   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data - 'role'
   where email = 'nguoi-van-hanh@example.com';
   ```

2. **Catalog `ready`.** Kiểm lại trước khi làm bất cứ gì:
   ```bash
   npm run catalog:sheet -- import --dir docs/catalog/staging --out "$run/pack.json"
   npm run catalog:validate -- --input "$run/pack.json"
   ```
   Phải thấy `"valid": true` và `"ready": true`. Nếu không, **dừng** — các bước sau đều từ chối.
3. **Sao lưu.** Bước 6 (PITR/backup) nên xong trước, vì chuỗi này ghi thật và không có nút hoàn tác.

## Bước 1 — Resolve (đọc production)

Đối chiếu mọi mã trong pack với dữ liệu production thật, và chụp lại một ảnh snapshot có hash.

Đừng dán khoá thẳng vào dòng lệnh: nó vào lịch sử shell và hiện trong `ps` cho người dùng khác trên
cùng máy. Nhập vào mà không hiện lên màn hình:

```powershell
# PowerShell
$env:SUPABASE_URL = "https://vkrqzwlpneocgjwhqbsl.supabase.co"
$env:SUPABASE_SECRET_KEY = Read-Host "Service role key"
npm run catalog:resolve -- --input "$run/pack.json" --output "$run/manifest.json"
```

```bash
# bash
export SUPABASE_URL="https://vkrqzwlpneocgjwhqbsl.supabase.co"
read -rs -p "Service role key: " key && export SUPABASE_SECRET_KEY="$key" && unset key
npm run catalog:resolve -- --input "$run/pack.json" --output "$run/manifest.json"
```

Bước này **chỉ SELECT**, không ghi gì. Nó chạy lại kiểm định 9A trước và từ chối truy vấn production
nếu pack chưa `valid` và `ready`.

Sau bước này **đóng cửa sổ terminal đó**, hoặc `Remove-Item Env:SUPABASE_SECRET_KEY` /
`unset SUPABASE_SECRET_KEY`. Các bước còn lại không cần khoá này.

## Bước 2 — Plan (offline)

```bash
npm run catalog:plan -- --input "$run/pack.json" --manifest "$run/manifest.json" --output "$run/plan.json"
```

Hoàn toàn offline, không chạm mạng. Cùng một cặp pack + manifest luôn cho ra cùng một plan.

## Bước 3 — Xem plan sẽ làm gì

```bash
npm run catalog:execute -- --plan "$run/plan.json" --journal "$run/journal.json" --dry-run
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

```powershell
# PowerShell
$env:BEPNHA_ADMIN_ENDPOINT = "https://bepnhatoi.vercel.app/api/admin/catalog"
$env:BEPNHA_ADMIN_ACCESS_TOKEN = Read-Host "Access token"
npm run catalog:execute -- --plan "$run/plan.json" --journal "$run/journal.json"
```

```bash
# bash
export BEPNHA_ADMIN_ENDPOINT="https://bepnhatoi.vercel.app/api/admin/catalog"
read -rs -p "Access token: " token && export BEPNHA_ADMIN_ACCESS_TOKEN="$token" && unset token
npm run catalog:execute -- --plan "$run/plan.json" --journal "$run/journal.json"
```

Token Supabase hết hạn khoảng một giờ. Nếu chạy quá lâu và gặp `401 UNAUTHORIZED`, lấy token mới rồi
chạy lại với `--resume`.

## Nếu đứt giữa chừng

`journal.json` được ghi lại sau **mỗi** lần cấp UUID và **mỗi** thao tác hoàn tất, nên mất mạng hay
Ctrl-C đều để lại một tệp tiếp tục được:

```bash
npm run catalog:execute -- --plan "$run/plan.json" --journal "$run/journal.json" --resume
```

**Đừng chạy lại từ đầu với một journal mới.** Các thao tác `create_*` không idempotent — chạy lại từ
đầu sẽ tạo bản sao thứ hai của mọi thực phẩm đã tạo. Công cụ từ chối ghi đè một journal đã có nếu
thiếu `--resume`, chính là để chặn việc đó.

Một lỗi cần xử lý bằng tay chứ không phải bằng `--resume` ngay: thông báo _"the write may or may not
have been applied"_. Nó nghĩa là yêu cầu đi ra nhưng không có câu trả lời về — lệnh đó có thể đã
được áp dụng. Vào Supabase kiểm tra thao tác đó trước khi tiếp tục.

## Nếu một lần chạy đã ghi được một phần rồi hỏng

Đây là trường hợp khác với "đứt giữa chừng": journal còn nguyên và `--resume` vẫn chạy tiếp được,
nhưng nếu bạn đã **sửa dữ liệu trong `docs/catalog/staging/`** để chữa nguyên nhân hỏng thì journal
cũ không dùng lại được nữa — nó gắn với `inputSha256` của plan cũ, và công cụ từ chối đúng như vậy.

Lúc đó phải làm lại từ Bước 1 với pack mới. Nhưng chạy `catalog:resolve` lần nữa sẽ **thất bại**:

```
VERSION_ALREADY_EXISTS  identity:food_fact:bap_cai:1
```

Vì bước 9B phân loại mọi cặp (bản ghi cha, `versionNumber`) đã tồn tại trong production là *collision*
— nó cố tình không cho ghi đè một phiên bản đã xuất bản. Những gì lần chạy trước đã tạo vẫn còn đó.

Cách xử lý đúng là **nâng số phiên bản**, không phải xoá dữ liệu production. Catalog vốn được thiết
kế để thay đổi một thứ đã xuất bản bằng cách xuất bản phiên bản kế tiếp; phiên bản cũ ở lại để các
thực đơn đã sinh trước đó vẫn giải thích được. Tăng `1` → `2` ở các cột phiên bản trong staging:

| Tệp                         | Cột                     |
| --------------------------- | ----------------------- |
| `foods.csv`                 | `factVersionNumber`     |
| `prices.csv`                | `foodFactVersionNumber` |
| `recipe_ingredients.csv`    | `foodFactVersionNumber` |
| `recipes.csv`               | `versionNumber`         |
| `meal_option_components.csv`| `recipeVersionNumber`   |
| `price_book.csv`            | `versionNumber`         |

Chỉ nâng những loại bản ghi mà lần chạy trước **đã thực sự tạo** trong production. Loại nào chưa có
bản ghi nào thì giữ nguyên `1` — nâng thừa sẽ tạo ra một phiên bản 2 mà không có phiên bản 1, hợp lệ
nhưng gây hiểu nhầm khi đọc lịch sử sau này. Đọc journal của lần chạy hỏng để biết loại nào đã chạy
qua, hoặc đếm trực tiếp trong Supabase.

Sau khi sửa: xoá `manifest.json`, `plan.json`, `journal.json` trong `$run`, sinh lại `pack.json`, rồi
chạy lại từ **Điều kiện trước, mục 2**.

## Tại sao đi qua `/api/admin/catalog` chứ không ghi thẳng database

Khoá service-role ở lại trên server. Bạn xác thực bằng token của chính mình, server kiểm tra bạn có
phải admin, và mọi thao tác ghi vào `admin_audit_log` **gắn tên một con người** chứ không phải một
bí mật dùng chung. Mỗi thao tác của plan là đúng một request. Food/recipe/price-book đi qua
`/api/admin/catalog`; ba thao tác meal-option được executor tự chuyển sang endpoint sibling
`/api/admin/meal-options`. Biến `BEPNHA_ADMIN_ENDPOINT` vẫn đặt là URL `/api/admin/catalog` như
ở Bước 4.

## Ý nghĩa các mã lỗi hay gặp

| Mã                           | Nghĩa                               | Làm gì                                 |
| ---------------------------- | ----------------------------------- | -------------------------------------- |
| `401 UNAUTHORIZED`           | token sai hoặc hết hạn              | lấy token mới, `--resume`              |
| `403 ADMIN_REQUIRED`         | user chưa có `role: admin`          | xem Điều kiện trước, mục 1             |
| `409 STALE_CATALOG_REVISION` | production đã đổi kể từ lúc resolve | chạy lại từ **Bước 1** với journal mới |
| `422 PUBLICATION_INCOMPLETE` | bản ghi chưa đủ dữ liệu để publish  | lỗi dữ liệu, dừng và báo               |
| `400 VALIDATION_FAILED`      | payload sai hình dạng               | lỗi công cụ, dừng và báo               |
| `503 CATALOG_UNAVAILABLE`    | server hoặc database không sẵn sàng | kiểm tra Supabase rồi `--resume`       |
