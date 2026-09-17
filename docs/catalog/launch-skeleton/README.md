# Khung catalog quy mô ra mắt

12 bảng CSV này là **khung**, không phải dữ liệu. Chúng chứa cấu trúc — thực phẩm nào tồn tại, món
nào nấu từ chúng, bữa nào ghép từ món — và để trống mọi con số cần tra cứu.

## Vì sao số liệu để trống

`AGENTS.md` mục 3 cấm dùng LLM để tạo ra số liệu dinh dưỡng, kết luận dị ứng, giá, hay định lượng
khẩu phần. Lý do rất cụ thể: một dòng `peanut: absent` đoán bừa có thể đưa một đứa trẻ dị ứng vào
viện, và một mức giá bịa khiến mọi con số ngân sách app hiển thị đều là nói dối.

Ô nào có sẵn giá trị thì giá trị đó là **định nghĩa**, không phải đo đạc: một gam bằng một gam,
phiên bản số 1, thứ tự bước nấu. Mọi ô còn lại mang dấu `CAN-DIEN` hoặc để trống.

## Trạng thái đã kiểm chứng

Chạy validator trên một bản tạm có bơm giá trị giả hợp lệ (chỉ để dò cấu trúc, không bao giờ commit):

```
foods 45 | recipes 37 | priceRows 45 | mealOptions 24
primaryProteinGroups 8 | reachableFoods 45 | pricedReachableFoods 45
blockers: không có
```

Nghĩa là **cấu trúc đã đạt mọi ngưỡng ra mắt**: vượt mức tối thiểu 21 meal option, có 8 nhóm đạm
khác nhau thay vì 3, mọi thực phẩm đều nằm trong lineage dùng tới, và mọi thực phẩm dùng tới đều có
dòng giá chờ điền.

Phần còn lại hoàn toàn là sự thật cần người tra cứu.

## Khối lượng còn phải điền

| Bảng | Ô cần điền | Nguồn |
| --- | --- | --- |
| `food_allergens.csv` | 900 | kết luận dị nguyên + căn cứ, cho 45 thực phẩm × 10 dị nguyên |
| `food_nutrients.csv` | 540 | Bảng thành phần thực phẩm Việt Nam, 45 × 6 dưỡng chất |
| `prices.csv` | 225 + 45 số | khảo giá chợ thật, kèm ngày khảo |
| `recipe_ingredients.csv` | 182 | định lượng từng nguyên liệu |
| `food_conversions.csv` | 94 | bước hiển thị, và khối lượng thực của một đơn vị với ml/quả |
| `foods.csv` | 90 | phần ăn được + nguồn |
| `recipes.csv` | 37 + 74 số | khẩu phần, thời gian nấu |
| `meal_options.csv` | 24 + 48 số | khẩu phần, thời gian |
| `pack.csv`, `price_book.csv` | 4 | ngày và nguồn |

Tổng: **2096 ô `CAN-DIEN` và 167 ô số để trống**.

## Cách làm

```bash
npm run catalog:sheet -- import --dir docs/catalog/launch-skeleton --out pack.json
npm run catalog:validate -- --input pack.json
```

Validator trả về đường dẫn chính xác tới từng ô chưa đạt. Tải 12 tệp này lên Google Sheets, mỗi tệp
một tab, điền dần, tải xuống rồi chạy lại. Lặp tới khi `valid` và `ready` cùng `true`.

`grep -c "CAN-DIEN" *.csv` cho biết còn bao nhiêu ô.

## Hai điều đừng làm

**Đừng điền `absent` cho cả mười dị nguyên để cho nhanh.** Validator từ chối `unknown` như một kết
luận, nhưng nó không thể phân biệt `absent` thật với `absent` bịa. Đó là chỗ duy nhất trong toàn bộ
chuỗi công cụ mà không có gì bảo vệ được người dùng ngoài sự trung thực của người biên tập.

**Đừng coi danh sách nguyên liệu là dữ liệu đã duyệt.** Phần ghép món là một đề xuất biên tập cần
đọc lại: thiếu hay thừa một nguyên liệu sẽ làm sai lineage dị nguyên của cả bữa ăn.
