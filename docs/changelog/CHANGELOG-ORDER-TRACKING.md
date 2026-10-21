# Order tracking view
1. Run supabase-order-tracking-statuses.sql once (adds 4 statuses: arrived/left China warehouse, arrived/left Cambodia warehouse).
2. Customer Orders > View order opens a page whose animation follows the status:
   box = paid / processing / confirmed, warehouse = arrived ... warehouse, truck = left ... warehouse or shipped,
   green check = completed / delivered, clock = pending / payment pending, red X = cancelled / rejected.
3. Custom statuses you add yourself also work if the name contains: arriv (warehouse), left / leav / ship / transit / out for (truck), china or cambodia (picks the place).
