# Gia đình, mục tiêu cân nặng và mua thực phẩm theo lượng dùng thực tế

Ngày: 2026-10-02. Trạng thái: đặc tả để người dùng duyệt trước khi lập kế hoạch triển khai.

## 1. Kết quả cần đạt

Người dùng muốn bổ sung chiều cao, cân nặng, chỉ số BMI và lựa chọn giữ cân, tăng cân hoặc giảm cân trong cài đặt gia đình. Lựa chọn này phải ảnh hưởng đến cả thực đơn và khẩu phần. Danh sách mua thực phẩm phải phù hợp với nguyên liệu thực sự nấu, đơn vị đo và hình thức bán: cần 600 g cá không mặc nhiên phải mua 1 kg; không yêu cầu dùng 2,4 quả trứng rồi bỏ phần còn lại.

Hướng đã được người dùng chốt trong trao đổi: cả nhà ăn chung thực đơn, chia khẩu phần theo từng người lớn; ưu tiên mua lẻ thực phẩm tươi khi có hình thức bán phù hợp, giữ nguyên quy cách đối với hàng đóng gói. BMI là cách hiểu của chữ “pmi” trong yêu cầu.

Thành công được đánh giá bằng một chuỗi tính toán thống nhất: hồ sơ thành viên → khẩu phần từng bữa → lượng nguyên liệu thực tế → dinh dưỡng và chi phí dùng → cộng nguyên liệu trong tuần → trừ kho → lượng cần mua và phần dư. Giao diện không tự làm tròn riêng một kết quả đã tính ở domain.

Đây là thay đổi đối với mô hình dữ liệu và hợp đồng tính toán. Các giới hạn ban đầu về việc không thu thập chiều cao, cân nặng, tuổi và thông tin dùng để ước tính năng lượng trong đặc tả ngày 2026-08-25 được thay thế trong phạm vi dưới đây, theo yêu cầu mới của người dùng.

## 2. Phạm vi và cách tiếp cận

Chọn mở rộng bộ tính toán xác định hiện có. Tách ba trách nhiệm: ước tính nhu cầu của thành viên, chuẩn hóa lượng dùng có thể nấu, tính lượng mua theo quy cách bán. Tiếp tục dùng `decimal.js`, các lớp domain/application/infrastructure và luồng lập thực đơn hiện tại; không thêm một bộ tối ưu hay thư viện tính dinh dưỡng khác.

Chỉ lưu BMI/mục tiêu mà không đổi tính toán không đáp ứng yêu cầu. Làm tròn ở giao diện cũng không đáp ứng vì sẽ khiến dinh dưỡng, kho và tiền tính từ lượng khác nhau. Một hệ thống thực đơn riêng cho mỗi người làm thay đổi cách nấu của gia đình và vượt phạm vi đã chốt.

Bao gồm hồ sơ người lớn và người cao tuổi, mục tiêu năng lượng cho bữa chính, chia khẩu phần, lựa chọn thực đơn theo mục tiêu, quy tắc lượng dùng và lượng mua theo từng thực phẩm, cập nhật hợp đồng DB/snapshot, kiểm thử và hướng dẫn triển khai.

Trẻ em giữ hệ số theo nhóm tuổi hiện tại; không áp dụng BMI người lớn hay chế độ giảm/tăng cân tự động cho trẻ. Không thêm theo dõi cân nặng theo thời gian, dự báo số kg sẽ thay đổi, bệnh án, ngày sinh, thực đơn đủ cả ngày, thời hạn bảo quản tự suy đoán hoặc tự động cập nhật kho bằng phần dư dự kiến.

## 3. Hồ sơ thành viên và cài đặt gia đình

Trẻ em tiếp tục được nhập bằng số lượng theo năm nhóm tuổi. Người lớn và người cao tuổi có các thẻ thành viên riêng; mỗi thẻ tương ứng đúng một người trong tổng số của nhóm. Tổng số thành viên vẫn nằm trong giới hạn 1–20 hiện tại.

Mỗi thẻ có ID ổn định, nhóm `adult` hoặc `elderly`, thứ tự, tên gợi nhớ tùy chọn và các trường sau:

| Trường                       | Quy tắc                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Chiều cao                    | cm, tối đa 2 chữ số thập phân, 100–250; có thể chưa nhập                                         |
| Cân nặng                     | kg, tối đa 2 chữ số thập phân, 25–350; có thể chưa nhập                                          |
| Tuổi                         | số nguyên 18–100; có thể chưa nhập; không lưu ngày sinh                                          |
| Giới tính dùng cho công thức | `male`, `female` hoặc chưa cung cấp; giải thích mục đích của trường                              |
| Mức vận động                 | một lựa chọn trong bảng hệ số ở mục 4 hoặc chưa cung cấp                                         |
| Mục tiêu                     | `maintain`, `gain`, `lose`; mặc định giữ cân, không tự suy từ BMI                                |
| Tên gợi nhớ                  | tùy chọn, tối đa 40 ký tự; khi trống hiển thị “Người lớn 1”, “Người cao tuổi 1” theo nhóm/thứ tự |

Các giới hạn trên là giới hạn đầu vào của bộ ước tính, không phải phân loại sức khỏe. Không chọn giới tính hoặc vận động mặc định thay người dùng.

Hộ cũ được hiển thị với đúng số thẻ trống theo số lượng đã lưu; không tự điền thông số cơ thể. ID cho các thẻ cũ được cấp khi lần đầu lưu theo hợp đồng mới. Sau đó tăng số lượng bằng thêm thẻ; giảm số lượng bằng xóa chính thẻ được chọn. Không đổi danh tính của người còn lại hay tái gán thông số theo vị trí.

Cho phép lưu hồ sơ chưa đầy đủ. Có chiều cao và cân nặng thì hiện BMI; chỉ khi có đủ chiều cao, cân nặng, tuổi, giới tính dùng cho công thức và vận động mới áp dụng mục tiêu năng lượng. Hồ sơ thiếu dữ liệu dùng hệ số khẩu phần cũ, kèm trạng thái rõ “Chưa đủ thông tin để áp dụng mục tiêu”; không hiển thị rằng mục tiêu đã được áp dụng.

Cài đặt chung bổ sung “Phần năng lượng ngày dành cho bữa được lập”: phần trăm nguyên 20–50%, mặc định **33%**. Giải thích ngay tại trường: Bếp Nhà đang lập 7 bữa chính/tuần, mỗi ngày một bữa; các bữa còn lại chưa được tính trong kế hoạch. Giá trị này được lưu và đưa vào snapshot, không chỉ là thiết lập hiển thị.

Giữ ngân sách tuần, thời gian nấu, dị ứng, loại trừ và khẩu vị. Trang xác nhận cho biết số người đã áp dụng mục tiêu và số người còn dùng hệ số theo nhóm tuổi.

## 4. BMI và năng lượng

Domain dùng `ExactDecimal`; không dùng số thực JavaScript cho phép tính có thẩm quyền. Chuẩn hóa các kết quả đưa vào hợp đồng/snapshot về chuỗi decimal tối đa 18 chữ số thập phân, `ROUND_HALF_UP`, tại một ranh giới dùng chung; các phép tính sau đó dùng đúng giá trị đã chuẩn hóa. Phần hiển thị có thể làm tròn thêm nhưng không thay đổi đầu vào tính toán.

BMI = cân nặng kg / (chiều cao cm / 100)². Hiển thị 2 chữ số thập phân; không suy ra nhu cầu năng lượng chỉ từ BMI và không tự đổi mục tiêu người dùng chọn.

Ước tính chuyển hóa cơ bản theo Mifflin–St Jeor ([công thức gốc, 1990](https://doi.org/10.1093/ajcn/51.2.241)):

```text
BMR = 10 × cân nặng kg + 6,25 × chiều cao cm − 5 × tuổi + C
C = 5 khi chọn male; C = −161 khi chọn female
TDEE = BMR × hệ số vận động
```

| Mức vận động                              | Hệ số |
| ----------------------------------------- | ----- |
| Ít vận động                               | 1,2   |
| Nhẹ, khoảng 1–3 buổi/tuần                 | 1,375 |
| Vừa, khoảng 3–5 buổi/tuần                 | 1,55  |
| Nhiều, khoảng 6–7 buổi/tuần               | 1,725 |
| Rất nhiều, lao động/vận động cường độ cao | 1,9   |

Mục tiêu ngày: giữ cân = TDEE; tăng cân = TDEE × 1,1; giảm cân = TDEE × 0,9. Mục tiêu bữa chính = mục tiêu ngày × phần trăm đã cài đặt / 100. Các hệ số cố định được pin trong `energy-target-v1`; lần này không thêm mức giảm tùy ý hoặc cam kết thay đổi cân nặng.

Nếu BMR không dương hoặc kết quả không hợp lệ, không tạo mục tiêu. Khi BMI dưới 18,5 và chọn giảm cân, lưu lựa chọn nhưng không tự giảm khẩu phần; thông báo không hỗ trợ giảm cân tự động trong trường hợp này và đánh dấu mục tiêu chưa áp dụng. Không âm thầm thay lựa chọn bằng giữ cân. Những thành viên này vẫn nhận hệ số khẩu phần nhóm tuổi để gia đình có thể lập bữa ăn.

Các con số được ghi là **ước tính năng lượng**, không phải đơn thuốc dinh dưỡng. Không dùng công thức này cho trẻ em. Không suy đoán thai kỳ hay bệnh lý từ BMI.

Ví dụ kiểm tra: nam 30 tuổi, 170 cm, 65 kg, vận động nhẹ có BMI hiển thị 22,49; BMR 1.567,5; TDEE 2.155,3125 kcal. Với tỷ lệ 33%, bữa giữ cân nhắm 711,253125 kcal; giảm cân 640,1278125; tăng cân 782,3784375. Giao diện hiển thị kcal nguyên và công khai tỷ lệ bữa, còn domain giữ giá trị chuẩn hóa.

## 5. Thực đơn chung và chia khẩu phần

Với mỗi meal option hợp lệ, trước tiên tính năng lượng của đúng một suất người lớn chuẩn từ recipe/fact đã pin, bao gồm phần ăn được. Thiếu dữ liệu năng lượng, chuyển đổi hoặc phần ăn được thì loại ứng viên theo lỗi hiện có; không thay bằng 0. Năng lượng suất chuẩn phải dương để dùng cho cá nhân hóa.

Với thành viên có mục tiêu hợp lệ, hệ số suất theo món = mục tiêu kcal của bữa / kcal suất chuẩn. Giới hạn hệ số này trong khoảng **0,5–2** suất chuẩn để tránh tạo khẩu phần xa quy mô công thức; phần lệch được thể hiện và dùng khi chọn món. Với người chưa đủ thông tin, dùng 1 cho người lớn hoặc 0,85 cho người cao tuổi. Trẻ em giữ hệ số `0,4 / 0,55 / 0,7 / 0,85 / 1` của năm nhóm tuổi.

Tổng các hệ số xác định lượng cần nấu cho cả nhà. Bổ sung đầu vào scale có kiểu riêng cho hệ số suất theo ứng viên; không đưa số thập phân vào trường số lượng người. Tỷ lệ chia của một thành viên = hệ số người đó / tổng hệ số. Cả nhà vẫn dùng cùng các món; chia món đã nấu theo tỷ lệ này. Một quả trứng dùng để nấu chung có thể chia sau khi chế biến, không yêu cầu mua hoặc đập một phần quả trứng.

Sau khi chuẩn hóa nguyên liệu ở mục 6, tính lại toàn bộ năng lượng và dưỡng chất từ lượng thực tế. Ước tính kcal nhận được của từng người = kcal thực tế cả bữa × tỷ lệ chia. Đây là hướng dẫn chia món, không phải số gram thức ăn chín đo được; không tự chuyển lượng sống sang gram chín khi thiếu dữ liệu hao hụt/chế biến. Tỷ lệ của nhóm trẻ được hiển thị theo một trẻ của nhóm, không gộp cả nhóm thành một người.

Mục tiêu ảnh hưởng đến lựa chọn món qua một thành phần điểm mới, bên cạnh cấu trúc bữa, đa dạng, khẩu vị, dùng kho và giảm dư thừa:

- Với từng thành viên có mục tiêu, `energyError = min(1, abs(kcalThựcTế − kcalMụcTiêu) / kcalMụcTiêu)`.
- `scaleEffort = min(1, abs(hệSốSuấtĐãGiớiHạn − 1))`.
- Điểm phạt mục tiêu = `ROUND_HALF_UP(2000 × trungBình(0,75 × energyError + 0,25 × scaleEffort))` trên các bữa và thành viên có mục tiêu hợp lệ. Khi không có mục tiêu hợp lệ, thành phần này bằng 0 với lý do “không có mục tiêu áp dụng”, không phải dữ liệu năng lượng thiếu được coi bằng 0.

Điểm này ưu tiên món đáp ứng năng lượng với khẩu phần dễ chia và tính đến sai lệch do đơn vị nguyên quả. Không đặt mục tiêu năng lượng thành điều kiện làm yếu dị ứng, loại trừ hoặc ngân sách: các điều kiện cứng vẫn được kiểm tra trước, ngân sách kiểm tra bằng số tiền cần mua thực tế. Giữ cách tìm kiếm hữu hạn và thứ tự tie-break xác định; không tuyên bố tìm được tối ưu toàn cục.

## 6. Lượng nguyên liệu có thể nấu

Thêm chính sách lượng dùng có phiên bản, gắn với `foodFactVersionId`, đơn vị cơ sở và bằng chứng về dạng thực phẩm. Chính sách độc lập với bước hiển thị trong `food_fact_unit_conversions`; `displayStep` cũ không phải căn cứ để tăng lượng muối hay buộc mua nguyên gói.

| Dạng thực phẩm đã được rà soát                                         | Lượng dùng thực tế                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Trứng nguyên quả và thực phẩm đếm nguyên đơn vị                        | làm tròn lên theo bước đếm đã xác nhận; trứng có bước 1 quả                     |
| Thực phẩm có thể chia theo khối lượng, như thịt/cá chia phần, rau, gạo | bước 1 g, làm tròn gần nhất; lượng dương làm tròn thành 0 dùng tối thiểu 1 g    |
| Gia vị theo khối lượng                                                 | bước 0,1 g, làm tròn gần nhất; tối thiểu 0,1 g khi lượng lý thuyết dương        |
| Thực phẩm/gia vị theo thể tích                                         | bước 0,1 ml, làm tròn gần nhất; tối thiểu 0,1 ml khi lượng lý thuyết dương      |
| Sản phẩm phải dùng nguyên miếng/con hoặc có quy cách riêng             | dùng bước riêng và chuyển đổi đã xác nhận; không đoán trọng lượng một miếng/con |

Chính sách chỉ được áp dụng khi dạng thực phẩm và chuyển đổi phù hợp. Một bản ghi đơn vị `g` không tự chứng minh có thể chia con gà hoặc quả trứng tùy ý. Thiếu chính sách cần thiết cho một thực phẩm thì ứng viên có lỗi dữ liệu rõ ràng, không ngầm chọn một bước chung.

Chuẩn hóa lượng dùng tại từng dòng nguyên liệu của từng recipe component, từng bữa. Ví dụ một dòng trứng lý thuyết 2,4 quả trở thành **3 quả được dùng**. Hai bữa khác nhau mỗi bữa cần 1,2 quả thì mỗi bữa dùng 2 quả, tổng dùng 4; không chỉ làm tròn tổng tuần thành 3 rồi vẫn yêu cầu nấu 1,2 quả từng bữa.

Từ lượng thực tế, tính lại đồng bộ `sourceQuantity`, `baseQuantity`, `grossGrams` bằng chuyển đổi cùng food fact. Lưu cả lượng lý thuyết và lý do điều chỉnh để giải thích, nhưng chỉ lượng thực tế được dùng cho dinh dưỡng, chi phí dùng, nguồn shopping và trừ kho. Các chi tiết nguyên liệu trong hướng dẫn nấu tham chiếu cùng kết quả này.

Ví dụ 0,3 g muối vẫn là 0,3 g; không dùng projector hiện tại để biến thành 5 g. Khi đổi từ kg sang g hoặc chọn đơn vị trình bày khác, lượng vật lý phải giữ nguyên. Phần bỏ đi không ăn được, ví dụ vỏ trứng/xương cá, chỉ được tính từ `edibleFraction` của fact; không nhầm với phần mua dư còn có thể dùng.

## 7. Quy cách mua và nguồn giá

Tách **đơn vị báo giá** khỏi **bước mua**. Hợp đồng giá mới phân biệt:

| Hình thức bán | Dữ liệu bắt buộc                                                                             | Cách mua                              |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| `loose_mass`  | khối lượng báo giá, giá theo khối lượng đó, bước cân, bằng chứng bán theo cân/dạng chia phần | làm tròn lượng còn thiếu lên bước cân |
| `loose_count` | giá theo số đơn vị báo giá, bước đếm nguyên, bằng chứng bán lẻ                               | làm tròn lượng còn thiếu lên bước đếm |
| `fixed_pack`  | lượng mỗi gói, giá mỗi gói, bước số gói nguyên                                               | mua đủ số gói, giữ phần dư            |

Các trường giá và quy cách có đơn vị cùng chiều với food fact. Lưu nguồn, ngày quan sát, phiên bản và fingerprint của dữ liệu này. Bước cân/đếm là dữ liệu chính sách được rà soát, không suy từ tên món, category hoặc `packageQuantity = 1 kg`.

Mỗi lần tính toán tiếp tục dùng đúng một bản ghi giá/quy cách cho mỗi `foodId` trong price book đã chọn. Khi chuẩn bị catalog mới, ưu tiên nguồn bán lẻ có căn cứ cho thực phẩm tươi; nếu không có, giữ nguồn gói hợp lệ. Loader từ chối bản ghi trùng/mâu thuẫn thay vì chọn tùy thứ tự. Lần này không bổ sung tối ưu nhiều nhà bán hoặc nhiều cỡ gói cho cùng thực phẩm.

Ưu tiên mặc định của phiên bản mới là mua lẻ thực phẩm tươi **nếu có quy cách bán lẻ được hỗ trợ bởi dữ liệu**. Không tạo một nhà bán lẻ giả hoặc suy giá mua lẻ ngoài chợ từ giá một hộp siêu thị. Nếu chỉ có gói cố định, tính đúng gói đó và ghi rõ vì sao có phần dư. Không có giá/quy cách dùng được thì không khẳng định ngân sách đủ.

Giữ các bản ghi giá đã công bố bất biến. Các bản ghi cũ không có metadata mới được đọc với ý nghĩa gói cố định của hợp đồng cũ; đây là giữ nguyên hợp đồng đã có, không phải xác nhận mới về người bán. Muốn đổi sang giá theo cân phải tạo dữ liệu giá/quy cách mới có nguồn và nêu rõ loại giá. Catalog staging phải rà soát từng dòng đang dùng, tách giá theo kg và sản phẩm gói cụ thể; không đổi toàn bộ thực phẩm tươi sang mua lẻ chỉ dựa vào nhóm.

Các ví dụ có điều kiện rõ ràng:

- Cá cần 600 g, có giá theo kg và bước mua 50 g: mua **600 g**, dư 0. Nếu báo giá 100.000 đ/kg, số tiền mua là 60.000 đ. Giá và bước trong ví dụ này là fixture minh họa, không phải giá nhà bán đã được xác minh.
- Cá cần 620 g với bước mua 50 g: mua **650 g**, dư 30 g.
- Cá chỉ bán gói 1.000 g: cần 600 g thì mua **1 gói**, dư 400 g; không sửa quy cách gói cho đẹp kết quả.
- Trứng thực tế dùng 3 quả: giá bán lẻ theo quả cho phép mua 3; nguồn chỉ có hộp 10 quả thì mua 1 hộp, dư 7 quả. Nguồn staging hiện có là hộp 10 quả, nên không tự đổi thành một đề nghị bán lẻ.
- Đậu hũ 220 g và thịt bò xay 200 g có nguồn sản phẩm đóng gói vẫn là gói cố định cho đến khi có nguồn quy cách khác phù hợp.

Thực phẩm nguyên con/nguyên miếng chỉ chuyển sang bán theo cân chia phần khi metadata xác nhận đúng dạng mua và food fact. Không đoán trọng lượng trung bình của con cá/gà để làm tròn số con.

## 8. Cộng tuần, kho, chi phí và phần dư

Giữ thứ tự đang đúng: cộng **lượng thực tế dùng của tất cả bữa** theo thực phẩm/đơn vị cơ sở → trừ kho hợp lệ → làm tròn lượng mua. Không làm tròn gói cho từng bữa rồi cộng tiền/gói của cả tuần.

```text
needed = tổng lượng thực tế dùng
pantryUsed = min(needed, lượng kho hợp lệ)
remaining = needed − pantryUsed
```

Với mua lẻ: `purchase = ceil(remaining / saleStep) × saleStep`; tiền dòng = `ROUND_HALF_UP(purchase / quoteQuantity × quotePriceVnd)` về đồng nguyên. Với gói cố định: `packCount = ceil(remaining / packQuantity / packIncrement) × packIncrement`; `purchase = packCount × packQuantity`; tiền dòng = `packCount × packPriceVnd`. `leftover = purchase − remaining` trong cả hai trường hợp.

Nếu remaining bằng 0 thì không tạo dòng mua dương; không ép mua thêm một gói. Tổng tiền mua = tổng tiền từng dòng đã làm tròn, nằm trong giới hạn số nguyên an toàn. Không gọi 0,6 kg cá là 0,6 “gói”; dòng mua lẻ có lượng/bước mua và đơn vị riêng.

Chi phí nguyên liệu đã dùng vẫn là một con số riêng với số tiền cần chi để mua: tính tỷ lệ từ lượng **thực tế dùng**, cùng nguồn giá, theo quy tắc làm tròn tổng chi phí dùng hiện có. Không cộng phần mua dư vào kcal của bữa và không dùng chi phí tiêu thụ để khẳng định đạt ngân sách mua.

Kho trứng nguyên quả phải có số nguyên quả sau chuyển đổi. Chặn lưu mới số lẻ với thông báo cụ thể. Nếu có dữ liệu cũ như 2,4 quả, giữ nguyên bản ghi để người dùng sửa; thế hệ tính toán mới báo lỗi cần chỉnh kho, không âm thầm làm tròn, bỏ phần lẻ hoặc cho rằng đó là trứng đã đánh. Chuyển đổi từ gram sang quả cần dữ liệu quy đổi phù hợp, không tự tạo.

Danh sách mua hiển thị “Cần nấu / Có trong kho / Cần mua / Dư sau kế hoạch”, kèm “theo cân”, “theo quả” hoặc số gói và lượng mỗi gói. Phần dư là dự kiến toán học; không tự coi là đã mua hoặc đã nhập tủ lạnh. Không tự gán hạn dùng hay khẳng định một thực phẩm tươi giữ được cả tuần. Giữ điểm tái sử dụng nguyên liệu/kho và phạt mua dư để ưu tiên các bữa dùng chung nguyên liệu trong các ràng buộc hiện tại.

## 9. Hợp đồng, lưu trữ và tương thích

### Thành viên và lưu gia đình

Thêm bảng `public.household_member_profiles` chứa dữ liệu riêng tư theo quyền chủ hộ, khóa chính UUID, khóa ngoại trực tiếp đến household, nhóm/thứ tự và các trường mục 3. Không gắn hồ sơ bằng khóa ngoại đến hàng `household_member_groups`: RPC hiện tại xóa/tạo lại các hàng nhóm khi lưu, sẽ làm mất hoặc đổi danh tính hồ sơ nếu dùng quan hệ đó.

Thêm tỷ lệ năng lượng bữa vào household. RPC mới `save_household_setup_v2` lưu nhóm, toàn bộ tập hồ sơ, tỷ lệ bữa và các cài đặt hiện có trong một transaction với `expectedVersion`. Kiểm tra ownership, ID trùng, tổng số hồ sơ đúng số người lớn/cao tuổi, giới hạn đầu vào và chỉ xóa hồ sơ người dùng đã bỏ khỏi tập gửi lên. Hộ không có profile vẫn hợp lệ đối với hợp đồng cũ. Không cho một save theo hợp đồng cũ xóa hồ sơ mới; từ chối ghi cũ khi household đã có dữ liệu mới mà lời gọi không bảo toàn được.

RPC đọc `get_household_setup_v2` trả về phiên bản hộ, nhóm và hồ sơ trong cùng một snapshot DB để không ghép hồ sơ mới với phiên bản hộ cũ. Hộ chỉ có dữ liệu nhóm được trả về đúng dạng legacy, rồi giao diện tạo thẻ nháp như mục 3; việc đọc không ghi profile hay tăng version.

Tất cả cập nhật hồ sơ/cài đặt tăng cùng `household.version`; kết quả stale không ghi một phần và không tự ghi đè. Không cấp ghi trực tiếp vào bảng hồ sơ cho client để bỏ qua transaction/version. RPC ghi kiểm tra chủ hộ, không nhận ID hồ sơ của hộ khác, dùng search path cố định và tên schema đầy đủ. RLS cho phép đúng chủ hộ đọc, không mở cho anonymous/hộ khác; các đường ghi vẫn phải chịu kiểm tra ownership. Cập nhật generated database types bằng CLI mà repository đang pin.

### Catalog, tính toán và snapshot

Phiên bản tạo tuần mới: `planner-engine-v6`, `portion-v2`, `energy-target-v1`, `food-quantity-v1`, `purchase-v2`, `shopping-list-v2`. Giữ `price-freshness-v1` và quy tắc ngày giá hiện có. Hợp đồng giá/shopping v2 phân nhánh có kiểu theo hình thức bán; không nới `purchaseIncrement` cũ thành số gói lẻ.

Chính sách lượng dùng được lưu theo food fact với version/hash và nguồn; metadata mua được lưu với giá/quy cách versioned. Bổ sung loader, catalog validator và staging để phát hiện thiếu policy, sai chiều đơn vị, bước không dương, số quả/gói không nguyên, dạng nguyên con không có quy đổi hoặc nguồn chưa đủ. Không viết lại hash của food fact/price book đã công bố để gắn dữ liệu mới.

Snapshot mới pin tập hồ sơ đầu vào, trạng thái áp dụng mục tiêu, cấu hình năng lượng/tỷ lệ bữa, policy lượng dùng, giá và quy cách mua, lượng lý thuyết/thực tế, tỷ lệ chia, kcal thực tế, điểm mục tiêu và toàn bộ lineage. ID/thứ tự được canonicalize để cùng input tạo cùng fingerprint; thay đổi chiều cao, cân nặng, mục tiêu hoặc bước mua phải thay fingerprint phù hợp. Mọi payload có thông số cơ thể nằm trong phạm vi private của chủ hộ.

Giữ nguyên khả năng đọc các revision/snapshot v1–v5. Không tính lại dữ liệu lịch sử từ cân nặng hiện tại, không làm tròn lại trứng trong tuần cũ và không thay hóa đơn mua cũ theo quy cách mới.

Đổi một bữa trong tuần v6 giữ nguyên snapshot/lượng thực tế của sáu bữa còn lại, dùng hồ sơ và cấu hình đã pin; tính lại shopping cả tuần từ bảy bữa và kho hợp lệ theo luồng hiện tại. Nếu cài đặt gia đình đã thay đổi, báo cần tạo lại tuần theo kiểm tra version, không trộn khẩu phần cũ/mới âm thầm. Đổi bữa trong revision cũ tiếp tục luồng tính toán không cá nhân hóa đang có và snapshot hợp đồng cũ; tạo tuần mới mới áp dụng toàn bộ cải tiến. Giao diện phân biệt rõ trường hợp này.

### Ràng buộc SQL và khoảng cách schema/code

Migrations bổ sung schema/RPC, dữ liệu cấu hình được kiểm chứng cần thiết và các ràng buộc v2. Shopping v1 vẫn kiểm tra số gói nguyên và tích giá gói như trước. Shopping v2 kiểm tra đúng nhánh: bước mua hợp lệ, lượng mua đủ lượng còn thiếu sau kho, phần dư bằng chênh lệch, tiền theo quy tắc của nhánh, tổng nguồn bằng lượng dùng và tổng tiền các dòng bằng tổng snapshot. Các kiểm tra lineage, fact/price FK, quyền hộ và nhất quán revision vẫn giữ nguyên.

Ba hàm phải chấp nhận và kiểm tra đầy đủ engine v6: `private.assert_revision_shopping_row(uuid)`, `private.assert_plan_summary_row(uuid)` và `public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)`. Không chỉ thay danh sách engine mà bỏ qua tính hợp lệ snapshot/shopping v2.

Đường đọc mới khi gặp schema chưa cập nhật (`42703`, thiếu bảng `42P01`, hoặc thiếu RPC `42883`/`PGRST202`) chỉ fallback về hình dạng đọc cũ và ghi nhận dữ liệu mới “chưa có”. Chỉ fallback với lỗi thiếu schema được xác định; lỗi quyền, hỏng dữ liệu hay kết nối không được coi là hộ chưa nhập thông tin. Đường ghi hồ sơ mới không fallback RPC cũ hay bỏ trường để lưu cho thành công; báo phụ thuộc schema chưa sẵn sàng và giữ bản nhập trên màn hình.

Engine v6 không có fallback ghi an toàn trên schema chỉ nhận v5. **Migration chấp nhận engine và shopping v2 phải được áp dụng trên production trước khi merge code bật v6**, theo AGENTS.md. Công việc triển khai ở nhánh gồm viết migration, thử local và tài liệu thứ tự; production migration/merge/deploy cần yêu cầu cụ thể của người dùng, chưa nằm trong sự chấp thuận thiết kế này.

## 10. Giao diện và quyền riêng tư

Mở rộng bước “Gia đình” của onboarding và trang cài đặt hiện có bằng thẻ người lớn/cao tuổi, chiều cao/cân nặng, BMI tự tính và lựa chọn mục tiêu. Các trường dành cho ước tính năng lượng được giải thích ngắn gọn; báo chính xác trường còn thiếu. Giữ bản nháp khi lưu lỗi và xử lý stale theo luồng hiện tại.

Trang xác nhận và thực đơn hiển thị mục tiêu kcal bữa, kcal thực tế ước tính, tỷ lệ chia cho từng người/nhóm trẻ và lý do chưa áp dụng mục tiêu nếu có. Không báo “đạt giảm cân” chỉ vì một bữa gần mục tiêu; không trình bày kế hoạch một bữa như toàn bộ khẩu phần ngày. Hướng dẫn nấu và shopping dùng lượng thực tế, có giải thích điều chỉnh như “Dùng 3 quả trứng, chia phần sau khi nấu”.

Dữ liệu cơ thể chỉ lưu trong DB private và trạng thái màn hình cần thiết. Không ghi vào localStorage/IndexedDB, telemetry, log lỗi hoặc gửi hồ sơ thô vào Gemini. Nội dung trợ lý hiện có chỉ nhận thông tin bữa ăn theo hợp đồng đang được phép, không tự mở rộng sang dữ liệu cơ thể. Rời phiên/hộ xóa trạng thái liên quan như các dữ liệu private khác. UI mới dùng route/chunk hiện có; kiểm tra ngân sách bundle thay vì đưa toàn bộ bộ tính vào entry tải đầu.

## 11. Kiểm thử và tiêu chí nghiệm thu

Viết kiểm thử domain trước thay đổi phép tính. Tối thiểu có các nhóm sau:

1. BMI, công thức BMR/TDEE, từng hệ số vận động, ba mục tiêu và tỷ lệ bữa; ví dụ số cụ thể ở mục 4, đầu vào biên/thiếu/sai, BMI thấp với mục tiêu giảm, không áp dụng quy tắc người lớn cho trẻ.
2. Hộ nhiều mục tiêu, hộ nhập một phần, hộ chỉ có nhóm tuổi cũ; hệ số 0,5–2, tỷ lệ chia, kcal sau làm tròn; chứng minh thay mục tiêu có thể thay lượng dùng **và** thứ tự chọn món trong fixture có ứng viên phù hợp, vẫn tôn trọng dị ứng/thời gian/ngân sách.
3. Trứng 2,4 → dùng 3; hai bữa 1,2 → tổng dùng 4; gia vị 0,3 g; quy đổi g/kg, ml/l, count/gross; thiếu policy/nguồn/quy đổi và hình thức nguyên con không bị đoán.
4. Cá 600 g mua theo cân → 600 g; 620 g với bước 50 g → 650 g; gói 1 kg → dư 400 g; trứng bán lẻ khác hộp 10; sản phẩm 220 g/200 g giữ gói. Cộng nhiều bữa và trừ kho trước làm tròn mua, kho đủ/không đủ, số quả kho lẻ báo cần sửa.
5. Bất biến: lượng nguồn shopping bằng lượng thực tế nấu; dinh dưỡng/chi phí dùng tính cùng lượng thực tế; `purchase ≥ remaining`; `leftover = purchase − remaining`; tổng tiền bằng tổng dòng; không tạo dòng cần mua dương khi kho đã đủ; thao tác chia bữa không tạo yêu cầu mua trứng lẻ.
6. Snapshot/hash xác định, hồ sơ đổi làm thay input fingerprint, lịch sử không đổi, đổi một bữa khóa đúng sáu bữa, luồng đổi bữa cũ giữ hợp đồng cũ, stale household/pantry/revision không ghi đè.
7. DB pgTAP và integration: ownership/RLS, validation/concurrency/atomicity của RPC, hồ sơ không mất vì thay group rows, shopping v1/v2 không nhận số tiền hoặc lượng mua giả, ba guard engine v6. Fixture riêng cho schema cũ và RPC chưa có; ghi không làm rơi trường mới.
8. Component/Playwright: onboarding hộ cũ/mới, thẻ nhiều người, nhập BMI/mục tiêu, reload giữ dữ liệu, thêm/xóa đúng người, lưu lỗi giữ draft, thực đơn/khẩu phần và shopping hiển thị đúng đơn vị, private state khi đổi phiên; smoke và accessibility mobile hiện có.

Trước khi báo hoàn thành triển khai: format/lint/typecheck, unit/component và coverage liên quan, DB reset/lint/pgTAP, generated types, integration household/planner/shopping/pantry/catalog, production build và bundle budget, planner performance gate, smoke và E2E luồng sửa đổi. Kiểm tra nguồn/catalog bằng validator/audit hiện có đã mở rộng. Không báo PASS cho gate chưa chạy; nếu phụ thuộc môi trường chặn một gate bắt buộc, ghi rõ BLOCKED.

Đặc tả này chưa phải kế hoạch triển khai hay một thay đổi đã hoạt động trên production. Sau khi người dùng duyệt bản này, viết kế hoạch công việc/test/migration cụ thể để duyệt trước khi sửa mã sản phẩm.
