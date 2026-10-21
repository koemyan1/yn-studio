-- Order tracking statuses for the new order view (box / warehouse / truck animations).
-- Run once in Supabase -> SQL Editor. Safe to run again.
insert into public.order_statuses(name,label,color,sort_order,active,marks_paid) values
('arrived china warehouse','Arrived at China warehouse','#2563eb',42,true,true),
('left china warehouse','Left China warehouse','#e1232e',44,true,true),
('arrived cambodia warehouse','Arrived at Cambodia warehouse','#0ea5e9',46,true,true),
('left cambodia warehouse','Left Cambodia warehouse (to destination)','#f59e0b',48,true,true)
on conflict (name) do update set
  label=excluded.label, color=excluded.color, sort_order=excluded.sort_order, active=true, marks_paid=true;
