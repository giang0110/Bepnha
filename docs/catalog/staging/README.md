# Catalog đang biên tập

Dữ liệu trong thư mục này do người vận hành soạn bằng ChatGPT + Tavily, qua **bốn vòng**
(2026-09-18), rồi được kiểm định bằng chính công cụ của dự án. Vòng ba lấp hết các ô vận hành còn
trống. Vòng bốn thêm `allergen_assessments.csv` — hồ sơ bằng chứng cho cả 450 cặp — nhưng **không đổi
một ô `status` nào**, nên pack sinh ra từ thư mục này **giống hệt từng byte** với vòng ba. Đây vẫn là
**bản đang làm dở**, chưa phải catalog để xuất bản — lý do nằm ở mục "Còn thiếu".

## Kiểm định đã chạy

```bash
npm run catalog:sheet -- import --dir docs/catalog/staging --out pack.json
npm run catalog:validate -- --input pack.json
npm run catalog:audit -- docs/catalog/staging
```

Kết quả trên bản hiện tại trong thư mục này (không đổi so với vòng ba — pack giống hệt từng byte):

| Kiểm định | Kết quả |
|---|---|
| Cấu trúc | 45 thực phẩm, 37 món, 24 meal option, 8 nhóm đạm, 45/45 thực phẩm dùng tới đều có giá |
| `catalog:validate` | `valid: false`, `ready: false`, **486 chẩn đoán, toàn bộ là dị nguyên** |
| `catalog:audit` | `NO_BLOCKING_FINDINGS` (92 cảnh báo nguồn phụ, 1 cảnh báo Atwater) |
| Ô vận hành bắt buộc còn trống | **0** |
| `manifest.json` | 18/18 tệp khớp sha256 và số byte |

Không còn blocker cấu trúc nào, và cũng không còn `CAN-DIEN` trong bất kỳ cột bắt buộc nào.

## Điều đáng ghi nhận nhất

Bộ dữ liệu này **không bịa một kết luận dị ứng nào**.

```
phân bố status: unknown 441 | contains 9 | absent 0
```

Chín ô `contains` đều là tất yếu — cá chứa `fish`, tôm chứa `crustacean`, mực chứa `mollusc`, trứng
chứa `egg`, đậu hũ chứa `soy` — và đều kèm nguồn tra cứu được. Không ô nào ghi `absent`. Đó chính là
hành vi đúng: `absent` là một khẳng định về an toàn, và không nguồn nào trên mạng chứng minh được nó
cho một thực phẩm bán ngoài chợ.

441 ô `unknown` đều mang một ghi chú giải thích vì sao còn bỏ ngỏ, chứ không mang một URL dựng lên
cho có. Đó là cách ghi đúng: một ô `unknown` nợ một lời giải thích, không nợ một nguồn.

Số liệu dinh dưỡng nhất quán nội tại: 44/45 thực phẩm thoả công thức Atwater trong sai số 25%, tức
là các con số đến từ cùng một phép phân tích thật chứ không phải được nghĩ ra rời rạc. Ô lệch duy
nhất là `muoi` — muối khai 1 kcal trong khi ba chất sinh năng lượng đều bằng 0; đó là làm tròn, không
phải bịa.

## Vòng ba đã lấp gì

| Nhóm | Số ô | Đã đối chiếu thế nào |
|---|---|---|
| Định lượng nguyên liệu | 31 | đọc tay các món lấp mới; 300 g gạo cho 4 suất cơm trắng, 500 g gà + 30 g gừng + 30 ml nước mắm cho gà kho gừng — đúng tầm một bữa gia đình |
| Khẩu phần + thời gian món | 7 × 3 | trong miền hợp lệ (`activeMinutes ≥ 1`, `activeMinutes ≤ elapsedMinutes ≤ 180`) |
| Khẩu phần + thời gian meal option | 24 × 3 | dựng lại từ thành phần, **khớp đúng 24/24** |
| `nam_rom` `sodium_mg` | 1 | suy từ nguồn, xem dưới |

Công thức meal option người soạn khai — và công cụ này dựng lại được y hệt trên cả 24 dòng:

```
yieldAdultEquivalent = min(yield của từng món / hệ số nhân)
activeMinutes        = tổng activeMinutes của các món
elapsedMinutes       = max(elapsedMinutes lớn nhất, activeMinutes)
```

Dựng lại khớp 24/24 không chứng minh các con số gốc của từng món là đúng — nó chứng minh 24 dòng
meal option được tính chứ không được đoán từng dòng một. Các con số gốc vẫn là phán đoán của người
nấu, và đó là đúng người để phán đoán.

## `nam_rom` sodium: chỗ trống cố ý đã được lấp bằng suy dẫn có nguồn

Vòng hai bỏ số `73` trích từ một blog cây giống và để ô trống, nên `catalog:audit` báo
`PROVENANCE_MISSING`. Vòng ba lấp lại bằng một phép suy dẫn ghi rõ:

```
345,34 mg natri / kg nấm khô  ×  (1 − 0,9040 độ ẩm)  /  10  =  3,32 mg/100 g tươi
```

Người soạn ghi `3.3`, kèm hai URL (một bài trên PMC và một tài liệu kỹ thuật trồng nấm rơm). Phép
tính này kiểm lại được, cả hai đầu vào đều có nguồn, nên `catalog:audit` giờ báo
`NO_BLOCKING_FINDINGS`.

Vẫn nên biết đây là **suy dẫn, không phải đo trực tiếp**: độ ẩm và hàm lượng natri đến từ hai tài
liệu khác nhau, có thể khác giống và khác điều kiện trồng. Nếu sau này tìm được bảng thành phần công
bố thẳng natri cho nấm rơm tươi, hãy thay.

## Còn thiếu — chỉ còn một việc, và nó chặn xuất bản

| Việc | Số ô | Ai làm được |
|---|---|---|
| Kết luận dị nguyên (`unknown` → kết luận thật) | **441** | chỉ con người |

486 chẩn đoán của validator là 441 `UNKNOWN_ALLERGEN_LINEAGE` cộng 45 `ALLERGEN_COVERAGE_INCOMPLETE`
— mỗi thực phẩm một dòng. Không còn loại lỗi nào khác.

**Hệ quả nếu xuất bản nguyên trạng.** `evaluate-hard-rules.ts` fail-closed: một nguyên liệu có
`status = "unknown"` cho đúng dị nguyên đang xét thì món đó bị trả về `unknown_lineage`, và
`evaluate-eligibility.ts` loại món đó. Hộ **không khai dị ứng nào** thì không có luật cứng nào chạy
và vẫn lên được thực đơn. Hộ **khai bất kỳ dị ứng nào** sẽ bị loại gần như toàn bộ món — không phải
vì món có chất đó, mà vì catalog chưa biết. Đó là đúng hướng an toàn và sai hướng dùng được.

Vì vậy dữ liệu này **đưa vào repo được, xuất bản thì chưa**.

## `allergen_assessments.csv` — hồ sơ bằng chứng của vòng bốn

Tệp này **không nằm trong pipeline**. `catalog:sheet` chỉ đọc 12 CSV chuẩn; đây là tài liệu đi kèm.
Nó chẩn đoán đủ **450/450 cặp (45 thực phẩm × 10 dị nguyên)** và chia làm ba:

| Kết luận khảo sát | Số cặp | `status` trong `food_allergens.csv` |
|---|---|---|
| `confirmed_contains` | 9 | `contains` |
| `formulation_or_source_dependent` | 10 | `unknown` |
| `not_intrinsic_but_cross_contact_unverified` | 431 | `unknown` |

Mười cặp `formulation_or_source_dependent` là phần có giá trị thật và đúng: `nuoc_tuong` × `wheat`
(nước tương truyền thống ủ lúa mì, bản gluten-free dùng gạo), `dau_an` × `peanut`/`tree_nut`/`soy`/
`sesame` (dầu ăn chung phụ thuộc nguyên liệu và mức tinh luyện), `hat_nem` × `egg`/`soy`/`wheat`/
`fish`/`crustacean` (công thức hạt nêm khác nhau theo hãng). Đó là khảo sát thật của từng thứ.

431 cặp còn lại thì **là một mẫu câu lặp lại**: 450 dòng chỉ có 10 mẫu `rationale` và 11 bộ URL, và
431 dòng cùng viện đúng hai văn bản chính sách (Codex CXS 1-1985 và hướng dẫn PAL của WHO/FAO). Nội
dung nó khẳng định là đúng và tệp nói thẳng ra điều đó — "This does NOT establish absence" — nhưng
đó là **một lập trường được nhân bản 431 lần**, không phải 431 lần tra cứu.

## Quyết định đang chặn: `absent` nghĩa là gì

Người soạn từ chối ghi `absent` vì nhiễm chéo không thể loại trừ từ tên một thực phẩm. Về an toàn
thực phẩm, điều đó đúng. Nhưng nó va vào thiết kế của chính ứng dụng:

`evaluate-hard-rules.ts` xử lý `may_contain` **y hệt** `contains` — đều loại món. `unknown` cũng loại
món. Nên trong bốn giá trị `absent | contains | may_contain | unknown`, **chỉ `absent` mới cho một
món đi qua**. Giữ nguyên lập trường của vòng bốn thì hộ có dị ứng không bao giờ nhận được món nào, và
tính năng dị ứng coi như không ra mắt.

Đây là **quyết định sản phẩm của chủ dự án**, không phải việc công cụ hay LLM được tự quyết
(`AGENTS.md` mục 3). Ba hướng:

1. **`absent` = "bản thân thực phẩm không chứa dị nguyên đó"** — mức nhận dạng thực phẩm, và ứng dụng
   hiển thị cảnh báo thường trực rằng nguyên liệu mua chợ không kiểm soát được nhiễm chéo. 431 cặp
   thành `absent`, 10 cặp biến thiên thành `may_contain` (vẫn bị loại), 9 giữ `contains` → `ready`.
   Đây là cách hầu hết ứng dụng nấu ăn hoạt động: lọc theo thành phần, và nói rõ không bảo đảm khâu
   sản xuất.
2. **`absent` = "đã được xác nhận an toàn, kể cả nhiễm chéo"** — giữ nguyên lập trường vòng bốn. Khi
   đó cần dữ liệu ở mức SKU/nhà cung cấp, thứ một người đi chợ không có, nên tính năng dị ứng không
   ra mắt được.
3. Tự khảo từng thực phẩm và tự quyết từng dòng, qua `catalog:allergens` bên dưới.

Nếu chọn hướng 1, cần biết trước một chuyện: `catalog:audit` sẽ báo `ABSENT_BULK_FILLED`, vì 431 kết
luận `absent` cùng viện một lý do trên 45 thực phẩm — đúng chữ ký của điền hàng loạt mà kiểm tra đó
sinh ra để bắt. Cảnh báo đó **không sai**; nó đang mô tả đúng việc sắp làm. Muốn đi hướng 1 thì phải
ghi rõ quyết định vào tài liệu và chấp nhận cảnh báo một cách có ý thức, chứ không phải nới kiểm tra
cho nó im.

## Điền dị nguyên: 45 dòng thay vì 900 ô

```bash
npm run catalog:allergens -- export --dir docs/catalog/staging --out allergen-worksheet.csv
# điền, rồi:
npm run catalog:allergens -- apply --dir docs/catalog/staging --worksheet allergen-worksheet.csv
npm run catalog:audit -- docs/catalog/staging
```

Worksheet xoay bảng lại: **một dòng một thực phẩm**, mười dị nguyên thành mười cột, và **một ô lý do
dùng chung cho cả thực phẩm đó**. Bạn giữ một món trong đầu rồi quyết một lượt về nó, thay vì nhảy
qua lại giữa 450 dòng.

Ô để trống nghĩa là `unknown` và sẽ giữ nguyên là `unknown` — công cụ không bao giờ đoán hộ. Một kết
luận (`absent`, `contains`, `may_contain`) mà cột `reason` trống thì **bị từ chối và không ghi gì
cả**: một kết luận không ai giải trình được chính là thứ toàn bộ chuỗi này sinh ra để ngăn.

Các ô đã có URL riêng, như `ca_loc` chứa `fish`, giữ nguyên nguồn cụ thể của nó chứ không bị lý do
chung ghi đè.

`catalog:audit` cảnh báo nếu **từ 10 thực phẩm trở lên** cùng viện một lý do cho kết luận `absent` —
dấu hiệu của điền hàng loạt. Một lý do dùng cho cả mười dị nguyên của **một** thực phẩm thì bình
thường, vì đó đúng là cách người ta khảo.

## Chất lượng nguồn dinh dưỡng

68% số dòng truy về Bảng thành phần thực phẩm Việt Nam (bản FAO lưu và bản đăng trên
`dulieuphapluat.vn`), cộng Viện Dinh dưỡng và bảng FCT Philippines. Phần còn lại — 92 dòng — dựa trên
trang tổng hợp nước ngoài, và `catalog:audit` liệt kê đích danh.

Đáng thay nguồn trước tiên là nhóm thịt và cá, vì chúng ảnh hưởng nặng nhất tới kế hoạch bữa ăn:
`thit_ba_chi`, `thit_bo_bap`, `thit_bo_xay`, `thit_nac_vai`, `ca_loc`, `ca_basa`, `ca_nuc`,
`tom_the`.

## Giá

45 dòng, khảo cùng ngày 2026-09-17 từ Bách Hoá Xanh, WinMart và Co.op online, mỗi dòng một URL sản
phẩm. Giá từ 0–30 ngày là hiện hành, 31–90 ngày bị gắn cảnh báo, **quá 90 ngày thì món đó bị loại
khỏi kế hoạch** — nên bộ giá này hết hạn khoảng giữa tháng 12/2026 nếu không khảo lại.

## Đọc `enrichment_summary.json` và `ENRICHMENT_STATUS.md` cho đúng

Hai tệp này do công cụ bên ngoài sinh ra và được giữ nguyên làm vết tích của bản giao. Cả hai khai
`validator_passed: true` / `Validator: PASS`. **Điều đó không đúng** với `catalog:validate` của dự
án: lệnh đó trả `valid: false`, `ready: false`, 486 chẩn đoán. Nhiều khả năng bên soạn kiểm bằng một
phép kiểm cấu trúc riêng (`structural_validation.json`) — cấu trúc thì đúng là sạch. Bảng "Kiểm định
đã chạy" ở đầu tệp này mới là kết quả của công cụ trong repo.

## research_log.csv và review_queue.csv

Nhật ký tra cứu (1879 dòng) và hàng đợi cần xem lại (156 dòng) do công cụ bên ngoài sinh ra, giữ lại
làm vết tích. Chúng không tham gia vào pipeline; `catalog:sheet` chỉ đọc 12 tệp CSV chuẩn.
