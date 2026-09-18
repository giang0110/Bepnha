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
