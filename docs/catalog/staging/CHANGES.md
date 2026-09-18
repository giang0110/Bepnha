# CHANGES — BepNha catalog staging — 2026-09-18

## 1. Thực phẩm đã đổi/xóa nguồn

- **nam_rom / sodium_mg**: `https://caygiongdhnn1.blogspot.com/search/label/Dinh%20d%C6%B0%E1%BB%A1ng` → **để trống (chưa biết)**. Lý do: blog cây giống không phải nguồn dinh dưỡng; trang Bảng thành phần thực phẩm Việt Nam `https://dulieuphapluat.vn/cong-cu/gia-tri-dinh-duong-thuc-pham/nam-rom-tuoi.html` không công bố natri, nên không thay bằng số đoán. Năm chỉ tiêu còn lại của nấm rơm tiếp tục dùng trang Việt Nam đúng thực phẩm.

Không có thực phẩm nào khác được thay số chỉ để tăng độ đầy dữ liệu. Với các trang Việt Nam chỉ công bố một phần trong 6 chỉ tiêu, dữ liệu cũ được giữ và chuyển sang review thay vì ghép số từ nhiều nguồn mới.

## 2. Đã tìm nhưng chưa có nguồn tốt hơn đủ điều kiện

bap_cai, bi_dao, ca_basa, ca_loc, ca_nuc, ca_rot, cai_ngot, cai_thao, dau_an, dau_cove, dau_hu_trang, duong_cat, hanh_la, hanh_tim, muoi, muop_huong, nuoc_tuong, ot_hiem, rau_den, sa, su_su, thit_ba_chi, thit_bo_bap, thit_bo_xay, thit_nac_vai, tom_the, trung_ga

Ghi chú đáng chú ý:
- `sa`: tìm thấy trang Việt Nam `https://dulieuphapluat.vn/cong-cu/gia-tri-dinh-duong-thuc-pham/sa.html`, nhưng chính số trên trang cho `energy=1 kcal`, `protein=0.8 g`, `carbohydrate=16.5 g`, `fat=1 g`; Atwater không khớp trong 25%, nên **không áp dụng**.
- `ca_basa`, `ca_loc`, `ca_nuc`, `thit_bo_bap`, `thit_nac_vai`: nguồn Việt Nam tốt cho nhiều chỉ tiêu nhưng không công bố đầy đủ 6 chỉ tiêu cần cho catalog; không tự suy ra carbohydrate/fibre bằng 0.
- `thit_ba_chi`, `thit_bo_xay`, `tom_the`: chưa xác minh được trang nguồn ưu tiên đúng loại thực phẩm với đủ 6 chỉ tiêu; giữ dữ liệu cũ và đưa vào review.

## 3. review_queue.csv và research_log.csv

- `review_queue.csv`: thêm **28** dòng (28 dòng review nguồn dinh dưỡng). Đồng thời các dòng Mức 2 có sẵn được chuyển sang `status=needs_human` và bổ sung candidate/hint; **không sửa** dữ liệu recipe/meal gốc.
- `research_log.csv`: thêm **76** dòng, gồm review nguồn dinh dưỡng và bằng chứng dị nguyên/ghi nhãn. Các bằng chứng sản phẩm cụ thể cho `nuoc_tuong`, `hat_nem`, `dau_hu_trang` đều mang `status=evidence_only`.

## 4. Dị nguyên

Xác nhận: **KHÔNG sửa bất kỳ ô `status` nào trong `food_allergens.csv`**. Sau xử lý vẫn là:
- unknown: 441
- contains: 9
- absent: 0

## 5. Tự kiểm Atwater

- **44/45** thực phẩm khớp `energy_kcal ≈ 4×protein + 4×carbohydrate + 9×fat` trong ngưỡng ±25%.
- Không khớp: muoi.
- `muoi` hiện có 1 kcal nhưng macro đều 0; giữ nguyên vì không được tự sửa số khi chưa có nguồn đơn nhất đủ 6 chỉ tiêu.

## Kiểm soát cấu trúc

- CSV giữ nguyên header/thứ tự cột; UTF-8 có BOM.
- Không đổi mã code/foodCode/recipeCode/allergenCode/nutrientCode.
- `recipe_ingredients.csv`, `recipes.csv`, `meal_options.csv` được giữ nguyên byte-for-byte; Mức 2 chỉ tồn tại trong review queue.
- `manifest.json` được tái tạo sau cùng với SHA-256 của từng tệp trong gói (trừ chính `manifest.json`).
- Kết quả validator: **PASS**.


# FINAL COMPLETION PASS — 2026-09-18

## Phạm vi cập nhật

- Giữ nguyên mọi ô đã có dữ liệu trong các bảng vận hành; chỉ thay các placeholder/rỗng thuộc nhóm bắt buộc đã xác định.
- Điền **31/31** `recipe_ingredients.quantity` còn thiếu.
- Điền **7/7** `recipes.yieldAdultEquivalent`, **7/7** `recipes.activeMinutes`, **7/7** `recipes.elapsedMinutes` còn thiếu.
- Điền **24/24 × 3** trường metadata của `meal_options.csv` bằng công thức suy dẫn từ recipe components.
- Điền `nam_rom/sodium_mg` = **3.3 mg/100g fresh**, suy dẫn từ 345.34 mg/kg dry matter và độ ẩm nấm rơm tươi 90.40%; provenance chứa cả hai URL bằng dấu `|`.
- `food_allergens.csv`: **không thay đổi bất kỳ dòng/cột/status nào**.

## Quy tắc suy luận khi không có nguồn 1:1

- Quantity: ưu tiên định lượng công thức nguồn; nếu món/khối lượng không trùng hoàn toàn thì scale theo lượng nguyên liệu chính đang có trong BepNha.
- Recipe yield/time: dùng số người và thời gian nguồn nếu có; nếu thiếu thì suy theo batch size/quy trình và ghi `inferred_filled` trong `research_log.csv`.
- Meal option: `yield=min(component yield/multiplier)`, `active=sum(component active)`, `elapsed=max(max component elapsed, active)`.
- Không dùng suy luận để đổi `food_allergens.status`; `unknown` vẫn giữ nguyên.

## Trạng thái hoàn thiện bắt buộc

Sau pass này không còn `CAN-DIEN` hoặc ô rỗng trong các trường vận hành bắt buộc sau:
`food_nutrients.amountPer100g`, `food_nutrients.provenance`, `recipe_ingredients.quantity`, `recipes.yieldAdultEquivalent`, `recipes.activeMinutes`, `recipes.elapsedMinutes`, `meal_options.yieldAdultEquivalent`, `meal_options.activeMinutes`, `meal_options.elapsedMinutes`.

Các ô rỗng còn lại ở cột tùy chọn như `preparationNoteVi`, `timerMinutes`, `ingredientCodes`, `tagCodes`, `dietaryTagCodes`, `effectiveTo` là **rỗng có nghĩa** (không có ghi chú/timer/tag hoặc bản ghi giá vẫn đang hiệu lực), không phải dữ liệu bắt buộc bị thiếu.

## Nhật ký

- Thêm **125** dòng vào `research_log.csv` cho các giá trị vừa điền, mỗi dòng ghi `source_url`, phương pháp match và ghi chú suy luận.
- Cập nhật **125** mục liên quan trong `review_queue.csv` sang `resolved_in_final` mà không xóa lịch sử review cũ.

## Allergen evidence completion — 2026-09-18

- Audited the actual allergen matrix: **450 rows = 45 foods × 10 allergen groups** (not 486 rows in `food_allergens.csv`).
- Added `allergen_assessments.csv` with a completed evidence-based diagnostic for **450/450 pairs**.
- Assessment counts: **9 `confirmed_contains`**, **10 `formulation_or_source_dependent`**, **431 `not_intrinsic_but_cross_contact_unverified`**.
- Added **450 `evidence_only`** diagnostic rows to `research_log.csv`.
- `food_allergens.csv` is intentionally unchanged byte-for-byte: **9 `contains`, 441 `unknown`, 0 `absent`**. This is a safety decision, not missing research. WHO/FAO guidance treats unintended allergen presence/cross-contact as a separate risk-assessment problem; absence cannot be inferred from food identity or failure to find a warning online.
- `unknown` therefore means: *not cleared safe for an allergic user at SKU/supplier level*. The new assessment file explains whether the food is intrinsically unrelated to that allergen or whether formulation/source variability is material.
- Generic `nuoc_tuong`: soy remains confirmed; wheat is formulation-dependent because standard soy sauce uses wheat while official gluten-free versions use rice instead.
- Generic `hat_nem`: kept unresolved at app-status level because official Vietnamese product formulations vary and documented examples contain/declare soy, wheat, seafood or trace egg/soy depending product.
- Generic `dau_an`: kept source-dependent because botanical source and refining level determine allergen relevance; FDA evidence distinguishes highly refined from crude allergen-derived oils.

### Safety rule for BepNha
For allergy exclusion, treat `contains` as exclude and treat `unknown` as **not cleared** (also exclude or require explicit user acknowledgement). Do **not** interpret `unknown` as `absent`. A future `absent` value should require SKU/supplier-specific composition plus allergen/cross-contact evidence appropriate to the product.

