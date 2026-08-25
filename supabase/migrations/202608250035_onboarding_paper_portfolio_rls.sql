begin;

create policy "users create own paper portfolios"
on public.paper_portfolios
for insert
to authenticated
with check ((select auth.uid()) = user_id);

commit;
