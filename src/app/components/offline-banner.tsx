import { useOnline } from "@/app/pwa/use-online"

/**
 * Says the network is gone, once, for the whole app.
 *
 * Without it the pages fail in their own words — "không thể xử lý kế hoạch lúc này" — which sounds
 * like the app is broken when what happened is that the market has no signal. It says what still
 * works, because the honest answer is "some of it": the plan you already opened is cached, the
 * shopping list is not, and nothing can be saved until the signal comes back.
 */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null

  return (
    <div
      className="border-b border-broth-200 bg-broth-50 px-4 py-2 text-center text-sm font-semibold text-broth-900"
      data-print="hide"
      role="status"
    >
      Đang offline — xem được kế hoạch đã tải, chưa lưu được thay đổi.
    </div>
  )
}
