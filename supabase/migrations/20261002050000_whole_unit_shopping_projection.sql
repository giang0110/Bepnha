-- Display physical pieces from immutable actual recipe conversions, never current food heads.
-- This is an owner-scoped read projection; cost and settlement contracts remain unchanged.
do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.get_shopping_list(uuid,uuid)'::regprocedure);
 patched:=replace(definition,'''checked'',check_state.shopping_list_item_id is not null,''checkedAt'',check_state.checked_at,''policyRefs'',item.policy_refs,',
 '''wholeUnit'',(select jsonb_build_object(''unitCode'',ingredient#>>''{conversion,unitCode}'',''baseQuantityPerPiece'',trim_scale((ingredient#>>''{conversion,baseQuantityPerUnit}'')::numeric/(ingredient#>>''{conversion,sourceToDimensionBase}'')::numeric)::text)
   from public.shopping_list_item_sources src join public.meal_plan_items saved on saved.id=src.meal_plan_item_id
   join public.food_quantity_policy_versions policy on policy.id=(src.quantity_policy_ref->>''id'')::uuid
   cross join lateral jsonb_array_elements(saved.calculation_snapshot->''scaledIngredients'') ingredient
   where src.shopping_list_item_id=item.id and policy.food_form in (''whole_piece'',''whole_count'')
     and ingredient->>''sourceId''=src.meal_option_recipe_id::text||'':''||src.recipe_ingredient_id::text
     and ingredient#>>''{conversion,sourceDimension}''=''count'' order by src.meal_plan_item_id,src.meal_option_recipe_id,src.recipe_ingredient_id limit 1),
 ''checked'',check_state.shopping_list_item_id is not null,''checkedAt'',check_state.checked_at,''policyRefs'',item.policy_refs,');
 if patched=definition then raise exception using errcode='55000',message='WHOLE_UNIT_SHOPPING_PROJECTION_PATCH_REQUIRED';end if;
 execute patched;
end $patch$;
