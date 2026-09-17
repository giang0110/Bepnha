# Catalog đang biên tập

Dữ liệu trong thư mục này do người vận hành soạn bằng ChatGPT + Tavily (2026-09-18), rồi được kiểm
định bằng chính công cụ của dự án. Đây là **bản đang làm dở**, chưa phải catalog để xuất bản.

## Kiểm định đã chạy

```bash
npm run catalog:sheet -- import --dir docs/catalog/staging --out pack.json
npm run catalog:validate -- --input pack.json
npm run catalog:audit -- docs/catalog/staging
```

Cấu trúc nguyên vẹn: 45 thực phẩm, 37 món, 24 meal option, 8 nhóm đạm, 45/45 thực phẩm dùng tới đều
có giá, không blocker cấu trúc nào.

## Điều đáng ghi nhận nhất

Bộ dữ liệu này **không bịa một kết luận dị ứng nào**.

```
phân bố status: unknown 441 | contains 9 | absent 0
```

Chín ô `contains` đều là tất yếu — cá chứa `fish`, tôm chứa `crustacean`, mực chứa `mollusc`, trứng
chứa `egg`, đậu hũ chứa `soy` — và đều kèm nguồn tra cứu được. Không ô nào ghi `absent`. Đó chính là
hành vi đúng: `absent` là một khẳng định về an toàn, và không nguồn nào trên mạng chứng minh được nó
cho một thực phẩm bán ngoài chợ.

Số liệu dinh dưỡng cũng nhất quán nội tại: 44/45 thực phẩm thoả công thức Atwater trong sai số 25%,
tức là các con số đến từ cùng một phép phân tích thật chứ không phải được nghĩ ra rời rạc.

## Còn thiếu, theo đúng thứ tự khối lượng

| Việc | Số ô | Ai làm được |
|---|---|---|
| Kết luận dị nguyên (`unknown` → kết luận thật) | **441** | chỉ con người |
| Định lượng nguyên liệu | 31 | người nấu |
| Khẩu phần meal option | 24 | người nấu |
| Thời gian nấu meal option | 48 | người nấu |
| Thời gian nấu món | 14 | người nấu |
| Khẩu phần món | 7 | người nấu |

441 ô dị nguyên là phần lớn nhất và là phần duy nhất không công cụ nào chạm vào được.

Lưu ý về cách đọc kết quả validator: khi còn ô số để trống, pack không parse được nên các kiểm tra
sâu **không chạy**, và báo cáo chỉ hiện vài chục lỗi hình dạng. Con số 441 chỉ lộ ra sau khi lấp đầy
các ô số. Đừng nhầm "ít lỗi" với "gần xong".

## Chất lượng nguồn dinh dưỡng

68% số dòng truy về Bảng thành phần thực phẩm Việt Nam (bản FAO lưu và bản đăng trên
`dulieuphapluat.vn`), cộng Viện Dinh dưỡng và bảng FCT Philippines. Phần còn lại — 92 dòng — dựa trên
trang tổng hợp nước ngoài, và `catalog:audit` liệt kê đích danh.

Đáng thay nguồn trước tiên là nhóm thịt và cá, vì chúng ảnh hưởng nặng nhất tới kế hoạch bữa ăn:
`thit_ba_chi`, `thit_bo_bap`, `thit_bo_xay`, `thit_nac_vai`, `ca_loc`, `ca_basa`, `ca_nuc`,
`tom_the`. Riêng `nam_rom` đang trích một blog về cây giống — nguồn đó nên bỏ hẳn.

## Giá

45 dòng, khảo cùng ngày 2026-09-17 từ Bách Hoá Xanh, WinMart và Co.op online, mỗi dòng một URL sản
phẩm. Giá từ 0–30 ngày là hiện hành, 31–90 ngày bị gắn cảnh báo, **quá 90 ngày thì món đó bị loại
khỏi kế hoạch** — nên bộ giá này hết hạn khoảng giữa tháng 12/2026 nếu không khảo lại.

## research_log.csv và review_queue.csv

Nhật ký tra cứu (1228 dòng) và hàng đợi cần xem lại (128 dòng) do công cụ bên ngoài sinh ra, giữ lại
làm vết tích. Chúng không tham gia vào pipeline; `catalog:sheet` chỉ đọc 12 tệp CSV chuẩn.
