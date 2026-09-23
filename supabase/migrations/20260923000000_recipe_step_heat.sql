-- Cho một bước nấu nói được nấu ở mức lửa nào, hoặc bao nhiêu độ.
--
-- `recipe_steps` đã có `timer_minutes` và bảng nối `recipe_step_ingredients`, nên khung cho "bao lâu"
-- và "với nguyên liệu nào" vốn đã đủ — chỉ thiếu phần nhiệt.
--
-- Hai cột chứ không phải một, vì chúng trả lời hai câu khác nhau. Bếp gia đình Việt hầu hết nấu theo
-- *mức lửa*: "phi thơm tỏi trên lửa lớn" là chỉ dẫn đủ và không quy ra độ C được. Còn lò nướng và
-- chiên ngập dầu thì ngược lại, chỉ có số độ mới có nghĩa. Một bước có thể không cần cột nào, cần
-- một, hoặc hiếm khi cần cả hai; cả hai đều cho phép rỗng và không cột nào suy ra được cột kia.
--
-- Không đặt giá trị mặc định: một bước chưa ai ghi nhiệt phải đọc là "chưa biết", không phải là
-- "lửa vừa". Đoán hộ người soạn công thức ở đây là bịa ra chỉ dẫn nấu ăn.

create type public.recipe_heat_level as enum ('low', 'medium', 'high');

alter table public.recipe_steps
  add column heat_level public.recipe_heat_level,
  -- Dưới 40 độ thì không phải là nấu; trên 300 vượt ngoài tầm lò gia dụng và chảo dầu.
  add column temperature_celsius smallint
    check (temperature_celsius is null or temperature_celsius between 40 and 300);

-- Bản tổng hợp dùng để tính `content_hash` lúc publish phải phủ hết nội dung của phiên bản. Nếu
-- không thêm hai trường này vào đó, một công thức có ghi nhiệt sẽ được băm y như một công thức
-- không ghi — hash không còn chứng minh được nội dung đã publish. Thân hàm giữ nguyên, chỉ thêm
-- hai khoá vào phần `steps`.
create or replace function public.get_catalog_aggregate_for_publication(
  p_aggregate_type text,
  p_aggregate_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_aggregate_type = 'food_fact_version' then
    select jsonb_build_object(
      'aggregateType', 'food_fact_version',
      'food', jsonb_build_object(
        'foodId', food.id,
        'code', food.code,
        'nameVi', food.name_vi,
        'baseDimension', food.base_dimension,
        'baseUnitId', food.base_unit_id,
        'revision', food.revision
      ),
      'fact', jsonb_build_object(
        'foodFactVersionId', fact.id,
        'versionNumber', fact.version_number,
        'revision', fact.revision,
        'categoryId', fact.category_id,
        'edibleFraction', trim(trailing '.' from trim(trailing '0' from fact.edible_fraction::text)),
        'nutritionBasis', fact.nutrition_basis,
        'provenance', fact.provenance,
        'publicationStatus', fact.publication_status,
        'contentHash', fact.content_hash
      ),
      'conversions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'unitId', conversion.unit_id,
            'unitCode', unit.code,
            'sourceDimension', unit.dimension,
            'sourceToDimensionBase', trim(trailing '.' from trim(trailing '0' from unit.to_dimension_base::text)),
            'baseQuantityPerUnit', trim(trailing '.' from trim(trailing '0' from conversion.base_quantity_per_unit::text)),
            'grossGramsPerUnit', trim(trailing '.' from trim(trailing '0' from conversion.gross_grams_per_unit::text)),
            'displayStep', trim(trailing '.' from trim(trailing '0' from conversion.display_step::text)),
            'provenance', conversion.provenance
          ) order by unit.code, conversion.unit_id
        )
        from public.food_fact_unit_conversions as conversion
        join public.units as unit on unit.id = conversion.unit_id
        where conversion.food_fact_version_id = fact.id
      ), '[]'::jsonb),
      'assessments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'allergenId', assessment.allergen_id,
            'allergenCode', allergen.code,
            'status', assessment.assessment,
            'provenance', assessment.provenance
          ) order by allergen.code
        )
        from public.food_fact_allergen_assessments as assessment
        join public.allergens as allergen on allergen.id = assessment.allergen_id
        where assessment.food_fact_version_id = fact.id
      ), '[]'::jsonb),
      'nutrients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'nutrientId', amount.nutrient_id,
            'nutrientCode', nutrient.code,
            'unitCode', nutrient.unit_code,
            'displayPrecision', nutrient.display_precision,
            'amountPer100g', trim(trailing '.' from trim(trailing '0' from amount.amount_per_100g::text)),
            'provenance', amount.provenance
          ) order by nutrient.code
        )
        from public.food_fact_nutrients as amount
        join public.nutrients as nutrient on nutrient.id = amount.nutrient_id
        where amount.food_fact_version_id = fact.id
      ), '[]'::jsonb),
      'dietaryTags', coalesce((
        select jsonb_agg(
          jsonb_build_object('dietaryTagId', tag.id, 'code', tag.code)
          order by tag.code
        )
        from public.food_fact_dietary_tags as link
        join public.dietary_tags as tag on tag.id = link.dietary_tag_id
        where link.food_fact_version_id = fact.id
      ), '[]'::jsonb)
    ) into v_result
    from public.food_fact_versions as fact
    join public.foods as food on food.id = fact.food_id
    where fact.id = p_aggregate_id;
  elsif p_aggregate_type = 'recipe_version' then
    select jsonb_build_object(
      'aggregateType', 'recipe_version',
      'recipe', jsonb_build_object(
        'recipeId', recipe.id,
        'code', recipe.code,
        'nameVi', recipe.name_vi,
        'revision', recipe.revision
      ),
      'version', jsonb_build_object(
        'recipeVersionId', version.id,
        'versionNumber', version.version_number,
        'revision', version.revision,
        'yieldAdultEquivalent', trim(trailing '.' from trim(trailing '0' from version.yield_adult_equivalent::text)),
        'activeMinutes', version.active_minutes,
        'elapsedMinutes', version.elapsed_minutes,
        'publicationStatus', version.publication_status,
        'contentHash', version.content_hash
      ),
      'ingredients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'recipeIngredientId', ingredient.id,
            'foodId', ingredient.food_id,
            'foodFactVersionId', ingredient.food_fact_version_id,
            'foodFactContentHash', fact.content_hash,
            'foodFactPublicationStatus', fact.publication_status,
            'quantity', trim(trailing '.' from trim(trailing '0' from ingredient.quantity::text)),
            'unitId', ingredient.unit_id,
            'preparationNoteVi', ingredient.preparation_note_vi,
            'order', ingredient.sort_order,
            'hasPinnedConversion', conversion.unit_id is not null
          ) order by ingredient.sort_order, ingredient.id
        )
        from public.recipe_ingredients as ingredient
        join public.food_fact_versions as fact on fact.id = ingredient.food_fact_version_id
        left join public.food_fact_unit_conversions as conversion
          on conversion.food_fact_version_id = fact.id and conversion.unit_id = ingredient.unit_id
        where ingredient.recipe_version_id = version.id
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'recipeStepId', step.id,
            'order', step.sort_order,
            'instructionVi', step.instruction_vi,
            'timerMinutes', step.timer_minutes,
            'heatLevel', step.heat_level,
            'temperatureCelsius', step.temperature_celsius
          ) order by step.sort_order, step.id
        )
        from public.recipe_steps as step
        where step.recipe_version_id = version.id
      ), '[]'::jsonb),
      'stepIngredients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'recipeStepId', link.recipe_step_id,
            'recipeIngredientId', link.recipe_ingredient_id,
            'referenceOrder', link.reference_order
          ) order by link.recipe_step_id, link.reference_order
        )
        from public.recipe_step_ingredients as link
        where link.recipe_version_id = version.id
      ), '[]'::jsonb),
      'tags', coalesce((
        select jsonb_agg(
          jsonb_build_object('recipeTagId', tag.id, 'code', tag.code, 'kind', tag.tag_kind)
          order by tag.code
        )
        from public.recipe_version_tags as link
        join public.recipe_tags as tag on tag.id = link.recipe_tag_id
        where link.recipe_version_id = version.id
      ), '[]'::jsonb)
    ) into v_result
    from public.recipe_versions as version
    join public.recipes as recipe on recipe.id = version.recipe_id
    where version.id = p_aggregate_id;
  elsif p_aggregate_type = 'price_book' then
    select jsonb_build_object(
      'aggregateType', 'price_book',
      'book', jsonb_build_object(
        'priceBookId', book.id,
        'regionId', book.region_id,
        'versionNumber', book.version_number,
        'revision', book.revision,
        'effectiveFrom', book.effective_from,
        'effectiveTo', book.effective_to,
        'publicationStatus', book.publication_status,
        'contentHash', book.content_hash
      ),
      'prices', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'foodPriceId', price.id,
            'foodId', price.food_id,
            'foodFactVersionId', price.food_fact_version_id,
            'foodFactContentHash', fact.content_hash,
            'foodFactPublicationStatus', fact.publication_status,
            'packageQuantity', trim(trailing '.' from trim(trailing '0' from price.package_quantity::text)),
            'packageUnitId', price.package_unit_id,
            'packageBaseQuantity', trim(trailing '.' from trim(trailing '0' from price.package_base_quantity::text)),
            'baseUnitId', price.base_unit_id,
            'packagePriceVnd', price.package_price_vnd,
            'purchaseIncrement', trim(trailing '.' from trim(trailing '0' from price.purchase_increment::text)),
            'observedAt', price.observed_at,
            'sourceReference', price.source_reference
          ) order by price.food_id, price.id
        )
        from public.food_prices as price
        join public.food_fact_versions as fact on fact.id = price.food_fact_version_id
        where price.price_book_id = book.id
      ), '[]'::jsonb)
    ) into v_result
    from public.price_books as book
    where book.id = p_aggregate_id;
  else
    raise exception using errcode = '22023', message = 'UNSUPPORTED_CATALOG_AGGREGATE';
  end if;
  return v_result;
end;
$$;
