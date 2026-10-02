-- Atomic household profile input and authoritative whole-unit pantry writes.
CREATE OR REPLACE FUNCTION public.get_planner_generation_input(p_household_id uuid, p_week_start date, p_calculation_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'household', to_jsonb(household),
    'memberGroups', coalesce((
      select jsonb_agg(to_jsonb(member_group) order by member_group.age_band)
      from public.household_member_groups as member_group
      where member_group.household_id = household.id
    ), '[]'::jsonb),
    'foodRules', coalesce((
      select jsonb_agg(rule.rule_code order by rule.rule_code)
      from public.household_food_rules as rule where rule.household_id = household.id
    ), '[]'::jsonb),
    -- Only the rules that departed from the default travel, so a planner input carrying no
    -- strictness at all still filters strictly.
    'foodRuleStrictness', coalesce((
      select jsonb_object_agg(rule.rule_code, rule.allergen_strictness)
      from public.household_food_rules as rule
      where rule.household_id = household.id and rule.allergen_strictness <> 'strict'
    ), '{}'::jsonb),
    'weekStart', p_week_start,
    'calculationDate', p_calculation_date,
    'mealOptionVersionIds', coalesce((
      select jsonb_agg(version.id order by version.id)
      from public.meal_options as identity
      join public.meal_option_versions as version on version.id = identity.current_version_id
      where identity.status = 'published' and identity.retired_at is null
        and version.publication_status = 'published'
    ), '[]'::jsonb),
    'priceBook', public.get_current_price_book(household.price_region_id)
  ) || jsonb_build_object('inputVersion','planner-input-v2')
    || case when household.nutrition_setup_version is null then '{}'::jsonb
       else jsonb_build_object('nutritionSetup',public.get_household_setup_v2()->'nutritionSetup') end
  from public.households as household
  where household.id = p_household_id
    and household.owner_user_id = (select auth.uid())
    and household.onboarding_completed_at is not null
    and extract(isodow from p_week_start) = 1;
$function$

;

create function public.get_plan_revision_for_owner(p_household_id uuid,p_week_start date,p_revision_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('plan',to_jsonb(p),'revision',to_jsonb(r)) from public.meal_plans p
 join public.meal_plan_revisions r on r.meal_plan_id=p.id and r.id=p_revision_id and r.state='ready'
 join public.households h on h.id=p.household_id
 where p.household_id=p_household_id and p.week_start=p_week_start and h.owner_user_id=(select auth.uid());
$$;
revoke all on function public.get_plan_revision_for_owner(uuid,date,uuid) from public,anon;
grant execute on function public.get_plan_revision_for_owner(uuid,date,uuid) to authenticated;

create function private.enforce_whole_unit_pantry_write() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.food_quantity_policy_versions;
begin
 -- Preserve historical confirmation arithmetic only inside its protected, owner-checked RPC.
 -- An arbitrary caller-supplied setting cannot create the private transition context.
 if private.plan_transition_is_trusted() and exists(select 1 from public.meal_plan_revisions r
    join public.meal_plans p on p.id=r.meal_plan_id join public.households h on h.id=p.household_id
    where r.id::text=current_setting('bepnha.shopping_transition_revision',true)
      and r.engine_version in ('planner-engine-v1','planner-engine-v2','planner-engine-v3','planner-engine-v4','planner-engine-v5')
      and h.owner_user_id=auth.uid()) then return new; end if;
 select * into q from public.food_quantity_policy_versions where food_fact_version_id=new.food_fact_version_id
   and publication_status='published' order by version_number desc limit 1;
 if q.id is null then return new; end if;
 if q.food_form='whole_count' and new.base_quantity<>trunc(new.base_quantity) then
   raise exception using errcode='23514',message='INVALID_INDIVISIBLE_PANTRY_QUANTITY';
 end if;
 if q.food_form='whole_piece' and not exists(select 1 from public.food_fact_unit_conversions c join public.units u on u.id=c.unit_id
   where c.food_fact_version_id=q.food_fact_version_id and u.dimension='count'
     and q.step_base_quantity*u.to_dimension_base/c.base_quantity_per_unit=trunc(q.step_base_quantity*u.to_dimension_base/c.base_quantity_per_unit)
     and new.base_quantity*u.to_dimension_base/c.base_quantity_per_unit=trunc(new.base_quantity*u.to_dimension_base/c.base_quantity_per_unit)) then
   raise exception using errcode='23514',message='INVALID_INDIVISIBLE_PANTRY_QUANTITY';
 end if;
 return new;
end $$;
revoke all on function private.enforce_whole_unit_pantry_write() from public,anon,authenticated,service_role;
create trigger pantry_items_z_whole_unit_guard before insert or update on public.pantry_items
for each row execute function private.enforce_whole_unit_pantry_write();

do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.apply_shopping_to_pantry(uuid)'::regprocedure);
 patched:=replace(definition,E'begin\n',E'begin\n  perform private.begin_plan_transition();\n  perform set_config(\'bepnha.shopping_transition_revision\',p_meal_plan_revision_id::text,true);\n');
 patched:=replace(patched,'  v_fact_version_id uuid;',E'  v_fact_version_id uuid;\n  v_is_v6 boolean;');
 patched:=replace(patched,'  select list.id, plan.household_id','  select list.id, plan.household_id, revision.engine_version = ''planner-engine-v6''');
 patched:=replace(patched,'  into v_shopping_list_id, v_household_id','  into v_shopping_list_id, v_household_id, v_is_v6');
 patched:=replace(patched,'  join public.meal_plans as plan on plan.id = list.meal_plan_id',E'  join public.meal_plans as plan on plan.id = list.meal_plan_id\n  join public.meal_plan_revisions as revision on revision.id = list.meal_plan_revision_id');
 patched:=replace(patched,'      item.base_unit_id,',E'      item.base_unit_id,\n      item.price_food_fact_version_id,\n      item.policy_refs,');
 patched:=replace(patched,$old$    if v_has_pantry_row then
      v_fact_version_id := v_existing.food_fact_version_id;$old$,$new$    if v_has_pantry_row then
      -- Whole pieces have an immutable measured identity. A later stock edit needs an explicit
      -- regeneration decision; it must not merge two facts merely because both use grams.
      if v_is_v6 and v_existing.food_fact_version_id is distinct from v_item.price_food_fact_version_id
        and exists (select 1 from jsonb_array_elements(v_item.policy_refs) as ref
          join public.food_quantity_policy_versions q on q.id = (ref->>'id')::uuid
          where q.food_form in ('whole_count','whole_piece')) then
        raise exception using errcode = '23514', message = 'PANTRY_FACT_CHANGED_REGENERATION_REQUIRED';
      end if;
      v_fact_version_id := v_existing.food_fact_version_id;$new$);
 patched:=replace(patched,$old$      select food.current_fact_version_id
      into v_fact_version_id
      from public.foods as food
      where food.id = v_item.food_id;$old$,$new$      if v_is_v6 then
        v_fact_version_id := v_item.price_food_fact_version_id;
      else
        select food.current_fact_version_id
        into v_fact_version_id
        from public.foods as food
        where food.id = v_item.food_id;
      end if;$new$);
 patched:=replace(patched,E'  return jsonb_build_object(',E'  perform private.end_plan_transition();\n  return jsonb_build_object(');
 patched:=replace(patched,E'end;\n$function$',E'exception when others then\n  perform private.end_plan_transition();\n  raise;\nend;\n$function$');
 if patched=definition or patched not like '%shopping_transition_revision%' or patched not like '%exception when others%'
   or patched not like '%PANTRY_FACT_CHANGED_REGENERATION_REQUIRED%'
   or patched not like '%v_fact_version_id := v_item.price_food_fact_version_id%'
   or patched not like '%v_household_id, v_is_v6%' then raise exception using errcode='55000',message='NUTRITION_PANTRY_TRANSITION_PATCH_REQUIRED';end if;
 execute patched;
end $patch$;

-- Reproduce the explicit immutable legacy fixed-pack contract; never infer loose sale terms.
do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.assert_v6_purchase_line(jsonb)'::regprocedure);
 patched:=replace(definition,'rule jsonb;','rule jsonb; legacy boolean; terms_hash text; terms_provenance text;');
 patched:=replace(patched,' and b.purchase_contract_version=''purchase-v2''','');
 patched:=replace(patched,'if p.id is null or t.food_price_id is null or t.content_hash is null then',
  'legacy:=(select purchase_contract_version is null from public.price_books where id=p.price_book_id); if p.id is null or (not legacy and (t.food_price_id is null or t.content_hash is null)) or (legacy and t.food_price_id is not null) then');
 patched:=replace(patched,'rule:=case when',
  'if legacy then terms_hash:=encode(extensions.digest(convert_to(concat_ws(''|'',''legacy-fixed-pack-v1'',p.id::text,p.price_book_id::text,p.food_id::text,p.food_fact_version_id::text,p.base_unit_id::text,f.base_dimension::text,trim_scale(p.package_base_quantity)::text,p.package_price_vnd::text,trim_scale(p.purchase_increment)::text,p.observed_at::text,p.source_reference),''UTF8''),''sha256''),''hex''); terms_provenance:=''Published legacy fixed-pack terms: ''||p.source_reference; else terms_hash:=t.content_hash;terms_provenance:=t.provenance;end if; rule:=case when legacy then jsonb_build_object(''mode'',''fixed_pack'',''packIncrement'',trim_scale(p.purchase_increment)::text) when');
 patched:=replace(patched,'is distinct from t.provenance','is distinct from terms_provenance');
 patched:=replace(patched,'is distinct from t.content_hash','is distinct from terms_hash');
 patched:=replace(patched,'or t.base_dimension is distinct from f.base_dimension','or (not legacy and t.base_dimension is distinct from f.base_dimension)');
 patched:=replace(patched,'when t.purchase_mode=''fixed_pack'' then p.package_base_quantity*t.pack_increment','when legacy then p.package_base_quantity*p.purchase_increment when t.purchase_mode=''fixed_pack'' then p.package_base_quantity*t.pack_increment');
 patched:=replace(patched,'when t.purchase_mode=''fixed_pack'' then t.pack_increment','when legacy then p.purchase_increment when t.purchase_mode=''fixed_pack'' then t.pack_increment');
 patched:=replace(patched,'when t.purchase_mode=''fixed_pack'' then units*p.package_base_quantity','when legacy or t.purchase_mode=''fixed_pack'' then units*p.package_base_quantity');
 if patched=definition or patched not like '%legacy-fixed-pack-v1%' then raise exception using errcode='55000',message='LEGACY_FIXED_PACK_PROOF_PATCH_REQUIRED'; end if;
 execute patched;
end $patch$;

create function private.assert_v6_household_profile_pin(p_revision_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.meal_plan_revisions; h public.households; profile_snapshot jsonb; expected_profiles jsonb; expected_groups jsonb; actual_groups jsonb;
begin
 select * into r from public.meal_plan_revisions where id=p_revision_id;
 select household.* into h from public.households household join public.meal_plans p on p.household_id=household.id where p.id=r.meal_plan_id;
 if h.version<>r.household_setup_version then raise exception using errcode='23514',message='V6_HOUSEHOLD_PROFILE_PIN_MISMATCH';end if;
 profile_snapshot:=r.input_snapshot#>'{household,nutritionSetup}';
 if h.nutrition_setup_version is null then
  if profile_snapshot is not null then raise exception using errcode='23514',message='V6_HOUSEHOLD_PROFILE_PIN_MISMATCH';end if;
  return;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'memberKind',p.member_kind,'sortOrder',p.sort_order,'label',p.label,
   'heightCm',trim_scale(p.height_cm)::text,'weightKg',trim_scale(p.weight_kg)::text,'ageYears',p.age_years,'sexForEquation',p.sex_for_equation,'activityLevel',p.activity_level,'goal',p.goal) order by p.member_kind,p.sort_order),'[]') into expected_profiles from public.household_member_profiles p where p.household_id=h.id;
 if r.calculation_snapshot#>'{privatePlanBinding,input,nutritionSetup}' is distinct from profile_snapshot or profile_snapshot is distinct from jsonb_build_object('version',h.nutrition_setup_version,'plannedMealSharePercent',h.planned_meal_share_percent,'memberProfiles',expected_profiles)
   or r.input_snapshot#>>'{household,householdId}' is distinct from h.id::text or (r.input_snapshot#>>'{household,setupVersion}')::integer is distinct from h.version then raise exception using errcode='23514',message='V6_HOUSEHOLD_PROFILE_PIN_MISMATCH'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('memberKind',g.member_kind,'ageBand',g.age_band,'memberCount',g.member_count)),'[]') into expected_groups from public.household_member_groups g where g.household_id=h.id;
 actual_groups:=r.input_snapshot#>'{household,memberGroups}';
 if jsonb_typeof(actual_groups) is distinct from 'array' or jsonb_array_length(actual_groups)<>jsonb_array_length(expected_groups) or not(actual_groups@>expected_groups and expected_groups@>actual_groups) then raise exception using errcode='23514',message='V6_HOUSEHOLD_GROUP_PIN_MISMATCH';end if;
end $$;
revoke all on function private.assert_v6_household_profile_pin(uuid) from public,anon,authenticated,service_role;
do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.assert_revision_shopping_v6(uuid)'::regprocedure);
 patched:=replace(definition,' select count(*) into source_count from public.shopping_list_item_sources',
  ' perform private.assert_v6_household_profile_pin(p_revision_id); select count(*) into source_count from public.shopping_list_item_sources');
 if patched=definition then raise exception using errcode='55000',message='V6_PROFILE_PIN_PATCH_REQUIRED';end if;
 execute patched;
end $patch$;

-- Whole-piece sale and stock quantities must use the source's measured physical lineage.
create function private.assert_v6_whole_purchase_units(p_line jsonb) returns void language plpgsql security definer set search_path='' as $$
declare q public.food_quantity_policy_versions; piece numeric; quantum numeric;
begin
 for q in select policy.* from jsonb_array_elements(p_line->'policyRefs') ref
   join public.food_quantity_policy_versions policy on policy.id=(ref->>'id')::uuid
   where policy.food_form='whole_piece' loop
  if q.food_fact_version_id::text is distinct from p_line->>'priceFoodFactVersionId' then
   raise exception using errcode='23514',message='V6_INCOMPATIBLE_WHOLE_UNIT_PRICE';end if;
  select c.base_quantity_per_unit/u.to_dimension_base into piece from public.food_fact_unit_conversions c join public.units u on u.id=c.unit_id
   where c.food_fact_version_id=q.food_fact_version_id and u.dimension='count' order by u.code limit 1;
  quantum:=case when p_line#>>'{purchaseRule,mode}'='fixed_pack' then (p_line->>'quoteBaseQuantity')::numeric*(p_line#>>'{purchaseRule,packIncrement}')::numeric else (p_line#>>'{purchaseRule,saleStepBaseQuantity}')::numeric end;
  if piece is null or quantum/piece<>trunc(quantum/piece)
    or (p_line->>'requiredBaseQuantity')::numeric/piece<>trunc((p_line->>'requiredBaseQuantity')::numeric/piece)
    or (p_line->>'pantryDeductedBaseQuantity')::numeric/piece<>trunc((p_line->>'pantryDeductedBaseQuantity')::numeric/piece)
    or (p_line->>'leftoverBaseQuantity')::numeric/piece<>trunc((p_line->>'leftoverBaseQuantity')::numeric/piece) then
    raise exception using errcode='23514',message='V6_FRACTIONAL_WHOLE_UNIT_PURCHASE';end if;
 end loop;
end $$;
revoke all on function private.assert_v6_whole_purchase_units(jsonb) from public,anon,authenticated,service_role;
do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.assert_revision_shopping_v6(uuid)'::regprocedure);
 patched:=replace(definition,'perform private.assert_v6_purchase_line(line);','perform private.assert_v6_purchase_line(line); perform private.assert_v6_whole_purchase_units(line);');
 if patched=definition then raise exception using errcode='55000',message='V6_WHOLE_PURCHASE_PATCH_REQUIRED';end if;
 execute patched;
end $patch$;
