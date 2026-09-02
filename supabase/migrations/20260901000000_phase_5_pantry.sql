-- Phase 5 changes the authoritative planner semantics by binding an explicit pantry snapshot.
-- Phase 4 shopping persistence intentionally pinned planner-engine-v2, so extend only those
-- existing guards to the known Phase 5 engine while preserving exact engine/snapshot matching.
do $$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'private.assert_revision_shopping_row(uuid)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$if v_revision.engine_version <> 'planner-engine-v2'
    or v_revision.input_snapshot ->> 'engineVersion' <> 'planner-engine-v2' then$old$,
    $new$if v_revision.engine_version not in ('planner-engine-v2', 'planner-engine-v3')
    or v_revision.input_snapshot ->> 'engineVersion' is distinct from v_revision.engine_version then$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_SHOPPING_REVISION_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'private.assert_plan_summary_row(uuid)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$if v_revision.engine_version = 'planner-engine-v2' then$old$,
    $new$if v_revision.engine_version in ('planner-engine-v2', 'planner-engine-v3') then$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_PLAN_SUMMARY_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$or p_revision ->> 'engineVersion' <> 'planner-engine-v2'
    or p_revision #>> '{inputSnapshot,engineVersion}' <> 'planner-engine-v2'
    or p_revision ->> 'engineVersion' is distinct from p_revision #>> '{inputSnapshot,engineVersion}'$old$,
    $new$or p_revision ->> 'engineVersion' not in ('planner-engine-v2', 'planner-engine-v3')
    or p_revision ->> 'engineVersion' is distinct from p_revision #>> '{inputSnapshot,engineVersion}'$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_PLAN_PERSISTENCE_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;
end;
$$;
