# Sao lưu và phục hồi production

Chuỗi này chạy **trên máy của bạn**. Nó cần khoá database của production, và khoá đó phải ở lại chỗ
bạn kiểm soát.

## Vì sao cần

Tổ chức Supabase của dự án ở **gói Free**, và gói Free **không có sao lưu tự động** — Supabase chỉ
cấp sao lưu hằng ngày cho Pro/Team/Enterprise, còn với Free thì khuyến nghị tự xuất bản sao logic và
giữ ở ngoài.

Khi production còn trống thì mất cũng không sao. Giờ thì không: nó giữ 45 thực phẩm với hai phiên
bản fact, 37 công thức với hai phiên bản, 24 meal option và 45 dòng giá — soạn thủ công qua nhiều
vòng, trong đó có một vòng phải truy ngược từ một thông báo lỗi trống rỗng. Không có gì trong repo
dựng lại được chúng: `docs/catalog/staging/` giữ **nội dung**, nhưng UUID, số revision, `content_hash`
và toàn bộ `admin_audit_log` chỉ tồn tại trong database.

`docs/operations/production-readiness.md` yêu cầu việc này xong **trước** khi có dữ liệu hộ gia đình
thật, không phải sau.

## Công cụ: `pg_dump` trực tiếp, không qua Supabase CLI

`supabase db dump` **bắt buộc cần Docker** — không có daemon thì nó dừng ngay với
`LegacyDockerRunError` trước khi chạm tới database. Nếu máy bạn không cài Docker Desktop thì lệnh đó
không dùng được, và đó là lý do tài liệu này đi thẳng bằng `pg_dump`.

Cần **PostgreSQL client tools**, phiên bản major **bằng hoặc cao hơn** server của production —
`pg_dump` cũ hơn server sẽ từ chối chạy. Kiểm lại mỗi lần, vì Supabase có nâng cấp:

```sql
select version();
```

Ngày 2026-09-22 production trả về **PostgreSQL 17.6**, nên bản cài tối thiểu là 17.

Tải bộ cài PostgreSQL cho Windows tại postgresql.org. Trong trình cài đặt, đủ để chọn:

- **Command Line Tools** — cho `pg_dump` và `psql`;
- **PostgreSQL Server** — làm đích cho bài diễn tập phục hồi ở Bước 3.

Không cần Stack Builder, không cần pgAdmin.

Một lần cài cho cả hai, nên `pg_dump` và `psql` tự khớp phiên bản — điều này có ý nghĩa: từ dòng
17.6 (và 16.10) `pg_dump` chèn hai lệnh `\restrict` / `\unrestrict` vào đầu và cuối tệp, và chỉ
`psql` cùng đời mới hiểu. Server dùng làm đích diễn tập cũng phải cùng major hoặc mới hơn bản đã
dump, vì `pg_dump` 17 sinh ra `SET transaction_timeout` mà Postgres 16 không nhận.

Chuỗi kết nối lấy ở Supabase Dashboard → Project Settings → Database → Connection string → **URI**.
Nếu kết nối trực tiếp không đi được (Supabase cấp IPv6 cho kết nối trực tiếp), dùng chuỗi **Session
pooler** — nó có IPv4 và `pg_dump` chạy bình thường qua đó. Đừng dùng **Transaction pooler**: nó
không giữ phiên nên `pg_dump` sẽ hỏng.

## Một cạm bẫy phải biết trước

Bản sao lưu chỉ có dữ liệu (`--data-only`) của schema này **không phục hồi được theo cách thông
thường**. Các trigger bảo vệ sẽ nổ giữa chừng, khi mới nạp được một phần các hàng liên quan:

```
psql:data.sql:238: ERROR:  INCOMPLETE_HARD_RULE_CATALOG_MAPPING
```

Đây không phải bản dump hỏng. `household_rule_options` và `household_rule_catalog_targets` được canh
bởi một *constraint trigger* đòi ánh xạ phải đầy đủ; trong lúc nạp thì nó chưa đầy đủ. Schema còn
nhiều trigger khác cùng tính chất (`PUBLISHED_CATALOG_VERSION_IMMUTABLE`, `CATALOG_MAPPING_IMMUTABLE`,
`PRICE_BOOK_MUST_START_DRAFT`…).

Cách xử lý là tắt trigger **trong cùng phiên** nạp dữ liệu:

```sql
set session_replication_role = replica;
```

`psql` xử lý `-c` và `-f` theo đúng thứ tự viết ra trong **một** phiên duy nhất, nên đặt `-c` trước
`-f` là đủ. Tách thành hai lần gọi `psql` thì vô nghĩa — phiên thứ nhất đã đóng trước khi phiên thứ
hai bắt đầu nạp.

Toàn bộ quy trình dưới đây đã được chạy thử end-to-end trên PostgreSQL 16 với đúng 15 migration của
repo: không có dòng đó thì hỏng ở `INCOMPLETE_HARD_RULE_CATALOG_MAPPING`; có dòng đó thì phục hồi
sạch, mọi số đếm khớp tuyệt đối, 41 hàm trong `private` và 48 RLS policy trở lại đầy đủ.

## Bước 1 — Xuất bốn tệp

BepNha sở hữu hai schema: `public` và `private`. `auth`, `extensions` và `supabase_migrations` là của
Supabase — nhưng `auth.users` giữ tài khoản thật nên vẫn phải sao lưu, và sổ migration cho biết
production đang ở đâu.

```powershell
$bk   = "D:/IT/bepnha-backups/$(Get-Date -Format yyyy-MM-dd)"
New-Item -ItemType Directory -Force -Path $bk | Out-Null

# dán chuỗi kết nối vào khi được hỏi; nó không hiện lên màn hình và không vào lịch sử shell
$sec  = Read-Host "Connection string cua production" -AsSecureString
$prod = [System.Net.NetworkCredential]::new("", $sec).Password

pg_dump --schema-only --schema=public --schema=private -f "$bk/schema.sql" $prod
pg_dump --data-only   --schema=public --schema=private -f "$bk/data.sql"   $prod
pg_dump --data-only --table=auth.users -f "$bk/auth-users.sql" $prod
pg_dump --data-only --table=supabase_migrations.schema_migrations -f "$bk/migrations.sql" $prod

Remove-Variable prod, sec
```

```bash
bk="$HOME/bepnha-backups/$(date +%F)" && mkdir -p "$bk"
read -rs -p "Connection string cua production: " prod && echo

pg_dump --schema-only --schema=public --schema=private -f "$bk/schema.sql" "$prod"
pg_dump --data-only   --schema=public --schema=private -f "$bk/data.sql"   "$prod"
pg_dump --data-only --table=auth.users -f "$bk/auth-users.sql" "$prod"
pg_dump --data-only --table=supabase_migrations.schema_migrations -f "$bk/migrations.sql" "$prod"

unset prod
```

`pg_dump` sẽ in một dòng `hint` nhắc về `--disable-triggers` khi dump `--data-only`. Đó là đúng cảnh
báo cho cạm bẫy ở trên, và Bước 3 đã xử lý — không phải lỗi.

| Tệp               | Chứa gì                                              | Thiếu thì sao                            |
| ----------------- | ---------------------------------------------------- | ---------------------------------------- |
| `schema.sql`      | bảng, hàm `private`, trigger, RLS policy             | không có gì để nạp dữ liệu vào           |
| `data.sql`        | mọi hàng của `public` và `private`, kể cả audit log  | phục hồi ra một database rỗng            |
| `auth-users.sql`  | tài khoản đăng nhập                                  | catalog còn, nhưng không ai vào được     |
| `migrations.sql`  | sổ migration đã áp dụng                              | project mới không biết đang ở migration nào |

Kiểm bốn tệp có nội dung thật, đừng chỉ nhìn tên:

```powershell
Get-ChildItem $bk | Select-Object Name, Length
Select-String -Path "$bk/data.sql" -Pattern "COPY public.food_prices" | Select-Object -First 1
```

`data.sql` phải từ vài trăm KB trở lên; riêng dữ liệu catalog đã lớn hơn thế.

## Bước 2 — Lấy số liệu production để lát nữa đối chiếu

Trong Supabase SQL Editor:

```sql
select 'food_fact'       as bang, count(*) from public.food_fact_versions
union all select 'recipe_version',  count(*) from public.recipe_versions
union all select 'meal_option_ver', count(*) from public.meal_option_versions
union all select 'food_price',      count(*) from public.food_prices
union all select 'price_book',      count(*) from public.price_books
union all select 'household',       count(*) from public.households
union all select 'audit_log',       count(*) from public.admin_audit_log;
```

Chép kết quả ra. Bước 4 sẽ so với đúng truy vấn này.

## Bước 3 — Phục hồi thử vào một database bỏ đi

Một bản sao lưu chưa từng được phục hồi thì chưa phải bản sao lưu. Bước này **bắt buộc**, và
`production-readiness.md` ghi rõ: **không bao giờ** dùng việc reset production làm bài kiểm tra phục
hồi.

Bản dump chỉ chứa `public` và `private`, nhưng nó tham chiếu ra ngoài: khoá ngoại trỏ tới
`auth.users`, RLS policy gọi `auth.uid()`. Trên Supabase những thứ đó có sẵn; trên PostgreSQL vừa cài
thì không. `docs/operations/restore-drill-bootstrap.sql` dựng phần tối thiểu đó.

```powershell
# psql doc bon bien nay, nen khong phai lap lai tham so o moi lenh
$env:PGHOST = "localhost"; $env:PGPORT = "5432"; $env:PGUSER = "postgres"
$env:PGPASSWORD = "<mat khau postgres cuc bo, dat luc cai dat>"

psql -c "drop database if exists restore_drill" -c "create database restore_drill"

# ban dump tu tao schema public, nen xoa cai rong o dich di
psql -d restore_drill -c "drop schema public cascade"

psql -d restore_drill -v ON_ERROR_STOP=1 -q -f docs/operations/restore-drill-bootstrap.sql
psql -d restore_drill -v ON_ERROR_STOP=1 -q -f "$bk/schema.sql"
psql -d restore_drill -v ON_ERROR_STOP=1 -q `
  -c "set session_replication_role = replica" -f "$bk/data.sql"
```

Ba lệnh cuối không in gì ra là thành công. `ON_ERROR_STOP=1` khiến `psql` dừng ngay ở lỗi đầu tiên,
nên im lặng nghĩa là sạch.

`auth-users.sql` **không** nạp ở đây: nó mang đủ cột của Supabase, còn bảng trong tệp mồi chỉ có
những cột mà `public` tham chiếu tới. Đích thật của nó là một project Supabase mới. Bước 4 kiểm nó
bằng cách đếm hàng trong tệp.

## Bước 4 — Đối chiếu, đừng tin là xong

```powershell
psql -d restore_drill -c @"
select 'food_fact'       as bang, count(*) from public.food_fact_versions
union all select 'recipe_version',  count(*) from public.recipe_versions
union all select 'meal_option_ver', count(*) from public.meal_option_versions
union all select 'food_price',      count(*) from public.food_prices
union all select 'price_book',      count(*) from public.price_books
union all select 'household',       count(*) from public.households
union all select 'audit_log',       count(*) from public.admin_audit_log;
"@
```

So với Bước 2. **Mọi số phải khớp.** Lệch một hàng nghĩa là bản sao lưu không dùng được, và phải tìm
ra vì sao trước khi coi bước này là xong.

Đếm số hàng không đủ. Kiểm thêm ba thứ mà một bản phục hồi hỏng vẫn có thể đếm đúng:

```powershell
# 1. chu co dau con nguyen ven
psql -d restore_drill -c "select code, name_vi from public.recipe_tags where tag_kind = 'protein_hint' order by code limit 5"

# 2. ham trong private va RLS policy co tro lai khong
psql -d restore_drill -c @"
select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private')                              as ham_private,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relrowsecurity)           as bang_bat_rls,
       (select count(*) from pg_policy)                            as rls_policy;
"@

# 3. so tai khoan trong ban dump auth.users
(Select-String -Path "$bk/auth-users.sql" -Pattern "^[0-9a-f]{8}-" ).Count
```

Kỳ vọng: đọc được `Bò`, `Trứng`, `Cá`, `Đạm thực vật` đủ dấu; `ham_private` khoảng 41,
`bang_bat_rls` khoảng 40, `rls_policy` khoảng 48; số tài khoản khớp với `select count(*) from
auth.users` trên production.

Thấy `B?`, `Tr?ng` hay ô vuông nghĩa là tệp bị mã hoá lại trên đường đi — đừng đổ tệp qua pipeline
của PowerShell, `psql -f` đọc thẳng từ đĩa nên không có chuyện đó.

Dọn dẹp:

```powershell
psql -c "drop database restore_drill"
Remove-Item Env:PGPASSWORD, Env:PGHOST, Env:PGPORT, Env:PGUSER
```

## Bước 5 — Cất giữ

| Yêu cầu        | Cụ thể                                                                             |
| -------------- | ---------------------------------------------------------------------------------- |
| Nơi cất        | **ngoài** Supabase — máy của bạn cộng một bản ở nơi khác (ổ ngoài hoặc cloud riêng) |
| Mã hoá         | bốn tệp chứa dữ liệu hộ gia đình thật; nén có mật khẩu hoặc để trên ổ đã mã hoá     |
| Quyền truy cập | chỉ người vận hành dự án (`giang0110`), trừ khi uỷ quyền rõ ràng cho người khác     |
| Giữ bao lâu    | tối thiểu 4 bản gần nhất; xoá bản cũ hơn để không tích tụ dữ liệu cá nhân vô hạn    |

`data.sql` chứa `households`, `household_members` và kế hoạch bữa ăn của người thật; `auth-users.sql`
chứa email của họ. Đây là dữ liệu cá nhân, không phải tệp build — đừng để lẫn vào thư mục dự án và
đừng commit. Thư mục `$bk` ở ví dụ trên cố ý nằm ngoài repo.

## Nhịp sao lưu

| Khi nào                                 | Vì sao                                                   |
| --------------------------------------- | -------------------------------------------------------- |
| **Ngay trước** mỗi lần xuất bản catalog | đó là lúc duy nhất dữ liệu catalog bị ghi hàng loạt       |
| **Ngay trước** mỗi lần `db push`        | migration không có nút hoàn tác                           |
| Định kỳ, ít nhất **hàng tuần**          | dữ liệu hộ gia đình tích tụ liên tục, không theo sự kiện  |

Diễn tập phục hồi (Bước 3–4) làm lại ít nhất **mỗi quý**, và bắt buộc sau bất kỳ migration nào đổi
cấu trúc bảng.

## Nếu phải phục hồi thật

Đích là một **project Supabase mới**, không phải PostgreSQL trắng — nó cấp sẵn `auth`, `extensions`
và các vai trò, nên **không** chạy tệp mồi ở đó. Thứ tự: `schema.sql`, rồi `data.sql` với
`set session_replication_role = replica`, rồi `auth-users.sql`, rồi `migrations.sql`. Sau đó đổi
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` và các biến server trong Vercel sang project mới.

Đọc `production-readiness.md` mục **Rollback, deletion, and key rotation** trước khi bắt đầu.

## Không bao giờ

- Dùng reset production làm bài kiểm tra phục hồi.
- Xoá project Supabase để xử lý sự cố — thao tác này không thể hoàn tác và xoá luôn mọi bản sao lưu
  phía Supabase.
- Coi một bản dump chưa từng phục hồi thử là bản sao lưu.
