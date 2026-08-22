begin;

drop index public.canonical_observations_source_unique;

alter table public.canonical_observations
  add constraint canonical_observations_source_observation_id_key unique (source_observation_id);

commit;
