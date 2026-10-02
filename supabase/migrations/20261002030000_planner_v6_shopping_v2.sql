-- Apply before activating engine v6. Historical engines retain their validators and projections.
alter table public.meal_plan_items alter column adult_equivalent type numeric(38,18), alter column scale_factor type numeric(38,18);
alter table public.shopping_lists drop constraint shopping_lists_snapshot_version_check;
alter table public.shopping_lists add constraint shopping_lists_snapshot_version_check check(snapshot_version in ('shopping-list-v1','shopping-list-v2'));
alter table public.shopping_list_items
 add column purchase_contract jsonb,
 add column policy_refs jsonb,
 add column purchase_mode text generated always as (purchase_contract #>> '{purchaseRule,mode}') stored,
 add column quote_base_quantity text generated always as (purchase_contract ->> 'quoteBaseQuantity') stored,
 add column quote_price_vnd bigint generated always as ((purchase_contract ->> 'quotePriceVnd')::bigint) stored,
 add column purchase_unit_count text generated always as (purchase_contract ->> 'purchaseUnitCount') stored,
 add column purchase_terms_content_hash text generated always as (purchase_contract ->> 'purchaseTermsContentHash') stored,
 alter column package_base_quantity drop not null,
 alter column purchase_increment drop not null,
 alter column purchase_package_count drop not null,
 alter column package_price_vnd drop not null;
alter table public.shopping_list_item_sources add column quantity_policy_ref jsonb;
-- Legacy package arithmetic applies only to legacy contracts. Physical need/stock/leftover checks
-- remain in force for every version; v2 quote arithmetic is replayed against immutable terms below.
do $$
declare c record; d text;
begin
 for c in select oid,conname from pg_constraint where conrelid='public.shopping_list_items'::regclass and contype='c' loop
  d:=pg_get_constraintdef(c.oid);
  if d like '%package_base_quantity%' or d like '%purchase_package_count%' or d like '%purchase_increment%' or d like '%package_price_vnd%' then
   execute format('alter table public.shopping_list_items drop constraint %I',c.conname);
   execute format('alter table public.shopping_list_items add constraint %I check (purchase_contract is not null or (%s))',c.conname,substring(d from 8 for length(d)-8));
  end if;
 end loop;
end $$;
alter table public.shopping_list_items add constraint shopping_items_versioned_contract_check check (coalesce((
 (purchase_contract is null and policy_refs is null and package_base_quantity is not null and purchase_increment is not null and purchase_package_count is not null and package_price_vnd is not null)
 or (purchase_contract is not null and purchase_contract->>'version'='purchase-v2' and jsonb_typeof(policy_refs)='array' and jsonb_array_length(policy_refs)>0
   and private.is_canonical_decimal_text(quote_base_quantity,false) and quote_price_vnd between 1 and 9007199254740991
   and private.is_canonical_decimal_text(purchase_unit_count,true) and purchase_unit_count::numeric=trunc(purchase_unit_count::numeric)
   and purchase_terms_content_hash ~ '^[a-f0-9]{64}$'
   and ((purchase_mode='fixed_pack' and package_base_quantity is not null and purchase_increment is not null and purchase_package_count is not null and package_price_vnd is not null
      and package_base_quantity=quote_base_quantity and purchase_package_count=purchase_unit_count and package_price_vnd=quote_price_vnd
      and purchase_increment=purchase_contract#>>'{purchaseRule,packIncrement}' and private.is_canonical_decimal_text(purchase_increment,false)
      and purchase_increment::numeric=trunc(purchase_increment::numeric) and mod(purchase_package_count::numeric,purchase_increment::numeric)=0
      and purchase_base_quantity::numeric=package_base_quantity::numeric*purchase_package_count::numeric)
     or (purchase_mode in ('loose_mass','loose_count') and package_base_quantity is null and purchase_increment is null and purchase_package_count is null and package_price_vnd is null)))
),false)) ;

create function private.assert_v6_purchase_line(p_line jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.food_prices; t public.food_price_purchase_terms; f public.foods; rule jsonb; k text; need numeric; deducted numeric; remain numeric; step numeric; units numeric; bought numeric; cost numeric;
begin
 if jsonb_typeof(p_line) is distinct from 'object' or p_line->>'version' is distinct from 'purchase-v2' then raise exception using errcode='23514',message='V6_PURCHASE_CONTRACT_REQUIRED'; end if;
 foreach k in array array['requiredBaseQuantity','pantryDeductedBaseQuantity','purchaseRequiredBaseQuantity','purchaseUnitCount','purchaseBaseQuantity','leftoverBaseQuantity','quoteBaseQuantity'] loop
  if not coalesce(private.is_canonical_decimal_text(p_line->>k,k not in ('requiredBaseQuantity','quoteBaseQuantity')),false) then raise exception using errcode='23514',message='V6_PURCHASE_DECIMAL_INVALID'; end if;
 end loop;
 select price.* into p from public.food_prices price join public.price_books b on b.id=price.price_book_id
 where price.id=(p_line->>'foodPriceId')::uuid and b.publication_status='published' and b.purchase_contract_version='purchase-v2';
 select * into t from public.food_price_purchase_terms where food_price_id=p.id;
 select * into f from public.foods where id=p.food_id;
 if p.id is null or t.food_price_id is null or t.content_hash is null then raise exception using errcode='23514',message='V6_PURCHASE_TERMS_REQUIRED'; end if;
 rule:=case when t.purchase_mode='fixed_pack' then jsonb_build_object('mode',t.purchase_mode,'packIncrement',trim_scale(t.pack_increment)::text) else jsonb_build_object('mode',t.purchase_mode,'saleStepBaseQuantity',trim_scale(t.sale_step_base_quantity)::text) end;
 if p_line->'purchaseRule' is distinct from rule or p_line->>'purchaseProvenance' is distinct from t.provenance or p_line->>'purchaseTermsContentHash' is distinct from t.content_hash
   or p_line->>'foodId' is distinct from p.food_id::text or p_line->>'priceBookId' is distinct from p.price_book_id::text
   or p_line->>'priceFoodFactVersionId' is distinct from p.food_fact_version_id::text or p_line->>'baseUnitId' is distinct from p.base_unit_id::text
   or p_line->>'baseDimension' is distinct from f.base_dimension::text or t.base_dimension is distinct from f.base_dimension
   or (p_line->>'quoteBaseQuantity')::numeric<>p.package_base_quantity or (p_line->>'quotePriceVnd')::numeric is distinct from p.package_price_vnd
   or p_line->>'observedAt' is distinct from p.observed_at::text or p_line->>'freshness' not in ('current','stale_usable') then raise exception using errcode='23514',message='V6_PURCHASE_PRICE_PIN_MISMATCH'; end if;
 need:=(p_line->>'requiredBaseQuantity')::numeric; deducted:=(p_line->>'pantryDeductedBaseQuantity')::numeric;remain:=greatest(need-deducted,0);
 step:=case when t.purchase_mode='fixed_pack' then p.package_base_quantity*t.pack_increment else t.sale_step_base_quantity end;
 units:=ceil(remain/step)*case when t.purchase_mode='fixed_pack' then t.pack_increment else 1 end;
 bought:=case when t.purchase_mode='fixed_pack' then units*p.package_base_quantity else units*step end;
 cost:=round(bought::numeric(70,36)*p.package_price_vnd/p.package_base_quantity,0);
 if need<>deducted+remain or (p_line->>'purchaseRequiredBaseQuantity')::numeric<>remain or (p_line->>'purchaseUnitCount')::numeric<>units
   or (p_line->>'purchaseBaseQuantity')::numeric<>bought or (p_line->>'leftoverBaseQuantity')::numeric<>bought-remain
   or (p_line->>'lineCostVnd')::numeric is distinct from cost or cost>9007199254740991 or cost<0
   or (f.base_dimension='count' and (need<>trunc(need) or deducted<>trunc(deducted) or bought<>trunc(bought))) then raise exception using errcode='23514',message='V6_PURCHASE_QUANTITY_OR_COST_MISMATCH'; end if;
end $$;
revoke all on function private.assert_v6_purchase_line(jsonb) from public,anon,authenticated,service_role;

create function private.assert_v6_cooking_source(p_item_id uuid,p_source jsonb) returns void language plpgsql security definer set search_path='' as $$
declare i public.meal_plan_items; c public.meal_option_recipes; r public.recipe_ingredients; rv public.recipe_versions; conv public.food_fact_unit_conversions; q public.food_quantity_policy_versions; f public.foods; a jsonb; actual jsonb; theoretical jsonb; scaled jsonb; source_key text; theory_source numeric; theory_base numeric; actual_base numeric; expected_source numeric; expected_gross numeric; ref jsonb;
begin
 select * into i from public.meal_plan_items where id=p_item_id;
 select * into c from public.meal_option_recipes where id=(p_source->>'mealOptionRecipeId')::uuid and meal_option_version_id=i.meal_option_version_id;
 select * into r from public.recipe_ingredients where id=(p_source->>'recipeIngredientId')::uuid and recipe_version_id=c.recipe_version_id;
 select * into rv from public.recipe_versions where id=c.recipe_version_id;
 select * into conv from public.food_fact_unit_conversions where food_fact_version_id=r.food_fact_version_id and unit_id=r.unit_id;
 select * into f from public.foods where id=r.food_id;
 select * into q from public.food_quantity_policy_versions where id=(p_source#>>'{quantityPolicyRef,id}')::uuid and food_fact_version_id=r.food_fact_version_id and publication_status='published';
 ref:=jsonb_build_object('id',q.id,'contentHash',q.content_hash,'versionNumber',q.version_number);
 source_key:=c.id::text||':'||r.id::text;
 select value into a from jsonb_array_elements(i.calculation_snapshot->'quantityAdjustments') where value->>'sourceId'=source_key;
 select value into scaled from jsonb_array_elements(i.calculation_snapshot->'scaledIngredients') where value->>'sourceId'=source_key;
 if i.id is null or c.id is null or r.id is null or conv.food_fact_version_id is null or q.id is null or a is null or scaled is null or q.base_unit_id<>f.base_unit_id
   or (q.food_form='whole_piece' and (select dimension from public.units where id=r.unit_id)<>'count')
   or p_source->'quantityPolicyRef' is distinct from ref or a->'policyRef' is distinct from ref
   or p_source->>'foodId' is distinct from r.food_id::text or p_source->>'foodFactVersionId' is distinct from r.food_fact_version_id::text
   or p_source->>'recipeVersionId' is distinct from c.recipe_version_id::text or p_source->>'baseUnitId' is distinct from f.base_unit_id::text
   or i.meal_option_id::text is distinct from p_source->>'mealOptionId' or i.meal_option_version_id::text is distinct from p_source->>'mealOptionVersionId' then raise exception using errcode='23514',message='V6_COOKING_POLICY_OR_LINEAGE_MISMATCH'; end if;
 actual:=a->'actualIngredient';theoretical:=a->'theoreticalIngredient';
 theory_source:=round(r.quantity*round(i.adult_equivalent::numeric(70,36)/rv.yield_adult_equivalent,18),18);
 theory_base:=round(theory_source*conv.base_quantity_per_unit,18);
 actual_base:=greatest(q.step_base_quantity,case when q.rounding='ceil' then ceil(theory_base/q.step_base_quantity) else round(theory_base::numeric(70,36)/q.step_base_quantity,0) end*q.step_base_quantity);
 expected_source:=round(actual_base::numeric(70,36)/conv.base_quantity_per_unit,18);
 expected_gross:=round(actual_base::numeric(70,36)*conv.gross_grams_per_unit/conv.base_quantity_per_unit,18);
 if (theoretical->>'sourceQuantity')::numeric is distinct from theory_source or (theoretical->>'baseQuantity')::numeric is distinct from theory_base
   or (theoretical->>'grossGrams')::numeric is distinct from round(theory_source*conv.gross_grams_per_unit,18)
   or (actual->>'baseQuantity')::numeric is distinct from actual_base or (actual->>'sourceQuantity')::numeric is distinct from expected_source
   or (actual->>'grossGrams')::numeric is distinct from expected_gross or (scaled->>'baseQuantity')::numeric is distinct from actual_base
   or (scaled->>'sourceQuantity')::numeric is distinct from expected_source or (scaled->>'grossGrams')::numeric is distinct from expected_gross
   or (p_source->>'requiredBaseQuantity')::numeric is distinct from actual_base
   or scaled->>'foodId' is distinct from r.food_id::text or scaled->>'foodFactVersionId' is distinct from r.food_fact_version_id::text
   or scaled->>'unitId' is distinct from r.unit_id::text or scaled->>'baseUnitId' is distinct from f.base_unit_id::text
   or theoretical->>'foodId' is distinct from r.food_id::text or actual->>'foodId' is distinct from r.food_id::text then raise exception using errcode='23514',message='V6_COOKING_ACTUAL_QUANTITY_MISMATCH'; end if;
end $$;
revoke all on function private.assert_v6_cooking_source(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.assert_revision_shopping_v6(p_revision_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.meal_plan_revisions; l public.shopping_lists; row_line public.shopping_list_items; s jsonb; b jsonb; line jsonb; basket_line jsonb; source jsonb; ref jsonb; i public.meal_plan_items; total numeric; source_sum numeric; source_count integer; snapshot_count integer; pantry_qty numeric;
begin
 select * into r from public.meal_plan_revisions where id=p_revision_id;
 s:=r.calculation_snapshot->'shoppingList';b:=r.calculation_snapshot->'purchaseBasket';
 if r.engine_version is distinct from 'planner-engine-v6' or r.input_snapshot->>'engineVersion' is distinct from r.engine_version
   or r.portion_config_version is distinct from 'portion-v2' or r.planner_config_version is distinct from 'planner-v2'
   or r.input_snapshot->>'inputVersion' is distinct from 'planner-input-v2' or r.input_snapshot#>>'{energyTargetConfig,version}' is distinct from 'energy-target-v1'
   or s->>'version' is distinct from 'shopping-list-v2' or s->>'groceryCategoryConfigVersion' is distinct from 'grocery-category-v1'
   or jsonb_typeof(s->'lines') is distinct from 'array' or jsonb_typeof(b->'lines') is distinct from 'array' or jsonb_typeof(s->'warnings') is distinct from 'array' then raise exception using errcode='23514',message='V6_SNAPSHOT_CONTRACT_MISMATCH'; end if;
 select * into l from public.shopping_lists where meal_plan_revision_id=r.id and meal_plan_id=r.meal_plan_id;
 if l.id is null or l.snapshot_version<>s->>'version' or l.grocery_category_config_version<>s->>'groceryCategoryConfigVersion' or l.calculation_fingerprint<>r.calculation_fingerprint or l.warnings is distinct from s->'warnings'
   or l.estimated_purchase_cost_vnd<>r.total_estimated_cost_vnd or jsonb_array_length(s->'lines')<>jsonb_array_length(b->'lines')
   or jsonb_array_length(s->'lines')<>(select count(*) from public.shopping_list_items where shopping_list_id=l.id) then raise exception using errcode='23514',message='V6_SHOPPING_SUMMARY_MISMATCH'; end if;
 select coalesce(sum(line_cost_vnd),0) into total from public.shopping_list_items where shopping_list_id=l.id;
 if total<>r.total_estimated_cost_vnd or (s->>'totalEstimatedCostVnd')::numeric is distinct from total or (b->>'totalEstimatedCostVnd')::numeric is distinct from total then raise exception using errcode='23514',message='V6_SHOPPING_TOTAL_MISMATCH'; end if;
 for line in select value from jsonb_array_elements(s->'lines') loop
  perform private.assert_v6_purchase_line(line);
  if r.calculation_date<(line->>'observedAt')::date or r.calculation_date-(line->>'observedAt')::date>90
    or line->>'freshness' is distinct from (case when r.calculation_date-(line->>'observedAt')::date<=30 then 'current' else 'stale_usable' end) then raise exception using errcode='23514',message='V6_PRICE_FRESHNESS_MISMATCH'; end if;
  select * into row_line from public.shopping_list_items where shopping_list_id=l.id and food_id=(line->>'foodId')::uuid;
  select value into basket_line from jsonb_array_elements(b->'lines') where value->>'foodId'=line->>'foodId';
  if row_line.id is null or row_line.purchase_contract is distinct from (line-'groceryCategoryCode'-'factRefs'-'policyRefs'-'sources') or basket_line is distinct from row_line.purchase_contract
    or row_line.policy_refs is distinct from line->'policyRefs' or row_line.required_base_quantity is distinct from line->>'requiredBaseQuantity'
    or row_line.pantry_deducted_base_quantity is distinct from line->>'pantryDeductedBaseQuantity' or row_line.purchase_required_base_quantity is distinct from line->>'purchaseRequiredBaseQuantity'
    or row_line.purchase_base_quantity is distinct from line->>'purchaseBaseQuantity' or row_line.leftover_base_quantity is distinct from line->>'leftoverBaseQuantity'
    or row_line.line_cost_vnd is distinct from (line->>'lineCostVnd')::bigint or row_line.base_unit_id::text is distinct from line->>'baseUnitId'
    or row_line.food_price_id::text is distinct from line->>'foodPriceId' or row_line.price_book_id::text is distinct from line->>'priceBookId'
    or row_line.price_food_fact_version_id::text is distinct from line->>'priceFoodFactVersionId' or row_line.observed_at::text is distinct from line->>'observedAt'
    or row_line.freshness is distinct from line->>'freshness' or row_line.grocery_category_code is distinct from line->>'groceryCategoryCode' then raise exception using errcode='23514',message='V6_SHOPPING_RELATIONAL_MISMATCH'; end if;
  if jsonb_typeof(line->'sources') is distinct from 'array' or jsonb_array_length(line->'sources')=0 or jsonb_typeof(line->'factRefs') is distinct from 'array' or jsonb_typeof(line->'policyRefs') is distinct from 'array' then raise exception using errcode='23514',message='V6_SHOPPING_SOURCES_REQUIRED'; end if;
  select count(*),sum(required_base_quantity::numeric) into source_count,source_sum from public.shopping_list_item_sources where shopping_list_item_id=row_line.id;
  if source_count<>jsonb_array_length(line->'sources') or source_sum<>row_line.required_base_quantity::numeric then raise exception using errcode='23514',message='V6_SHOPPING_SOURCE_SUM_MISMATCH'; end if;
  select coalesce(sum((item->>'baseQuantity')::numeric),0) into pantry_qty from jsonb_array_elements(coalesce(r.input_snapshot#>'{pantrySnapshot,items}','[]')) item where item->>'foodId'=line->>'foodId' and item->>'baseUnitId'=line->>'baseUnitId';
  if row_line.pantry_deducted_base_quantity::numeric<>least(source_sum,pantry_qty) then raise exception using errcode='23514',message='V6_PANTRY_DEDUCTION_PIN_MISMATCH'; end if;
  for source in select value from jsonb_array_elements(line->'sources') loop
   select * into i from public.meal_plan_items where meal_plan_revision_id=r.id and day_index=(source->>'dayIndex')::smallint;
   perform private.assert_v6_cooking_source(i.id,source);
   if not exists(select 1 from public.shopping_list_item_sources ds where ds.shopping_list_item_id=row_line.id and ds.meal_plan_item_id=i.id
      and ds.meal_option_recipe_id::text=source->>'mealOptionRecipeId' and ds.recipe_version_id::text=source->>'recipeVersionId' and ds.recipe_ingredient_id::text=source->>'recipeIngredientId'
      and ds.food_id::text=source->>'foodId' and ds.food_fact_version_id::text=source->>'foodFactVersionId' and ds.base_unit_id::text=source->>'baseUnitId'
      and ds.required_base_quantity=source->>'requiredBaseQuantity' and ds.quantity_policy_ref=source->'quantityPolicyRef') then raise exception using errcode='23514',message='V6_SHOPPING_SOURCE_PIN_MISMATCH'; end if;
  end loop;
  if jsonb_array_length(line->'factRefs')<>(select count(distinct food_fact_version_id) from public.shopping_list_item_sources where shopping_list_item_id=row_line.id)
    or jsonb_array_length(line->'policyRefs')<>(select count(distinct quantity_policy_ref->>'id') from public.shopping_list_item_sources where shopping_list_item_id=row_line.id) then raise exception using errcode='23514',message='V6_SHOPPING_REF_SET_MISMATCH'; end if;
  if jsonb_array_length(line->'factRefs')<>(select count(distinct v->>'foodFactVersionId') from jsonb_array_elements(line->'factRefs') v)
    or jsonb_array_length(line->'policyRefs')<>(select count(distinct v->>'id') from jsonb_array_elements(line->'policyRefs') v) then raise exception using errcode='23514',message='V6_SHOPPING_DUPLICATE_REFS'; end if;
  for ref in select value from jsonb_array_elements(line->'factRefs') loop
   if not exists(select 1 from public.food_fact_versions ff join public.shopping_list_item_sources ds on ds.food_fact_version_id=ff.id where ds.shopping_list_item_id=row_line.id and ff.id::text=ref->>'foodFactVersionId' and ff.content_hash=ref->>'contentHash') then raise exception using errcode='23514',message='V6_SHOPPING_FACT_HASH_MISMATCH'; end if;
  end loop;
  for ref in select value from jsonb_array_elements(line->'policyRefs') loop
   if not exists(select 1 from public.shopping_list_item_sources ds where ds.shopping_list_item_id=row_line.id and ds.quantity_policy_ref=ref) then raise exception using errcode='23514',message='V6_SHOPPING_POLICY_HASH_MISMATCH'; end if;
  end loop;
 end loop;
 select count(*) into source_count from public.shopping_list_item_sources where meal_plan_revision_id=r.id;
 select sum(jsonb_array_length(calculation_snapshot->'scaledIngredients')) into snapshot_count from public.meal_plan_items where meal_plan_revision_id=r.id;
 if source_count is distinct from snapshot_count or source_count<>(select count(*) from public.meal_plan_items mi join public.meal_option_recipes mc on mc.meal_option_version_id=mi.meal_option_version_id join public.recipe_ingredients ri on ri.recipe_version_id=mc.recipe_version_id where mi.meal_plan_revision_id=r.id) then raise exception using errcode='23514',message='V6_COOKING_SOURCE_COVERAGE_MISMATCH'; end if;
 if r.revision_kind='replacement' and exists(select 1 from public.meal_plan_revisions parent where parent.id=r.parent_revision_id and (
     parent.engine_version<>'planner-engine-v6' or parent.input_snapshot->'household' is distinct from r.input_snapshot->'household'
     or parent.input_snapshot->'portionConfig' is distinct from r.input_snapshot->'portionConfig' or parent.input_snapshot->'energyTargetConfig' is distinct from r.input_snapshot->'energyTargetConfig'
     or parent.input_snapshot->'plannerConfig' is distinct from r.input_snapshot->'plannerConfig' or parent.input_snapshot->'priceFreshnessConfig' is distinct from r.input_snapshot->'priceFreshnessConfig'
     or parent.input_snapshot->'pantrySnapshot' is distinct from r.input_snapshot->'pantrySnapshot' or parent.input_snapshot->'candidateManifest' is distinct from r.input_snapshot->'candidateManifest'
     or parent.catalog_fingerprint<>r.catalog_fingerprint)) then raise exception using errcode='23514',message='V6_REPLACEMENT_INPUT_BINDING_CHANGED'; end if;
 if r.revision_kind='replacement' and exists(select 1 from public.meal_plan_items old_i join public.meal_plan_items new_i on new_i.meal_plan_revision_id=r.id and new_i.day_index=old_i.day_index where old_i.meal_plan_revision_id=r.parent_revision_id and old_i.day_index<>r.replaced_day_index and (old_i.calculation_snapshot is distinct from new_i.calculation_snapshot or old_i.adult_equivalent<>new_i.adult_equivalent or old_i.scale_factor<>new_i.scale_factor)) then raise exception using errcode='23514',message='V6_REPLACEMENT_LOCKED_DAY_CHANGED'; end if;
end $$;
revoke all on function private.assert_revision_shopping_v6(uuid) from public,anon,authenticated,service_role;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.assert_revision_shopping_row(uuid)'::regprocedure);
 patched:=replace(definition,$old$  if v_revision.engine_version not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5')$old$,$new$  if v_revision.engine_version = 'planner-engine-v6' then
    perform private.assert_revision_shopping_v6(p_revision_id);
    return;
  end if;
  if v_revision.engine_version not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5')$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: private.assert_revision_shopping_row(uuid)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.assert_plan_summary_row(uuid)'::regprocedure);
 patched:=replace(definition,$old$('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5') then$old$,$new$('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5', 'planner-engine-v6') then$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: private.assert_plan_summary_row(uuid)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$p_revision ->> 'engineVersion' not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5')$old$,$new$p_revision ->> 'engineVersion' not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5', 'planner-engine-v6')$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$p_revision ->> 'portionConfigVersion' <> 'portion-v1'$old$,$new$p_revision ->> 'portionConfigVersion' is distinct from (case when p_revision->>'engineVersion'='planner-engine-v6' then 'portion-v2' else 'portion-v1' end)$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$p_revision ->> 'plannerConfigVersion' <> 'planner-v1'$old$,$new$p_revision ->> 'plannerConfigVersion' is distinct from (case when p_revision->>'engineVersion'='planner-engine-v6' then 'planner-v2' else 'planner-v1' end)$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$v_shopping ->> 'version' <> 'shopping-list-v1'$old$,$new$v_shopping ->> 'version' is distinct from (case when p_revision->>'engineVersion'='planner-engine-v6' then 'shopping-list-v2' else 'shopping-list-v1' end)$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$      price_food_fact_version_id, observed_at, freshness, grocery_category_code
$old$,$new$      price_food_fact_version_id, observed_at, freshness, grocery_category_code, purchase_contract, policy_refs
$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$      v_line ->> 'packageBaseQuantity', v_line ->> 'purchaseIncrement',
      v_line ->> 'purchasePackageCount', v_line ->> 'purchaseBaseQuantity',
      v_line ->> 'leftoverBaseQuantity', (v_line ->> 'packagePriceVnd')::bigint,$old$,$new$      case when v_line#>>'{purchaseRule,mode}'='fixed_pack' then v_line->>'quoteBaseQuantity' else v_line->>'packageBaseQuantity' end,
      case when v_line#>>'{purchaseRule,mode}'='fixed_pack' then v_line#>>'{purchaseRule,packIncrement}' else v_line->>'purchaseIncrement' end,
      case when v_line#>>'{purchaseRule,mode}'='fixed_pack' then v_line->>'purchaseUnitCount' else v_line->>'purchasePackageCount' end,
      v_line ->> 'purchaseBaseQuantity', v_line ->> 'leftoverBaseQuantity',
      case when v_line#>>'{purchaseRule,mode}'='fixed_pack' then (v_line->>'quotePriceVnd')::bigint else (v_line->>'packagePriceVnd')::bigint end,$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$      v_line ->> 'groceryCategoryCode'
$old$,$new$      v_line ->> 'groceryCategoryCode',
      case when v_shopping->>'version'='shopping-list-v2' then v_line-'groceryCategoryCode'-'factRefs'-'policyRefs'-'sources' else null end,
      case when v_shopping->>'version'='shopping-list-v2' then v_line->'policyRefs' else null end
$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$        required_base_quantity
      ) values ($old$,$new$        required_base_quantity, quantity_policy_ref
      ) values ($new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(definition,$old$        v_source ->> 'requiredBaseQuantity'
$old$,$new$        v_source ->> 'requiredBaseQuantity', v_source -> 'quantityPolicyRef'
$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)';end if;
 execute patched;
end $patch$;

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.get_shopping_list(uuid,uuid)'::regprocedure);
 patched:=replace(definition,$old$  return jsonb_build_object(
    'status', 'ready',$old$,$new$  if v_list.snapshot_version='shopping-list-v2' then
    return jsonb_build_object('status','ready','snapshotVersion','shopping-list-v2','planId',v_plan.id,'revisionId',v_revision.id,'weekStart',v_plan.week_start,
      'calculationFingerprint',v_list.calculation_fingerprint,'budgetVnd',v_revision.budget_vnd,'budgetStatus',v_revision.budget_status,'overageVnd',v_revision.overage_vnd,
      'totalEstimatedCostVnd',v_list.estimated_purchase_cost_vnd,'warnings',v_list.warnings,'items',coalesce((select jsonb_agg(
        item.purchase_contract || jsonb_build_object('shoppingListItemId',item.id,'foodNameVi',food.name_vi,'groceryCategoryCode',item.grocery_category_code,
        'checked',check_state.shopping_list_item_id is not null,'checkedAt',check_state.checked_at,'policyRefs',item.policy_refs,
        'transferredToPantry',exists(select 1 from public.shopping_pantry_transfer_lines tl where tl.shopping_list_item_id=item.id),
        'sources',(select jsonb_agg(jsonb_build_object('dayIndex',mi.day_index,'mealPlanItemId',ds.meal_plan_item_id,'mealOptionId',mi.meal_option_id,
          'mealOptionVersionId',mi.meal_option_version_id,'mealOptionNameVi',mo.name_vi,'mealOptionRecipeId',ds.meal_option_recipe_id,
          'recipeVersionId',ds.recipe_version_id,'recipeIngredientId',ds.recipe_ingredient_id,'foodFactVersionId',ds.food_fact_version_id,
          'baseUnitId',ds.base_unit_id,'requiredBaseQuantity',ds.required_base_quantity,'quantityPolicyRef',ds.quantity_policy_ref)
          order by mi.day_index,ds.meal_option_recipe_id,ds.recipe_ingredient_id,ds.food_fact_version_id)
          from public.shopping_list_item_sources ds join public.meal_plan_items mi on mi.id=ds.meal_plan_item_id
          join public.meal_options mo on mo.id=mi.meal_option_id where ds.shopping_list_item_id=item.id)) order by item.food_id)
        from public.shopping_list_items item join public.foods food on food.id=item.food_id
        left join public.shopping_item_check_states check_state on check_state.shopping_list_item_id=item.id where item.shopping_list_id=v_list.id),'[]'::jsonb));
  end if;
  return jsonb_build_object(
    'status', 'ready',$new$);
 if patched=definition then raise exception using errcode='55000',message='V6_EXPECTED_FUNCTION_PATCH_NOT_FOUND: public.get_shopping_list(uuid,uuid)';end if;
 execute patched;
end $patch$;

-- A checked, pantry-covered line settles only consumption. Its added surplus is legitimately zero;
-- the existing primary key remains the once-only latch for both directions.
alter table public.shopping_pantry_transfer_lines
 drop constraint shopping_pantry_transfer_lines_transferred_base_quantity_check;
alter table public.shopping_pantry_transfer_lines
 add constraint shopping_pantry_transfer_lines_transferred_base_quantity_check
 check(private.is_canonical_decimal_text(transferred_base_quantity,true));
