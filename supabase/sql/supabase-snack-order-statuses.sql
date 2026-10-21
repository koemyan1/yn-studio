-- Snack order statuses (Snacks page orders): paid -> processing -> waiting for a delivery driver -> out for delivery -> completed / cancelled.
-- Run once in Supabase -> SQL Editor. Safe to run again.
-- "paid", "processing", "completed" and "cancelled" already exist; this adds the two new ones.
insert into public.order_statuses(name,label,color,sort_order,active,marks_paid) values
('waiting for driver','Waiting for a delivery driver','#0d9488',50,true,true),
('out for delivery','Out for delivery','#f59e0b',52,true,true)
on conflict (name) do update set
  label=excluded.label, color=excluded.color, sort_order=excluded.sort_order, active=true, marks_paid=true;
