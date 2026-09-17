# Biên tập catalog pack

`catalog-pack-template.json` là khung rỗng đúng hình dạng mà Phase 9A kiểm tra. Tài liệu này nói rõ
phải điền gì và vì sao một số ô cố tình để trống thay vì có sẵn giá trị.

Đây là công việc biên tập dữ liệu, không phải viết code. Không ai trong chuỗi công cụ đoán hộ được
một con số dinh dưỡng hay một kết luận dị ứng.

## Soạn bằng bảng tính thay vì gõ JSON

Pack là JSON lồng năm tầng. Điền tay được, nhưng để `ready` bằng `true` cần tối thiểu 21 meal option,
và mỗi thực phẩm đã chiếm 16 dòng bắt buộc — mười dị nguyên và sáu dưỡng chất. Đó là hàng nghìn ô.

```bash
npm run catalog:sheet -- export --pack docs/catalog/catalog-pack-template.json --dir catalog-csv
```

Sinh ra 12 bảng CSV, mỗi bảng một tệp. Tải cả 12 lên Google Sheets, mỗi tệp một tab, rồi điền. Xong
thì tải xuống lại và ghép ngược:

```bash
npm run catalog:sheet -- import --dir catalog-csv --out pack.json
npm run catalog:validate -- --input pack.json
```

Các bảng nối với nhau bằng `code` của bản ghi cha: `food_nutrients.csv` có cột `foodCode`,
`recipe_steps.csv` có cột `recipeCode`, v.v. Trường nhiều giá trị như `categoryAncestry` hay
`ingredientCodes` ngăn nhau bằng dấu `|`, không phải dấu phẩy, vì tên tiếng Việt có dấu phẩy.

Bộ chuyển đổi **chỉ đổi hình dạng, không phán xét giá trị**. `catalog:validate` vẫn là nơi duy nhất
quyết định dữ liệu có đạt hay không. Cụ thể, một ô để trống không bao giờ trở thành một giá trị: ô số
trống thành `null` rồi bị validator bắt, chứ không thành `0`; ô `status` trống vẫn trống, không thành
`absent`.

Cột được khớp theo **tên**, nên đảo thứ tự cột hay thêm cột ghi chú riêng đều không sao. Đổi tên một
cột bắt buộc thì bộ đọc báo đúng tên cột bị thiếu.

Xuất ra có dấu BOM UTF-8 để Excel mở không vỡ dấu tiếng Việt.

## Vòng lặp làm việc

```bash
npm run catalog:validate -- --input docs/catalog/catalog-pack-template.json
```

Validator trả về đường dẫn chính xác tới từng ô chưa đạt, ví dụ
`$.foods[0].fact.allergenAssessments[3].status`. Điền, chạy lại, lặp cho tới khi `valid` và `ready`
cùng là `true`. Khung ban đầu trả về 50 lỗi hình dạng — đó là trạng thái đúng, không phải hỏng.

Mọi chỗ cần điền đều mang dấu `CAN-DIEN`, nên `grep -c "CAN-DIEN"` cho biết còn bao nhiêu ô.

## Vì sao các ô để trống thay vì có giá trị mặc định

Điều quan trọng nhất trong khung này là **cái nó không làm**.

Trường `status` của mỗi dị nguyên là một chuỗi mô tả, không phải `"absent"`. Nếu khung điền sẵn
`"absent"` cho cả mười dị nguyên, nó sẽ hợp lệ ngay và một người biên tập không để ý sẽ xuất bản một
catalog tuyên bố mọi món đều không chứa dị nguyên. Đó là kiểu lỗi khiến một ứng dụng ăn uống trở nên
nguy hiểm chứ không chỉ sai.

Cùng lý do, `amountPer100g` để trống chứ không phải `"0"`. Số 0 là một giá trị dinh dưỡng hợp lệ và
có thật — natri bằng 0 là một sự kiện. Không thể phân biệt "bằng 0" với "chưa biết" nếu mặc định là
0, nên khung bắt phải khai báo.

`AGENTS.md` mục 3 nói thẳng điều này: không bao giờ âm thầm thay dữ liệu dinh dưỡng, giá, quy đổi hay
dị nguyên còn thiếu bằng 0 hoặc giá trị mặc định.

## Bộ mã cố định

Không được tự đặt mã mới. Validator chỉ chấp nhận đúng các mã sau.

**Dị nguyên** — phải khai báo đủ cả mười cho từng thực phẩm:
`peanut`, `tree_nut`, `dairy`, `egg`, `soy`, `wheat`, `fish`, `crustacean`, `mollusc`, `sesame`

**Dưỡng chất** — phải khai báo đủ cả sáu cho từng thực phẩm:
`energy_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`, `fibre_g`, `sodium_mg`

**Nhóm thực phẩm**: `food`, `pork`, `beef`, `poultry`, `seafood`, `fish`, `crustacean`, `mollusc`,
`egg`, `dairy`, `tofu`, `vegetable`, `staple`, `seasoning`

**Đơn vị**: `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `item`

**Vai trò món trong bữa**: `staple`, `main`, `vegetable`, `soup`, `side`

**Thẻ chế độ ăn**: chỉ `vegetarian` ở lần ra mắt này.

**Vùng giá**: chỉ `vn_baseline`.

## Ngưỡng để `ready` bằng true

| Điều kiện | Ngưỡng |
| --- | --- |
| Số meal option | tối thiểu **21** |
| Số nhóm đạm chính khác nhau | tối thiểu **3** |
| Lineage thực phẩm | đầy đủ, không thiếu mắt xích |
| Giá | mọi thực phẩm được dùng tới đều phải có giá dùng được |

Nhóm đạm chính lấy từ `proteinHintCode` của meal option. Ba nhóm khác nhau nghĩa là thực đơn không
thể bảy ngày cùng một loại đạm.

Khung mẫu có 5 thực phẩm, 1 công thức, 1 meal option — đủ để thấy hình dạng, còn xa ngưỡng ra mắt.

## Vài trường dễ hiểu nhầm

**`edibleFraction`** là phần ăn được trên tổng khối lượng mua. Gà còn xương khoảng `0.75`; rau bỏ gốc
thấp hơn 1. Để `1` nghĩa là mua bao nhiêu ăn được bấy nhiêu — đúng với gạo, sai với cá nguyên con.

**`packageBaseQuantity`** là quy cách bán quy về đơn vị cơ số. Một bao gạo 5kg với `baseUnitCode` là
`g` thì giá trị là `5000`.

**`purchaseIncrement`** là bước mua tối thiểu thực tế ngoài chợ. Thịt có thể mua theo 100g; một quả
trứng không thể mua nửa quả. Trường này quyết định phép làm tròn trong giỏ đi chợ, nên nó ảnh hưởng
trực tiếp tới số tiền hiển thị cho người dùng.

**`observedAt`** là ngày khảo giá thật. Đây không phải trường trang trí: giá từ 0–30 ngày là hiện
hành, 31–90 ngày vẫn dùng được nhưng bị gắn cảnh báo `STALE_PRICE` và hiện ngày khảo cho người dùng,
quá 90 ngày thì món đó bị loại khỏi kế hoạch. Ghi ngày sai sẽ khiến dữ liệu tự hết hạn lệch lúc.

**`provenance`** xuất hiện ở nhiều nơi và phải trỏ tới nguồn tra cứu được, không phải "ước lượng".
Đây là thứ cho phép kiểm chứng lại một con số sau này.

## Sau khi pack hợp lệ

1. `npm run catalog:validate` — `valid` và `ready` cùng `true`
2. `npm run catalog:resolve` — đối chiếu với trạng thái production hiện tại (Phase 9B)
3. `npm run catalog:plan` — sinh kế hoạch ghi dạng dry-run (Phase 9C)
4. Phase 9D, bộ thực thi kế hoạch đó — **lõi đã có, phần nối vào production thì chưa**

Ba bước đầu đều chạy hoàn toàn offline và không chạm production.

`catalog-mutation-executor.ts` là lõi của bước bốn: nó quyết định thứ tự thực thi, phân giải các
tham chiếu tượng trưng thành định danh thật, và bảo đảm chạy lại được sau khi đứt giữa chừng. Nó
không thực hiện I/O nào; bên gọi truyền vào hàm `runOperation`, và đó là nơi chứa quyền và
credential.

Điểm đáng lưu ý nhất là **khả năng chạy lại**. Một lần chạy đứt sau khi đã tạo hai mươi thực phẩm,
khi chạy lại phải dùng đúng những định danh đã cấp. Nhật ký vì thế ghi cả các UUID được cấp phát,
ngay trước thao tác dùng tới chúng, chứ không chỉ ghi thao tác đã hoàn tất — nếu không, lần chạy sau
sẽ cấp UUID mới và tạo ra bản trùng mà kế hoạch tưởng là bản cũ.

### Phần còn thiếu, và vì sao nó chưa được viết

`runOperation` phải gọi tới `executeCatalogAdminCommand` và `executeMealOptionAdminCommand` — nơi đã
có sẵn kiểm tra, chuẩn hoá và tính băm nội dung. Không được gọi thẳng RPC để đi vòng qua chúng.

Nhưng `tsconfig.node.json` chỉ cho `scripts/` nhìn thấy đúng ba tệp domain, và kế hoạch 9C ghi rõ
"Do not import/call application executors or repositories". Các script hiện có chạm Supabase bằng
interface tự định nghĩa, không mượn tầng application. Viết phần nối trong `scripts/` sẽ buộc phải
mở rộng `tsconfig.node.json` để kéo cả tầng application vào — tức là nới một ranh giới có chủ đích
cho vừa với code mới.

Nên chỗ đặt phần nối là một quyết định kiến trúc còn để ngỏ, không phải việc gõ thêm sáu mươi dòng.

## Điều tuyệt đối không làm

Không hạ ngưỡng, không nới luật cứng, và không điền số cho có để `ready` chuyển thành `true`. Nếu dữ
liệu chưa đủ thì kết luận đúng là catalog chưa sẵn sàng, chứ không phải catalog đã sẵn sàng với dữ
liệu bịa.
