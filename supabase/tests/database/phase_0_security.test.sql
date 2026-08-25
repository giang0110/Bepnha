begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select has_schema('private');

select is(
  has_schema_privilege('anon', 'private', 'USAGE'),
  false,
  'anon cannot use private schema'
);

select is(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  false,
  'authenticated cannot use private schema'
);

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ),
  0,
  'every exposed public table has RLS enabled'
);

select * from finish();
rollback;
