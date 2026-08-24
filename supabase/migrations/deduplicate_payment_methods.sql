-- ============================================================
-- DEDUPLICAR PAYMENT_METHODS (UUID-safe, sin min(uuid))
-- ============================================================

-- Re-encausar FKs: por cada nombre, 1 id canónico
update public.transactions t
set payment_method_id = sub.keep_id
from (
  select distinct on (name)
    name,
    id as keep_id
  from public.payment_methods
  order by name, created_at asc nulls first, id::text asc
) sub
join public.payment_methods dup
  on dup.name = sub.name and dup.id <> sub.keep_id
where t.payment_method_id = dup.id;

-- Borrar pagos repetidos (nos quedamos con 1 por nombre)
delete from public.payment_methods pm
where pm.id in (
  select dup.id
  from public.payment_methods dup
  join (
    select distinct on (name) name, id as keep_id
    from public.payment_methods
    order by name, created_at asc nulls first, id::text asc
  ) keep
    on keep.name = dup.name and keep.keep_id <> dup.id
);

alter table public.payment_methods
  add constraint payment_methods_name_key unique (name);

-- ============================================================
-- DEDUPLICAR CATEGORIES (UUID-safe)
-- ============================================================
do $$
declare
  has_dups boolean;
begin
  select exists (select 1 from public.categories group by name having count(*) > 1)
    into has_dups;

  if has_dups then
    update public.transactions t
    set category_id = sub.keep_id
    from (
      select distinct on (name)
        name,
        id as keep_id
      from public.categories
      order by name, created_at asc nulls first, id::text asc
    ) sub
    join public.categories dup
      on dup.name = sub.name and dup.id <> sub.keep_id
    where t.category_id = dup.id;

    delete from public.categories c
    where c.id in (
      select dup.id
      from public.categories dup
      join (
        select distinct on (name) name, id as keep_id
        from public.categories
        order by name, created_at asc nulls first, id::text asc
      ) keep
        on keep.name = dup.name and keep.keep_id <> dup.id
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'categories_name_type_key'
  ) then
    alter table public.categories
      add constraint categories_name_type_key unique (name, type);
  end if;
end $$;

insert into public.payment_methods (name) values ('Efectivo') on conflict (name) do nothing;
insert into public.payment_methods (name) values ('Débito')   on conflict (name) do nothing;
insert into public.payment_methods (name) values ('Crédito')  on conflict (name) do nothing;
