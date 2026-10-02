# Household Nutrition and Practical Purchasing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung hồ sơ/BMI và mục tiêu từng người lớn, điều chỉnh thực đơn/khẩu phần, rồi tính nguyên liệu và lượng mua theo đơn vị có thể dùng thực tế.

**Architecture:** Mở rộng domain xác định hiện có bằng hợp đồng có phiên bản cho mục tiêu năng lượng, lượng nấu và quy cách mua. Luồng v6 dùng cùng lượng thực tế cho dinh dưỡng, chi phí, kho và shopping; luồng lịch sử v1–v5 giữ nguyên. Lưu gia đình trong transaction có version và quyền chủ hộ; giao diện dùng kết quả domain, không tính lại một bộ số khác.

**Tech Stack:** TypeScript strict, React/Vite, decimal.js, Supabase/PostgreSQL migrations/RLS/pgTAP, Vitest, Playwright; không thêm dependency.

**Spec:** [2026-10-02-household-nutrition-practical-purchasing-design.md](../specs/2026-10-02-household-nutrition-practical-purchasing-design.md), người dùng đã duyệt ngày 2026-10-02. Đây là kế hoạch để duyệt; các checkbox chưa được thực hiện.

## Global Constraints

- Tổng số thành viên vẫn nằm trong giới hạn 1–20 hiện tại.
- Chiều cao: cm, tối đa 2 chữ số thập phân, 100–250; cân nặng: kg, tối đa 2 chữ số thập phân, 25–350; tuổi: số nguyên 18–100.
- Giới tính dùng cho công thức: `male`, `female` hoặc chưa cung cấp; không chọn giới tính hoặc vận động mặc định thay người dùng.
- Mục tiêu: `maintain`, `gain`, `lose`; mặc định giữ cân, không tự suy từ BMI.
- Mifflin–St Jeor: `10 × kg + 6.25 × cm − 5 × tuổi + C`, `C = 5 / −161`; vận động `1.2 / 1.375 / 1.55 / 1.725 / 1.9`; mục tiêu `1 / 1.1 / 0.9` lần TDEE.
- BMI hiển thị 2 chữ số thập phân. BMI dưới 18,5 và chọn giảm cân: lưu lựa chọn, đánh dấu chưa áp dụng, không tự giảm khẩu phần.
- Phần trăm nguyên 20–50%, mặc định **33%**; kế hoạch là 7 bữa chính/tuần, mỗi ngày một bữa, không phải khẩu phần đủ cả ngày.
- Hệ số suất cá nhân giới hạn **0,5–2**; người lớn/cao tuổi thiếu thông tin dùng `1 / 0.85`; trẻ giữ `0.4 / 0.55 / 0.7 / 0.85 / 1`.
- Trứng nguyên quả: bước 1, làm tròn lên từng dòng/từng bữa; khối lượng chia được: 1 g; gia vị: 0,1 g; thể tích: 0,1 ml. Không suy chính sách vật lý từ `displayStep`.
- Cộng lượng nấu thực tế cả tuần → trừ kho → làm tròn lượng mua. Mua lẻ có dữ liệu thì dùng bước cân/đếm; gói cố định vẫn mua nguyên gói.
- Các phiên bản mới: `planner-engine-v6`, `portion-v2`, `energy-target-v1`, `food-quantity-v1`, `purchase-v2`, `shopping-list-v2`; giữ `price-freshness-v1`.
- Mọi phép tính có thẩm quyền dùng `ExactDecimal`; chuỗi canonical tối đa 18 chữ số thập phân, `ROUND_HALF_UP` tại ranh giới hợp đồng dùng chung. Tổng tiền mua bằng tổng tiền dòng theo đồng nguyên an toàn.
- Không LLM cho khẩu phần, dinh dưỡng, giá, lượng mua, eligibility, dị ứng hoặc ngân sách. Thiếu fact/giá/chuyển đổi/policy cần thiết phải báo lỗi, không điền 0.
- Không ghi dữ liệu cơ thể vào localStorage/IndexedDB, telemetry, log lỗi hoặc gửi hồ sơ thô vào Gemini. Hồ sơ/snapshot có dữ liệu này chỉ thuộc quyền chủ hộ.
- Migrations là cách duy nhất đổi schema. Đường đọc thiếu schema có fallback được kiểm tra; đường ghi mới không bỏ trường hoặc dùng RPC cũ để lưu cho thành công.
- Migration chấp nhận engine và shopping v2 phải được áp dụng trên production trước khi merge code bật v6. Kế hoạch này chỉ chạy DB local; chưa cho phép production migration, catalog publication, merge, PR hoặc deploy.
- Tiếp tục nhánh `codex/household-nutrition-practical-purchasing` trong checkout cloud hiện tại, giữ nâng cấp pantry đã có; không tạo worktree khác, không sửa `nupsbox`.

## Review Focus

1. Người Việt nhập `65,50`/`170,5`: nhận đúng số thập phân, không biến thành số hàng nghìn hoặc làm mất dấu; Task 9.
2. Xóa người ở giữa danh sách rồi thêm người mới: ID và thông số của người còn lại giữ đúng, không tái gán theo thứ tự; Tasks 2 và 9.
3. Client gửi UUID hồ sơ thuộc hộ khác hoặc ghi thẳng vào bảng: toàn bộ giao dịch bị từ chối, không di chuyển hồ sơ hoặc vượt kiểm tra version; Task 2.
4. Kho đã đủ toàn bộ một nguyên liệu: dòng nguồn vẫn giải thích lượng dùng và phần trừ kho dù lượng mua/tiền bằng 0; chỉ cập nhật kho khi xác nhận theo luồng hiện có, một lần; Tasks 4 và 7.
5. Catalog thay fact/policy giữa xem và đổi bữa: revision đã pin không được ghép fact mới vào sáu bữa cũ; đổi input phải báo cần tạo lại kế hoạch; Tasks 6 và 8.

## Working conventions

Trước thực hiện, đọc cả spec và AGENTS.md. Dùng TDD cho thay đổi phép tính, lưu bằng chứng RED/GREEN với đúng lý do; mỗi task chỉ commit sau khi các gate của task đạt và `npm run typecheck` không lỗi. Stage đúng các file trong task, không dùng `git add .`. Push nhánh sau khi hoàn tất toàn bộ kiểm thử/review của bản nâng cấp theo AGENTS.md.

Lệnh `npm run test -- <paths>` là Vitest trong repository. Với DB/browser trong cloud, trước tiên chạy `source /workspace/.cloud-onboarding/activate.sh`. Dùng Supabase local của BepNha; generated types phải dùng CLI pin của repository qua `env -u SUPABASE_CLI_BINARY_OVERRIDE npm run db:types:generate` hoặc `db:types:check`. Nếu helper không còn, dùng luồng local tương đương trong package.json và ghi chính xác lý do gate bị chặn, không sửa production để vượt gate.

Các file mới được liệt kê ở task sở hữu chúng; file đã tồn tại thì sửa tại chỗ. Không thực hiện các lệnh kiểm thử/migration trong tài liệu trước khi kế hoạch và cách thực hiện được duyệt.

Các đoạn assertion dưới đây dùng fixture/result được chuẩn bị trong test có tên ở Step 1 của task đó; chỉ pin điều kiện cần chứng minh, không thay việc xây fixture hợp lệ từ các test helpers hiện có.

---

### Task 1: Mô hình thành viên và bộ ước tính năng lượng

**Files:**

- Create: `src/domain/household/member-profile.ts`, `src/domain/household/validate-member-profiles.ts`, `src/domain/nutrition/member-energy-target.ts`.
- Modify: `src/domain/household/household.ts`, `src/domain/household/validate-household-setup.ts`.
- Test: `src/domain/household/validate-member-profiles.test.ts`, `src/domain/nutrition/member-energy-target.test.ts`, `src/domain/household/validate-household-setup.test.ts`.

**Interfaces:**

- `MemberProfileV1`: `id: string` UUID, `memberKind: "adult" | "elderly"`, `sortOrder: number`, `label: string | null`, `heightCm: string | null`, `weightKg: string | null`, `ageYears: number | null`, `sexForEquation: "male" | "female" | null`, `activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active" | null`, `goal: "maintain" | "gain" | "lose"`.
- `HouseholdNutritionSetupV1`: `version: "household-nutrition-v1"`, `memberProfiles: readonly MemberProfileV1[]`, `plannedMealSharePercent: number`. Add optional `nutritionSetup` to `HouseholdSetupInput`; absence preserves legacy shape.
- `validateMemberProfiles(value: unknown, groups: readonly HouseholdMemberGroup[]): MemberProfilesValidationResult`, discriminated `ok/value` or `ok/error` with field path. Reject duplicate IDs/order, wrong adult/elderly totals and fields outside the global constraints; children are not profile rows.
- `calculateBmi(heightCm: string, weightKg: string): BmiResult`, result canonical decimal or validation error.
- `calculateMemberEnergyTarget(profile: MemberProfileV1, plannedMealSharePercent: number): MemberEnergyEstimate`. Applied estimate includes `memberId`, `bmi`, `bmrKcal`, `tdeeKcal`, `dailyTargetKcal`, `mealTargetKcal`; unapplied includes `memberId`, optional BMI and reason `INCOMPLETE_PROFILE`, `UNSUPPORTED_WEIGHT_LOSS` or `INVALID_ENERGY_ESTIMATE`.

- [x] **Step 1: Write failing behavior tests.** Local `baseMember` fixture uses a valid UUID, age 30, height `"170"`, weight `"65"`, male/light/maintain. Pin numeric results below and add female/activity variants, boundary validation, invalid decimals/NaN/infinity/exponent, incomplete fields, BMI below 18.5 with lose, child counts unaffected and legacy input without `nutritionSetup` round-trips without invented fields.

```ts
expect(calculateBmi("170", "65")).toEqual({
  ok: true,
  value: "22.491349480968858131"
})
expect(calculateMemberEnergyTarget(baseMember, 33)).toMatchObject({
  status: "applied",
  bmrKcal: "1567.5",
  tdeeKcal: "2155.3125",
  dailyTargetKcal: "2155.3125",
  mealTargetKcal: "711.253125"
})
expect(calculateMemberEnergyTarget({ ...baseMember, goal: "lose" }, 33)).toMatchObject({
  mealTargetKcal: "640.1278125"
})
expect(calculateMemberEnergyTarget({ ...baseMember, goal: "gain" }, 33)).toMatchObject({
  mealTargetKcal: "782.3784375"
})
```

- [x] **Step 2: Run RED.** `npm run test -- src/domain/household/validate-member-profiles.test.ts src/domain/nutrition/member-energy-target.test.ts src/domain/household/validate-household-setup.test.ts`; new behavior must fail before implementation.
- [x] **Step 3: Implement the three new interfaces/modules and extend household validation.** Validate raw values before canonicalizing; allow null fields and partial profiles. One canonical-decimal boundary is shared by targets and later v2 scaling; do not round kcal to integers in domain.
- [x] **Step 4: Run GREEN.** Repeat Step 2, then `npm run typecheck`; all tests pass, exit 0. Existing household/portion tests must still pass.
- [x] **Step 5: Stage the task files and commit.** `git commit -m "feat: add household member energy estimates"`.

### Task 2: Lưu hồ sơ gia đình an toàn và chịu được schema cũ

**Files:**

- Create: `supabase/migrations/20261002010000_household_nutrition_profiles.sql`, `supabase/tests/database/household_nutrition_profiles.test.sql`.
- Modify: `src/application/household/household-repository.ts`, `src/application/household/save-household.ts`, `src/application/household/load-household.ts`, `src/infrastructure/supabase/supabase-household-repository.ts`, `src/infrastructure/supabase/database.types.ts`.
- Test: `src/application/household/save-household.test.ts`, `src/application/household/load-household.test.ts`, `src/infrastructure/supabase/supabase-household-repository.test.ts`, `tests/integration/supabase-household.integration.test.ts`.

**Interfaces:**

- Consumes: `HouseholdNutritionSetupV1`, `validateMemberProfiles`; keep `HouseholdRepository.loadOwn()` and `saveOwn(input, expectedVersion)` signatures.
- `get_household_setup_v2()` returns the own household JSON with existing fields plus `nutritionSetup`, or null; one DB statement/snapshot, no write side effect. Add nullable `nutrition_setup_version` on household: null means legacy, `household-nutrition-v1` means explicitly saved v2 setup, including a child-only household with an empty profile list. `planned_meal_share_percent` defaults to 33 but is returned in `nutritionSetup` only with the marker, so an explicit share setting is never lost when there are no adults.
- `save_household_setup_v2(p_expected_version integer, p_weekly_plan_budget_vnd bigint, p_max_elapsed_minutes integer, p_member_groups jsonb, p_rule_codes text[], p_allergen_strictness jsonb, p_member_profiles jsonb, p_planned_meal_share_percent integer)` returns the same saved-household identity/version shape as the current RPC. Profile JSON keys match `MemberProfileV1`.
- Add save failure `DEPENDENCY_SCHEMA_NOT_READY`; read fallback is restricted to `42703`, `42P01`, `42883` and `PGRST202`. Authentication/network/corrupt-data failures retain their current typed errors.

- [x] **Step 1: Write RED tests.** `saves_profiles_atomically_with_groups_and_version`, `removing_middle_profile_keeps_remaining_ids`, `foreign_profile_id_rolls_back_entire_save`, `direct_profile_write_is_denied`, `stale_save_keeps_all_old_fields`, `legacy_rpc_cannot_drop_existing_profiles`, `child_only_household_keeps_explicit_share_setting`, `read_falls_back_only_for_missing_schema`, `write_missing_rpc_preserves_payload_and_fails`. SQL tests check owner/hộ khác/anon, duplicate ID/order, 1–20 total, null and valid range, no profile cascade when groups are replaced, read-only legacy load and concurrent saves.

```ts
expect(saved).toMatchObject({
  ok: true,
  household: {
    nutritionSetup: { version: "household-nutrition-v1", plannedMealSharePercent: 40 }
  }
})
expect(missingRpcSave).toEqual({ ok: false, reason: "DEPENDENCY_SCHEMA_NOT_READY" })
expect(afterRejectedSave).toEqual(beforeRejectedSave)
```

- [x] **Step 2: Run RED.** Focused household Vitest tests; `supabase test db supabase/tests/database/household_nutrition_profiles.test.sql` on the local stack. Missing expected table/RPC is the initial DB failure, not a green skipped test.
- [x] **Step 3: Implement the migration.** `public.household_member_profiles` references household directly; unique `(household_id, member_kind, sort_order)`, constrained enums/numbers, owner SELECT RLS, no authenticated direct writes. Security-definer save locks the household, checks auth/version/foreign IDs and validates counts before upsert/delete. Set the setup marker/share atomically, even when the profile list is empty. Use fixed search path and qualified names. Both RPCs retain all old rule/allergen fields. Guard the old save RPC whenever the marker is present, not only when profile rows exist.
- [x] **Step 4: Implement repository/use-case mapping.** Try the v2 read, fallback to the existing SELECT only for missing schema; never fallback v2 writes. Parse through domain validation. The saved input maps back to the same IDs, values and new household version; do not log the input as an error cause.
- [x] **Step 5: Apply/check LOCAL schema and generated types.** `npm run supabase:reset`, `npm run supabase:lint`, `npm run supabase:test`; regenerate/check types with the pinned CLI as described above. Run household integration tests using `node scripts/local-supabase-env.mjs -- npx vitest run --config vitest.integration.config.ts tests/integration/supabase-household.integration.test.ts`.
- [x] **Step 6: Run GREEN.** Repeat focused tests and `npm run typecheck`; SQL and integration gates exit 0. Include an older-schema fake response deliberately, since reset alone cannot exercise it.
- [x] **Step 7: Stage the task files and commit.** `git commit -m "feat: persist private household nutrition profiles"`.

### Task 3: Chuẩn hóa lượng nguyên liệu thực tế mà giữ phép tính cũ

**Files:**

- Create: `src/domain/recipe/food-quantity-policy.ts`, `src/domain/recipe/normalize-cooking-quantity.ts`.
- Modify: `src/domain/recipe/scale-recipe.ts`, `src/domain/meal-option/scale-meal-option.ts`.
- Test: `src/domain/recipe/normalize-cooking-quantity.test.ts`, `src/domain/recipe/scale-recipe.test.ts`, `src/domain/meal-option/scale-meal-option.test.ts`.

**Interfaces:**

- `FoodQuantityPolicyV1`: `id` UUID, positive integer `versionNumber`, `version: "food-quantity-v1"`, `foodFactVersionId`, `baseUnitId`, `baseDimension`, `foodForm: "portionable_mass" | "seasoning_mass" | "divisible_volume" | "whole_count" | "whole_piece"`, `stepBaseQuantity`, `rounding: "ceil" | "half_up"`, `provenance`, `contentHash`. Published inputs only; physical step cannot be inferred from display conversion.
- `normalizeCookingQuantity(ingredient: ScaledRecipeIngredient, conversion: FoodFactUnitConversion, policy: FoodQuantityPolicyV1): CookingQuantityResult`. Success returns `actualIngredient` with coherent source/base/gross values, `theoreticalIngredient`, policy ID/hash and adjustment reason; failure identifies missing/mismatched policy or conversion.
- Add `scaleRecipeForAdultEquivalent(recipe: RecipeVersionInput, adultEquivalent: string): ScaleRecipeResult` and `scaleMealOptionForAdultEquivalent(input: MealOptionVersionInput, adultEquivalent: string): ExplicitMealScaleResult`. The latter has the current meal-scale success/failure shape, with source `unitId`, `sourceQuantity` and validated `conversion` on each ingredient. Existing group-based exports become validated wrappers over the same arithmetic, projecting exactly their original v1 fields, so adding v2 source detail does not change old snapshots/hashes.

- [x] **Step 1: Write RED tests.** `whole_egg_2_4_uses_3`, `two_meals_1_2_use_4_total`, `salt_0_3_stays_0_3`, `kg_to_g_preserves_actual_mass`, `small_positive_quantity_uses_policy_minimum`, `unknown_whole_piece_weight_is_rejected`, `wrong_fact_or_base_unit_is_rejected`. Assert source/base/gross recompute consistently, policy hashes remain in output and unknown conversion is not treated as identity. Existing v1 scaling golden results must remain byte-equivalent.

```ts
expect(eggResult).toMatchObject({
  ok: true,
  value: {
    actualIngredient: {
      sourceQuantity: "3",
      baseQuantity: "3",
      grossGrams: "170.1"
    }
  }
}) // theoretical 2.4 items; fixture conversion 56.7 gross grams/item
expect(saltResult).toMatchObject({ ok: true, value: { actualIngredient: { baseQuantity: "0.3" } } })
```

- [x] **Step 2: Run RED.** `npm run test -- src/domain/recipe/normalize-cooking-quantity.test.ts src/domain/recipe/scale-recipe.test.ts src/domain/meal-option/scale-meal-option.test.ts`.
- [x] **Step 3: Implement explicit-AE scaling helpers.** Reuse current recipe/meal validation, component multipliers, canonical order and conversions. The explicit helper retains source/conversion data; the legacy wrapper strips only these newly introduced projection fields before returning the same old shape. Do not fake fractional `memberCount`, alter recipe facts or invoke the display projector for authoritative values.
- [x] **Step 4: Implement quantity normalization.** Apply one policy per existing unique food ingredient of each component/bữa; nearest means `ROUND_HALF_UP`, indivisible means ceil. Recompute source/gross from rounded base using the pinned conversion; record theoretical values for explanation only.
- [x] **Step 5: Run GREEN.** Repeat Step 2 and `npm run typecheck`; v1 and new quantity tests exit 0.
- [x] **Step 6: Stage the task files and commit.** `git commit -m "feat: calculate practical cooking quantities"`.

### Task 4: Hợp đồng mua lẻ/gói và bộ tính giỏ hàng v2

**Files:**

- Create: `src/domain/pricing/purchasing-v2.ts`, `src/domain/pricing/calculate-purchase-basket-v2.ts`.
- Modify: `src/domain/pricing/calculate-recipe-consumption-cost.ts`.
- Test: `src/domain/pricing/calculate-purchase-basket-v2.test.ts`, `src/domain/pricing/calculate-recipe-consumption-cost.test.ts`, `src/domain/pricing/calculate-purchase-basket.test.ts`.

**Interfaces:**

- Consumes: existing `CanonicalFoodRequirement`, `CanonicalFoodDeduction`, `PriceFreshnessConfigV1`; quantities already normalized by Task 3.
- `PurchaseRuleV2 = { mode: "fixed_pack"; packIncrement: string } | { mode: "loose_mass" | "loose_count"; saleStepBaseQuantity: string }`.
- `FoodPriceInputV2`: `version: "purchase-v2"`, existing food/price-book/fact/base-unit IDs and observed date, `baseDimension`, `quoteBaseQuantity`, `quotePriceVnd`, `purchaseRule`, `purchaseProvenance`, `purchaseTermsContentHash`. For fixed packs the quote quantity/price are the actual pack quantity/price; do not infer loose terms from a kg quote.
- `PurchaseBasketLineV2`: food/price-book/price/base-unit IDs (price fact ID is named `priceFoodFactVersionId`, matching existing basket/shopping lines), the quote/rule/provenance above plus `requiredBaseQuantity`, `pantryDeductedBaseQuantity`, `purchaseRequiredBaseQuantity`, `purchaseUnitCount`, `purchaseBaseQuantity`, `leftoverBaseQuantity`, `lineCostVnd`, `freshness`. `purchaseUnitCount` is integer packs for fixed mode, integer sale steps for loose mode; it is never displayed as fractional packs.
- `calculatePurchaseBasketV2(requirements: readonly CanonicalFoodRequirement[], prices: readonly FoodPriceInputV2[], calculationDate: string, freshnessConfig: PriceFreshnessConfigV1, pantryDeductions: readonly CanonicalFoodDeduction[]): PurchaseBasketResultV2`. Success `value` is `PurchaseBasketV2` with lines/warnings/total; errors retain v1 price failures and add `INVALID_PURCHASE_RULE`/`PURCHASE_AMOUNT_OUT_OF_RANGE`.
- Add `calculateRecipeConsumptionCostV2(ingredients: readonly RecipeCostIngredient[], prices: readonly FoodPriceInputV2[], calculationDate: string, freshnessConfig: PriceFreshnessConfigV1): RecipeConsumptionCostResult`, retaining the existing consumption-cost result shape and its rounding rule.

- [ ] **Step 1: Write RED tests.** `loose_fish_600_buys_600`, `loose_fish_620_step_50_buys_650`, `fixed_fish_600_buys_pack_1000`, `loose_eggs_3_differs_from_box_10`, `weekly_aggregation_then_pantry_then_sale_rounding`, `fully_covered_food_has_zero_purchase_and_preserves_deduction`. With fixture 100,000 đ/1,000 g, assert 600 g/60,000 đ/0 dư and 650 g/65,000 đ/30 g dư. With eggs 3 and pantry 2, assert loose buy 1 or box buy 10/dư 9. Add noninteger count/pack steps, wrong dimension, missing/duplicate/conflicting prices, stale/future price, safe-integer overflow and sub-đồng rounding; no invalid input becomes a zero cost. Consumption costs must use 3 eggs, not theoretical 2.4 or purchased box 10.

```ts
expect(looseFishResult).toMatchObject({
  ok: true,
  value: {
    lines: [
      {
        purchaseBaseQuantity: "600",
        leftoverBaseQuantity: "0",
        lineCostVnd: 60_000
      }
    ]
  }
})
expect(coveredResult).toMatchObject({
  ok: true,
  value: {
    lines: [
      {
        requiredBaseQuantity: "600",
        pantryDeductedBaseQuantity: "600",
        purchaseBaseQuantity: "0",
        lineCostVnd: 0
      }
    ]
  }
})
```

- [ ] **Step 2: Run RED.** `npm run test -- src/domain/pricing/calculate-purchase-basket-v2.test.ts src/domain/pricing/calculate-recipe-consumption-cost.test.ts src/domain/pricing/calculate-purchase-basket.test.ts`.
- [ ] **Step 3: Implement typed price normalization and basket v2.** Aggregate actual need, subtract eligible deductions, branch on the declared purchase mode. Keep source lines when `remaining = 0`: purchase count/quantity/cost/leftover are 0 but need and deduction remain; no positive purchase is forced. Use the exact formulas and line/total currency rounding from spec §8. Leave the existing v1 basket untouched.
- [ ] **Step 4: Implement consumption-cost v2 using quote rates.** Price provenance/freshness/base unit are still validated. A shared internal rate-cost helper may serve both exported functions if v1 golden behavior remains unchanged; do not equate used cost with purchased cost.
- [ ] **Step 5: Run GREEN.** Repeat Step 2, then `npm run typecheck`; all exit 0.
- [ ] **Step 6: Stage the task files and commit.** `git commit -m "feat: calculate purchases by weight count or fixed pack"`.

### Task 5: Metadata catalog có phiên bản, nguồn và đường xuất bản được kiểm tra

**Files:**

- Create: `supabase/migrations/20261002020000_food_quantity_and_purchase_terms.sql`, `supabase/tests/database/food_quantity_and_purchase_terms.test.sql`.
- Modify: `src/application/catalog/catalog-admin-command.ts`, `src/application/catalog/catalog-admin-repository.ts`, `src/application/catalog/execute-catalog-admin-command.ts`, `src/infrastructure/server/supabase-catalog-admin-repository.ts`, `api/admin/catalog.ts`, `src/infrastructure/supabase/database.types.ts`.
- Modify: `scripts/catalog-pack/catalog-pack-types.ts`, `scripts/catalog-pack/catalog-pack-schema.ts`, `scripts/catalog-pack/catalog-pack-validator-core.ts`, `scripts/catalog-pack/catalog-sheet-tables.ts`, `scripts/catalog-pack/catalog-production-types.ts`, `scripts/catalog-pack/catalog-production-reader.ts`, `scripts/catalog-pack/supabase-catalog-production-reader.ts`, `scripts/catalog-pack/catalog-production-resolver.ts`, `scripts/catalog-pack/catalog-mutation-types.ts`, `scripts/catalog-pack/catalog-mutation-planner.ts`, `scripts/catalog-pack/catalog-mutation-executor.ts`, `scripts/catalog-pack/catalog-admin-http-gateway.ts`, `scripts/catalog-pack/catalog-audit.ts`.
- Test: `src/application/catalog/execute-catalog-admin-command.test.ts`, `src/infrastructure/server/supabase-catalog-admin-repository.test.ts`, `api/admin/catalog.test.ts`, `scripts/catalog-pack/catalog-pack-validator.test.ts`, `scripts/catalog-pack/catalog-sheet-tables.test.ts`, `scripts/catalog-pack/catalog-production-resolver.test.ts`, `scripts/catalog-pack/catalog-production-reader.test.ts`, `scripts/catalog-pack/catalog-mutation-planner.test.ts`, `scripts/catalog-pack/catalog-mutation-executor.test.ts`, `scripts/catalog-pack/catalog-admin-http-gateway.test.ts`, `scripts/catalog-pack/catalog-audit.test.ts`, `scripts/catalog-pack/catalog-pack-authority-regression.test.ts`, `scripts/catalog-pack/catalog-mutation-authority-regression.test.ts`.

**Interfaces:**

- Consumes: `FoodQuantityPolicyV1`, `PurchaseRuleV2`, `FoodPriceInputV2`.
- Add `CatalogPackV2`, `schemaVersion: "2"`, containing top-level `foodQuantityPolicies` keyed by food code/fact version and a v2 price book with explicit purchasing terms. Preserve v1 parsing/byte hashes; imported v1 packs do not silently become v2.
- `public.food_quantity_policy_versions`: food/fact/base-unit FKs, positive `version_number`, draft/published status, declared form/step/rounding/source, content hash. Published rows are immutable; generation selects highest published version **for the exact fact ID**, and snapshots pin that version. No runtime category heuristic.
- `public.food_price_purchase_terms`: one terms row per price ID, quote semantics inherited from that price, explicit purchase mode/step/pack increment/provenance/hash. Terms may only be authored with a draft price book; cannot attach new terms to a published legacy price/book.
- Admin commands/RPCs: `save_food_quantity_policy_draft`, `publish_food_quantity_policy`, and `save_price_book_draft_v2` for atomic price+terms save. Keep existing catalog role authorization/publication validation. New mutation operation kinds are the two policy commands; price draft/publication remains the existing logical operation with versioned input.

- [ ] **Step 1: Write RED tests.** `v2_sheet_round_trip_keeps_policy_and_sale_terms`, `v1_hashes_do_not_change`, `loose_mode_requires_source_and_matching_dimension`, `whole_piece_without_conversion_is_not_publishable`, `published_policy_and_terms_cannot_be_mutated`, `duplicate_food_price_is_rejected`, `mutation_requires_policy_before_v6_readiness`. Assert a generic fish category or 1 kg price cannot create a loose offer, a box-10 source remains fixed, and admin commands retain authorization. Cover dependency/order bindings and source/hash inclusion through parser → resolver → mutation plan → HTTP gateway.

```ts
expect(importedV2.schemaVersion).toBe("2")
expect(importedV2.foodQuantityPolicies[0].stepBaseQuantity).toBe("1")
expect(importedV2.priceBook.prices[0].purchaseRule.mode).toBe("fixed_pack")
expect(legacyHashAfter).toBe(legacyHashBefore)
```

- [ ] **Step 2: Run RED.** `npm run test -- scripts/catalog-pack src/application/catalog/execute-catalog-admin-command.test.ts src/infrastructure/server/supabase-catalog-admin-repository.test.ts api/admin/catalog.test.ts`, plus the new pgTAP file on local DB.
- [ ] **Step 3: Implement schema/publication and admin contracts.** Published-only catalog reads, admin-only draft writes/publication, qualified RPC names, deterministic hashes. Existing food fact/price-book immutability and nutrition/allergy validators remain active. Price terms absent on old prices preserve legacy fixed-pack semantics; missing cooking policy remains missing and must be diagnosed.
- [ ] **Step 4: Implement v2 pack/sheet/resolver/mutation/audit support.** V2 `pack.csv` declares schema version 2, adds `food_quantity_policies.csv` and explicit price-term columns. Preserve v1 sheet filenames/headers/import defaults exactly; no new CSV is required when importing a v1 bundle. Keep old manifest operations interpretable. Include quantity-policy and v2 price-term fields in publication aggregate validation/hash/RPC; omit them entirely for legacy hashes. Audit reports separately `MISSING_QUANTITY_POLICY`, `PURCHASE_TERMS_UNVERIFIED`, `PURCHASE_DIMENSION_MISMATCH` and inconsistent whole-unit steps. No blank numeric/source cell is defaulted.
- [ ] **Step 5: Run GREEN and LOCAL DB gates.** Repeat Step 2; `npm run supabase:reset`, `npm run supabase:lint`, `npm run supabase:test`; regenerate/check types with the pinned CLI; `npm run typecheck`. All exit 0. Publication exercised here is fixture data in local DB only.
- [ ] **Step 6: Stage the task files and commit.** `git commit -m "feat: version food preparation and purchasing metadata"`.

### Task 6: Planner v2 cá nhân hóa, dinh dưỡng thực tế và lựa chọn thực đơn

**Files:**

- Create: `src/domain/portion/calculate-member-meal-portions.ts`, `src/domain/planner/planner-v2.ts`.
- Modify: `src/domain/portion/portion-config.ts`, `src/domain/planner/planner-input.ts`, `src/domain/planner/normalize-planner-input.ts`, `src/domain/planner/evaluate-eligibility.ts`, `src/domain/planner/planner-config.ts`, `src/domain/planner/score-week.ts`, `src/domain/planner/search-week.ts`, `src/domain/planner/replace-meal.ts`, `src/domain/planner/planner-outcome.ts`, `src/domain/planner/planner-snapshot.ts`.
- Test: `src/domain/portion/calculate-member-meal-portions.test.ts`, `src/domain/planner/normalize-planner-input.test.ts`, `src/domain/planner/evaluate-eligibility.test.ts`, `src/domain/planner/score-week.test.ts`, `src/domain/planner/search-week.test.ts`, `src/domain/planner/replace-meal.test.ts`, `src/domain/planner/planner-snapshot.test.ts`, `src/domain/planner/planner-golden.test.ts`, `src/test/planner-performance-gate.test.ts`.

**Interfaces:**

- Consumes: member estimates (Task 1), explicit-AE scale and actual cooking quantity (Task 3), purchasing v2 (Task 4), published metadata (Task 5).
- `PlannerCandidateInputV2`: existing candidate identity/meal/lineage with `prices: readonly FoodPriceInputV2[]`, `quantityPolicies: readonly FoodQuantityPolicyV1[]`. Policy map uses exact fact/base unit; no guessing from category.
- `PlannerInputV2`: existing household/week/budget/rules/history/ratings/pantry fields, `inputVersion: "planner-input-v2"`, optional `nutritionSetup`, v2 candidates. `NormalizedPlannerInputV2` pins `portion-v2`, `energy-target-v1`, `planner-v2` and all existing limits. Define these types in `planner-v2.ts`; leave the v1 exported types usable unchanged.
- `calculateMemberMealPortions(groups: readonly PortionMemberGroupInput[], nutritionSetup: HouseholdNutritionSetupV1 | undefined, standardServingKcal: string): MemberMealPortionsResult`. Success contains `adultEquivalent` and `portions`: per-person/per-child-group entries with `recipientKey`, optional `memberId`, `memberCount`, `coefficientPerMember`, `totalCoefficient`, `sharePerMember`, nullable `mealTargetKcal`, `energyTargetStatus` and `unappliedReason`. Fallback adults receive snapshot-local keys such as `adult:1`; no fake persistent profile is created. Raw weights/total pin the ratio; canonical share is a projection of them. Eligibility adds `actualMealKcal` to each entry after calculating actual nutrition.
- `EligibleMealOptionV2`: v1 meal identity/roles/time/lineage plus actual scaled ingredients, quantity adjustments, `memberPortions`, nutrition from actual quantities, v2 prices/requirements and target scoring evidence.
- Export new functions `normalizePlannerInputV2(input: PlannerInputV2): NormalizePlannerInputResultV2`, `evaluatePlannerEligibilityV2(input: NormalizedPlannerInputV2): EligibilityResultV2`, `scoreWeeklyPlanV2(selected: readonly EligibleMealOptionV2[], basket: PurchaseBasketV2, input: NormalizedPlannerInputV2): WeeklyPlanScoreV2`, `searchWeekV2(input: NormalizedPlannerInputV2, eligible: readonly EligibleMealOptionV2[]): PlannerSearchResultV2`, `previewMealReplacementV2(input: NormalizedPlannerInputV2, currentPlan: ReadyPlanV2, dayIndex: number): MealReplacementPreviewResultV2`.
- `ReadyPlanV2` retains v1 item identities/order/scale fields and frontier metrics, with v2 snapshots/basket/score. New result unions use existing ready-within/ready-over/failure shapes. `WeeklyPlanScoreV2` adds `energyGoalFit` and explanations; `planner-v2` copies v1 limits/weights and adds goal weight 2000. Reuse existing bounded-search internals through typed callbacks so v1 wrappers preserve exact order/results; do not copy a second beam-search algorithm.

- [ ] **Step 1: Write RED tests.** `mixed_goals_change_member_weights_and_actual_quantities`, `changing_goal_reorders_eligible_meal_fixture`, `partial_profiles_keep_age_coefficients_with_reason`, `children_are_counted_per_child`, `clamp_0_5_and_2_exposes_target_deviation`, `nutrition_uses_three_actual_eggs`, `missing_energy_or_policy_cannot_pass`, `hard_allergy_and_purchase_budget_win_over_goal`, `replacement_keeps_six_actual_snapshots`, `published_fact_drift_cannot_change_pinned_days`. Two meal fixtures with different energy per standard serving and otherwise equal score must demonstrate menu selection changing with goals. Add tests that profile/policy/terms changes alter hashes and input array order does not; old golden hashes stay fixed.

```ts
expect(lowTargetPortions.value.portions[0].coefficientPerMember).toBe("0.5")
expect(highTargetPortions.value.portions[0].coefficientPerMember).toBe("2")
expect(goalRankingForGain[0].mealOptionId).not.toBe(goalRankingForLose[0].mealOptionId)
expect(replacedPlan.items.filter((item) => item.dayIndex !== targetDayIndex)).toEqual(
  originalPlan.items.filter((item) => item.dayIndex !== targetDayIndex)
)
```

- [ ] **Step 2: Run RED.** `npm run test -- src/domain/portion src/domain/planner`; record failures in the new assertions, not a broad unrelated fixture failure.
- [ ] **Step 3: Implement portions and v2 normalization.** Member estimates map to target/standard-kcal, clamp 0.5–2; fallback coefficients are explicit. Multiply child coefficient by count for the total while keeping per-child share. Use coefficient/total to estimate allocation; canonicalization is shared, and presentation percentages do not feed back into domain. Reject incomplete catalog inputs and unsupported input versions; profile omission is allowed as legacy household input.
- [ ] **Step 4: Implement v2 eligibility and scoring.** Apply the same hard-rule/allergy/time checks as v1, compute one standard adult serving before cooking quantization, scale by total weight, normalize each ingredient, then recompute nutrients/cost/requirements. `energyGoalFit = ROUND_HALF_UP(2000 × mean(0.75 × cappedRelativeKcalError + 0.25 × cappedAbsCoefficientMinus1))` for applied member/bữa pairs; none applied means term 0 with an explicit reason. Include actual kcal per member in output. Never compare budget against used cost.
- [ ] **Step 5: Implement v2 search/replacement/snapshots.** Reuse deterministic frontier sizes 250/125/125 and candidate limit 500, pantry/recent-history/rating behavior, stable ties and hard weekly rules. Basket v2 is used at partial/completed search states, not just final presentation. Replacement keeps six frozen snapshots and recalculates aggregate shopping; add typed error for incompatible pinned inputs. Snapshot manifests include policy/terms IDs and hashes, estimates and quantity adjustment evidence. This task does not yet switch the app-wide engine constant.
- [ ] **Step 6: Run GREEN.** Repeat Step 2; `npm run typecheck`; `npm run test:performance:planner` with v1/v2 fixtures in the existing gate, retaining its SLO rather than raising the threshold. All exit 0; capture the v1 golden comparison.
- [ ] **Step 7: Stage the task files and commit.** `git commit -m "feat: personalize meal selection and portions"`.

### Task 7: Shopping v2, SQL engine guards và kiểm tra lượng nấu/mua

**Files:**

- Create: `supabase/migrations/20261002030000_planner_v6_shopping_v2.sql`, `supabase/tests/database/planner_v6_shopping_v2.test.sql`.
- Modify: `src/domain/shopping/shopping-list.ts`, `src/domain/shopping/build-shopping-list-snapshot.ts`, `src/domain/shopping/pantry-restock.ts`, `src/application/shopping/shopping-list-repository.ts`, `src/infrastructure/supabase/supabase-shopping-list-repository.ts`, `src/infrastructure/supabase/database.types.ts`.
- Test: `src/domain/shopping/build-shopping-list-snapshot.test.ts`, `src/domain/shopping/pantry-restock.test.ts`, `src/infrastructure/supabase/supabase-shopping-list-repository.test.ts`, `tests/integration/shopping-list.integration.test.ts`, `supabase/tests/database/phase_4_shopping_integrity.test.sql`, `supabase/tests/database/phase_9_shopping_pantry_restock.test.sql`, `supabase/tests/database/phase_10_pantry_consume.test.sql`.

**Interfaces:**

- Consumes: `NormalizedPlannerInputV2`, `ReadyPlanV2`, `PurchaseBasketLineV2` and policy lineage.
- Add `ShoppingListSnapshotV2`, `version: "shopping-list-v2"`, with v2 basket lines plus grocery category, fact/policy refs and actual-quantity sources. `buildShoppingListSnapshotV2(input: NormalizedPlannerInputV2, plan: ReadyPlanV2): BuildShoppingListSnapshotResultV2`; old builder/result stay unchanged.
- Add `ShoppingListItemV2`, `ReadyShoppingListV2`, `VersionedShoppingListRepository` (same `load`, `setChecked`, `applyToPantry` commands, v1/v2 read union) and versioned Supabase/browser factories beside the existing v1 factories. V2 responses carry `snapshotVersion: "shopping-list-v2"`; a missing tag uses the old parser, not v2 assumptions. Existing v1 ports remain narrow until Task 10 wires the versioned port. The v2 reader validates declared mode and all amount/currency/source invariants; no fake fixed-pack fields on loose items.
- Factory names: `createSupabaseVersionedShoppingListRepository(client: SupabaseClient<Database>): VersionedShoppingListRepository`, `createBrowserVersionedShoppingListRepository(client: SupabaseClient<Database>, fetcher?: ShoppingFetcher): VersionedShoppingListRepository`; share existing mutation implementations.
- Persistence/get-shopping RPC signatures remain unchanged and dispatch by snapshot version/engine. New DB columns are mode/quote/terms/purchase-unit metadata; old package columns may be null only in a fully constrained v2 loose branch. V1 and v2-fixed require their proper integer-pack semantics. Row generation retains need/stock sources even for zero-purchase items.

- [ ] **Step 1: Write RED tests.** `shopping_sources_sum_actual_ingredients`, `loose_projection_has_no_fractional_pack`, `covered_stock_row_costs_zero_and_consumes_once_on_confirmation`, `v1_snapshot_reads_unchanged`, `tampered_price_cost_leftover_or_policy_is_rejected`, `v6_with_v1_contract_is_rejected`, `wrong_household_cannot_read_or_confirm`. For pgTAP, persist a complete 7-day v6 fixture with 600 g loose fish and actual integer eggs; falsify each amount, currency rounding, source, policy hash, price linkage or count in separate rejection cases. Include current pantry-restock transfer/idempotency/stale revision behavior and no auto-transfer during generation/read.

```ts
expect(shoppingProjection).toMatchObject({ ok: true, value: { version: "shopping-list-v2" } })
expect(projectedEggSource.requiredBaseQuantity).toBe("3")
expect(repeatedTransfer.transferredLineCount).toBe(0)
expect(pantryAfterReadOnlyLoad).toEqual(pantryBeforeReadOnlyLoad)
```

- [ ] **Step 2: Run RED.** Focused shopping Vitest tests and `supabase test db supabase/tests/database/planner_v6_shopping_v2.test.sql` on local DB.
- [ ] **Step 3: Implement projection/parser contracts.** Aggregate actual ingredients, not theoretical source quantities. Verify need = deducted + remaining and purchase − remaining = leftover; verify line/total currency and mode-specific quantum. Keep canonical sorting, fact/price FKs, source lineage and existing category warnings. Parse v1 using its old rules; parse v2 only after checking its explicit version.
- [ ] **Step 4: Implement the migration before any runtime v6 activation.** Extend all three SQL functions named in spec §9, insert/read RPCs and snapshot-version constraints. Validate v6 ingredients against pinned recipe theoretical scale and quantity policy rounding, and shopping sources against those actual quantities. Validate quote provenance/terms against immutable published rows. Preserve trusted transitions, old engine guards and owner RLS; do not bypass checks by merely allowing an engine string. `apply_shopping_to_pantry` continues using physical leftover/deducted amounts with per-item latch and only checked items.
- [ ] **Step 5: Run LOCAL schema/integration GREEN.** `npm run supabase:reset`, `npm run supabase:lint`, `npm run supabase:test`; regenerate/check types with pinned CLI. `node scripts/local-supabase-admin-env.mjs -- npx vitest run --config vitest.integration.config.ts tests/integration/shopping-list.integration.test.ts`. Repeat focused unit tests and `npm run typecheck`; all exit 0, including old revision constraints.
- [ ] **Step 6: Stage the task files and commit.** `git commit -m "feat: validate planner v6 purchases and shopping snapshots"`.

### Task 8: Kết nối server/use cases v6, kho nguyên đơn vị và luồng lịch sử

**Files:**

- Create: `src/application/planner/planner-nutrition-use-cases.ts`, `src/application/planner/planner-versioned-repository.ts`, `src/infrastructure/server/load-food-quantity-policies.ts`, `supabase/migrations/20261002040000_planner_nutrition_input_and_pantry_units.sql`, `supabase/tests/database/planner_nutrition_input_and_pantry_units.test.sql`.
- Modify: `src/application/planner/planner-use-cases.ts`, `src/application/planner/plan-trust.ts`, `src/domain/planner/planner-engine-version.ts`, `src/infrastructure/server/supabase-planner-input-loader.ts`, `src/infrastructure/server/supabase-planner-repository.ts`, `src/infrastructure/server/load-pantry-snapshot.ts`, `src/infrastructure/server/supabase-assistant-context-repository.ts`, `src/infrastructure/supabase/supabase-pantry-repository.ts`, `src/infrastructure/supabase/database.types.ts`.
- Test: `src/application/planner/planner-nutrition-use-cases.test.ts`, `src/application/planner/planner-use-cases.test.ts`, `src/application/planner/plan-trust.test.ts`, `src/infrastructure/server/supabase-planner-input-loader.test.ts`, `src/infrastructure/server/supabase-planner-input-loader.price-filter.test.ts`, `src/infrastructure/server/supabase-planner-input-loader.concurrency.test.ts`, `src/infrastructure/server/supabase-planner-repository.test.ts`, `src/infrastructure/server/supabase-assistant-context-repository.test.ts`, `src/infrastructure/server/load-food-quantity-policies.test.ts`, `src/infrastructure/supabase/supabase-pantry-repository.test.ts`, `tests/integration/planner-api.integration.test.ts`, `tests/integration/pantry.integration.test.ts`.

**Interfaces:**

- Consumes: normalized v2 planner, shopping v2 and household snapshot. `PlannerRepositoryV2` mirrors existing load/persist ports with typed v2 generation, v1/v2 revision reads and `PersistPlannerRevisionCommandV2`. New persistence command pins engine/portion/planner/shopping v6/v2 and otherwise keeps the existing ownership, idempotency, expected versions and revision fields.
- `createVersionedPlannerUseCases(dependencies: { legacyRepository: PlannerRepository; repository: PlannerRepositoryV2; hasher: ContentHasher }): VersionedPlannerUseCases`, in `planner-nutrition-use-cases.ts`. Produces `generate`, `preview`, `apply`, `current` methods with the same command parameters as existing use cases, versioned result unions. Generation uses v6; legacy replacement delegates to preserved v5 logic; v6 replacement uses pinned nutrition and current version checks. `current` reads either snapshot without recalculating.
- Export `createSupabasePlannerRepositoryV2` and v2 hydrate methods beside existing factories; do not switch runtime composition until Task 10. `LEGACY_PLANNER_ENGINE_VERSION = "planner-engine-v5"` freezes existing application use cases. Add v6 to persisted-version union now; set the default `PLANNER_ENGINE_VERSION` to v6 only in Task 10.
- `loadFoodQuantityPolicies(client: SupabaseClient<Database>, factVersionIds: readonly string[], pinnedPolicyIds?: readonly string[]): Promise<readonly FoodQuantityPolicyV1[]>` fetches in batches, validates identities/hashes and honors exact historical pins. Missing publication remains missing, not an inferred policy.
- `get_planner_generation_input` includes `nutritionSetup` in the same SQL household snapshot. Published price reads expose terms when present; legacy rows convert explicitly to fixed-pack v2 rates with a deterministic legacy-contract fingerprint. Missing new schema on a read is “not stated”; new generation/persistence without necessary v6 schema reports `DEPENDENCY_SCHEMA_NOT_READY`, never writes a v5 replacement as a fallback.
- Whole-count pantry writes validate converted base quantity against published policy; a legacy fractional row still reads unchanged, but v6 normalization returns `INVALID_INDIVISIBLE_PANTRY_QUANTITY` for correction. No silent floor/ceil and no fake beaten-egg fact.

- [ ] **Step 1: Write RED tests.** `generation_pins_body_profile_and_actual_quantity_lineage`, `current_plan_reads_without_recomputing`, `v6_replacement_uses_pinned_profiles_and_keeps_six_days`, `legacy_replacement_writes_v5_with_unchanged_shape`, `profile_or_pantry_change_rejects_preview_apply`, `missing_schema_read_is_tolerated_write_is_not`, `fractional_egg_stock_needs_correction`, `assistant_payload_has_no_body_profile`. Simulate newer catalog heads with older pinned policy/fact IDs; retain old facts and six snapshots exactly. Make repeated same idempotency key return one revision; stale plan/household/pantry cannot overwrite a new value.

```ts
expect(persistedV6Command).toMatchObject({
  engineVersion: "planner-engine-v6",
  portionConfigVersion: "portion-v2",
  plannerConfigVersion: "planner-v2",
  calculationSnapshot: { shoppingList: { version: "shopping-list-v2" } }
})
expect(persistedLegacyCommand.engineVersion).toBe("planner-engine-v5")
expect(JSON.stringify(assistantContext)).not.toContain("weightKg")
```

- [ ] **Step 2: Run RED.** Focused tests under `src/application/planner` and server loader/repository plus the new pgTAP file. Missing RPC/table is not treated as household with zero people or zero price.
- [ ] **Step 3: Implement input/pantry migration and loaders.** Load household settings consistently, batch policy reads while keeping existing candidate concurrency/order. Old revision hydration explicitly uses old price-book/snapshot contract; v6 pins policy/price terms and profiles. Hydrate immutable versions for the six locked days from their manifest as well as the candidate pool, so newer catalog heads do not erase required old lineage. If compatible pinned inputs cannot be reconstructed, return a typed regeneration/dependency error rather than substituting latest facts. Only whitelisted missing-schema errors are tolerable on reads. Extend pantry write validation without rewriting any stored fractional legacy rows.
- [ ] **Step 4: Implement versioned use cases and repository factories.** Reuse current hashing/idempotency/revision transitions. Preserve v5 application behavior using the legacy constant so activating the new default cannot stamp v6 onto a shopping-v1 replacement. Body facts stay in private snapshots. The owner-facing portion DTO includes recipient/label/count, ratio, target/actual meal kcal and status/reason; exclude height, weight, age, sex, activity, BMI, BMR and TDEE from plan DTO/cache/share. Assistant context uses its existing explicit meal allowlist, with no new personal target/profile fields. Do not dump RPC payloads into logs.
- [ ] **Step 5: Run LOCAL schema/integration GREEN.** Reset/lint/pgTAP and generated-types gates; `node scripts/local-supabase-admin-env.mjs -- npx vitest run --config vitest.integration.config.ts tests/integration/planner-api.integration.test.ts tests/integration/pantry.integration.test.ts`. Repeat focused unit tests and `npm run typecheck`, all exit 0. Default runtime remains v5 at this checkpoint; v6 factories are tested directly.
- [ ] **Step 6: Stage the task files and commit.** `git commit -m "feat: wire versioned nutrition planning and pantry units"`.

### Task 9: Cài đặt/onboarding theo từng người, BMI và mục tiêu

**Files:**

- Create: `src/features/household/member-profile-input.ts`, `src/features/household/components/member-profile-card.tsx`, `src/features/household/components/meal-energy-share-field.tsx`.
- Modify: `src/features/household/household-form-state.ts`, `src/features/household/components/member-groups-step.tsx`, `src/features/household/components/review-step.tsx`, `src/features/household/settings/household-settings-page.tsx`, `src/features/household/onboarding/onboarding-page.tsx`, `src/features/household/household-summary-page.tsx`, `src/features/household/household-display.ts`.
- Test: `src/features/household/member-profile-input.test.ts`, `src/features/household/household-form-state.test.ts`, `src/features/household/components/member-profile-card.test.tsx`, `src/features/household/components/meal-energy-share-field.test.tsx`, `src/features/household/components/member-groups-step.test.tsx`, `src/features/household/components/review-step.test.tsx`, `src/features/household/settings/household-settings-page.test.tsx`, `src/features/household/onboarding/onboarding-page.test.tsx`, `src/features/household/household-summary-page.test.tsx`, `src/features/household/household-display.test.ts`, `tests/household-onboarding.spec.ts`.

**Interfaces:**

- Consumes: member profile/energy results, household v2 save port and schema-not-ready error.
- `parseMemberMeasurementInput(value: string): MemberMeasurementInputResult` accepts trimmed single decimal separator `.` or `,`, max 2 decimal digits; empty means null, otherwise canonical string/error. Reject mixed punctuation, scientific notation and thousands separators; domain still validates range. Do not parse by `Number()` or remove arbitrary characters.
- Form state adds profile drafts and share input. `createMemberProfileDraft(memberKind: "adult" | "elderly", id: string, sortOrder: number): MemberProfileDraft`; IDs generated once outside reducer via `crypto.randomUUID`, retained throughout draft/save. `householdFormStateFromSetup` accepts an injected ID factory for legacy placeholder creation. Reducer actions are explicit `add-member-profile`, `remove-member-profile` by ID, `update-member-profile` by ID, `set-meal-energy-share`; adult/elderly counts derive from profiles, child count actions remain.
- `MemberProfileDraft` retains profile identity/label/goal/sex/activity and replaces the three numeric fields with `heightInput`, `weightInput`, `ageInput` strings; empty input is not 0. Share input is a string until validated. Form save converts to `MemberProfileV1` without changing the original draft on failure.
- Card renders label/measurements/age/sex/activity/goal, BMI and applied/unapplied reason using domain helpers. Review step includes applied member counts, target estimates and the 7-bữa/33%-day explanation; both save flows send full `nutritionSetup`.

- [ ] **Step 1: Write RED tests.** `comma_decimal_is_preserved_as_canonical`, `remove_middle_member_does_not_move_weight_to_another_person`, `legacy_counts_create_blank_profiles_without_body_defaults`, `bmi_preview_uses_current_draft`, `missing_age_sex_activity_does_not_claim_goal_applied`, `share_20_50_bounds_and_33_default`, `save_failure_keeps_all_profile_inputs`, `signout_or_household_change_ignores_late_save_reply`. Assert 65,50/170,5 parse to 65.5/170.5, labels are associated to inputs, no placeholder sex/activity, save reload retains exact IDs and excludes profile data from device storage. Newly added profile gets a new ID, never a removed person's ID.

```ts
expect(parseMemberMeasurementInput("65,50")).toEqual({ ok: true, value: "65.5" })
expect(parseMemberMeasurementInput("170,5")).toEqual({ ok: true, value: "170.5" })
expect(remainingProfiles.map((profile) => profile.id)).toEqual([firstId, thirdId])
expect(screen.getByText("22,49")).toBeVisible() // draft 170 cm / 65 kg
```

- [ ] **Step 2: Run RED.** `npm run test -- src/features/household` with new reducer/card/parser tests.
- [ ] **Step 3: Implement form state and focused components.** Keep children grouped and total 1–20. BMI shows 2 decimals, kcal integer for presentation only, goal choice independent of BMI. Add partial-profile messages and low-BMI lose reason. Render the share setting with exact single-bữa scope, avoid another wizard step or a separate health dashboard.
- [ ] **Step 4: Wire onboarding/settings/review/summary.** Preserve draft on validation/network/schema errors, existing stale-reload behavior and auth/unmount cancellation. Never persist body draft to localStorage; use route chunks already in place. Add profile data to the own-household view only.
- [ ] **Step 5: Run GREEN and browser flow.** Repeat Step 2 and `npm run typecheck`; `node scripts/local-supabase-env.mjs -- npx playwright test --config=/workspace/.cloud-onboarding/playwright-bepnha.config.ts tests/household-onboarding.spec.ts`. Use real local save/reload/RLS alongside the existing test auth fixture; all exit 0.
- [ ] **Step 6: Stage the task files and commit.** `git commit -m "feat: edit family body measurements and meal goals"`.

### Task 10: Hiển thị khẩu phần/lượng mua và bật luồng v6

**Files:**

- Create: `src/features/plans/member-portions-panel.tsx`, `src/features/shopping/purchase-quantity-label.ts`.
- Modify: `src/features/plans/planner-api.ts`, `src/features/plans/weekly-plan-page.tsx`, `src/features/plans/ingredient-labels.ts`, `src/features/plans/step-ingredient-details.ts`, `src/features/shopping/shopping-list-page.tsx`, `src/features/shopping/shopping-list-text.ts`, `src/features/shopping/offline-shopping-store.ts`, `src/features/pantry/pantry-page.tsx`, `src/application/pantry/pantry-food-options-repository.ts`, `src/infrastructure/supabase/supabase-pantry-food-options-repository.ts`.
- Modify for activation: `src/domain/planner/planner-engine-version.ts`, `src/infrastructure/server/planner-runtime.ts`, `src/infrastructure/server/planner-http.ts`, `src/application/shopping/shopping-list-repository.ts`, `src/infrastructure/supabase/supabase-shopping-list-repository.ts`, `src/main.tsx`, `src/app/App.tsx`.
- Test: `src/features/plans/member-portions-panel.test.tsx`, `src/features/shopping/purchase-quantity-label.test.ts`, `src/features/plans/planner-api.test.ts`, `src/features/plans/weekly-plan-page.test.tsx`, `src/features/plans/ingredient-labels.test.ts`, `src/features/plans/step-ingredient-details.test.ts`, `src/features/shopping/shopping-list-page.test.tsx`, `src/features/shopping/shopping-list-text.test.ts`, `src/features/shopping/offline-shopping-store.test.ts`, `src/features/pantry/pantry-page.test.tsx`, `src/infrastructure/supabase/supabase-pantry-food-options-repository.test.ts`, `src/infrastructure/server/planner-http.test.ts`, `src/app/App.test.tsx`, `src/application/planner/planner-pantry-evidence.test.ts`, `src/application/planner/planner-use-cases.test.ts`, `tests/planner.spec.ts`, `tests/shopping-list.spec.ts`, `tests/pantry.spec.ts`, `tests/assistant.spec.ts`, `tests/accessibility-mobile.spec.ts`.

**Interfaces:**

- Consumes: `VersionedPlannerUseCases`, v1/v2 plan/read unions, normalized member allocation and versioned shopping port (Tasks 6–8).
- `MemberPortionsPanel` receives applied/unapplied estimates and ratios from a stored v6 meal snapshot; no weight/height lookup or recalculation during historical render. Show per-person or per-child allocation, target kcal/actual kcal, one-bữa daily share and any clamp/unapplied reason.
- `purchaseQuantityLabel(item: ShoppingListItem | ShoppingListItemV2, unitLabel: (baseUnitId: string) => string): string`. Fixed packs show count × pack quantity; loose items show physical quantity and correct unit. Used by both screen and share text. A 600 g loose item is never “0,6 gói”; full pantry coverage shows “Đã có đủ trong kho”, cost 0.
- Pantry food options add optional declared whole-count policy/conversion metadata. Input rejects fractional whole units using the same canonical conversion; absent metadata is not interpreted as permission to round data secretly. Server validation from Task 8 remains authoritative.
- At this task's integration step, `PLANNER_ENGINE_VERSION = "planner-engine-v6"`, runtime composes versioned services and browser shopping parser. V1 exported domain/use-case functions and `LEGACY_PLANNER_ENGINE_VERSION` remain for legacy replacement. HTTP authentication/rate limits and command shapes remain; DTO includes version/discriminator and only required owner-facing estimates/portions, not raw body inputs.

- [ ] **Step 1: Write RED tests.** `member_panel_uses_snapshot_not_current_body_profile`, `loose_fish_has_600_g_label_in_screen_and_share`, `eggs_show_three_actual_units_in_recipe_steps`, `fixed_box_shows_10_and_surplus_7`, `fully_covered_item_remains_confirmable_for_pantry_use`, `fractional_egg_input_rejected_without_losing_draft`, `legacy_plan_notice_explains_create_new_week_for_new_portions`, `signout_clears_private_data_and_late_reply_cannot_restore_it`. Cover v2 API parsing/malformed version, correct error links for schema/pantry correction, checked/unchecked/offline replay across revision changes and “đi chợ xong” once-only semantics. No profile appears in service-worker cached plan DTO, shared shopping text or device storage.

```ts
expect(purchaseQuantityLabel(looseFishItem, () => "g")).toBe("600 g")
expect(sharedShoppingText).not.toContain("0,6 gói")
expect(planDto).not.toHaveProperty("nutritionSetup")
expect(JSON.stringify(planDto)).not.toContain("heightCm")
```

- [ ] **Step 2: Run RED.** `npm run test -- src/features/plans src/features/shopping src/features/pantry src/app/App.test.tsx src/infrastructure/server/planner-http.test.ts`; add owner-session and accessibility assertions in browser fixtures.
- [ ] **Step 3: Implement focused presentation.** Extract the new portions panel from the already large weekly-plan page instead of embedding body/goal math there. All ingredient labels and cooking-step quantities use stored actual values; do not run the old 5 g display projector over v6 quantities. Shopping/share use the same purchase label and display need/stock/buy/surplus with a mode explanation. Legacy screens continue showing their unchanged snapshot numbers.
- [ ] **Step 4: Activate typed v6 composition after Tasks 7–9 pass.** Broaden HTTP/API/component ports to explicit v1/v2 unions, wire the versioned services/factories, set the default engine to v6. Keep legacy snapshots/replace functions using their legacy constant and config. Update old-path tests to assert that legacy constant rather than falsely expecting the new engine on a v1 payload. Handle `DEPENDENCY_SCHEMA_NOT_READY` and `INVALID_INDIVISIBLE_PANTRY_QUANTITY` as actionable failures, not zero/empty successes.
- [ ] **Step 5: Run GREEN.** Repeat focused tests, `npm run typecheck`, `npm run build`, `npm run bundle:check`; all exit 0. Do not raise the bundle limit; use existing lazy route/chunk boundaries if needed. Update onboarding selectors in all six existing browser flows to add adult cards; include assistant flow since it also uses the changed family UI. Run `node scripts/local-supabase-admin-env.mjs -- npx playwright test --config=/workspace/.cloud-onboarding/playwright-bepnha.config.ts tests/smoke.spec.ts tests/household-onboarding.spec.ts tests/planner.spec.ts tests/shopping-list.spec.ts tests/pantry.spec.ts tests/assistant.spec.ts tests/accessibility-mobile.spec.ts`. Label mocked planner/shop API browser fixtures accurately; real domain/server/DB is covered by the integration gates, not claimed from mocks.
- [ ] **Step 6: Stage the task files and commit.** `git commit -m "feat: show personal meal portions and practical shopping amounts"`.

### Task 11: Rà dữ liệu đang dùng, nghiệm thu toàn bộ và chuẩn bị bàn giao

**Files:**

- Create: `docs/catalog/staging/food_quantity_policies.csv`, `docs/catalog/staging/PURCHASING_REVIEW.md`, `docs/operations/household-nutrition-rollout.md`.
- Modify: `docs/catalog/staging/pack.csv`, `docs/catalog/staging/prices.csv`, `docs/catalog/staging/price_book.csv`, `docs/catalog/staging/research_log.csv`, `docs/catalog/staging/review_queue.csv`, `docs/catalog/staging/manifest.json`, `docs/operations/production-readiness.md`.
- Modify: `src/application/release/catalog-readiness.ts`, `src/application/release/catalog-readiness.test.ts`, `tests/integration/catalog-readiness.integration.test.ts`; update this plan's completed checkboxes only from actual execution evidence.
- Test/verify: all task tests and the full web/DB/integration/browser/performance gates below; scoped fixes belong in their owning source/test files and must be reported if added at review.

**Interfaces:**

- Consumes: v2 pack/sheets/audit, real local publication pipeline and versioned runtime.
- Staging v2 uses reviewed quantity policy per exact food fact; every active price is either a supported loose offer with source/step or a fixed pack preserving the known source. `PURCHASING_REVIEW.md` lists each food, physical form, cooking step, quoted unit, sale mode/step, evidence and unresolved source limitations. It is not a fabricated seller list.
- Add overload `evaluateCatalogReadiness(input: PlannerInputV2, scenarioCode: string): CatalogReadinessScenarioResult` alongside the existing v1 overload, dispatching by `inputVersion`. V6 readiness accounts for policy/terms and actual-unit pantry compatibility, reports precise missing-data blockers, retains the minimum 21 eligible meals and current allergy/nutrient/protein-capacity rules, and does not promote uncertain rows to publishable.
- Rollout document identifies the four new migrations, old/new read and write behavior, required policy publication, engine-guard verification and separate user approval for production operations. Current production workflow accepts migrations only from main: document the compatible schema-only review/integration step before the runtime v6 integration, rather than assuming one merge can safely publish code and schema at once.

- [ ] **Step 1: Write RED readiness tests.** `launch_catalog_without_quantity_policies_is_not_v6_ready`, `legacy_price_is_fixed_not_inferred_loose`, `reviewed_policy_and_price_terms_enable_v6_plan`, `unit_only_evidence_cannot_make_whole_fish_divisible`. Seed real local facts/policies/price terms through the admin pipeline in the readiness integration test. Full planner output must use integer eggs, known quantities, current budget checks and private member inputs.

```ts
expect(notReady.ready).toBe(false)
expect(ready.minimumEligibleMealOptionCount).toBe(21)
expect(ready.ready).toBe(true)
expect(
  integerEggPlan.purchaseBasket.lines.find((line) => line.foodId === eggId)?.requiredBaseQuantity
).toMatch(/^\d+$/)
```

- [ ] **Step 2: Run RED.** `npm run test -- src/application/release/catalog-readiness.test.ts`; run `npm run test:integration:catalog-readiness` against a reset local DB.
- [ ] **Step 3: Review catalog data and implement readiness.** Check every active staging ingredient/price against preparation notes and sources, recording conclusions. Keep box-10 eggs, 220 g tofu and 200 g beef mince fixed when those are the only sources. Obtain cited evidence before classifying a kg price as loose or setting its sale step; if evidence is unavailable, retain explicit fixed-pack legacy semantics and report that limitation. Never create a “confirmed” loose source from an assumed market price. Preserve existing nutrient/allergen facts, create new versions for changed price semantics, refresh only the authoring manifest hashes and keep an audit trail. Unknown mandatory physical/conversion data remains a readiness blocker.
- [ ] **Step 4: Validate authoring artifacts.** Run `npm run catalog:sheet -- import --dir docs/catalog/staging --out /tmp/bepnha-nutrition-catalog-pack.json`, `npm run catalog:validate -- --input /tmp/bepnha-nutrition-catalog-pack.json`, `npm run catalog:audit -- docs/catalog/staging`. Expect validator exit 0 and `NO_BLOCKING_FINDINGS`; explain retained nonblocking provenance warnings. Do not call `catalog:execute` against production. Repeat readiness unit/integration tests to GREEN.
- [ ] **Step 5: Write rollout instructions from tested behavior.** Schema-only migrations first, verify v5 reads/writes still work, publish reviewed preparation policies before enabling v6, integrate runtime/UI, then publish reviewed loose price book only through a separately approved production action. V6 can use legacy fixed prices while awaiting that publication, but cannot invent missing cooking policy. Verify all three SQL engine guards and v1/v2 shopping round-trip. Clearly state production operations are still awaiting their own explicit approval; no approval is requested before the local implementation is reviewable.
- [ ] **Step 6: Run the full web/performance gates once.** `npm run verify:web`, `npm run test:performance:planner`; capture exit 0 and counts/coverage/bundle metrics. No extra unrelated repetition after success unless a new change or failure justifies it.
- [ ] **Step 7: Run the full LOCAL DB/integration gates.** Reset/lint/pgTAP, pinned `db:types:check`; `npm run test:integration`, `npm run test:integration:catalog-admin`, `npm run test:integration:planner`, `npm run test:integration:assistant`, `npm run test:integration:shopping`, `npm run test:integration:pantry`; reset and run `npm run test:integration:catalog-readiness`. Expect all exit 0. Deliberate old-schema fixtures in unit/integration tests must also pass, since a full migration reset cannot prove compatibility alone.
- [ ] **Step 8: Run browser gates.** Repeat the real household save/reload plus smoke/planner/shopping/pantry/accessibility command in Task 10 after DB fixtures are ready; expected all tests pass with system Chromium. Check old/new plan reload, member deletion, purchase mode, whole eggs, stale inputs and privacy in the browser. Record which API cases are fixture mocks and which hit real Supabase/server integration.
- [ ] **Step 9: Obtain the final fresh-context review.** For Native, one fresh reviewer checks the complete branch against this spec/plan, with emphasis on private data, money, quantities, RLS, historical snapshots and schema gaps. For Subagent-driven, retain per-task gates and also review the complete branch. Resolve material findings with new regression tests and re-run only affected gates plus necessary final checks. No Critical/Important finding remains unresolved.
- [ ] **Step 10: Inspect/stage/commit only completed task and review-fix files.** `git diff --check` and `git status --short`; if all required gates pass and no unrelated change is included, `git commit -m "feat: complete family nutrition and practical purchasing readiness"`. A required blocker leaves the worktree reviewable and prohibits commit/push for that incomplete deliverable.
- [ ] **Step 11: Push and verify the work branch.** `git push origin codex/household-nutrition-practical-purchasing`; verify remote SHA with `git ls-remote --heads origin refs/heads/codex/household-nutrition-practical-purchasing`. Report `TASK_COMPLETE_PUSHED` only after actual successful checks/push, including branch/SHA/message/files/gates and pending production/catalog actions. Do not create PR, merge, deploy or run production migrations.

## Execution handoff

Các task theo thứ tự vì hồ sơ, quantity policy, price terms và snapshot chia sẻ giao diện; không tách thành các dự án có thể phát hành độc lập. Đề xuất **Native**: tôi thực hiện các task trong phiên này, sau đó một reviewer với context mới kiểm tra cả nhánh. Cách này giảm số lần chuyển context khi các phép tính và hợp đồng DB liên kết chặt.

Lựa chọn còn lại là **Subagent-driven**: mỗi task có tác nhân thực hiện và reviewer mới, sau cùng có review toàn nhánh; nhiều lượt review hơn và tốn context hơn. Chỉ dùng sau khi người dùng chọn cách đó.

Đọc/duyệt kế hoạch và chọn cách thực hiện trước khi sửa mã sản phẩm, theo `superpowers:writing-plans` và gate architectural của `superpowers:brainstorming`. Bản kế hoạch này không tự cấp phép triển khai production.
