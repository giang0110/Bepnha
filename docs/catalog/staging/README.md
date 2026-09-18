# Catalog ra mắt

Dữ liệu trong thư mục này do người vận hành soạn bằng ChatGPT + Tavily qua bốn vòng (2026-09-18),
rồi được kiểm định bằng chính công cụ của dự án. Vòng ba lấp hết các ô vận hành. Vòng bốn khảo đủ
450 cặp `(thực phẩm, dị nguyên)` và ghi lại trong `allergen_assessments.csv`. Kết luận của vòng bốn
đã được đưa vào `food_allergens.csv` bằng `catalog:assessments`.

**Bộ dữ liệu này `ready`.**

## Kiểm định đã chạy

```bash
npm run catalog:sheet -- import --dir docs/catalog/staging --out pack.json
npm run catalog:validate -- --input pack.json
npm run catalog:audit -- docs/catalog/staging
```

| Kiểm định                     | Kết quả                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Cấu trúc                      | 45 thực phẩm, 37 món, 24 meal option, 8 nhóm đạm, 45/45 thực phẩm dùng tới đều có giá |
| `catalog:validate`            | **`valid: true`, `ready: true`, 0 chẩn đoán**                                         |
| `catalog:audit`               | `NO_BLOCKING_FINDINGS` (92 cảnh báo nguồn phụ, 1 cảnh báo Atwater)                    |
| Ô vận hành bắt buộc còn trống | 0                                                                                     |
| `manifest.json`               | 19/19 tệp khớp sha256 và số byte                                                      |

## Dị nguyên: nói đúng điều đã kiểm, và để hộ tự quyết

```
phân bố status: cross_contact_unverified 431 | may_contain 10 | contains 9 | absent 0 | unknown 0
```

Không ô nào ghi `absent`, và đó là chủ ý. `absent` khẳng định cả **thành phần** lẫn **khâu chế biến**
đã được xác nhận — với nguyên liệu mua chợ thì vế sau không ai chứng minh được. Trước đây bộ dữ liệu
kẹt vì chỉ có hai lựa chọn: ghi `absent` (nói quá điều đã kiểm) hoặc để `unknown` (loại sạch mọi món
của mọi hộ khai dị ứng).

`cross_contact_unverified` là giá trị nói đúng sự thật: **không phải nguyên liệu, khâu chế biến chưa
xác minh.** Và phần còn lại — chấp nhận được hay không — là câu hỏi y tế, khác nhau từng nhà, nên
**hộ gia đình trả lời khi khai dị ứng**:

| Hộ chọn                                                   | Món mà nguyên liệu chỉ ở mức `cross_contact_unverified` |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Nghiêm ngặt _(mặc định, và là kết quả khi không trả lời)_ | bị loại                                                 |
| Theo nguyên liệu                                          | được mời, kèm ghi chú                                   |

`may_contain` và `contains` **luôn bị loại**, không phụ thuộc lựa chọn của hộ.

Mười ô `may_contain` là phần khảo sát kỹ nhất và đúng nhất: `nuoc_tuong` × `wheat` (nước tương ủ
truyền thống có lúa mì, bản gluten-free dùng gạo), `dau_an` × `peanut`/`tree_nut`/`soy`/`sesame`
(tuỳ nguyên liệu và mức tinh luyện), `hat_nem` × `egg`/`soy`/`wheat`/`fish`/`crustacean` (tuỳ hãng).
Mỗi ô kèm nguồn riêng của nó — Kikkoman, hướng dẫn FDA về dầu tinh luyện, trang sản phẩm của Knorr.

Chín ô `contains` là các trường hợp tất yếu và có nguồn: cá chứa `fish`, tôm chứa `crustacean`, mực
chứa `mollusc`, trứng chứa `egg`, đậu hũ và nước tương chứa `soy`, nước mắm chứa `fish`.

Số liệu dinh dưỡng nhất quán nội tại: 44/45 thực phẩm thoả Atwater trong sai số 25%. Ô lệch duy nhất
là `muoi` — muối khai 1 kcal trong khi ba chất sinh năng lượng đều bằng 0; đó là làm tròn.

## Vòng ba đã lấp gì

| Nhóm                              | Số ô   | Đã đối chiếu thế nào                                                                                                                       |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Định lượng nguyên liệu            | 31     | đọc tay các món lấp mới; 300 g gạo cho 4 suất cơm trắng, 500 g gà + 30 g gừng + 30 ml nước mắm cho gà kho gừng — đúng tầm một bữa gia đình |
| Khẩu phần + thời gian món         | 7 × 3  | trong miền hợp lệ (`activeMinutes ≥ 1`, `activeMinutes ≤ elapsedMinutes ≤ 180`)                                                            |
| Khẩu phần + thời gian meal option | 24 × 3 | dựng lại từ thành phần, **khớp đúng 24/24**                                                                                                |
| `nam_rom` `sodium_mg`             | 1      | suy từ nguồn, xem dưới                                                                                                                     |

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

## `allergen_assessments.csv` và cách nó được đưa vào

Vòng bốn chẩn đoán đủ **450/450 cặp** và chia làm ba kết luận. `catalog:assessments` ánh xạ đúng ba
kết luận đó sang ba `status`, không hơn:

| Kết luận khảo sát                            | `status`                   | Số cặp |
| -------------------------------------------- | -------------------------- | ------ |
| `confirmed_contains`                         | `contains`                 | 9      |
| `formulation_or_source_dependent`            | `may_contain`              | 10     |
| `not_intrinsic_but_cross_contact_unverified` | `cross_contact_unverified` | 431    |

```bash
npm run catalog:assessments -- apply --dir docs/catalog/staging --dry-run
npm run catalog:assessments -- apply --dir docs/catalog/staging
```

Công cụ này **không tự quyết gì cả**. Nó từ chối — và khi từ chối thì **không ghi gì**, kể cả các
dòng hợp lệ — nếu gặp một cặp khảo sát không phủ, một kết luận lạ, một cặp bị trả lời hai lần, một
kết luận mâu thuẫn với `status` đã có trong catalog, hoặc một khẳng định về thực phẩm mà khảo sát
không dẫn nguồn nào. `absent` **không thể sinh ra** từ đường này.

Một điểm kiểm chứng đáng ghi: 9 ô `contains` vốn đã có sẵn trong `food_allergens.csv` **trùng khớp
tuyệt đối** với 9 dòng `confirmed_contains` của khảo sát — nếu lệch, công cụ đã từ chối toàn bộ.

Một lưu ý về 431 dòng `cross_contact_unverified`: chúng dựa trên **một lập luận chung** được áp cho
mọi cặp, viện Codex CXS 1-1985 và hướng dẫn PAL của WHO/FAO, chứ không phải 431 lần tra cứu riêng.
Điều đó chấp nhận được vì `cross_contact_unverified` là lời khẳng định _khiêm tốn nhất có thể_ — nó
nói rằng chưa kiểm chứng được gì. Nếu sau này có dữ liệu ở mức SKU cho một thực phẩm cụ thể, ô đó
mới nên chuyển thành `absent`, và khi đó phải kèm bằng chứng riêng của nó.

Vì lý do đó `catalog:audit` không đòi URL cho `cross_contact_unverified` — nó nợ người đọc một lý
do, không nợ một nguồn. Ngược lại `contains` và `may_contain` bắt buộc có nguồn truy được.

## Sửa một ô dị nguyên bằng tay: 45 dòng thay vì 900 ô

```bash
npm run catalog:allergens -- export --dir docs/catalog/staging --out allergen-worksheet.csv
# điền, rồi:
npm run catalog:allergens -- apply --dir docs/catalog/staging --worksheet allergen-worksheet.csv
npm run catalog:audit -- docs/catalog/staging
```

Worksheet xoay bảng lại: **một dòng một thực phẩm**, mười dị nguyên thành mười cột, và **một ô lý do
dùng chung cho cả thực phẩm đó**. Bạn giữ một món trong đầu rồi quyết một lượt về nó, thay vì nhảy
qua lại giữa 450 dòng.

Dùng worksheet này khi muốn **nâng một ô lên `absent`** sau khi có bằng chứng ở mức SKU/nhà cung
cấp, hoặc sửa một kết luận cụ thể. Ô để trống nghĩa là `unknown` và sẽ giữ nguyên là `unknown` —
công cụ không bao giờ đoán hộ. Một kết luận (`absent`, `contains`, `may_contain`,
`cross_contact_unverified`) mà cột `reason` trống thì **bị từ chối và không ghi gì cả**: một kết
luận không ai giải trình được chính là thứ toàn bộ chuỗi này sinh ra để ngăn.

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
