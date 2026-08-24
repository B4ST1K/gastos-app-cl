-- ============================================================
-- 1) REPARACIÓN DE RLS (EL 403 FORBIDDEN EN INSERT)
--    Asegura que todo esté igualado y sin políticas huérfanas
-- ============================================================
alter table public.transactions enable row level security;
alter table public.categories   enable row level security;
alter table public.payment_methods enable row level security;

-- Borramos políticas antiguas por si hubiera alguna con error
drop policy if exists "Users can view their own transactions"       on public.transactions;
drop policy if exists "Users can insert their own transactions"     on public.transactions;
drop policy if exists "Users can update their own transactions"     on public.transactions;
drop policy if exists "Users can delete their own transactions"     on public.transactions;
drop policy if exists "Authenticated users can view categories"     on public.categories;
drop policy if exists "Authenticated users can view payment methods" on public.payment_methods;

-- Políticas de TRANSACTIONS (MISMO NOMBRE per row level security sin errores)
create policy "transactions_select"
on public.transactions for select
to authenticated
using (auth.uid() = user_id);

create policy "transactions_insert"
on public.transactions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "transactions_update"
on public.transactions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "transactions_delete"
on public.transactions for delete
to authenticated
using (auth.uid() = user_id);

-- Políticas de CATEGORIES (todos los usuarios autenticados pueden leer)
create policy "categories_select"
on public.categories for select
to authenticated
using (true);

-- Políticas de PAYMENT_METHODS (todos los usuarios autenticados pueden leer)
create policy "payment_methods_select"
on public.payment_methods for select
to authenticated
using (true);

-- ============================================================
-- 2) AJUSTE MÉTODOS DE PAGO (Solo Efectivo, Débito, Crédito)
-- ============================================================
-- Borramos los que NO quieres (Apple Pay, Transferencia, Otro)
-- y reordenamos. Si existen filas con FK apuntando a estos,
-- primero ponemos NULL.
update public.transactions set payment_method_id = null
where payment_method_id in (
  select id from public.payment_methods
  where name in ('Apple Pay', 'Transferencia', 'Otro')
);

delete from public.payment_methods where name in ('Apple Pay', 'Transferencia', 'Otro');

-- Aseguramos que existan los 3 que sí quieres (por si alguno se borró)
insert into public.payment_methods (name) values ('Efectivo') on conflict do nothing;
insert into public.payment_methods (name) values ('Débito')   on conflict do nothing;
insert into public.payment_methods (name) values ('Crédito')  on conflict do nothing;

-- ============================================================
-- 3) ÍNDICES de performance
-- ============================================================
create index if not exists idx_transactions_user_date
on public.transactions (user_id, transaction_date desc, created_at desc);

create index if not exists idx_transactions_category_id
on public.transactions (category_id);

create index if not exists idx_transactions_payment_method_id
on public.transactions (payment_method_id);

-- ============================================================
-- 4) GRANT básicos (por si acaso no están)
--    (NO hay sequence — tu PK es uuid con gen_random_uuid())
-- ============================================================
grant select, insert, update, delete on public.transactions      to authenticated;
grant select                         on public.categories        to authenticated;
grant select                         on public.payment_methods   to authenticated;
