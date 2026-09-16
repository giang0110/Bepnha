/**
 * Operator identity shown on the legal pages.
 *
 * These are the only facts on those pages that the codebase cannot derive from the schema, and a
 * privacy notice without a reachable controller is not a privacy notice. `docs/operations/
 * production-readiness.md` records replacing the placeholder as a launch blocker. The placeholder
 * deliberately uses the reserved `.invalid` TLD (RFC 2606) so it can never silently ship as an
 * address that quietly delivers somewhere wrong — mail to it is guaranteed to bounce.
 */
export const LEGAL_OPERATOR = {
  name: "Bếp Nhà",
  contactEmail: "CHUA-CAU-HINH@bepnha.invalid"
} as const

/** Bumped whenever the substance of either notice changes, not on wording tweaks. */
export const LEGAL_LAST_UPDATED = "2026-09-16"

export interface LegalSection {
  readonly heading: string
  readonly paragraphs?: readonly string[]
  readonly items?: readonly string[]
}

/**
 * The collection inventory below is derived from the actual schema and the module boundaries, not
 * from a template. If a migration starts storing something new, this list is wrong until updated.
 */
export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    heading: "Dữ liệu chúng tôi lưu",
    paragraphs: ["Bếp Nhà chỉ lưu những gì cần để lập kế hoạch bữa ăn cho hộ gia đình của bạn:"],
    items: [
      "Tài khoản: địa chỉ email và mật khẩu đã được băm, do Supabase Auth quản lý.",
      "Hộ gia đình: số người theo từng nhóm tuổi, múi giờ, ngân sách tuần và thời gian nấu tối đa.",
      "Quy tắc ăn uống: dị ứng, loại trừ và sở thích — tất cả chọn từ danh sách cố định.",
      "Tủ bếp: số lượng thực phẩm bạn đang có.",
      "Kế hoạch bữa ăn, danh sách đi chợ và trạng thái đã mua của từng món."
    ]
  },
  {
    heading: "Dữ liệu chúng tôi không thu thập",
    paragraphs: [
      "Đây là giới hạn của chính phần mềm, không phải lời hứa suông: cơ sở dữ liệu không có chỗ để lưu những thông tin dưới đây."
    ],
    items: [
      "Họ tên, ngày sinh, giới tính hay cân nặng của bất kỳ thành viên nào.",
      "Chẩn đoán y tế, chỉ số sức khoẻ hay bất kỳ dữ liệu sức khoẻ nào.",
      "Quy tắc ăn uống dạng văn bản tự do.",
      "Trẻ em không có tài khoản riêng. Trẻ chỉ được ghi nhận là một con số trong nhóm tuổi."
    ]
  },
  {
    heading: "Bên thứ ba",
    items: [
      "Supabase — lưu trữ cơ sở dữ liệu và xác thực đăng nhập.",
      "Vercel — lưu trữ và phục vụ ứng dụng.",
      "Google Gemini — chỉ dùng cho trợ lý tư vấn không bắt buộc, và chỉ khi tính năng này được bật."
    ],
    paragraphs: [
      "Khi trợ lý được bật, nhà cung cấp mô hình chỉ nhận phần dữ liệu kế hoạch tối thiểu đã được lọc. Họ không nhận mã đăng nhập, không nhận định danh người dùng, hộ gia đình, kế hoạch hay phiên bản kế hoạch, không nhận dữ liệu tủ bếp và không nhận dữ liệu tính toán thô. Trợ lý không bao giờ tự thay đổi kế hoạch của bạn."
    ]
  },
  {
    heading: "Nhật ký vận hành",
    paragraphs: [
      "Chúng tôi ghi lại mã tương quan, tên thao tác, kết quả, thời lượng làm tròn và mã trạng thái HTTP để phát hiện sự cố. Nhật ký không chứa câu hỏi bạn gửi cho trợ lý, không chứa mã đăng nhập, không chứa nội dung hộ gia đình và không chứa nội dung yêu cầu hay phản hồi."
    ]
  },
  {
    heading: "Quyền của bạn",
    items: [
      "Xem và sửa thông tin hộ gia đình bất cứ lúc nào trong phần cài đặt.",
      "Đặt lại mật khẩu qua email đăng nhập.",
      "Yêu cầu xoá tài khoản. Khi tài khoản bị xoá, hộ gia đình, kế hoạch, tủ bếp và danh sách đi chợ thuộc về tài khoản đó cũng bị xoá theo."
    ]
  },
  {
    heading: "Liên hệ",
    paragraphs: [`Mọi câu hỏi về dữ liệu cá nhân, vui lòng liên hệ ${LEGAL_OPERATOR.contactEmail}.`]
  }
]

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    heading: "Dịch vụ này là gì",
    paragraphs: [
      "Bếp Nhà giúp bạn lập kế hoạch bảy bữa chính trong tuần cho hộ gia đình, kèm ước tính chi phí và danh sách đi chợ. Mọi tính toán về khẩu phần, dinh dưỡng, giá và số lượng đều do phần mềm thực hiện theo quy tắc cố định."
    ]
  },
  {
    heading: "Đây không phải tư vấn y tế hay dinh dưỡng",
    paragraphs: [
      "Bếp Nhà không đưa ra tư vấn y tế, chẩn đoán hay phác đồ dinh dưỡng điều trị. Nếu bạn hoặc người trong nhà có bệnh lý, đang mang thai, hoặc cần chế độ ăn đặc biệt, hãy hỏi ý kiến nhân viên y tế có chuyên môn."
    ]
  },
  {
    heading: "Về dị ứng thực phẩm",
    paragraphs: [
      "Bạn có thể khai báo dị ứng và món cần loại trừ. Phần mềm sẽ loại các món ăn không phù hợp dựa trên dữ liệu nguyên liệu mà chúng tôi có. Khi dữ liệu về một nguyên liệu không đầy đủ, món đó bị loại bỏ thay vì được đoán là an toàn.",
      "Dù vậy, Bếp Nhà không thể bảo đảm an toàn dị ứng. Chúng tôi không kiểm soát nguyên liệu bạn mua, cách chế biến tại nhà hay nguy cơ nhiễm chéo. Người bị dị ứng nghiêm trọng phải tự kiểm tra nhãn và thành phần thực tế."
    ]
  },
  {
    heading: "Ước tính chi phí",
    paragraphs: [
      "Số tiền hiển thị là ước tính dựa trên dữ liệu giá đã lưu, tính theo quy cách đóng gói thực tế. Giá thị trường thay đổi liên tục, nên số tiền bạn chi thực tế có thể khác. Ngân sách tuần chỉ áp dụng cho bảy bữa chính đã lên kế hoạch, không bao gồm bữa sáng, đồ ăn vặt, đồ uống hay hàng bổ sung cho tủ bếp."
    ]
  },
  {
    heading: "Tài khoản của bạn",
    items: [
      "Mỗi tài khoản quản lý một hộ gia đình.",
      "Bạn chịu trách nhiệm giữ bí mật mật khẩu của mình.",
      "Bạn có thể yêu cầu xoá tài khoản bất cứ lúc nào. Việc xoá không thể hoàn tác."
    ]
  },
  {
    heading: "Liên hệ",
    paragraphs: [`Mọi thắc mắc về điều khoản, vui lòng liên hệ ${LEGAL_OPERATOR.contactEmail}.`]
  }
]
