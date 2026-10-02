# BepNha catalog staging status — 2026-09-18

- Mức 1: không suy đoán dinh dưỡng/giá/quy đổi. `nam_rom.sodium_mg` từ blog cây giống đã trả về trống.
- Mức 2: `recipe_ingredients.csv`, `recipes.csv`, `meal_options.csv` không bị sửa; đề xuất chỉ nằm trong `review_queue.csv` với `status=needs_human`.
- Mức 3: không sửa bất kỳ `status` nào trong `food_allergens.csv`; chỉ bổ sung bằng chứng vào `research_log.csv`.
- Atwater: 44/45 thực phẩm trong ngưỡng 25%.
- Validator: **PASS**.

## Rà soát mới 2026-10-02

Authoring v2 có 45 quantity policies; fact4/recipe4/meal-option3/price-book4. Ghi rõ sơ chế/cắt phần trong recipe mới, không thay số lượng gốc, nutrition, allergens, conversions hoặc observedAt. Cả 45 giá giữ fixed_pack vì chưa có bước bán loose được xác minh. Xem PURCHASING_REVIEW.md; trạng thái năm 2026-09 ở trên là lịch sử. Audit mới: 102 cảnh báo nguồn phụ, 1 Atwater, không có blocking finding.
