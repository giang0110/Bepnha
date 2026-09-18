# BepNha catalog staging status — 2026-09-18

- Mức 1: không suy đoán dinh dưỡng/giá/quy đổi. `nam_rom.sodium_mg` từ blog cây giống đã trả về trống.
- Mức 2: `recipe_ingredients.csv`, `recipes.csv`, `meal_options.csv` không bị sửa; đề xuất chỉ nằm trong `review_queue.csv` với `status=needs_human`.
- Mức 3: không sửa bất kỳ `status` nào trong `food_allergens.csv`; chỉ bổ sung bằng chứng vào `research_log.csv`.
- Atwater: 44/45 thực phẩm trong ngưỡng 25%.
- Validator: **PASS**.
