-- ============================================
-- CAMPO FALTANTE: type en transactions
-- ============================================
alter table public.transactions
  add column if not exists type text not null default 'expense'
  check (type in ('expense', 'income'));

comment on column public.transactions.type is 'expense = gasto, income = ingreso';

-- ============================================
-- CAMPO FALTANTE: type en categories
-- ============================================
alter table public.categories
  add column if not exists type text
  check (type in ('expense', 'income'));

-- Marcar categorías originales (de gasto)
update public.categories set type = 'expense' where type is null;

-- ============================================
-- CATEGORÍAS DE INGRESOS (solo si no existen)
-- ============================================
insert into public.categories (name, icon, color, type)
select * from (
  values
    ('Salario',         '💼', '#10b981', 'income'),
    ('Freelance',       '💻', '#0ea5e9', 'income'),
    ('Inversiones',     '📈', '#a855f7', 'income'),
    ('Ventas',          '🏷️', '#f59e0b', 'income'),
    ('Regalos',         '🎁', '#f472b6', 'income'),
    ('Otros Ingresos',  '💰', '#6b7280', 'income')
) as v (name, icon, color, type)
where not exists (
  select 1 from public.categories c
  where c.name = v.name and c.type = v.type
);
