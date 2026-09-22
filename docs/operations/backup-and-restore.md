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

Phải nằm cùng phiên psql với việc nạp — đặt ở phiên khác thì vô nghĩa, vì nó là thiết lập theo phiên.

Quy trình dưới đây đã được chạy thử end-to-end trên PostgreSQL 16 với đúng 15 migration của repo:
không có dòng đó thì hỏng ở `INCOMPLETE_HARD_RULE_CATALOG_MAPPING`, có dòng đó thì phục hồi sạch và
mọi số đếm khớp tuyệt đối.

## Bước 1 — Xuất ba tệp

Sao lưu đầy đủ là **ba** tệp, không phải một. Thiếu tệp nào cũng khiến bản sao không tự đứng được.

```powershell
$bk = "D:/IT/bepnha-backups/$(Get-Date -Format yyyy-MM-dd)"
New-Item -ItemType Directory -Force -Path $bk | Out-Null

npx supabase db dump --linked --role-only -f "$bk/roles.sql"
npx supabase db dump --linked             -f "$bk/schema.sql"
npx supabase db dump --linked --data-only --use-copy -f "$bk/data.sql"
```

```bash
bk="$HOME/bepnha-backups/$(date +%F)" && mkdir -p "$bk"

npx supabase db dump --linked --role-only -f "$bk/roles.sql"
npx supabase db dump --linked             -f "$bk/schema.sql"
npx supabase db dump --linked --data-only --use-copy -f "$bk/data.sql"
```

`--linked` dùng project đã liên kết và **hỏi mật khẩu**, nên mật khẩu không vào lịch sử shell. Đừng
thay bằng `--db-url` có sẵn mật khẩu trong chuỗi.

| Tệp          | Chứa gì                                  | Thiếu thì sao                              |
| ------------ | ---------------------------------------- | ------------------------------------------ |
| `roles.sql`  | vai trò cấp cluster                      | phục hồi vào project mới sẽ thiếu vai trò  |
| `schema.sql` | bảng, hàm, trigger, RLS policy           | không có gì để nạp dữ liệu vào             |
| `data.sql`   | toàn bộ hàng, kể cả catalog và audit log | phục hồi ra một database rỗng              |

Kiểm nhanh ba tệp đều có nội dung thật, đừng chỉ nhìn tên:

```powershell
Get-ChildItem $bk | Select-Object Name, Length
Select-String -Path "$bk/data.sql" -Pattern "COPY public.food_prices" | Select-Object -First 1
```

Nếu `data.sql` chỉ vài KB thì có gì đó sai — dữ liệu catalog một mình đã lớn hơn thế.

## Bước 2 — Phục hồi thử vào một database bỏ đi

Một bản sao lưu chưa từng được phục hồi thì chưa phải bản sao lưu. Bước này **bắt buộc**, và
`production-readiness.md` ghi rõ: **không bao giờ** dùng việc reset production làm bài kiểm tra phục
hồi.

Đích là stack Supabase cục bộ — nó dùng được ngay và vốn để vứt đi.

```powershell
npx supabase start

# một database mới, tách khỏi database dev cục bộ để không ghi đè lên nó
docker exec supabase_db_bepnha-local psql -U postgres `
  -c "drop database if exists restore_drill" -c "create database restore_drill"

# chép hai tệp vào trong container, rồi để psql tự đọc
docker cp "$bk/schema.sql" supabase_db_bepnha-local:/tmp/schema.sql
docker cp "$bk/data.sql"   supabase_db_bepnha-local:/tmp/data.sql

# schema trước
docker exec supabase_db_bepnha-local psql -U postgres -d restore_drill `
  -v ON_ERROR_STOP=1 -q -f /tmp/schema.sql

# rồi dữ liệu, với lệnh tắt trigger đứng trước -f trong CÙNG lần gọi psql
docker exec supabase_db_bepnha-local psql -U postgres -d restore_drill `
  -v ON_ERROR_STOP=1 -q `
  -c "set session_replication_role = replica" -f /tmp/data.sql
```

**Đừng đổ tệp qua pipeline của PowerShell** (`Get-Content ... | docker exec -i ...`). Windows
PowerShell 5.1 mặc định `$OutputEncoding` là ASCII, nên mọi ký tự tiếng Việt trong `name_vi`,
`provenance` và `source_reference` sẽ bị thay bằng `?` trên đường đi. Bước đối chiếu bên dưới đếm số
hàng nên **vẫn khớp**, và bản phục hồi trông như đạt trong khi chữ đã hỏng. `docker cp` chép nguyên
byte nên không có chuyện đó.

`psql` xử lý `-c` và `-f` theo đúng thứ tự viết ra, trong **một** phiên duy nhất — nên
`set session_replication_role` đặt trước `-f` là có hiệu lực cho cả lần nạp. Tách thành hai lần gọi
`docker exec` thì vô nghĩa, vì phiên thứ nhất đã đóng.

`roles.sql` không nạp ở đây: các vai trò đã có sẵn trong Postgres cục bộ. Nó chỉ dùng khi phục hồi
thật vào một project hoàn toàn mới.

## Bước 3 — Đối chiếu, đừng tin là xong

```powershell
docker exec supabase_db_bepnha-local psql -U postgres -d restore_drill -c @"
select 'food_fact'   as bang, count(*) from public.food_fact_versions
union all select 'recipe_version',  count(*) from public.recipe_versions
union all select 'meal_option_ver', count(*) from public.meal_option_versions
union all select 'food_price',      count(*) from public.food_prices
union all select 'price_book',      count(*) from public.price_books
union all select 'household',       count(*) from public.households
union all select 'audit_log',       count(*) from public.admin_audit_log;
"@
```

So với cùng truy vấn chạy trên production. **Mọi số phải khớp.** Lệch một hàng nghĩa là bản sao lưu
không dùng được, và phải tìm ra vì sao trước khi coi bước này là xong.

Đếm số hàng không đủ. Một bản phục hồi hỏng mã ký tự vẫn đúng số hàng, chỉ là chữ biến thành `?`.
Nhìn tận mắt vài dòng có dấu:

```powershell
docker exec supabase_db_bepnha-local psql -U postgres -d restore_drill -c @"
select code, name_vi from public.recipe_tags where tag_kind = 'protein_hint' order by code limit 5;
"@
```

Phải đọc được `Bò`, `Trứng`, `Cá`, `Đạm thực vật` — có dấu đầy đủ. Thấy `B?`, `Tr?ng` hay ô vuông
nghĩa là tệp đã bị mã hoá lại trên đường vào container; xem lại cảnh báo ở Bước 2.

Dọn dẹp:

```powershell
docker exec supabase_db_bepnha-local psql -U postgres -c "drop database restore_drill"
```

## Bước 4 — Cất giữ

| Yêu cầu     | Cụ thể                                                                              |
| ----------- | ----------------------------------------------------------------------------------- |
| Nơi cất     | **ngoài** Supabase — máy của bạn cộng một bản ở nơi khác (ổ ngoài hoặc cloud riêng)  |
| Mã hoá      | ba tệp chứa dữ liệu hộ gia đình thật; nén có mật khẩu hoặc để trên ổ đã mã hoá       |
| Quyền truy cập | chỉ người vận hành dự án (`giang0110`), trừ khi uỷ quyền rõ ràng cho người khác   |
| Giữ bao lâu | tối thiểu 4 bản gần nhất; xoá bản cũ hơn để không tích tụ dữ liệu cá nhân vô hạn     |

`data.sql` chứa `households`, `household_members` và kế hoạch bữa ăn của người thật. Nó là dữ liệu cá
nhân, không phải tệp build — đừng để lẫn vào thư mục dự án và đừng commit. Thư mục `$bk` ở ví dụ trên
cố ý nằm ngoài repo.

## Nhịp sao lưu

| Khi nào                              | Vì sao                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| **Ngay trước** mỗi lần xuất bản catalog | đó là lúc duy nhất dữ liệu catalog bị ghi hàng loạt   |
| **Ngay trước** mỗi lần `db push`     | migration không có nút hoàn tác                          |
| Định kỳ, ít nhất **hàng tuần**       | dữ liệu hộ gia đình tích tụ liên tục, không theo sự kiện |

Diễn tập phục hồi (Bước 2–3) làm lại ít nhất **mỗi quý**, và bắt buộc sau bất kỳ migration nào đổi
cấu trúc bảng.

## Không bao giờ

- Dùng reset production làm bài kiểm tra phục hồi.
- Xoá project Supabase để xử lý sự cố — thao tác này không thể hoàn tác và xoá luôn mọi bản sao lưu
  phía Supabase.
- Coi một bản dump chưa từng phục hồi thử là bản sao lưu.
