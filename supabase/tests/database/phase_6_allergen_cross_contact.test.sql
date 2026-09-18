begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- The vocabulary itself.

select is(
  (
    select string_agg(enumlabel, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.allergen_assessment_status'::regtype
  ),
  'absent,contains,may_contain,cross_contact_unverified,unknown',
  'allergen assessment carries the cross-contact status between may_contain and unknown'
);

select is(
  (
    select string_agg(enumlabel, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.household_allergen_strictness'::regtype
  ),
  'strict,ingredient_only',
  'a household rule reaches either strictly or to ingredients only'
);

select hasnt_type('public', 'allergen_assessment_status_superseded', 'the swapped-out type is gone');

-- The reach, and the direction it fails in.

select col_not_null(
  'public',
  'household_food_rules',
  'allergen_strictness',
  'every rule states its reach'
);

select col_default_is(
  'public',
  'household_food_rules',
  'allergen_strictness',
  'strict',
  'an unanswered question reads as the stricter choice, never as permission'
);

-- Only an allergy has a reach to choose. The household is built through the RPC the app calls, so
-- what is asserted below is the path a real sign-up takes.

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000000a1', 'reach@example.invalid');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.save_household_setup(
      null,
      500000,
      60::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]'::jsonb,
      array['allergen_peanut', 'exclude_beef'],
      '{"allergen_peanut":"ingredient_only"}'::jsonb
    )
  $$,
  'a household may ask one of its allergies to filter on ingredients only'
);

select is(
  (
    select allergen_strictness::text
    from public.household_food_rules
    where rule_code = 'allergen_peanut'
  ),
  'ingredient_only',
  'and that choice is what gets stored'
);

select is(
  (
    select allergen_strictness::text
    from public.household_food_rules
    where rule_code = 'exclude_beef'
  ),
  'strict',
  'while every other rule stays at the strict default'
);

select throws_ok(
  $$
    select public.save_household_setup(
      1,
      500000,
      60::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]'::jsonb,
      array['allergen_peanut', 'exclude_beef'],
      '{"exclude_beef":"ingredient_only"}'::jsonb
    )
  $$,
  '22023',
  'INVALID_ALLERGEN_STRICTNESS',
  'a food exclusion has no supplier to clear, so it cannot be relaxed'
);

select throws_ok(
  $$
    select public.save_household_setup(
      1,
      500000,
      60::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]'::jsonb,
      array['allergen_peanut'],
      '{"allergen_fish":"ingredient_only"}'::jsonb
    )
  $$,
  '22023',
  'INVALID_ALLERGEN_STRICTNESS',
  'a reach cannot be set for an allergy the household did not declare'
);

select throws_ok(
  $$
    select public.save_household_setup(
      1,
      500000,
      60::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]'::jsonb,
      array['allergen_peanut'],
      '{"allergen_peanut":"lenient"}'::jsonb
    )
  $$,
  '22023',
  'INVALID_ALLERGEN_STRICTNESS',
  'an unrecognised reach is refused rather than quietly ignored'
);

-- What the planner is handed.

select is(
  public.get_planner_generation_input(
    (
      select id from public.households
      where owner_user_id = '00000000-0000-4000-8000-0000000000a1'
    ),
    date '2026-09-21',
    date '2026-09-18'
  ) -> 'foodRuleStrictness',
  '{"allergen_peanut": "ingredient_only"}'::jsonb,
  'the planner receives only the rules that departed from the default'
);

select lives_ok(
  $$
    select public.save_household_setup(
      1,
      500000,
      60::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]'::jsonb,
      array['allergen_peanut', 'exclude_beef'],
      '{}'::jsonb
    )
  $$,
  'a household may return an allergy to the strict reading'
);

select is(
  public.get_planner_generation_input(
    (
      select id from public.households
      where owner_user_id = '00000000-0000-4000-8000-0000000000a1'
    ),
    date '2026-09-21',
    date '2026-09-18'
  ) -> 'foodRuleStrictness',
  '{}'::jsonb,
  'and the planner then receives nothing to relax'
);

select * from finish();
rollback;
