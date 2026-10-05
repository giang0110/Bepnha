begin;

-- Transaction-only fixtures use the c1/c2/c3/c4/c6/c7/c8 UUID namespaces,
-- settlement_* catalog codes and price-book version 61001. Every lookup and catalog
-- update is limited to these fixtures so the test also runs on a populated local DB.

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
values ('c1000000-0000-0000-0000-000000000001', 'settlement-owner@example.test');
insert into public.households (
  id, owner_user_id, weekly_plan_budget_vnd, max_elapsed_minutes
)
values (
  'c2000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001', 700000, 30
);
insert into public.household_member_groups (household_id, member_kind, age_band, member_count)
values ('c2000000-0000-0000-0000-000000000001', 'adult', 'adult', 2);
update public.households
set onboarding_completed_at = now()
where id = 'c2000000-0000-0000-0000-000000000001';

-- Minimal immutable catalog lineage used by the engine-v6 shopping projection.
insert into public.foods (id, code, name_vi, base_dimension, base_unit_id)
select
  'c6000000-0000-0000-0000-000000000001',
  'settlement_fish',
  'Cá kiểm thử',
  'mass',
  id
from public.units where code = 'g';

insert into public.food_fact_versions (
  id, food_id, version_number, category_id, edible_fraction, provenance, created_by
)
select
  'c6000000-0000-0000-0000-000000000002',
  'c6000000-0000-0000-0000-000000000001',
  1,
  id,
  1,
  'Planner persistence fixture',
  'c1000000-0000-0000-0000-000000000001'
from public.food_categories where code = 'staple';

insert into public.food_fact_unit_conversions (
  food_fact_version_id, unit_id, base_quantity_per_unit, gross_grams_per_unit,
  display_step, provenance
)
select
  'c6000000-0000-0000-0000-000000000002', id, 1, 1, 1,
  'Planner persistence fixture'
from public.units where code = 'g';

insert into public.recipes (id, code, name_vi)
values ('c6000000-0000-0000-0000-000000000003', 'settlement_fish_recipe', 'Món planner');
insert into public.recipe_versions (
  id, recipe_id, version_number, yield_adult_equivalent, active_minutes,
  elapsed_minutes, created_by
)
values (
  'c6000000-0000-0000-0000-000000000004',
  'c6000000-0000-0000-0000-000000000003',
  1, 2, 10, 20,
  'c1000000-0000-0000-0000-000000000001'
);
insert into public.recipe_ingredients (
  id, recipe_version_id, food_id, food_fact_version_id, quantity, unit_id, sort_order
)
select
  'c6000000-0000-0000-0000-000000000005',
  'c6000000-0000-0000-0000-000000000004',
  'c6000000-0000-0000-0000-000000000001',
  'c6000000-0000-0000-0000-000000000002',
  600, id, 1
from public.units where code = 'g';

insert into public.price_books (
  id, region_id, version_number, effective_from, created_by
)
select
  'c6000000-0000-0000-0000-000000000006', id, 61001, date '2026-08-01',
  'c1000000-0000-0000-0000-000000000001'
from public.price_regions where code = 'vn_baseline';

select private.begin_catalog_transition();
update public.food_fact_versions
set publication_status = 'published',
    content_hash = repeat('f', 64),
    assessment_completed_at = now(),
    published_at = now()
where id = 'c6000000-0000-0000-0000-000000000002';
update public.foods
set status = 'published', current_fact_version_id = 'c6000000-0000-0000-0000-000000000002'
where id = 'c6000000-0000-0000-0000-000000000001';
update public.recipe_versions
set publication_status = 'published', content_hash = repeat('e', 64), published_at = now()
where id = 'c6000000-0000-0000-0000-000000000004';
update public.recipes
set status = 'published', current_version_id = 'c6000000-0000-0000-0000-000000000004'
where id = 'c6000000-0000-0000-0000-000000000003';
select private.end_catalog_transition();

insert into public.food_prices (
  id, price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
  package_base_quantity, base_unit_id, package_price_vnd, purchase_increment,
  observed_at, source_reference
)
select
  'c6000000-0000-0000-0000-000000000007',
  'c6000000-0000-0000-0000-000000000006',
  'c6000000-0000-0000-0000-000000000001',
  'c6000000-0000-0000-0000-000000000002',
  1000, id, 1000, id, 100000, 1, date '2026-08-01', 'Planner generation price'
from public.units where code = 'g';


update public.price_books set purchase_contract_version='purchase-v2' where id='c6000000-0000-0000-0000-000000000006';
insert into public.food_price_purchase_terms(food_price_id,price_book_id,base_dimension,purchase_mode,sale_step_base_quantity,provenance,content_hash)
values ('c6000000-0000-0000-0000-000000000007','c6000000-0000-0000-0000-000000000006','mass','loose_mass',50,'Synthetic reviewed fish sold in 50g steps',null);
insert into public.foods(id,code,name_vi,base_dimension,base_unit_id) select 'c6000000-0000-0000-0000-000000000010','settlement_eggs','Trứng kiểm thử','count',id from public.units where code='item';
insert into public.food_fact_versions(id,food_id,version_number,category_id,edible_fraction,provenance,created_by)
select 'c6000000-0000-0000-0000-000000000011','c6000000-0000-0000-0000-000000000010',1,id,1,'Synthetic measured 50g eggs','c1000000-0000-0000-0000-000000000001' from public.food_categories where code='egg';
insert into public.food_fact_unit_conversions(food_fact_version_id,unit_id,base_quantity_per_unit,gross_grams_per_unit,display_step,provenance)
select 'c6000000-0000-0000-0000-000000000011',id,1,50,1,'Synthetic measured egg count' from public.units where code='item';
insert into public.recipes(id,code,name_vi) values ('c6000000-0000-0000-0000-000000000012','settlement_egg_recipe','Trứng chiên');
insert into public.recipe_versions(id,recipe_id,version_number,yield_adult_equivalent,active_minutes,elapsed_minutes,created_by)
values ('c6000000-0000-0000-0000-000000000013','c6000000-0000-0000-0000-000000000012',1,2,10,20,'c1000000-0000-0000-0000-000000000001');
insert into public.recipe_ingredients(id,recipe_version_id,food_id,food_fact_version_id,quantity,unit_id,sort_order)
select 'c6000000-0000-0000-0000-000000000014','c6000000-0000-0000-0000-000000000013','c6000000-0000-0000-0000-000000000010','c6000000-0000-0000-0000-000000000011',2.4,id,1 from public.units where code='item';
-- The one fish meal needs exactly 600g; six egg meals each need a theoretical 2.4 eggs.

select private.begin_catalog_transition();
update public.food_fact_versions set publication_status='published',content_hash=repeat('f',64),assessment_completed_at=now(),published_at=now() where id='c6000000-0000-0000-0000-000000000011';
select private.end_catalog_transition();
insert into public.food_prices(id,price_book_id,food_id,food_fact_version_id,package_quantity,package_unit_id,package_base_quantity,base_unit_id,package_price_vnd,purchase_increment,observed_at,source_reference)
select 'c6000000-0000-0000-0000-000000000015','c6000000-0000-0000-0000-000000000006','c6000000-0000-0000-0000-000000000010','c6000000-0000-0000-0000-000000000011',10,id,10,id,20000,1,'2026-08-01','Synthetic reviewed loose egg sale' from public.units where code='item';
insert into public.food_price_purchase_terms(food_price_id,price_book_id,base_dimension,purchase_mode,sale_step_base_quantity,provenance,content_hash)
values ('c6000000-0000-0000-0000-000000000015','c6000000-0000-0000-0000-000000000006','count','loose_count',1,'Synthetic reviewed loose egg sale',null);
insert into public.food_quantity_policy_versions(id,food_id,food_fact_version_id,version_number,base_unit_id,base_dimension,food_form,step_base_quantity,rounding,provenance,created_by)
select 'c8000000-0000-4000-8000-000000000001','c6000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000002',1,id,'mass','portionable_mass',1,'half_up','Synthetic gram portions','c1000000-0000-0000-0000-000000000001' from public.units where code='g';
insert into public.food_quantity_policy_versions(id,food_id,food_fact_version_id,version_number,base_unit_id,base_dimension,food_form,step_base_quantity,rounding,provenance,created_by)
select 'c8000000-0000-4000-8000-000000000002','c6000000-0000-0000-0000-000000000010','c6000000-0000-0000-0000-000000000011',1,id,'count','whole_count',1,'ceil','Synthetic measured whole eggs','c1000000-0000-0000-0000-000000000001' from public.units where code='item';
select private.begin_catalog_transition();
update public.foods set status='published',current_fact_version_id='c6000000-0000-0000-0000-000000000011' where id='c6000000-0000-0000-0000-000000000010';
update public.recipe_versions set publication_status='published',content_hash=repeat('e',64),published_at=now() where id='c6000000-0000-0000-0000-000000000013';
update public.recipes set status='published',current_version_id='c6000000-0000-0000-0000-000000000013' where id='c6000000-0000-0000-0000-000000000012';
update public.food_price_purchase_terms set content_hash=case when base_dimension='count' then repeat('c',64) else repeat('b',64) end where price_book_id='c6000000-0000-0000-0000-000000000006';
update public.price_books set publication_status='published',content_hash=repeat('a',64),published_at=now() where id='c6000000-0000-0000-0000-000000000006';
update public.food_quantity_policy_versions set publication_status='published',content_hash=repeat('d',64),published_at=now() where id in ('c8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000002');
select private.end_catalog_transition();
insert into public.meal_options(id,code,name_vi) select ('c3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'settlement_option_'||n,'Bữa kiểm thử '||n from generate_series(1,7) n;
insert into public.meal_option_versions(id,meal_option_id,version_number,yield_adult_equivalent,active_minutes,elapsed_minutes,created_by)
select ('c4000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('c3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,1,2,10,20,'c1000000-0000-0000-0000-000000000001' from generate_series(1,7) n;
insert into public.meal_option_recipes(id,meal_option_version_id,recipe_id,recipe_version_id,quantity_multiplier,meal_role,sort_order)
select ('c7000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('c4000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,case when n=1 then 'c6000000-0000-0000-0000-000000000003'::uuid else 'c6000000-0000-0000-0000-000000000012'::uuid end,case when n=1 then 'c6000000-0000-0000-0000-000000000004'::uuid else 'c6000000-0000-0000-0000-000000000013'::uuid end,1,'main',1 from generate_series(1,7) n;
select private.begin_catalog_transition();
update public.meal_option_versions set publication_status='published',content_hash=repeat('e',64),published_at=now() where id::text like 'c4000000-%';
update public.meal_options mo set status='published',current_version_id=mv.id from public.meal_option_versions mv where mv.meal_option_id=mo.id and mo.id::text like 'c3000000-%';
select private.end_catalog_transition();

create function pg_temp.sources(p_food uuid) returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('dayIndex',right(mc.id::text,12)::int-1,'mealOptionId',mv.meal_option_id,'mealOptionVersionId',mv.id,'mealOptionRecipeId',mc.id,'recipeVersionId',ri.recipe_version_id,'recipeIngredientId',ri.id,'foodId',ri.food_id,'foodFactVersionId',ri.food_fact_version_id,'baseUnitId',f.base_unit_id,'requiredBaseQuantity',case when f.base_dimension='count' then '3' else '600' end,'quantityPolicyRef',jsonb_build_object('id',q.id,'contentHash',q.content_hash,'versionNumber',q.version_number)) order by mc.id)
 from public.meal_option_recipes mc join public.meal_option_versions mv on mv.id=mc.meal_option_version_id join public.recipe_ingredients ri on ri.recipe_version_id=mc.recipe_version_id join public.foods f on f.id=ri.food_id join public.food_quantity_policy_versions q on q.food_fact_version_id=ri.food_fact_version_id where f.id=p_food;
$$;
create function pg_temp.line(p_food uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('version','purchase-v2','foodId',f.id,'baseUnitId',f.base_unit_id,'baseDimension',f.base_dimension,
 'quoteBaseQuantity',trim_scale(p.package_base_quantity)::text,'quotePriceVnd',p.package_price_vnd,
 'purchaseRule',jsonb_build_object('mode',t.purchase_mode,'saleStepBaseQuantity',trim_scale(t.sale_step_base_quantity)::text),
 'purchaseProvenance',t.provenance,'purchaseTermsContentHash',t.content_hash,'requiredBaseQuantity',case when f.base_dimension='count' then '18' else '600' end,
 'pantryDeductedBaseQuantity','0','purchaseRequiredBaseQuantity',case when f.base_dimension='count' then '18' else '600' end,
 'purchaseUnitCount',case when f.base_dimension='count' then '18' else '12' end,'purchaseBaseQuantity',case when f.base_dimension='count' then '18' else '600' end,'leftoverBaseQuantity','0',
 'lineCostVnd',case when f.base_dimension='count' then 36000 else 60000 end,'foodPriceId',p.id,'priceBookId',p.price_book_id,'priceFoodFactVersionId',p.food_fact_version_id,'observedAt',p.observed_at,'freshness','current','groceryCategoryCode',case when f.base_dimension='count' then 'eggs_tofu_dairy' else 'meat_seafood' end,
 'factRefs',jsonb_build_array(jsonb_build_object('foodFactVersionId',p.food_fact_version_id,'contentHash',ff.content_hash)),
 'policyRefs',jsonb_build_array(jsonb_build_object('id',q.id,'contentHash',q.content_hash,'versionNumber',q.version_number)),'sources',pg_temp.sources(f.id))
 from public.foods f join public.food_prices p on p.food_id=f.id join public.food_price_purchase_terms t on t.food_price_id=p.id join public.food_fact_versions ff on ff.id=p.food_fact_version_id join public.food_quantity_policy_versions q on q.food_fact_version_id=ff.id where f.id=p_food and p.price_book_id='c6000000-0000-0000-0000-000000000006';
$$;
create function pg_temp.items() returns jsonb language sql stable as $$
 with source_rows as(select value s from jsonb_array_elements(pg_temp.sources('c6000000-0000-0000-0000-000000000001')||pg_temp.sources('c6000000-0000-0000-0000-000000000010'))), ingredients as(select s,ri.quantity,ri.unit_id,
 jsonb_build_object('sourceId',s->>'mealOptionRecipeId'||':'||(s->>'recipeIngredientId'),'mealOptionRecipeId',s->>'mealOptionRecipeId','recipeIngredientId',s->>'recipeIngredientId','foodId',s->>'foodId','foodFactVersionId',s->>'foodFactVersionId','baseUnitId',s->>'baseUnitId','unitId',ri.unit_id,'sourceQuantity',s->>'requiredBaseQuantity','baseQuantity',s->>'requiredBaseQuantity','grossGrams',case when ri.quantity<3 then '150' else '600' end) actual,
 jsonb_build_object('recipeIngredientId',ri.id,'foodId',ri.food_id,'foodFactVersionId',ri.food_fact_version_id,'order',1,'unitId',ri.unit_id,'baseUnitId',s->>'baseUnitId','sourceQuantity',trim_scale(ri.quantity)::text,'baseQuantity',trim_scale(ri.quantity)::text,'grossGrams',case when ri.quantity<3 then '120' else '600' end) theory
 from source_rows join public.recipe_ingredients ri on ri.id=(s->>'recipeIngredientId')::uuid)
 select jsonb_agg(jsonb_build_object('dayIndex',(s->>'dayIndex')::int,'mealSlot','primary','mealOptionId',s->>'mealOptionId','mealOptionVersionId',s->>'mealOptionVersionId','adultEquivalent','2','scaleFactor','1','snapshot',jsonb_build_object('scaledIngredients',jsonb_build_array(actual),'quantityAdjustments',jsonb_build_array(jsonb_build_object('sourceId',actual->>'sourceId','actualIngredient',actual-'sourceId'-'mealOptionRecipeId','theoreticalIngredient',theory,'policyRef',s->'quantityPolicyRef','adjustmentReason',case when quantity<3 then 'ROUND_UP_TO_WHOLE_UNIT' else 'UNCHANGED' end)))) order by (s->>'dayIndex')::int) from ingredients;
$$;
create function pg_temp.revision() returns jsonb language sql stable as $$
 with lines as(select jsonb_build_array(pg_temp.line('c6000000-0000-0000-0000-000000000001'),pg_temp.line('c6000000-0000-0000-0000-000000000010')) ls)
 select jsonb_build_object('revisionKind','generation','householdSetupVersion',(select version from public.households where id='c2000000-0000-0000-0000-000000000001'),
 'engineVersion','planner-engine-v6','portionConfigVersion','portion-v2','plannerConfigVersion','planner-v2','priceFreshnessConfigVersion','price-freshness-v1','calculationDate','2026-08-26',
 'catalogFingerprint',repeat('a',64),'inputFingerprint',repeat('b',64),'calculationFingerprint',repeat('c',64),'budgetVnd',700000,'totalEstimatedCostVnd',96000,'overageVnd',0,'budgetStatus','within','warnings','[]'::jsonb,
 'inputSnapshot',jsonb_build_object('engineVersion','planner-engine-v6','inputVersion','planner-input-v2','energyTargetConfig',jsonb_build_object('version','energy-target-v1'),'pantrySnapshot',jsonb_build_object('items','[]'::jsonb)),
 'calculationSnapshot',jsonb_build_object('shoppingList',jsonb_build_object('version','shopping-list-v2','groceryCategoryConfigVersion','grocery-category-v1','lines',ls,'warnings','[]'::jsonb,'totalEstimatedCostVnd',96000),
 'purchaseBasket',jsonb_build_object('lines',(select jsonb_agg(v-'groceryCategoryCode'-'factRefs'-'policyRefs'-'sources') from jsonb_array_elements(ls) v),'warnings','[]'::jsonb,'totalEstimatedCostVnd',96000))) from lines;
$$;
insert into public.pantry_items(household_id,food_id,food_fact_version_id,quantity,unit_id,base_quantity,base_unit_id)
select 'c2000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000010','c6000000-0000-0000-0000-000000000011',18,id,0,id from public.units where code='item';
create function pg_temp.covered_revision() returns jsonb language sql stable as $$
 with egg as (select pg_temp.line('c6000000-0000-0000-0000-000000000010')||'{"pantryDeductedBaseQuantity":"18","purchaseRequiredBaseQuantity":"0","purchaseUnitCount":"0","purchaseBaseQuantity":"0","lineCostVnd":0}'::jsonb line), lines as(select jsonb_build_array(pg_temp.line('c6000000-0000-0000-0000-000000000001'),line) ls from egg)
 select jsonb_set(jsonb_set(jsonb_set(jsonb_set(pg_temp.revision(),'{totalEstimatedCostVnd}','60000'),'{calculationSnapshot,shoppingList}',jsonb_build_object('version','shopping-list-v2','groceryCategoryConfigVersion','grocery-category-v1','lines',ls,'warnings','[]'::jsonb,'totalEstimatedCostVnd',60000)),
 '{calculationSnapshot,purchaseBasket}',jsonb_build_object('lines',(select jsonb_agg(v-'groceryCategoryCode'-'factRefs'-'policyRefs'-'sources') from jsonb_array_elements(ls) v),'warnings','[]'::jsonb,'totalEstimatedCostVnd',60000)),
 '{inputSnapshot,pantrySnapshot,items}',jsonb_build_array(jsonb_build_object('foodId','c6000000-0000-0000-0000-000000000010','baseUnitId',(select id from public.units where code='item'),'baseQuantity','18'))) from lines;
$$;

create function pg_temp.covered_plan(p_week date, p_key uuid, p_revision jsonb default null)
returns void language plpgsql as $$
declare result jsonb;
begin
  result := public.persist_meal_plan_revision(
    'c1000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000001',
    p_week, 0, null, p_key, coalesce(p_revision,pg_temp.covered_revision()), pg_temp.items()
  );
  perform set_config('bepnha.settlement_revision', result->>'revisionId', true);
  perform set_config('bepnha.settlement_plan', result->>'planId', true);
end;
$$;

create view pg_temp.egg_pantry as
select id, quantity, base_quantity, version, food_fact_version_id
from public.pantry_items
where household_id='c2000000-0000-0000-0000-000000000001'
  and food_id='c6000000-0000-0000-0000-000000000010';
create view pg_temp.egg_item as
select * from public.shopping_list_items
where food_id='c6000000-0000-0000-0000-000000000010'
  and meal_plan_revision_id=current_setting('bepnha.settlement_revision')::uuid;
create view pg_temp.egg_evidence as
select * from public.shopping_pantry_transfer_lines
where shopping_list_item_id=(select id from pg_temp.egg_item);
create view pg_temp.fish_item as
select * from public.shopping_list_items
where food_id='c6000000-0000-0000-0000-000000000001'
  and meal_plan_revision_id=current_setting('bepnha.settlement_revision')::uuid;
create view pg_temp.fish_evidence as
select * from public.shopping_pantry_transfer_lines
where shopping_list_item_id=(select id from pg_temp.fish_item);
grant select on pg_temp.egg_pantry, pg_temp.egg_item, pg_temp.egg_evidence,
  pg_temp.fish_item, pg_temp.fish_evidence to authenticated;

-- Ordinary covered stock still consumes once, and each revision owns its own latch.
select pg_temp.covered_plan('2026-09-07', 'c9000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)$$,
  '42501','AUTHENTICATION_REQUIRED','settlement requires an authenticated owner'
);
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000099',true);
select throws_ok(
  $$select public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)$$,
  '42501','SHOPPING_LIST_OWNERSHIP_REQUIRED','a foreign owner cannot settle a known revision'
);
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
select public.set_shopping_item_checked((select id from pg_temp.egg_item),true);
select is(public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)->>'transferredLineCount',
  '1','ordinary covered stock settles once');
select is((select base_quantity from pg_temp.egg_pantry),0::numeric,
  'ordinary settlement consumes the original eighteen eggs');
select is((select pantry_consumed_base_quantity from pg_temp.egg_evidence),'18',
  'ordinary settlement records actual consumption');
reset role;
update public.pantry_items set quantity=18 where id=(select id from pg_temp.egg_pantry);
set local role authenticated;
select is(public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)->>'transferredLineCount',
  '0','ordinary settlement retries add no new settled lines');
select is((select base_quantity from pg_temp.egg_pantry),18::numeric,
  'ordinary settlement retries preserve a later refill');
reset role;

-- Emptying stock before confirmation still completes the checked line, with zero actual delta.
select pg_temp.covered_plan('2026-09-14', 'c9000000-0000-4000-8000-000000000002');
update public.pantry_items set quantity=0 where id=(select id from pg_temp.egg_pantry);
select set_config('bepnha.settlement_stock_version',(select version::text from pg_temp.egg_pantry),true);
set local role authenticated;
select is(public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)->>'transferredLineCount',
  '0','an unchecked covered line is not settled');
select is((select count(*)::int from pg_temp.egg_evidence),0,
  'an unchecked zero-stock line receives no latch');
select public.set_shopping_item_checked((select id from pg_temp.egg_item),true);
select public.set_shopping_item_checked((select id from pg_temp.fish_item),true);
select set_config('bepnha.settlement_result',
  public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)::text,true);
select is(current_setting('bepnha.settlement_result')::jsonb->>'transferredLineCount',
  '1','confirmation settles a covered line whose pantry was emptied');
select is(current_setting('bepnha.settlement_result')::jsonb->>'totalTransferredLineCount',
  '1','the total includes the first zero-change settlement');
select is((select count(*)::int from pg_temp.egg_evidence),1,
  'zero-change confirmation writes the per-line latch');
select is((select pantry_consumed_base_quantity from pg_temp.egg_evidence),'0',
  'an emptied pantry records zero actual consumption');
select is((select transferred_base_quantity from pg_temp.egg_evidence),'0',
  'a zero-buy covered line records zero surplus');
select is((select pantry_item_id from pg_temp.egg_evidence),(select id from pg_temp.egg_pantry),
  'zero-change evidence keeps the existing pantry reference');
select is((select version::text from pg_temp.egg_pantry),current_setting('bepnha.settlement_stock_version'),
  'zero-change confirmation does not update the pantry version');
select is((select base_quantity from pg_temp.egg_pantry),0::numeric,
  'zero-change confirmation leaves the empty pantry unchanged');
select is((
  select (item->>'transferredToPantry')::boolean
  from jsonb_array_elements(public.get_shopping_list(
    current_setting('bepnha.settlement_plan')::uuid,
    current_setting('bepnha.settlement_revision')::uuid)->'items') item
  where item->>'foodId'='c6000000-0000-0000-0000-000000000010'
),true,'the read projection marks the zero-change line settled');
select is((select count(*)::int from pg_temp.fish_evidence),0,
  'a checked line without original deduction or surplus stays outside settlement');
select is((select purchase_base_quantity from pg_temp.egg_item),'0',
  'settlement preserves the frozen purchase quantity');
select is((select line_cost_vnd from pg_temp.egg_item),0::bigint,
  'settlement preserves the frozen purchase cost');
reset role;
update public.pantry_items set quantity=18 where id=(select id from pg_temp.egg_pantry);
select set_config('bepnha.settlement_stock_version',(select version::text from pg_temp.egg_pantry),true);
set local role authenticated;
select set_config('bepnha.settlement_result',
  public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)::text,true);
select is(current_setting('bepnha.settlement_result')::jsonb->>'transferredLineCount',
  '0','retrying a zero-change confirmation settles no further lines');
select is(current_setting('bepnha.settlement_result')::jsonb->>'totalTransferredLineCount',
  '1','a retry preserves the total settled-line count');
select is((select base_quantity from pg_temp.egg_pantry),18::numeric,
  'retrying the confirmed trip preserves stock added after its first confirmation');
select is((select version::text from pg_temp.egg_pantry),current_setting('bepnha.settlement_stock_version'),
  'retrying the confirmed trip does not update the refill version');
select is((select count(*)::int from pg_temp.egg_evidence),1,
  'the zero-change latch remains unique after retry');
reset role;

-- Deleting the row before confirmation must latch without inventing a pantry row.
update public.pantry_items set quantity=18 where id=(select id from pg_temp.egg_pantry);
select pg_temp.covered_plan('2026-09-21', 'c9000000-0000-4000-8000-000000000003');
delete from public.pantry_items where id=(select id from pg_temp.egg_pantry);
set local role authenticated;
select public.set_shopping_item_checked((select id from pg_temp.egg_item),true);
select set_config('bepnha.settlement_result',
  public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)::text,true);
select is(current_setting('bepnha.settlement_result')::jsonb->>'transferredLineCount',
  '1','confirmation settles a covered line whose pantry row was deleted');
select is(current_setting('bepnha.settlement_result')::jsonb->>'totalTransferredLineCount',
  '1','a missing pantry contributes one completed line');
select is((select count(*)::int from pg_temp.egg_pantry),0,
  'zero-change settlement does not create a pantry row');
select is((select count(*)::int from pg_temp.egg_evidence),1,
  'a deleted pantry still receives a durable settlement latch');
select ok((select pantry_item_id is null from pg_temp.egg_evidence),
  'a missing pantry is represented by a null pantry reference');
select is((select pantry_consumed_base_quantity from pg_temp.egg_evidence),'0',
  'a missing pantry records zero actual consumption');
select is((select transferred_base_quantity from pg_temp.egg_evidence),'0',
  'a missing pantry receives no invented surplus');
reset role;
insert into public.pantry_items(household_id,food_id,food_fact_version_id,quantity,unit_id,base_quantity,base_unit_id)
select 'c2000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000010',
  'c6000000-0000-0000-0000-000000000011',18,id,0,id from public.units where code='item';
set local role authenticated;
select is(public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)->>'transferredLineCount',
  '0','retrying a deleted-pantry confirmation settles no further lines');
select is((select base_quantity from pg_temp.egg_pantry),18::numeric,
  'retrying after pantry recreation preserves new stock');
select is((select count(*)::int from pg_temp.egg_evidence),1,
  'the missing-row latch remains unique after retry');
reset role;

-- Current stock smaller than the original deduction records only what was really consumed.
update public.pantry_items set quantity=18 where id=(select id from pg_temp.egg_pantry);
select pg_temp.covered_plan('2026-09-28', 'c9000000-0000-4000-8000-000000000004');
update public.pantry_items set quantity=5 where id=(select id from pg_temp.egg_pantry);
set local role authenticated;
select public.set_shopping_item_checked((select id from pg_temp.egg_item),true);
select is(public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)->>'transferredLineCount',
  '1','reduced positive stock settles in its own revision');
select is((select base_quantity from pg_temp.egg_pantry),0::numeric,
  'consumption floors reduced stock at zero');
select is((select pantry_consumed_base_quantity from pg_temp.egg_evidence),'5',
  'reduced stock records actual consumption rather than the original deduction');
reset role;
update public.pantry_items set quantity=18 where id=(select id from pg_temp.egg_pantry);
set local role authenticated;
select is(public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)->>'transferredLineCount',
  '0','retrying partial consumption settles no further lines');
select is((select base_quantity from pg_temp.egg_pantry),18::numeric,
  'retrying partial consumption preserves a later refill');
reset role;

-- A zero-delta line and a real consumption line settle together without sharing evidence.
create function pg_temp.mixed_revision() returns jsonb language sql stable as $$
  with fish as (
    select pg_temp.line('c6000000-0000-0000-0000-000000000001') ||
      '{"pantryDeductedBaseQuantity":"200","purchaseRequiredBaseQuantity":"400","purchaseUnitCount":"8","purchaseBaseQuantity":"400","lineCostVnd":40000}'::jsonb line
  ), lines as (
    select jsonb_build_array(line, pg_temp.covered_revision()#>'{calculationSnapshot,shoppingList,lines,1}') ls
    from fish
  )
  select jsonb_set(jsonb_set(jsonb_set(jsonb_set(pg_temp.covered_revision(),
    '{totalEstimatedCostVnd}','40000'),
    '{calculationSnapshot,shoppingList}',jsonb_build_object('version','shopping-list-v2',
      'groceryCategoryConfigVersion','grocery-category-v1','lines',ls,'warnings','[]'::jsonb,'totalEstimatedCostVnd',40000)),
    '{calculationSnapshot,purchaseBasket}',jsonb_build_object('lines',
      (select jsonb_agg(v-'groceryCategoryCode'-'factRefs'-'policyRefs'-'sources') from jsonb_array_elements(ls) v),
      'warnings','[]'::jsonb,'totalEstimatedCostVnd',40000)),
    '{inputSnapshot,pantrySnapshot,items}',pg_temp.covered_revision()#>'{inputSnapshot,pantrySnapshot,items}' ||
      jsonb_build_array(jsonb_build_object('foodId','c6000000-0000-0000-0000-000000000001',
        'baseUnitId',(select id from public.units where code='g'),'baseQuantity','200')))
  from lines;
$$;
insert into public.pantry_items(household_id,food_id,food_fact_version_id,quantity,unit_id,base_quantity,base_unit_id)
select 'c2000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000001',
  'c6000000-0000-0000-0000-000000000002',200,id,0,id from public.units where code='g';
create view pg_temp.fish_pantry as
select id, base_quantity, version from public.pantry_items
where household_id='c2000000-0000-0000-0000-000000000001'
  and food_id='c6000000-0000-0000-0000-000000000001';
grant select on pg_temp.fish_pantry to authenticated;
select pg_temp.covered_plan('2026-10-12','c9000000-0000-4000-8000-000000000006',pg_temp.mixed_revision());
update public.pantry_items set quantity=0 where id=(select id from pg_temp.egg_pantry);
update public.pantry_items set quantity=100 where id=(select id from pg_temp.fish_pantry);
select set_config('bepnha.settlement_stock_version',(select version::text from pg_temp.egg_pantry),true);
set local role authenticated;
select public.set_shopping_item_checked((select id from pg_temp.egg_item),true);
select public.set_shopping_item_checked((select id from pg_temp.fish_item),true);
select set_config('bepnha.settlement_result',
  public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)::text,true);
select is(current_setting('bepnha.settlement_result')::jsonb->>'transferredLineCount','2',
  'one confirmation settles mixed zero-change and actual-consumption lines');
select is(current_setting('bepnha.settlement_result')::jsonb->>'totalTransferredLineCount','2',
  'the mixed revision counts both completed lines');
select is((select pantry_consumed_base_quantity from pg_temp.egg_evidence),'0',
  'the zero-change line keeps its own zero consumption evidence');
select is((select pantry_consumed_base_quantity from pg_temp.fish_evidence),'100',
  'the nonzero line keeps its own actual consumption evidence');
select is((select version::text from pg_temp.egg_pantry),current_setting('bepnha.settlement_stock_version'),
  'mixed settlement does not update the zero-change pantry row');
select is((select base_quantity from pg_temp.fish_pantry),0::numeric,
  'mixed settlement floors the actual-consumption pantry row at zero');
reset role;
update public.pantry_items set quantity=18 where id=(select id from pg_temp.egg_pantry);
update public.pantry_items set quantity=200 where id=(select id from pg_temp.fish_pantry);
set local role authenticated;
select is(public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)->>'transferredLineCount',
  '0','a repeated mixed confirmation settles neither line again');
select is((select base_quantity from pg_temp.egg_pantry),18::numeric,
  'a mixed confirmation retry preserves refilled zero-change stock');
select is((select base_quantity from pg_temp.fish_pantry),200::numeric,
  'a mixed confirmation retry preserves refilled consumed stock');
reset role;

-- Whole-count fact identity remains a hard guard even when current stock is zero.
select pg_temp.covered_plan('2026-10-05', 'c9000000-0000-4000-8000-000000000005');
insert into public.food_fact_versions(id,food_id,version_number,category_id,edible_fraction,provenance,created_by)
select 'c6000000-0000-0000-0000-000000000016','c6000000-0000-0000-0000-000000000010',2,id,1,
  'Synthetic different egg fact','c1000000-0000-0000-0000-000000000001'
from public.food_categories where code='egg';
insert into public.food_fact_unit_conversions(food_fact_version_id,unit_id,base_quantity_per_unit,gross_grams_per_unit,display_step,provenance)
select 'c6000000-0000-0000-0000-000000000016',id,1,55,1,'Synthetic different egg count'
from public.units where code='item';
select private.begin_catalog_transition();
update public.food_fact_versions set publication_status='published',content_hash=repeat('9',64),
  assessment_completed_at=now(),published_at=now() where id='c6000000-0000-0000-0000-000000000016';
select private.end_catalog_transition();
update public.pantry_items set food_fact_version_id='c6000000-0000-0000-0000-000000000016',quantity=0
where id=(select id from pg_temp.egg_pantry);
select set_config('bepnha.settlement_stock_version',(select version::text from pg_temp.egg_pantry),true);
set local role authenticated;
select public.set_shopping_item_checked((select id from pg_temp.egg_item),true);
select throws_ok(
  $$select public.apply_shopping_to_pantry(current_setting('bepnha.settlement_revision')::uuid)$$,
  '23514','PANTRY_FACT_CHANGED_REGENERATION_REQUIRED',
  'zero-change settlement still rejects changed whole-count facts'
);
select is((select count(*)::int from pg_temp.egg_evidence),0,
  'a rejected fact change writes no settlement latch');
select is((select count(*)::int from public.shopping_pantry_transfers
  where meal_plan_revision_id=current_setting('bepnha.settlement_revision')::uuid),0,
  'a rejected fact change rolls back its transfer header');
select is((select version::text from pg_temp.egg_pantry),current_setting('bepnha.settlement_stock_version'),
  'a rejected fact change leaves the pantry version unchanged');
reset role;
select ok(not private.plan_transition_is_trusted(),
  'a rejected fact change releases the trusted transition context');

select * from finish();
rollback;
