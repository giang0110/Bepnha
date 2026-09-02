import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"

interface Props {
  readonly householdRepository: HouseholdRepository
  readonly pantryRepository: PantryRepository
  readonly foodOptionsRepository: PantryFoodOptionsRepository
}

export function PantryPage(_props: Props) {
  return <p role="status">Đang tải tủ bếp…</p>
}
