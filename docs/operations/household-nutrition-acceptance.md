# Nghiệm thu nâng cấp gia đình, khẩu phần và mua thực phẩm

Phạm vi: toàn bộ 11 hạng mục đã duyệt, thực hiện trực tiếp trên nhánh
`codex/household-nutrition-practical-purchasing`. Không có thao tác trên production, PR hoặc merge.
Môi trường cloud đã được thiết lập và hướng dẫn khởi động được lưu. Dự án `nupsbox` không thay đổi.

## Hành vi đã triển khai

- Thành viên người lớn/người cao tuổi có định danh ổn định, chiều cao, cân nặng, tuổi, giới tính dùng
  cho công thức, mức vận động và mục tiêu giữ/tăng/giảm cân. Có thể lưu hồ sơ chưa đủ thông tin;
  không tự điền thông số cơ thể. Trẻ em dùng hệ số theo nhóm tuổi.
- BMI hiển thị hai chữ số thập phân. Mục tiêu dùng Mifflin, mức vận động và hệ số mục tiêu đã duyệt;
  giảm cân khi BMI thấp không được áp dụng. Cả lựa chọn thực đơn và khẩu phần mỗi người điều chỉnh
  theo mục tiêu, trong giới hạn khẩu phần và các ràng buộc dị ứng, thời gian, ngân sách.
- Thực đơn gồm bảy bữa chính, mỗi ngày một bữa; tỷ lệ năng lượng mặc định 33%, điều chỉnh 20–50%.
  Mỗi bữa lưu nhãn thành viên, tỷ lệ chia, mục tiêu và năng lượng thực tế. Hồ sơ thay đổi sau đó
  không tính lại bữa đã lưu; nhãn mặc định vẫn giữ số thứ tự 1/3 sau khi xóa thành viên 2.
- Lượng nấu thực tế làm cơ sở cho dinh dưỡng, chi phí và đi chợ. Trứng 2,4 quả thành 3 quả cho mỗi
  lượt nấu; thực phẩm theo khối lượng/thể tích dùng bước lượng rõ ràng, không suy đoán từ tên món.
- Đi chợ cộng lượng thực tế cả tuần, trừ đồ có sẵn, rồi làm tròn theo điều kiện bán đã xuất bản.
  Có hỗ trợ bán rời theo bước và gói cố định. Màn hình và nội dung chia sẻ dùng cùng lượng mua.
  Dòng đã đủ đồ trong tủ bếp vẫn tồn tại với lượng mua/chi phí bằng 0.
- Chỉ các món đã đánh dấu và thao tác “Đi chợ xong” mới cập nhật tủ bếp, một lần cho từng dòng.
  Trứng dư giữ quy đổi của lần mua: 350 g theo 50 g/quả là 7 quả dù danh mục mới là 60 g/quả.
  Stock nguyên chiếc dùng phiên bản quy đổi khác báo yêu cầu kiểm tra tủ bếp/lập lại kế hoạch.
- Thay đổi hồ sơ hoặc tủ bếp làm thao tác đổi món yêu cầu lập lại thực đơn; không báo thử lại
  vô hạn, không ghi revision mới. Sáu bữa còn lại giữ snapshot và dữ liệu nguồn đã ghim.
- Số đo/BMI/BMR/TDEE và đầu vào cơ thể nằm trong bằng chứng riêng của chủ gia đình. DTO thực đơn,
  trợ lý, cache và lưu trữ thiết bị không nhận các trường này. Phiên bản cũ vẫn có đường đọc/đổi món
  và bằng chứng xác minh riêng.

## Kiểm chứng cuối

Các lệnh dùng Node 24/npm đã kích hoạt trong cloud và Supabase loopback. Không suite nào gọi
production. Tất cả lệnh dưới đây đã kết thúc với exit 0.

| Gate        | Lệnh/kết quả                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web         | `node scripts/local-supabase-env.mjs -- npm run verify:web`: format/lint/typecheck/coverage/build/bundle, 193 file / 1.760 test PASS, audit 0 vulnerability |
| Coverage    | Statements 82,46%; branches 74,48%; functions 86,32%; lines 85,40%                                                                                          |
| Bundle      | 652.098 / 660.000 byte, giữ ngưỡng cũ                                                                                                                       |
| Performance | `npm run test:performance:planner`: 6/6 PASS; v2 max 2.058/2.046 ms, ngưỡng CI 5.000 ms; không phải p95 production                                          |
| SQL         | Reset local → `npm run supabase:lint` → `npm run supabase:test`: 28 file / 516 test PASS                                                                    |
| Types       | `env -u SUPABASE_CLI_BINARY_OVERRIDE npm run db:types:check`: PASS với CLI pinned 2.115                                                                     |
| Integration | `test:integration` 10; `catalog-admin` 1; `planner` 3; `assistant` 5; `shopping` 2; `pantry` 2; reset rồi `catalog-readiness` 3: tổng 26 test / 9 file PASS |
| Browser     | Chromium hệ thống, viewport mobile; 22 luồng chính + 1 trợ lý = 23/23 PASS                                                                                  |
| Catalog     | Sheet import → validate → audit: exit 0, `NO_BLOCKING_FINDINGS`; 45 food, 37 recipe, 48 meal-option, 7 protein-group; manifest 22 entry khớp hash/bytes     |
| Scope       | `git diff --check` PASS; checkout `nupsbox` sạch; không PR/merge/production                                                                                 |
| Dev API     | `/api/health` trả 200 `ok`; `/api/me` không đăng nhập trả 401                                                                                               |

Browser dùng
`node scripts/local-supabase-admin-env.mjs -- npx playwright test --config /workspace/.cloud-onboarding/playwright-bepnha.config.ts`
với smoke, household-onboarding, planner, shopping-list, pantry, accessibility-mobile rồi assistant.
Auth và household save/reload đi qua Supabase thật; planner/shop/pantry/assistant browser payload là
fixture. Các server/domain/SQL integration thật kiểm chứng lượng, giá, snapshot, owner isolation và
settlement, không suy ra những bằng chứng này chỉ từ mock UI.

## Rà soát và sửa lỗi

Một reviewer độc lập đọc toàn bộ nhánh từ `301f457` tới `37f8ea1` cùng thay đổi Task 11.
[Bản nhận xét gốc](../superpowers/reviews/2026-10-02-household-nutrition-practical-purchasing.md)
ghi ba lỗi Important, không có Critical. Cả ba được xác nhận theo tác động thực tế và sửa trong
một lượt, dùng kiểm thử RED → GREEN, không gọi reviewer lần hai:

1. **Dư thực phẩm bị đổi quy đổi theo catalog mới:** kiểm thử tích hợp thật thất bại với trứng
   50 → 60 g/quả; sửa để stock mới dùng fact đã ghim trong lần mua. Kiểm thử giữ 350 g = 7 quả,
   thêm một món đã mua khác, rollback khi stock không tương thích và không cộng trùng khi bấm lại.
2. **Đồ tủ bếp đã xóa/đổi fact báo lỗi dependency:** bốn assertion preview/apply tái hiện lỗi;
   so sánh snapshot tủ bếp trước khi nạp các policy cũ để trả đúng mã yêu cầu lập lại kế hoạch.
   Giữ nguyên xác minh lineage và chứng minh không có revision mới.
3. **Thành viên chưa đặt tên có khẩu phần không phân biệt được:** kiểm thử domain/component
   thất bại với nhãn trống; lưu nhãn mặc định theo loại thành viên và thứ tự ổn định. Có xác minh
   tên cụ thể, người lớn 1/3, người cao tuổi, trẻ em, mục tiêu khác nhau và đọc lại sau đổi tên.

## Các quyết định đã thực hiện (Rulings)

Danh sách dưới đây bao gồm toàn bộ quyết định trong ledger, theo thứ tự thực hiện. Những quyết định
về dữ liệu nguồn và production có giới hạn nêu rõ, không đại diện cho quan sát mới ngoài môi trường local.

| Quyết định                                                                                         | Lý do                                                                                    | Chi phí/rủi ro nếu sai                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dùng brief/ledger/log thủ công khi resource `sdd-workspace` và tài liệu test phụ không đọc được    | Không giả lập script skill; vẫn lưu BASE và bằng chứng RED/GREEN                         | Khó tiếp tục nếu mất bản ghi; đã lưu handoff và lịch sử git                         |
| Giữ checkout và nhánh cloud có sẵn                                                                 | Kế hoạch đã duyệt sử dụng nhánh riêng này                                                | Cần chú ý thay đổi ngoài phạm vi; đã kiểm tra status và giữ `nupsbox` sạch          |
| Thêm đúng RPC save tám tham số vào allowlist bảo mật                                               | Transaction lưu profile đã được duyệt, vẫn chặn anonymous và giữ search path rỗng        | Allowlist sai có thể bỏ sót quyền; kiểm thử RLS/RPC vẫn strict                      |
| Reset local rồi chạy SQL trước integration                                                         | Fixture dị ứng cũ giả định một household toàn DB                                         | Test có thể nhiễu nếu đảo thứ tự; không dùng reset trên production                  |
| Cập nhật schema expectation theo từng migration hợp lệ                                             | Guard chống schema ngoài ý muốn cần biết số bảng/function mới; cuối cùng là 27/46/33     | Con số thủ công cần cập nhật ở các release sau                                      |
| Kiểm tra emitted JS với tùy chọn rewrite của Vercel builder thực tế                                | Builder Node 14 chuyển import `.ts` sang `.js`; native CLI cũng cần import đúng          | Runtime khác builder cần kiểm tra lại; có regression closure                        |
| Đặt contract v2 cạnh legacy và chia sẻ search qua callback có kiểu                                 | Giữ kiểu và hash legacy; dùng cache penalty năng lượng chính xác để đạt giới hạn 5 s     | Phải duy trì hai contract; golden và sáu benchmark bảo vệ                           |
| Lưu purchase contract JSONB với cột generated, policy/source pin; tăng precision AE/scale lên 18   | Bán rời không cần cột gói giả; SQL có thể replay lượng/tiền chính xác                    | Hợp đồng JSON phức tạp hơn; các guard phải tiếp tục đồng bộ                         |
| Cho phép transferred surplus = 0 trong bằng chứng tiêu thụ                                         | Đồ đã có trong tủ vẫn cần trừ khi xác nhận, chốt từng dòng giữ nguyên                    | Nếu guard sai có thể tiêu thụ trùng; test zero-buy và retry đã chạy                 |
| Adapter giá legacy giữ gói cố định với fingerprint giống nhau trong Node/SQL                       | Giá cũ không có bằng chứng bán rời; không tự tạo sale step                               | Chưa giảm dư của các gói thật; có limitation công khai                              |
| Đọc đúng revision ID cho retry tạo thực đơn                                                        | Trả kế hoạch đã lưu, không nạp/tính lại thông số mới                                     | Tăng một RPC read; owner RLS và retry integration kiểm chứng                        |
| Nạp policy/converter theo fact tủ bếp, dùng decimal text và phân biệt lượng một chiếc với bước nấu | Trứng có thể có base gam; cooking quantum hai chiếc không cấm stock một chiếc            | Converter thiếu phải chặn, chủ gia đình cần sửa dữ liệu/tủ bếp                      |
| Không sửa stock phân số cũ; miễn guard legacy chỉ trong transaction owner/revision đã kiểm chứng   | Không viết lại lịch sử; GUC do caller đặt không đủ quyền bypass                          | Hai ngữ nghĩa cũ/mới tồn tại; trường hợp legacy phải giữ kiểm thử                   |
| Whole-piece fact giá và nguồn nấu phải trùng; không tự quy đổi fact khác                           | Một số gam có thể đại diện số quả khác nhau                                              | Một offer hợp lệ nhưng khác fact sẽ cần compatibility rule được duyệt riêng         |
| Thêm migration thứ năm chỉ đọc quy đổi chiếc từ snapshot đã lưu                                    | UI đi chợ cần biết đơn vị nguyên chiếc mà không tham khảo catalog head                   | Rollout cần đủ năm migration trước bật runtime                                      |
| Deferred parser đi chợ được memoize và retry khi tải chunk lỗi                                     | Giữ first-load budget 660.000 byte, không tăng ngưỡng                                    | Lần mở đi chợ cần tải chunk; có test lỗi/retry                                      |
| Policy chuẩn bị là quyết định biên tập dạng nguyên liệu; giữ toàn bộ scalar khoa học/giá/ngày/URL  | Ghi rõ cắt/chia nguyên liệu, không giả vờ có khảo sát seller mới                         | Seller thật có thể chỉ bán cả con/gói; purchase vẫn theo nguồn cố định              |
| Giữ 45 giá cố định khi chưa có bằng chứng bước bán rời                                             | Kg là đơn vị báo giá, không chứng minh bán rời 50 g                                      | Ví dụ mua đúng 600 g chưa áp dụng cho offer production thiếu nguồn                  |
| Chuẩn hóa LF/BOM của CSV đã sửa và chỉnh số đếm README theo dữ liệu thực                           | Diff strict và manifest cần khớp byte; dữ liệu cũ thực sự là 48 món                      | Công cụ cần hỗ trợ CSV chuẩn; import/audit và scalar comparison đã chạy             |
| Integration readiness đầu tiên tái dùng pipeline đã GREEN, không ghi nhận RED giả                  | RED thuộc overload readiness unit; admin/persistence đã có kiểm chứng trước              | Một số integration test không có RED mới; final review regressions có RED thật      |
| Đổi tuần fixture assistant khi trùng tuần v6; sửa selector share đúng accessible name              | Giữ guard stale và luồng người dùng thực, không nới assertion                            | Fixture phải tiếp tục dùng tuần độc lập                                             |
| Chỉ chặn service worker trong bài probe lỗi HTTP có route Playwright                               | Worker giành request làm probe âm không tới interceptor; test offline/SW vẫn bật         | Probe không kiểm SW; các bài SW riêng vẫn chạy                                      |
| Rà soát retailer/khoa học không được reviewer xác minh lại                                         | Giữ nguyên các nguồn/ngày/allergen/nutrient và cảnh báo, không nhận có nguồn bán rời mới | Nguồn có thể cũ/yếu; queue giữ 45 mục chờ xác minh seller                           |
| Không kết luận deployment/production từ kiểm thử local                                             | Đúng phạm vi và quyền đã duyệt; có staged rollout riêng                                  | Operator bật v6 sớm có thể gặp thiếu schema/policy                                  |
| Không mở rộng base count như dozen trong nâng cấp này                                              | Catalog hỗ trợ đang dùng `item`; reviewer không xác nhận regression trên dữ liệu đó      | Catalog tương lai dùng base count khác cần validation/converter rõ ràng             |
| Giữ contract retry replacement và chốt no-op kế thừa                                               | Retry đã apply có thể báo stale; no-op không làm thay đổi stock vật lý                   | UX retry/no-op có thể gây nhầm, cần quyết định riêng nếu đổi contract               |
| Không suy ra kết quả lâm sàng hoặc đủ dinh dưỡng cả ngày                                           | Chỉ triển khai công thức và phạm vi một bữa chính đã duyệt                               | Người dùng có thể hiểu quá phạm vi; UI ghi phần năng lượng/bữa rõ ràng              |
| Sửa migration draft thứ tư tại chỗ                                                                 | Migration feature chưa phát hành, vẫn giữ rollout năm migration                          | Môi trường tự áp dụng draft phải cập nhật function qua migration được rà soát riêng |
| Lưu nhãn mặc định trong trường `label` đã allowlist                                                | Giữ danh tính 1/3, không nạp profile hiện tại hoặc đánh lại số                           | Câu chữ theo locale được giữ cùng snapshot cũ                                       |
| Bỏ menu merge/PR của skill hoàn tất theo phạm vi push-only đã duyệt                                | AGENTS và kế hoạch chỉ cho phép push nhánh, không PR/main/deploy                         | Production vẫn chờ release được duyệt riêng                                         |
| Lưu nhận xét/đủ quyết định vào git trước dọn workspace scratch                                     | Git giữ test, kết quả và bàn giao; không để bản ghi quyết định chỉ ở `/tmp`              | Log thô không còn sau cleanup; cần rerun nếu cần chi tiết mới                       |

## Điểm nhỏ được hoãn (Deferred minors)

- Hướng dẫn `INCOMPLETE_PROFILE` hiện liệt kê các trường có thể thiếu, chưa chỉ đích danh từng trường
  đang trống. Không ảnh hưởng lưu hồ sơ hay công thức; có thể cải thiện UX trong hạng mục sau.

## Điều kiện trước production

[Rollout](household-nutrition-rollout.md) yêu cầu schema/admin release tương thích legacy, năm
migration và xuất bản policy/fact/recipe phù hợp trước bật planner v6. Không có fallback ghi v6
vào schema cũ hoặc bỏ trường cơ thể. Mỗi thao tác production phải có quyền riêng theo AGENTS.

45 báo giá staging vẫn là gói cố định theo bằng chứng cũ; hộp 10 trứng, đậu hũ 220 g và thịt xay 200 g
được giữ. Có 102 cảnh báo nguồn dinh dưỡng thứ cấp và một chênh Atwater của muối, không thay đổi dữ
liệu để che cảnh báo. [Rà soát mua hàng](../catalog/staging/PURCHASING_REVIEW.md) ghi đủ 45 món và
việc cần lấy nguồn bán rời. Fixture 600 g cá/bước 50 g và trứng 50/60 g là dữ liệu kiểm thử local,
không phải quan sát nhà bán hàng hoặc quy đổi production mới.
