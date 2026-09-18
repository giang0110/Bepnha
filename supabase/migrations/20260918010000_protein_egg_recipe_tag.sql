-- Give eggs a protein hint of their own.
--
-- The seeded hints — pork, beef, poultry, fish, seafood, plant — have no room for eggs, and the
-- launch catalog has two meals built on them. None of the six is true: an egg is not a plant, and
-- filing it under poultry would make an omelette and a braised chicken the same protein for the
-- planner's variety scoring, so a week would avoid putting them near each other for a reason that
-- does not exist.
--
-- The hint only feeds variety scoring; allergy and food exclusions run off category ancestry, which
-- already carries `egg`. So this changes how varied a week looks, and nothing about what is safe.

insert into public.recipe_tags (id, code, name_vi, tag_kind)
values ('70070000-0000-0000-0000-000000000018', 'protein_egg', 'Trứng', 'protein_hint');
