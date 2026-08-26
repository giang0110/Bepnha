begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'households', 'households table exists');
select has_table(
  'public',
  'household_member_groups',
  'household_member_groups table exists'
);
select has_table('public', 'household_rule_options', 'household_rule_options table exists');
select has_table('public', 'household_food_rules', 'household_food_rules table exists');

select has_pk('public', 'profiles', 'profiles has a primary key');
select has_pk('public', 'households', 'households has a primary key');
select has_pk(
  'public',
  'household_member_groups',
  'household_member_groups has a primary key'
);
select has_pk('public', 'household_rule_options', 'household_rule_options has a primary key');
select has_pk('public', 'household_food_rules', 'household_food_rules has a primary key');

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('profiles', 'households', 'household_member_groups', 'household_food_rules')
      and column_name in (
        'display_name',
        'name',
        'birth_date',
        'sex',
        'weight',
        'diagnosis',
        'health_data',
        'dietary_notes'
      )
  ),
  0,
  'household tables store no prohibited personal or free-text fields'
);

select is(
  (select count(*)::integer from public.household_rule_options),
  26,
  'canonical household vocabulary has exactly 26 options'
);

select results_eq(
  $$
    select code
    from public.household_rule_options
    order by sort_order
  $$,
  $$
    values
      ('allergen_peanut'), ('allergen_tree_nut'), ('allergen_milk'),
      ('allergen_egg'), ('allergen_soy'), ('allergen_wheat'),
      ('allergen_fish'), ('allergen_crustacean'), ('allergen_mollusc'),
      ('allergen_sesame'), ('allergen_other'), ('exclude_pork'),
      ('exclude_beef'), ('exclude_poultry'), ('exclude_seafood'),
      ('exclude_egg'), ('exclude_dairy'), ('diet_vegetarian'),
      ('prefer_pork'), ('prefer_beef'), ('prefer_poultry'), ('prefer_fish'),
      ('prefer_seafood'), ('prefer_tofu'), ('prefer_vegetable_forward'),
      ('prefer_soup')
  $$,
  'canonical option order matches the domain contract'
);

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'households',
        'household_member_groups',
        'household_rule_options',
        'household_food_rules'
      )
      and relation.relrowsecurity
  ),
  5,
  'RLS is enabled on every Phase 1 public table'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.households'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%owner_user_id%'
  ),
  1,
  'one household per owner is enforced by a unique constraint'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid in (
      'public.households'::regclass,
      'public.household_member_groups'::regclass,
      'public.household_food_rules'::regclass
    )
      and tgname in (
        'households_require_valid_members',
        'household_member_groups_require_valid_household',
        'household_food_rules_no_hard_soft_conflict'
      )
      and tgconstraint <> 0
      and tgdeferrable
      and not tginitdeferred
  ),
  3,
  'all authoritative cross-row triggers are initially-immediate constraint triggers'
);

select has_function('private', 'assert_household_member_state', array['uuid']);
select has_function('private', 'assert_household_rule_target_state', array['uuid']);
select has_function(
  'public',
  'save_household_setup',
  array['integer', 'bigint', 'smallint', 'jsonb', 'text[]']
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.save_household_setup(integer,bigint,smallint,jsonb,text[])'::regprocedure
  ),
  false,
  'save_household_setup is security invoker'
);

select ok(
  (
    select array_to_string(proconfig, ',') like '%search_path=%'
    from pg_proc
    where oid = 'public.save_household_setup(integer,bigint,smallint,jsonb,text[])'::regprocedure
  ),
  'save_household_setup has an empty search path'
);

select ok(
  (
    select pg_get_functiondef(oid) like '%public.households_require_valid_members%'
      and pg_get_functiondef(oid) like '%public.household_member_groups_require_valid_household%'
    from pg_proc
    where oid = 'public.save_household_setup(integer,bigint,smallint,jsonb,text[])'::regprocedure
  ),
  'save_household_setup resolves deferred constraints with an empty search path'
);

select is(
  has_function_privilege(
    'anon',
    'public.save_household_setup(integer,bigint,smallint,jsonb,text[])',
    'EXECUTE'
  ),
  false,
  'anon cannot execute the household RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.save_household_setup(integer,bigint,smallint,jsonb,text[])',
    'EXECUTE'
  ),
  true,
  'authenticated users can execute the household RPC under RLS'
);

select is(
  has_table_privilege('anon', 'public.households', 'SELECT'),
  false,
  'anon has no household table grant'
);

select is(
  has_table_privilege('authenticated', 'public.households', 'SELECT,INSERT,UPDATE'),
  true,
  'authenticated receives only intended household write grants'
);

select is(
  has_table_privilege('authenticated', 'public.household_rule_options', 'SELECT'),
  true,
  'authenticated can read canonical options'
);

select is(
  has_table_privilege('authenticated', 'public.household_rule_options', 'INSERT,UPDATE,DELETE'),
  false,
  'authenticated cannot mutate canonical options'
);

insert into auth.users (id, email)
values ('10000000-0000-0000-0000-000000000001', 'profile-trigger@example.test');

select is(
  (
    select locale
    from public.profiles
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'vi-VN',
  'auth user creation inserts the minimized profile'
);

select throws_ok(
  $$
    update public.household_rule_options
    set label_vi = 'Changed'
    where code = 'prefer_soup'
  $$,
  '55000',
  'HOUSEHOLD_RULE_OPTIONS_ARE_APPEND_ONLY',
  'canonical options are append-only even for trusted SQL paths'
);

select * from finish();
rollback;
