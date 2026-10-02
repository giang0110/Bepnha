begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_table('public', 'household_member_profiles', 'private member profiles exist');
select has_function('public', 'get_household_setup_v2', array[]::text[], 'atomic profile read exists');
select has_function('public', 'save_household_setup_v2', array['integer', 'bigint', 'integer', 'jsonb', 'text[]', 'jsonb', 'jsonb', 'integer'], 'atomic profile write exists');

insert into auth.users (id,email) values
 ('ab000000-0000-4000-8000-000000000001','nutrition-owner@example.test'),
 ('ab000000-0000-4000-8000-000000000002','nutrition-other@example.test');
create function pg_temp.profile(n integer) returns jsonb language sql as $$
 select jsonb_build_object('id','ac000000-0000-4000-8000-' || lpad(n::text,12,'0'),
 'memberKind','adult','sortOrder',n,'label',null,'heightCm','170','weightKg','65.50',
 'ageYears',30,'sexForEquation','male','activityLevel','light','goal','maintain')
$$;
create function pg_temp.save_profiles(expected integer, profiles jsonb,
 groups jsonb default '[{"memberKind":"adult","ageBand":"adult","memberCount":3}]',
 share integer default 40) returns jsonb language plpgsql as $$
begin
 return to_jsonb(public.save_household_setup_v2(expected,1000000::bigint,30,groups,array['allergen_peanut','prefer_soup'],'{"allergen_peanut":"ingredient_only"}',profiles,share));
end $$;
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select pg_temp.save_profiles(null,jsonb_build_array(pg_temp.profile(1),pg_temp.profile(2),pg_temp.profile(3)))$$,'saves profiles atomically with groups');
select is((public.get_household_setup_v2()->>'version')::integer,1,'new setup starts at version1');
select is(public.get_household_setup_v2()->'nutritionSetup'->>'plannedMealSharePercent','40','keeps chosen meal share');
select is(public.get_household_setup_v2()->'nutritionSetup'->'memberProfiles'->0->>'weightKg','65.5','canonical measurement survives read');
select is(public.get_household_setup_v2()->'household_food_rules'->0->>'allergen_strictness','ingredient_only','allergen reach preserved');
select lives_ok($$select pg_temp.save_profiles(1,jsonb_build_array(pg_temp.profile(1),pg_temp.profile(3)), '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]')$$,'removes only middle member');
select is(public.get_household_setup_v2()->'nutritionSetup'->'memberProfiles'->1->>'id', 'ac000000-0000-4000-8000-000000000003','remaining identity is stable');
select is((public.get_household_setup_v2()->>'version')::integer,2,'one version increment for whole save');
select throws_ok($$select pg_temp.save_profiles(1,jsonb_build_array(pg_temp.profile(1)))$$,'P0001','STALE_HOUSEHOLD_VERSION','stale save rejected');
select is((public.get_household_setup_v2()->>'version')::integer,2,'stale save does not change version');
select throws_ok($$select public.save_household_setup(2,900000::bigint,30::smallint,'[{"memberKind":"adult","ageBand":"adult","memberCount":1}]',array[]::text[])$$,'23514','NUTRITION_SETUP_REQUIRES_V2','legacy RPC cannot discard profiles');
select throws_ok($$insert into public.household_member_profiles(id,household_id,member_kind,sort_order,goal) select 'ac000000-0000-4000-8000-000000000004',id,'adult',4,'maintain' from public.households$$,'42501',null,'direct profile write denied');
select throws_ok($$update public.households set planned_meal_share_percent=50$$,'42501',null,'direct share update cannot bypass versioned transaction');
select throws_ok($$update public.households set nutrition_setup_version=null$$,'42501',null,'direct setup marker update denied');
select throws_ok($$select pg_temp.save_profiles(2,jsonb_build_array(pg_temp.profile(1),pg_temp.profile(1)),'[{"memberKind":"adult","ageBand":"adult","memberCount":2}]')$$,'22023','INVALID_MEMBER_PROFILES','duplicate identity rejected');
select throws_ok($$select pg_temp.save_profiles(2,jsonb_build_array(pg_temp.profile(1),pg_temp.profile(2)||'{"sortOrder":1}'),'[{"memberKind":"adult","ageBand":"adult","memberCount":2}]')$$,'22023','INVALID_MEMBER_PROFILES','duplicate sort order rejected');
select throws_ok($$select pg_temp.save_profiles(2,jsonb_build_array(pg_temp.profile(1)||'{"heightCm":"170.001"}',pg_temp.profile(3)),'[{"memberKind":"adult","ageBand":"adult","memberCount":2}]')$$,'22023','INVALID_MEMBER_PROFILES','extra precision rejected before conversion');
select throws_ok($$select pg_temp.save_profiles(2,jsonb_build_array(pg_temp.profile(1)),'[{"memberKind":"adult","ageBand":"adult","memberCount":2}]')$$,'22023','MEMBER_PROFILE_COUNT_MISMATCH','missing adult rejected');
select is((public.get_household_setup_v2()->'nutritionSetup'->'memberProfiles')::text,jsonb_build_array(pg_temp.profile(1)||'{"weightKg":"65.5"}',pg_temp.profile(3)||'{"weightKg":"65.5"}')::text,'failed writes preserve profiles');
reset role;
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.household_member_profiles),0,'other owner cannot read profiles');
select throws_ok($$select pg_temp.save_profiles(null,jsonb_build_array(pg_temp.profile(1)),'[{"memberKind":"adult","ageBand":"adult","memberCount":1}]')$$,'42501','FOREIGN_MEMBER_PROFILE_ID','foreign profile ID rolls back entire create');
select is(public.get_household_setup_v2(),null::jsonb,'failed foreign create leaves no household');
select lives_ok($$select pg_temp.save_profiles(null,'[]','[{"memberKind":"child","ageBand":"4_6","memberCount":2}]',40)$$,'child-only setup is valid');
select is(public.get_household_setup_v2()->'nutritionSetup'->>'plannedMealSharePercent','40','child-only share survives reload');
select throws_ok($$select public.save_household_setup(1,900000::bigint,30::smallint,'[{"memberKind":"child","ageBand":"4_6","memberCount":2}]',array[]::text[])$$,'23514','NUTRITION_SETUP_REQUIRES_V2','legacy cannot drop child-only share either');
reset role;
set local role anon;
select throws_ok($$select * from public.household_member_profiles$$,'42501',null,'anon cannot read profiles');
select throws_ok($$select public.get_household_setup_v2()$$,'42501',null,'anon cannot call profile read');
reset role;
select * from finish();
rollback;
