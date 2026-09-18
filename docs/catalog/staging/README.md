# Catalog đang biên tập

Dữ liệu trong thư mục này do người vận hành soạn bằng ChatGPT + Tavily, qua **ba vòng**
(2026-09-18), rồi được kiểm định bằng chính công cụ của dự án. Vòng ba lấp hết các ô vận hành còn
trống. Đây vẫn là **bản đang làm dở**, chưa phải catalog để xuất bản — lý do nằm ở mục "Còn thiếu".

## Kiểm định đã chạy

```bash
npm run catalog:sheet -- import --dir docs/catalog/staging --out pack.json
npm run catalog:validate -- --input pack.json
npm run catalog:audit -- docs/catalog/staging
```

Kết quả trên bản hiện tại trong thư mục này:

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

Nhật ký tra cứu (1429 dòng) và hàng đợi cần xem lại (156 dòng) do công cụ bên ngoài sinh ra, giữ lại
làm vết tích. Chúng không tham gia vào pipeline; `catalog:sheet` chỉ đọc 12 tệp CSV chuẩn.
