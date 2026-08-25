import { Button } from "@/app/components/ui/button"

export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Bếp Nhà</h1>
      <p>Lập kế hoạch bữa ăn hằng tuần cho gia đình.</p>
      <Button disabled>Bắt đầu ở Giai đoạn 1</Button>
    </main>
  )
}
