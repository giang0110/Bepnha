begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
values ('91000000-0000-0000-0000-000000000001', 'planner-owner@example.test');
insert into public.households (
  id, owner_user_id, weekly_plan_budget_vnd, max_elapsed_minutes
)
values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001', 700000, 30
);
insert into public.household_member_groups (household_id, member_kind, age_band, member_count)
values ('92000000-0000-0000-0000-000000000001', 'adult', 'adult', 2);
update public.households
set onboarding_completed_at = now()
where id = '92000000-0000-0000-0000-000000000001';

-- Minimal immutable catalog lineage used by the engine-v2 shopping projection.
insert into public.foods (id, code, name_vi, base_dimension, base_unit_id)
select
  '96000000-0000-0000-0000-000000000001',
  'planner_food',
  'Cá kiểm thử',
  'mass',
  id
from public.units where code = 'g';

insert into public.food_fact_versions (
  id, food_id, version_number, category_id, edible_fraction, provenance, created_by
)
select
  '96000000-0000-0000-0000-000000000002',
  '96000000-0000-0000-0000-000000000001',
  1,
  id,
  1,
  'Planner persistence fixture',
  '91000000-0000-0000-0000-000000000001'
from public.food_categories where code = 'staple';

insert into public.food_fact_unit_conversions (
  food_fact_version_id, unit_id, base_quantity_per_unit, gross_grams_per_unit,
  display_step, provenance
)
select
  '96000000-0000-0000-0000-000000000002', id, 1, 1, 1,
  'Planner persistence fixture'
from public.units where code = 'g';

insert into public.recipes (id, code, name_vi)
values ('96000000-0000-0000-0000-000000000003', 'planner_recipe', 'Món planner');
insert into public.recipe_versions (
  id, recipe_id, version_number, yield_adult_equivalent, active_minutes,
  elapsed_minutes, created_by
)
values (
  '96000000-0000-0000-0000-000000000004',
  '96000000-0000-0000-0000-000000000003',
  1, 2, 10, 20,
  '91000000-0000-0000-0000-000000000001'
);
insert into public.recipe_ingredients (
  id, recipe_version_id, food_id, food_fact_version_id, quantity, unit_id, sort_order
)
select
  '96000000-0000-0000-0000-000000000005',
  '96000000-0000-0000-0000-000000000004',
  '96000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000002',
  600, id, 1
from public.units where code = 'g';

insert into public.price_books (
  id, region_id, version_number, effective_from, created_by
)
select
  '96000000-0000-0000-0000-000000000006', id, 1, date '2026-08-01',
  '91000000-0000-0000-0000-000000000001'
from public.price_regions where code = 'vn_baseline';

select private.begin_catalog_transition();
update public.food_fact_versions
set publication_status = 'published',
    content_hash = repeat('f', 64),
    assessment_completed_at = now(),
    published_at = now()
where id = '96000000-0000-0000-0000-000000000002';
update public.foods
set status = 'published', current_fact_version_id = '96000000-0000-0000-0000-000000000002'
where id = '96000000-0000-0000-0000-000000000001';
update public.recipe_versions
set publication_status = 'published', content_hash = repeat('e', 64), published_at = now()
where id = '96000000-0000-0000-0000-000000000004';
update public.recipes
set status = 'published', current_version_id = '96000000-0000-0000-0000-000000000004'
where id = '96000000-0000-0000-0000-000000000003';
select private.end_catalog_transition();

insert into public.food_prices (
  id, price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
  package_base_quantity, base_unit_id, package_price_vnd, purchase_increment,
  observed_at, source_reference
)
select
  '96000000-0000-0000-0000-000000000007',
  '96000000-0000-0000-0000-000000000006',
  '96000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000002',
  1000, id, 1000, id, 100000, 1, date '2026-08-01', 'Planner generation price'
from public.units where code = 'g';


select has_function('private','assert_v6_purchase_line',array['jsonb'],'v6 purchase proof is authoritative');
select has_function('private','assert_revision_shopping_v6',array['uuid'],'v6 revision proof is separate from legacy');
select has_column('public','shopping_list_items','purchase_contract','v2 stores explicit purchasing contract');
select ok(pg_get_functiondef('private.assert_revision_shopping_row(uuid)'::regprocedure) like '%assert_revision_shopping_v6%', 'shopping guard dispatches v6 to full proof');
select ok(pg_get_functiondef('private.assert_plan_summary_row(uuid)'::regprocedure) like '%planner-engine-v6%', 'summary guard accepts v6');
select ok(pg_get_functiondef('public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure) like '%shopping-list-v2%', 'persistence requires v2 contract for v6');

update public.price_books set purchase_contract_version='purchase-v2' where id='96000000-0000-0000-0000-000000000006';
insert into public.food_price_purchase_terms(food_price_id,price_book_id,base_dimension,purchase_mode,sale_step_base_quantity,provenance,content_hash)
values ('96000000-0000-0000-0000-000000000007','96000000-0000-0000-0000-000000000006','mass','loose_mass',50,'Synthetic reviewed fish sold in 50g steps',null);
insert into public.foods(id,code,name_vi,base_dimension,base_unit_id) select '96000000-0000-0000-0000-000000000010','v6_eggs','Trứng kiểm thử','count',id from public.units where code='item';
insert into public.food_fact_versions(id,food_id,version_number,category_id,edible_fraction,provenance,created_by)
select '96000000-0000-0000-0000-000000000011','96000000-0000-0000-0000-000000000010',1,id,1,'Synthetic measured 50g eggs','91000000-0000-0000-0000-000000000001' from public.food_categories where code='egg';
insert into public.food_fact_unit_conversions(food_fact_version_id,unit_id,base_quantity_per_unit,gross_grams_per_unit,display_step,provenance)
select '96000000-0000-0000-0000-000000000011',id,1,50,1,'Synthetic measured egg count' from public.units where code='item';
insert into public.recipes(id,code,name_vi) values ('96000000-0000-0000-0000-000000000012','v6_egg_recipe','Trứng chiên');
insert into public.recipe_versions(id,recipe_id,version_number,yield_adult_equivalent,active_minutes,elapsed_minutes,created_by)
values ('96000000-0000-0000-0000-000000000013','96000000-0000-0000-0000-000000000012',1,2,10,20,'91000000-0000-0000-0000-000000000001');
insert into public.recipe_ingredients(id,recipe_version_id,food_id,food_fact_version_id,quantity,unit_id,sort_order)
select '96000000-0000-0000-0000-000000000014','96000000-0000-0000-0000-000000000013','96000000-0000-0000-0000-000000000010','96000000-0000-0000-0000-000000000011',2.4,id,1 from public.units where code='item';
-- The one fish meal needs exactly 600g; six egg meals each need a theoretical 2.4 eggs.

select private.begin_catalog_transition();
update public.food_fact_versions set publication_status='published',content_hash=repeat('f',64),assessment_completed_at=now(),published_at=now() where id='96000000-0000-0000-0000-000000000011';
select private.end_catalog_transition();
insert into public.food_prices(id,price_book_id,food_id,food_fact_version_id,package_quantity,package_unit_id,package_base_quantity,base_unit_id,package_price_vnd,purchase_increment,observed_at,source_reference)
select '96000000-0000-0000-0000-000000000015','96000000-0000-0000-0000-000000000006','96000000-0000-0000-0000-000000000010','96000000-0000-0000-0000-000000000011',10,id,10,id,20000,1,'2026-08-01','Synthetic reviewed loose egg sale' from public.units where code='item';
insert into public.food_price_purchase_terms(food_price_id,price_book_id,base_dimension,purchase_mode,sale_step_base_quantity,provenance,content_hash)
values ('96000000-0000-0000-0000-000000000015','96000000-0000-0000-0000-000000000006','count','loose_count',1,'Synthetic reviewed loose egg sale',null);
insert into public.food_quantity_policy_versions(id,food_id,food_fact_version_id,version_number,base_unit_id,base_dimension,food_form,step_base_quantity,rounding,provenance,created_by)
select '98000000-0000-4000-8000-000000000001','96000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000002',1,id,'mass','portionable_mass',1,'half_up','Synthetic gram portions','91000000-0000-0000-0000-000000000001' from public.units where code='g';
insert into public.food_quantity_policy_versions(id,food_id,food_fact_version_id,version_number,base_unit_id,base_dimension,food_form,step_base_quantity,rounding,provenance,created_by)
select '98000000-0000-4000-8000-000000000002','96000000-0000-0000-0000-000000000010','96000000-0000-0000-0000-000000000011',1,id,'count','whole_count',1,'ceil','Synthetic measured whole eggs','91000000-0000-0000-0000-000000000001' from public.units where code='item';
select private.begin_catalog_transition();
update public.foods set status='published',current_fact_version_id='96000000-0000-0000-0000-000000000011' where id='96000000-0000-0000-0000-000000000010';
update public.recipe_versions set publication_status='published',content_hash=repeat('e',64),published_at=now() where id='96000000-0000-0000-0000-000000000013';
update public.recipes set status='published',current_version_id='96000000-0000-0000-0000-000000000013' where id='96000000-0000-0000-0000-000000000012';
update public.food_price_purchase_terms set content_hash=case when base_dimension='count' then repeat('c',64) else repeat('b',64) end where price_book_id='96000000-0000-0000-0000-000000000006';
update public.price_books set publication_status='published',content_hash=repeat('a',64),published_at=now() where id='96000000-0000-0000-0000-000000000006';
update public.food_quantity_policy_versions set publication_status='published',content_hash=repeat('d',64),published_at=now() where id in ('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002');
select private.end_catalog_transition();
insert into public.meal_options(id,code,name_vi) select ('93000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'v6_option_'||n,'Bữa kiểm thử '||n from generate_series(1,7) n;
insert into public.meal_option_versions(id,meal_option_id,version_number,yield_adult_equivalent,active_minutes,elapsed_minutes,created_by)
select ('94000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('93000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,1,2,10,20,'91000000-0000-0000-0000-000000000001' from generate_series(1,7) n;
insert into public.meal_option_recipes(id,meal_option_version_id,recipe_id,recipe_version_id,quantity_multiplier,meal_role,sort_order)
select ('97000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('94000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,case when n=1 then '96000000-0000-0000-0000-000000000003'::uuid else '96000000-0000-0000-0000-000000000012'::uuid end,case when n=1 then '96000000-0000-0000-0000-000000000004'::uuid else '96000000-0000-0000-0000-000000000013'::uuid end,1,'main',1 from generate_series(1,7) n;
select private.begin_catalog_transition();
update public.meal_option_versions set publication_status='published',content_hash=repeat('e',64),published_at=now() where id::text like '94000000-%';
update public.meal_options mo set status='published',current_version_id=mv.id from public.meal_option_versions mv where mv.meal_option_id=mo.id and mo.id::text like '93000000-%';
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
 from public.foods f join public.food_prices p on p.food_id=f.id join public.food_price_purchase_terms t on t.food_price_id=p.id join public.food_fact_versions ff on ff.id=p.food_fact_version_id join public.food_quantity_policy_versions q on q.food_fact_version_id=ff.id where f.id=p_food and p.price_book_id='96000000-0000-0000-0000-000000000006';
$$;
create function pg_temp.items() returns jsonb language sql stable as $$
 with source_rows as(select value s from jsonb_array_elements(pg_temp.sources('96000000-0000-0000-0000-000000000001')||pg_temp.sources('96000000-0000-0000-0000-000000000010'))), ingredients as(select s,ri.quantity,ri.unit_id,
 jsonb_build_object('sourceId',s->>'mealOptionRecipeId'||':'||(s->>'recipeIngredientId'),'mealOptionRecipeId',s->>'mealOptionRecipeId','recipeIngredientId',s->>'recipeIngredientId','foodId',s->>'foodId','foodFactVersionId',s->>'foodFactVersionId','baseUnitId',s->>'baseUnitId','unitId',ri.unit_id,'sourceQuantity',s->>'requiredBaseQuantity','baseQuantity',s->>'requiredBaseQuantity','grossGrams',case when ri.quantity<3 then '150' else '600' end) actual,
 jsonb_build_object('recipeIngredientId',ri.id,'foodId',ri.food_id,'foodFactVersionId',ri.food_fact_version_id,'order',1,'unitId',ri.unit_id,'baseUnitId',s->>'baseUnitId','sourceQuantity',trim_scale(ri.quantity)::text,'baseQuantity',trim_scale(ri.quantity)::text,'grossGrams',case when ri.quantity<3 then '120' else '600' end) theory
 from source_rows join public.recipe_ingredients ri on ri.id=(s->>'recipeIngredientId')::uuid)
 select jsonb_agg(jsonb_build_object('dayIndex',(s->>'dayIndex')::int,'mealSlot','primary','mealOptionId',s->>'mealOptionId','mealOptionVersionId',s->>'mealOptionVersionId','adultEquivalent','2','scaleFactor','1','snapshot',jsonb_build_object('scaledIngredients',jsonb_build_array(actual),'quantityAdjustments',jsonb_build_array(jsonb_build_object('sourceId',actual->>'sourceId','actualIngredient',actual-'sourceId'-'mealOptionRecipeId','theoreticalIngredient',theory,'policyRef',s->'quantityPolicyRef','adjustmentReason',case when quantity<3 then 'ROUND_UP_TO_WHOLE_UNIT' else 'UNCHANGED' end)))) order by (s->>'dayIndex')::int) from ingredients;
$$;
create function pg_temp.revision() returns jsonb language sql stable as $$
 with lines as(select jsonb_build_array(pg_temp.line('96000000-0000-0000-0000-000000000001'),pg_temp.line('96000000-0000-0000-0000-000000000010')) ls)
 select jsonb_build_object('revisionKind','generation','householdSetupVersion',(select version from public.households where id='92000000-0000-0000-0000-000000000001'),
 'engineVersion','planner-engine-v6','portionConfigVersion','portion-v2','plannerConfigVersion','planner-v2','priceFreshnessConfigVersion','price-freshness-v1','calculationDate','2026-08-26',
 'catalogFingerprint',repeat('a',64),'inputFingerprint',repeat('b',64),'calculationFingerprint',repeat('c',64),'budgetVnd',700000,'totalEstimatedCostVnd',96000,'overageVnd',0,'budgetStatus','within','warnings','[]'::jsonb,
 'inputSnapshot',jsonb_build_object('engineVersion','planner-engine-v6','inputVersion','planner-input-v2','energyTargetConfig',jsonb_build_object('version','energy-target-v1'),'pantrySnapshot',jsonb_build_object('items','[]'::jsonb)),
 'calculationSnapshot',jsonb_build_object('shoppingList',jsonb_build_object('version','shopping-list-v2','groceryCategoryConfigVersion','grocery-category-v1','lines',ls,'warnings','[]'::jsonb,'totalEstimatedCostVnd',96000),
 'purchaseBasket',jsonb_build_object('lines',(select jsonb_agg(v-'groceryCategoryCode'-'factRefs'-'policyRefs'-'sources') from jsonb_array_elements(ls) v),'warnings','[]'::jsonb,'totalEstimatedCostVnd',96000))) from lines;
$$;
select lives_ok($$ select private.assert_v6_purchase_line(pg_temp.line('96000000-0000-0000-0000-000000000001')) $$,'600g loose fish costs exactly 60000 VND');
select lives_ok($$ select private.assert_v6_purchase_line(pg_temp.line('96000000-0000-0000-0000-000000000010')) $$,'actual eighteen eggs have integer count');
select throws_ok(format('select private.assert_v6_purchase_line(%L::jsonb)',pg_temp.line('96000000-0000-0000-0000-000000000001')||change),'23514',null,'rejects tampered purchase: '||change::text)
from (values ('{"purchaseBaseQuantity":"1000"}'::jsonb),('{"purchaseUnitCount":"12.1"}'),('{"lineCostVnd":60001}'),('{"leftoverBaseQuantity":"0.6"}'),('{"quotePriceVnd":90000}'),('{"purchaseTermsContentHash":"bad"}'),('{"purchaseRule":{"mode":"loose_count","saleStepBaseQuantity":"1"}}'),('{"foodPriceId":"96000000-0000-0000-0000-000000000015"}')) v(change);
select throws_ok(format('select private.assert_v6_purchase_line(%L::jsonb)',pg_temp.line('96000000-0000-0000-0000-000000000010')||'{"requiredBaseQuantity":"18.4"}'),'23514',null,'rejects fractional whole eggs');
select throws_ok($$select public.persist_meal_plan_revision('91000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','2026-08-31',0,null,'99000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.revision(),'{calculationSnapshot,shoppingList,version}','"shopping-list-v1"'),pg_temp.items())$$,'22023','INVALID_REVISION_METADATA','v6 cannot persist a v1 shopping contract');
select lives_ok($$select public.persist_meal_plan_revision('91000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','2026-08-31',0,null,'99000000-0000-4000-8000-000000000001',pg_temp.revision(),pg_temp.items())$$,'persists seven v6 meals with actual fish and eggs');
select is((select purchase_base_quantity from public.shopping_list_items where food_id='96000000-0000-0000-0000-000000000001'),'600','fish purchase stays 600g');
select is((select purchase_base_quantity from public.shopping_list_items where food_id='96000000-0000-0000-0000-000000000010'),'18','six 2.4-egg theoretical meals cook eighteen whole eggs');
select ok((select bool_and(package_base_quantity is null and purchase_package_count is null) from public.shopping_list_items),'loose rows carry no fabricated packages');
select is((select count(*)::int from public.pantry_items where household_id='92000000-0000-0000-0000-000000000001'),0,'generation does not mutate pantry');
select throws_ok(format('select private.assert_v6_cooking_source(%L,%L::jsonb)',(select id from public.meal_plan_items where day_index=1),(pg_temp.sources('96000000-0000-0000-0000-000000000010')->0)||'{"requiredBaseQuantity":"2.4"}'),'23514','V6_COOKING_ACTUAL_QUANTITY_MISMATCH','source cannot use theoretical eggs');
select throws_ok(format('select private.assert_v6_cooking_source(%L,%L::jsonb)',(select id from public.meal_plan_items where day_index=1),jsonb_set(pg_temp.sources('96000000-0000-0000-0000-000000000010')->0,'{quantityPolicyRef,contentHash}','"bad"')),'23514','V6_COOKING_POLICY_OR_LINEAGE_MISMATCH','source requires exact published policy hash');
-- Explicit fixed packs remain fixed, and SQL applies currency rounding once after pricing.
insert into public.price_books(id,region_id,version_number,effective_from,created_by,purchase_contract_version)
select '96000000-0000-0000-0000-000000000020',id,2,'2026-08-01','91000000-0000-0000-0000-000000000001','purchase-v2' from public.price_regions where code='vn_baseline';
insert into public.food_prices(id,price_book_id,food_id,food_fact_version_id,package_quantity,package_unit_id,package_base_quantity,base_unit_id,package_price_vnd,purchase_increment,observed_at,source_reference)
select '96000000-0000-0000-0000-000000000021','96000000-0000-0000-0000-000000000020','96000000-0000-0000-0000-000000000010','96000000-0000-0000-0000-000000000011',10,id,10,id,20000,1,'2026-08-01','Synthetic reviewed fixed egg box' from public.units where code='item';
insert into public.food_prices(id,price_book_id,food_id,food_fact_version_id,package_quantity,package_unit_id,package_base_quantity,base_unit_id,package_price_vnd,purchase_increment,observed_at,source_reference)
select '96000000-0000-0000-0000-000000000022','96000000-0000-0000-0000-000000000020','96000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000002',12,id,12,id,1,1,'2026-08-01','Synthetic exact half VND fixture' from public.units where code='g';
insert into public.food_price_purchase_terms(food_price_id,price_book_id,base_dimension,purchase_mode,pack_increment,sale_step_base_quantity,provenance)
values ('96000000-0000-0000-0000-000000000021','96000000-0000-0000-0000-000000000020','count','fixed_pack',1,null,'Synthetic reviewed fixed egg box'),
('96000000-0000-0000-0000-000000000022','96000000-0000-0000-0000-000000000020','mass','loose_mass',null,1,'Synthetic exact half VND fixture');
select private.begin_catalog_transition();
update public.food_price_purchase_terms set content_hash=repeat('e',64) where price_book_id='96000000-0000-0000-0000-000000000020';
update public.price_books set publication_status='published',content_hash=repeat('e',64),published_at=now() where id='96000000-0000-0000-0000-000000000020';
select private.end_catalog_transition();
select lives_ok(format('select private.assert_v6_purchase_line(%L::jsonb)',(pg_temp.line('96000000-0000-0000-0000-000000000010')||jsonb_build_object('foodPriceId','96000000-0000-0000-0000-000000000021','priceBookId','96000000-0000-0000-0000-000000000020','purchaseRule',jsonb_build_object('mode','fixed_pack','packIncrement','1'),'purchaseTermsContentHash',repeat('e',64),'purchaseProvenance','Synthetic reviewed fixed egg box','purchaseUnitCount','2','purchaseBaseQuantity','20','leftoverBaseQuantity','2','lineCostVnd',40000))),'eighteen required eggs buy two fixed boxes of ten');
select lives_ok(format('select private.assert_v6_purchase_line(%L::jsonb)',(pg_temp.line('96000000-0000-0000-0000-000000000001')||jsonb_build_object('foodPriceId','96000000-0000-0000-0000-000000000022','priceBookId','96000000-0000-0000-0000-000000000020','purchaseRule',jsonb_build_object('mode','loose_mass','saleStepBaseQuantity','1'),'purchaseTermsContentHash',repeat('e',64),'purchaseProvenance','Synthetic exact half VND fixture','quoteBaseQuantity','12','quotePriceVnd',1,'requiredBaseQuantity','6','purchaseRequiredBaseQuantity','6','purchaseUnitCount','6','purchaseBaseQuantity','6','lineCostVnd',1))),'exact half VND rounds to one VND');
select throws_ok(format('select private.assert_v6_purchase_line(%L::jsonb)',(pg_temp.line('96000000-0000-0000-0000-000000000001')||jsonb_build_object('foodPriceId','96000000-0000-0000-0000-000000000022','priceBookId','96000000-0000-0000-0000-000000000020','purchaseRule',jsonb_build_object('mode','loose_mass','saleStepBaseQuantity','1'),'purchaseTermsContentHash',repeat('e',64),'purchaseProvenance','Synthetic exact half VND fixture','quoteBaseQuantity','12','quotePriceVnd',1,'requiredBaseQuantity','6','purchaseRequiredBaseQuantity','6','purchaseUnitCount','6','purchaseBaseQuantity','6','lineCostVnd',0))),'23514','V6_PURCHASE_QUANTITY_OR_COST_MISMATCH','rejects truncating half VND');

insert into public.pantry_items(household_id,food_id,food_fact_version_id,quantity,unit_id,base_quantity,base_unit_id)
select '92000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000010','96000000-0000-0000-0000-000000000011',18,id,0,id from public.units where code='item';
create function pg_temp.covered_revision() returns jsonb language sql stable as $$
 with egg as (select pg_temp.line('96000000-0000-0000-0000-000000000010')||'{"pantryDeductedBaseQuantity":"18","purchaseRequiredBaseQuantity":"0","purchaseUnitCount":"0","purchaseBaseQuantity":"0","lineCostVnd":0}'::jsonb line), lines as(select jsonb_build_array(pg_temp.line('96000000-0000-0000-0000-000000000001'),line) ls from egg)
 select jsonb_set(jsonb_set(jsonb_set(jsonb_set(pg_temp.revision(),'{totalEstimatedCostVnd}','60000'),'{calculationSnapshot,shoppingList}',jsonb_build_object('version','shopping-list-v2','groceryCategoryConfigVersion','grocery-category-v1','lines',ls,'warnings','[]'::jsonb,'totalEstimatedCostVnd',60000)),
 '{calculationSnapshot,purchaseBasket}',jsonb_build_object('lines',(select jsonb_agg(v-'groceryCategoryCode'-'factRefs'-'policyRefs'-'sources') from jsonb_array_elements(ls) v),'warnings','[]'::jsonb,'totalEstimatedCostVnd',60000)),
 '{inputSnapshot,pantrySnapshot,items}',jsonb_build_array(jsonb_build_object('foodId','96000000-0000-0000-0000-000000000010','baseUnitId',(select id from public.units where code='item'),'baseQuantity','18'))) from lines;
$$;
select lives_ok($$select public.persist_meal_plan_revision('91000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','2026-09-07',0,null,'99000000-0000-4000-8000-000000000002',pg_temp.covered_revision(),pg_temp.items())$$,'fully covered stock retains a zero-buy shopping row');
select is((select purchase_base_quantity from public.shopping_list_items where food_id='96000000-0000-0000-0000-000000000010' and meal_plan_revision_id=(select current_revision_id from public.meal_plans where week_start='2026-09-07')),'0','covered eggs need no purchase');
select is((select base_quantity from public.pantry_items)::numeric,18::numeric,'generation keeps stock untouched');
select set_config('bepnha.test_plan',(select id::text from public.meal_plans where week_start='2026-09-07'),true);
select set_config('bepnha.test_revision',(select current_revision_id::text from public.meal_plans where week_start='2026-09-07'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select is(public.get_shopping_list(current_setting('bepnha.test_plan')::uuid,null)->>'snapshotVersion','shopping-list-v2','owner reads the exact v2 revision');
select is((select base_quantity from public.pantry_items)::numeric,18::numeric,'reading keeps stock untouched');
select public.set_shopping_item_checked((select id from public.shopping_list_items where food_id='96000000-0000-0000-0000-000000000010' and meal_plan_revision_id=current_setting('bepnha.test_revision')::uuid),true);
select is(public.apply_shopping_to_pantry(current_setting('bepnha.test_revision')::uuid)->>'transferredLineCount','1','explicit confirmation settles the covered row');
select is((select base_quantity from public.pantry_items)::numeric,0::numeric,'confirmation deducts the eighteen stocked eggs');
select is(public.apply_shopping_to_pantry(current_setting('bepnha.test_revision')::uuid)->>'transferredLineCount','0','repeated confirmation does not deduct twice');
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000099',true);
select is(public.get_shopping_list(current_setting('bepnha.test_plan')::uuid,null),null::jsonb,'foreign owner cannot read a known plan ID');
select throws_ok($$select public.apply_shopping_to_pantry(current_setting('bepnha.test_revision')::uuid)$$,'42501',null,'foreign owner cannot confirm a known revision');
reset role;

select * from finish();
rollback;
