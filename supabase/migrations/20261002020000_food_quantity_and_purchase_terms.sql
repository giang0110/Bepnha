-- Explicit, immutable preparation policies and purchasing terms. No legacy metadata is inferred.
alter table public.price_books add column purchase_contract_version text
  check (purchase_contract_version is null or purchase_contract_version = 'purchase-v2');
alter table public.food_prices add constraint food_prices_id_book_unique unique(id, price_book_id);
create table public.food_quantity_policy_versions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null,
  food_fact_version_id uuid not null,
  version_number integer not null check(version_number > 0),
  revision integer not null default 1 check(revision > 0),
  base_unit_id uuid not null,
  base_dimension public.catalog_dimension not null,
  food_form text not null check(food_form in ('portionable_mass','seasoning_mass','divisible_volume','whole_count','whole_piece')),
  step_base_quantity numeric(38,18) not null check(step_base_quantity > 0),
  rounding text not null check(rounding in ('ceil','half_up')),
  provenance text not null check(char_length(btrim(provenance)) between 1 and 500 and btrim(provenance) !~* '^(unknown|unverified|todo|pending|tbd|n/a|not stated)$'),
  publication_status public.catalog_publication_status not null default 'draft',
  content_hash text,
  published_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(food_fact_version_id,version_number),
  foreign key(food_id,food_fact_version_id) references public.food_fact_versions(food_id,id) on delete restrict,
  foreign key(food_id,base_unit_id) references public.foods(id,base_unit_id) on delete restrict,
  foreign key(base_unit_id,base_dimension) references public.units(id,dimension) on delete restrict,
  check((publication_status='draft' and content_hash is null and published_at is null) or
    (publication_status='published' and content_hash is not null and content_hash ~ '^[a-f0-9]{64}$' and published_at is not null))
);
create index food_quantity_policy_food_fact_idx on public.food_quantity_policy_versions(food_id,food_fact_version_id);
create index food_quantity_policy_base_unit_idx on public.food_quantity_policy_versions(base_unit_id,base_dimension);
create index food_quantity_policy_created_by_idx on public.food_quantity_policy_versions(created_by);
create trigger food_quantity_policy_protect_lifecycle before insert or update or delete on public.food_quantity_policy_versions
  for each row execute function private.protect_catalog_version();

create table public.food_price_purchase_terms (
  food_price_id uuid primary key,
  price_book_id uuid not null references public.price_books(id) on delete cascade,
  version text not null default 'purchase-v2' check(version='purchase-v2'),
  base_dimension public.catalog_dimension not null,
  purchase_mode text not null check(purchase_mode in ('fixed_pack','loose_mass','loose_count')),
  pack_increment numeric(38,18),
  sale_step_base_quantity numeric(38,18),
  provenance text not null check(char_length(btrim(provenance)) between 1 and 500 and btrim(provenance) !~* '^(unknown|unverified|todo|pending|tbd|n/a|not stated)$'),
  content_hash text check(content_hash ~ '^[a-f0-9]{64}$'),
  foreign key(food_price_id,price_book_id) references public.food_prices(id,price_book_id) on delete cascade,
  check((purchase_mode='fixed_pack' and pack_increment is not null and pack_increment>0 and pack_increment=trunc(pack_increment) and sale_step_base_quantity is null)
     or (purchase_mode='loose_mass' and base_dimension='mass' and pack_increment is null and sale_step_base_quantity is not null and sale_step_base_quantity>0)
     or (purchase_mode='loose_count' and base_dimension='count' and pack_increment is null and sale_step_base_quantity is not null and sale_step_base_quantity>0 and sale_step_base_quantity=trunc(sale_step_base_quantity)))
);
create index food_price_purchase_terms_book_idx on public.food_price_purchase_terms(price_book_id);

create function private.protect_purchase_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare v_book public.price_books; v_food public.foods; v_price public.food_prices;
begin
  if tg_op in ('UPDATE','DELETE') then
    select * into v_book from public.price_books where id=old.price_book_id for update;
    if v_book.publication_status='published' then
      raise exception using errcode='23514',message='PUBLISHED_PURCHASE_TERMS_IMMUTABLE';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  select * into v_book from public.price_books where id=new.price_book_id for update;
  if v_book.publication_status='published' then
    raise exception using errcode='23514',message='PUBLISHED_PURCHASE_TERMS_IMMUTABLE';
  end if;
  if v_book.purchase_contract_version is distinct from 'purchase-v2' then
    raise exception using errcode='23514',message='PURCHASE_TERMS_REQUIRE_V2_DRAFT';
  end if;
  select * into v_price from public.food_prices where id=new.food_price_id;
  select * into v_food from public.foods where id=v_price.food_id;
  if new.base_dimension is distinct from v_food.base_dimension or
    (new.base_dimension='count' and v_price.package_base_quantity<>trunc(v_price.package_base_quantity)) or
    (new.purchase_mode='fixed_pack' and new.pack_increment is distinct from v_price.purchase_increment) then
    raise exception using errcode='23514',message='PURCHASE_DIMENSION_MISMATCH';
  end if;
  if new.content_hash is not null and not private.catalog_transition_is_trusted() then
    raise exception using errcode='42501',message='PURCHASE_TERMS_HASH_RPC_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_purchase_terms() from public,anon,authenticated,service_role;
create trigger food_price_purchase_terms_protect before insert or update or delete on public.food_price_purchase_terms
  for each row execute function private.protect_purchase_terms();

create function private.protect_purchase_contract() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.purchase_contract_version='purchase-v2' and new.purchase_contract_version is distinct from old.purchase_contract_version then
    raise exception using errcode='23514',message='PURCHASE_CONTRACT_IMMUTABLE';
  end if;
  if new.publication_status='published' and new.purchase_contract_version='purchase-v2' and exists(
    select 1 from public.food_prices as price left join public.food_price_purchase_terms as terms on terms.food_price_id=price.id
    where price.price_book_id=new.id and (terms.food_price_id is null or terms.content_hash is null)) then
    raise exception using errcode='23514',message='INCOMPLETE_PURCHASE_TERMS';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_purchase_contract() from public,anon,authenticated,service_role;
create trigger price_books_protect_purchase_contract before update on public.price_books for each row execute function private.protect_purchase_contract();

alter table public.food_quantity_policy_versions enable row level security;
alter table public.food_price_purchase_terms enable row level security;
revoke all on public.food_quantity_policy_versions,public.food_price_purchase_terms from public,anon,authenticated,service_role;
grant select on public.food_quantity_policy_versions,public.food_price_purchase_terms to authenticated,service_role;
create policy quantity_policy_published_read on public.food_quantity_policy_versions for select to authenticated
  using(publication_status='published');
create policy purchase_terms_published_read on public.food_price_purchase_terms for select to authenticated
  using(exists(select 1 from public.price_books as book where book.id=price_book_id and book.publication_status='published'));

create function public.save_food_quantity_policy_draft(p_policy_id uuid,p_expected_revision integer,p_definition jsonb,p_actor_user_id uuid)
returns public.food_quantity_policy_versions language plpgsql security definer set search_path='' as $$
declare v_policy public.food_quantity_policy_versions; v_definition public.food_quantity_policy_versions;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  if p_definition is null or jsonb_typeof(p_definition)<>'object' or
    (select count(*) from jsonb_object_keys(p_definition))<>9 or not(p_definition ?& array['foodId','foodFactVersionId','versionNumber','baseUnitId','baseDimension','foodForm','stepBaseQuantity','rounding','provenance']) or
    p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='INVALID_QUANTITY_POLICY';
  end if;
  v_definition.food_id:=(p_definition->>'foodId')::uuid;
  v_definition.food_fact_version_id:=(p_definition->>'foodFactVersionId')::uuid;
  v_definition.version_number:=(p_definition->>'versionNumber')::integer;
  v_definition.base_unit_id:=(p_definition->>'baseUnitId')::uuid;
  v_definition.base_dimension:=(p_definition->>'baseDimension')::public.catalog_dimension;
  v_definition.food_form:=p_definition->>'foodForm';
  if p_definition->>'stepBaseQuantity' !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$' then
    raise exception using errcode='22023',message='INVALID_QUANTITY_POLICY';
  end if;
  v_definition.step_base_quantity:=(p_definition->>'stepBaseQuantity')::numeric;
  v_definition.rounding:=p_definition->>'rounding';
  v_definition.provenance:=p_definition->>'provenance';
  select * into v_policy from public.food_quantity_policy_versions where id=p_policy_id for update;
  if not found then
    if p_expected_revision<>1 then raise exception using errcode='P0001',message='STALE_CATALOG_REVISION'; end if;
    insert into public.food_quantity_policy_versions(id,food_id,food_fact_version_id,version_number,base_unit_id,base_dimension,food_form,step_base_quantity,rounding,provenance,created_by)
    values(p_policy_id,v_definition.food_id,v_definition.food_fact_version_id,v_definition.version_number,v_definition.base_unit_id,v_definition.base_dimension,v_definition.food_form,v_definition.step_base_quantity,v_definition.rounding,v_definition.provenance,p_actor_user_id) returning * into v_policy;
  else
    if v_policy.publication_status<>'draft' or v_policy.revision<>p_expected_revision or
      v_policy.food_id<>v_definition.food_id or v_policy.food_fact_version_id<>v_definition.food_fact_version_id or v_policy.version_number<>v_definition.version_number then
      raise exception using errcode='P0001',message='STALE_CATALOG_REVISION';
    end if;
    update public.food_quantity_policy_versions set base_unit_id=v_definition.base_unit_id,base_dimension=v_definition.base_dimension,food_form=v_definition.food_form,step_base_quantity=v_definition.step_base_quantity,rounding=v_definition.rounding,provenance=v_definition.provenance where id=p_policy_id returning * into v_policy;
  end if;
  insert into public.admin_audit_log(actor_kind,actor_user_id,action,entity_type,entity_id,after_summary)
    values('admin_user',p_actor_user_id,'save_draft','food_quantity_policy_version',v_policy.id,jsonb_build_object('revision',v_policy.revision));
  return v_policy;
end;
$$;

create function public.publish_food_quantity_policy(p_policy_id uuid,p_content_hash text,p_actor_user_id uuid,p_expected_revision integer)
returns public.food_quantity_policy_versions language plpgsql security definer set search_path='' as $$
declare v_policy public.food_quantity_policy_versions; v_factor numeric;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  if p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='INVALID_CONTENT_HASH'; end if;
  select * into v_policy from public.food_quantity_policy_versions where id=p_policy_id for update;
  if p_expected_revision is null or p_expected_revision<1 or not found or v_policy.publication_status<>'draft' or v_policy.revision<>p_expected_revision then
    raise exception using errcode='P0001',message='STALE_CATALOG_REVISION';
  end if;
  select to_dimension_base into v_factor from public.units where id=v_policy.base_unit_id;
  if not exists(select 1 from public.food_fact_versions where id=v_policy.food_fact_version_id and food_id=v_policy.food_id and publication_status='published') or
    not exists(select 1 from public.food_fact_unit_conversions where food_fact_version_id=v_policy.food_fact_version_id) or not (
    (v_policy.food_form='portionable_mass' and v_policy.base_dimension='mass' and v_policy.rounding='half_up' and v_policy.step_base_quantity*v_factor=1) or
    (v_policy.food_form='seasoning_mass' and v_policy.base_dimension='mass' and v_policy.rounding='half_up' and v_policy.step_base_quantity*v_factor=0.1) or
    (v_policy.food_form='divisible_volume' and v_policy.base_dimension='volume' and v_policy.rounding='half_up' and v_policy.step_base_quantity*v_factor=0.1) or
    (v_policy.food_form='whole_count' and v_policy.base_dimension='count' and v_policy.rounding='ceil' and v_policy.step_base_quantity*v_factor>=1 and v_policy.step_base_quantity*v_factor=trunc(v_policy.step_base_quantity*v_factor)) or
    (v_policy.food_form='whole_piece' and v_policy.rounding='ceil' and exists(
      select 1 from public.food_fact_unit_conversions as c join public.units as u on u.id=c.unit_id
      where c.food_fact_version_id=v_policy.food_fact_version_id and u.dimension='count'
      and v_policy.step_base_quantity*u.to_dimension_base/c.base_quantity_per_unit>=1
      and v_policy.step_base_quantity*u.to_dimension_base/c.base_quantity_per_unit=trunc(v_policy.step_base_quantity*u.to_dimension_base/c.base_quantity_per_unit)
    ))) then
    raise exception using errcode='23514',message='INCOMPLETE_QUANTITY_POLICY';
  end if;
  perform private.begin_catalog_transition();
  update public.food_quantity_policy_versions set publication_status='published',content_hash=p_content_hash,published_at=now(),revision=revision+1,updated_at=now() where id=p_policy_id returning * into v_policy;
  insert into public.admin_audit_log(actor_kind,actor_user_id,action,entity_type,entity_id,after_summary)
    values('admin_user',p_actor_user_id,'publish','food_quantity_policy_version',v_policy.id,jsonb_build_object('contentHash',p_content_hash,'versionNumber',v_policy.version_number));
  perform private.end_catalog_transition();
  return v_policy;
end;
$$;

create function public.save_price_book_draft_v2(
  p_price_book_id uuid,
  p_expected_revision integer,
  p_effective_from date,
  p_effective_to date,
  p_prices jsonb,
  p_actor_user_id uuid
)
returns public.price_books
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.price_books;
begin
  perform private.assert_catalog_admin(p_actor_user_id);

  if p_prices is null or jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) = 0 then
    raise exception using errcode = '22023', message = 'PRICE_ROWS_REQUIRED';
  end if;

  update public.price_books
  set
    effective_from = p_effective_from,
    effective_to = p_effective_to,
    purchase_contract_version = 'purchase-v2'
  where id = p_price_book_id
    and revision = p_expected_revision
    and publication_status = 'draft'
  returning * into v_book;

  if not found then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;

  delete from public.food_prices
  where price_book_id = p_price_book_id;

  insert into public.food_prices (
    price_book_id,
    food_id,
    food_fact_version_id,
    package_quantity,
    package_unit_id,
    package_base_quantity,
    base_unit_id,
    package_price_vnd,
    purchase_increment,
    observed_at,
    source_reference
  )
  select
    p_price_book_id,
    price.food_id,
    price.food_fact_version_id,
    price.package_quantity,
    price.package_unit_id,
    price.package_base_quantity,
    price.base_unit_id,
    price.package_price_vnd,
    price.purchase_increment,
    price.observed_at,
    price.source_reference
  from jsonb_to_recordset(p_prices) as price(
    food_id uuid,
    food_fact_version_id uuid,
    package_quantity numeric,
    package_unit_id uuid,
    package_base_quantity numeric,
    base_unit_id uuid,
    package_price_vnd bigint,
    purchase_increment numeric,
    observed_at date,
    source_reference text
  );

  insert into public.food_price_purchase_terms(food_price_id,price_book_id,base_dimension,purchase_mode,pack_increment,sale_step_base_quantity,provenance)
  select saved.id,p_price_book_id,(raw->>'base_dimension')::public.catalog_dimension,raw->'purchase_rule'->>'mode',
    (raw->'purchase_rule'->>'packIncrement')::numeric,(raw->'purchase_rule'->>'saleStepBaseQuantity')::numeric,raw->>'purchase_provenance'
  from jsonb_array_elements(p_prices) as raw join public.food_prices as saved on saved.price_book_id=p_price_book_id and saved.food_id=(raw->>'food_id')::uuid;
  if exists(select 1 from jsonb_array_elements(p_prices) as raw where jsonb_typeof(raw->'purchase_rule') is distinct from 'object' or
    (select count(*) from jsonb_object_keys(raw->'purchase_rule'))<>2 or
    not((raw->'purchase_rule'->>'mode'='fixed_pack' and raw->'purchase_rule' ? 'packIncrement') or
        (raw->'purchase_rule'->>'mode' in ('loose_mass','loose_count') and raw->'purchase_rule' ? 'saleStepBaseQuantity'))) then
    raise exception using errcode='22023',message='INVALID_PURCHASE_RULE';
  end if;
  insert into public.admin_audit_log(actor_kind,actor_user_id,action,entity_type,entity_id,after_summary)
    values('admin_user',p_actor_user_id,'save_draft','price_book',v_book.id,jsonb_build_object('revision',v_book.revision,'purchasingVersion','purchase-v2'));
  return v_book;
end;
$$;

create or replace function public.save_price_book_draft_atomic(
  p_price_book_id uuid,
  p_expected_revision integer,
  p_effective_from date,
  p_effective_to date,
  p_prices jsonb,
  p_actor_user_id uuid
)
returns public.price_books
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.price_books;
begin
  perform private.assert_catalog_admin(p_actor_user_id);

  perform 1 from public.price_books where id=p_price_book_id for update;
  if exists(select 1 from public.price_books where id=p_price_book_id and purchase_contract_version='purchase-v2') then
    raise exception using errcode='22023',message='PURCHASE_TERMS_REQUIRES_V2';
  end if;
  if p_prices is null or jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) = 0 then
    raise exception using errcode = '22023', message = 'PRICE_ROWS_REQUIRED';
  end if;

  update public.price_books
  set
    effective_from = p_effective_from,
    effective_to = p_effective_to
  where id = p_price_book_id
    and revision = p_expected_revision
    and publication_status = 'draft'
  returning * into v_book;

  if not found then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;

  delete from public.food_prices
  where price_book_id = p_price_book_id;

  insert into public.food_prices (
    price_book_id,
    food_id,
    food_fact_version_id,
    package_quantity,
    package_unit_id,
    package_base_quantity,
    base_unit_id,
    package_price_vnd,
    purchase_increment,
    observed_at,
    source_reference
  )
  select
    p_price_book_id,
    price.food_id,
    price.food_fact_version_id,
    price.package_quantity,
    price.package_unit_id,
    price.package_base_quantity,
    price.base_unit_id,
    price.package_price_vnd,
    price.purchase_increment,
    price.observed_at,
    price.source_reference
  from jsonb_to_recordset(p_prices) as price(
    food_id uuid,
    food_fact_version_id uuid,
    package_quantity numeric,
    package_unit_id uuid,
    package_base_quantity numeric,
    base_unit_id uuid,
    package_price_vnd bigint,
    purchase_increment numeric,
    observed_at date,
    source_reference text
  );

  return v_book;
end;
$$;

create or replace function public.publish_price_book(
  p_price_book_id uuid,
  p_content_hash text,
  p_actor_user_id uuid,
  p_expected_revision integer
)
returns public.price_books
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.price_books;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_HASH';
  end if;
  select * into v_book
  from public.price_books
  where id = p_price_book_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRICE_BOOK_NOT_FOUND';
  end if;
  if v_book.publication_status <> 'draft' or v_book.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;
  perform 1 from public.price_regions where id = v_book.region_id for update;
  if not exists (select 1 from public.food_prices where price_book_id = v_book.id)
    or exists (
      select 1
      from public.food_prices as price
      join public.food_fact_versions as fact on fact.id = price.food_fact_version_id
      where price.price_book_id = v_book.id
        and (fact.publication_status <> 'published' or price.observed_at > current_date)
    ) then
    raise exception using errcode = '23514', message = 'INCOMPLETE_PRICE_BOOK';
  end if;

  if v_book.purchase_contract_version='purchase-v2' and exists(
    select 1 from public.food_prices as price left join public.food_price_purchase_terms as terms on terms.food_price_id=price.id
    where price.price_book_id=v_book.id and terms.food_price_id is null) then
    raise exception using errcode='23514',message='INCOMPLETE_PURCHASE_TERMS';
  end if;
  perform private.begin_catalog_transition();
  if v_book.purchase_contract_version='purchase-v2' then
    update public.food_price_purchase_terms as terms set content_hash=encode(extensions.digest(convert_to(jsonb_build_object(
      'version',terms.version,'foodPriceId',terms.food_price_id,'priceBookId',terms.price_book_id,'baseDimension',terms.base_dimension,
      'purchaseMode',terms.purchase_mode,'packIncrement',pg_catalog.trim_scale(terms.pack_increment)::text,
      'saleStepBaseQuantity',pg_catalog.trim_scale(terms.sale_step_base_quantity)::text,'provenance',terms.provenance)::text,'UTF8'),'sha256'),'hex')
    where terms.price_book_id=v_book.id;
  end if;
  update public.price_books
  set
    publication_status = 'published',
    content_hash = p_content_hash,
    published_at = now(),
    revision = revision + 1,
    updated_at = now()
  where id = v_book.id
  returning * into v_book;
  update public.price_regions
  set current_price_book_id = v_book.id
  where id = v_book.region_id;
  insert into public.admin_audit_log (
    actor_kind, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    'admin_user', p_actor_user_id, 'publish', 'price_book', v_book.id,
    jsonb_build_object('contentHash', p_content_hash, 'versionNumber', v_book.version_number)
  );
  perform private.end_catalog_transition();
  return v_book;
end;
$$;

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
  if p_aggregate_type='food_quantity_policy_version' then
    select jsonb_build_object('aggregateType','food_quantity_policy_version','policy',jsonb_build_object(
      'foodQuantityPolicyVersionId',p.id,'foodId',p.food_id,'foodFactVersionId',p.food_fact_version_id,'versionNumber',p.version_number,'revision',p.revision,
      'baseUnitId',p.base_unit_id,'baseDimension',p.base_dimension,'foodForm',p.food_form,'stepBaseQuantity',pg_catalog.trim_scale(p.step_base_quantity)::text,
      'rounding',p.rounding,'provenance',p.provenance,'publicationStatus',p.publication_status,'contentHash',p.content_hash),
      'foodFactContentHash',fact.content_hash,'foodFactPublicationStatus',fact.publication_status,'conversions',coalesce((
        select jsonb_agg(jsonb_build_object('unitId',u.id,'unitCode',u.code,'sourceDimension',u.dimension,'sourceToDimensionBase',pg_catalog.trim_scale(u.to_dimension_base)::text,
          'foodBaseUnitId',p.base_unit_id,'foodBaseDimension',p.base_dimension,'foodBaseUnitToDimensionBase',pg_catalog.trim_scale(bu.to_dimension_base)::text,
          'baseQuantityPerUnit',pg_catalog.trim_scale(c.base_quantity_per_unit)::text,'grossGramsPerUnit',pg_catalog.trim_scale(c.gross_grams_per_unit)::text,'displayStep',pg_catalog.trim_scale(c.display_step)::text)
          order by u.code,u.id) from public.food_fact_unit_conversions as c join public.units as u on u.id=c.unit_id join public.units as bu on bu.id=p.base_unit_id
          where c.food_fact_version_id=p.food_fact_version_id),'[]'::jsonb)) into v_result
    from public.food_quantity_policy_versions as p join public.food_fact_versions as fact on fact.id=p.food_fact_version_id where p.id=p_aggregate_id;
  elsif p_aggregate_type = 'food_fact_version' then
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
      ) || case when book.purchase_contract_version='purchase-v2' then jsonb_build_object('purchasingVersion','purchase-v2') else '{}'::jsonb end,
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
          ) || case when book.purchase_contract_version='purchase-v2' then jsonb_build_object('baseDimension',terms.base_dimension,
            'purchaseRule',case when terms.purchase_mode='fixed_pack' then jsonb_build_object('mode',terms.purchase_mode,'packIncrement',pg_catalog.trim_scale(terms.pack_increment)::text)
              else jsonb_build_object('mode',terms.purchase_mode,'saleStepBaseQuantity',pg_catalog.trim_scale(terms.sale_step_base_quantity)::text) end,
            'purchaseProvenance',terms.provenance) else '{}'::jsonb end order by price.food_id, price.id
        )
        from public.food_prices as price
        join public.food_fact_versions as fact on fact.id = price.food_fact_version_id
        left join public.food_price_purchase_terms as terms on terms.food_price_id=price.id
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
revoke all on function public.save_food_quantity_policy_draft(uuid,integer,jsonb,uuid),public.publish_food_quantity_policy(uuid,text,uuid,integer),public.save_price_book_draft_v2(uuid,integer,date,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_food_quantity_policy_draft(uuid,integer,jsonb,uuid),public.publish_food_quantity_policy(uuid,text,uuid,integer),public.save_price_book_draft_v2(uuid,integer,date,date,jsonb,uuid) to service_role;
