# City / Province delivery location SQL fix

The customer delivery form stores the city/province in `profiles.delivery_address`.
If saving it returns `record "new" has no field "updated at"`, a legacy trigger on
`profiles` is likely referencing a timestamp column with a space in its name.

## Apply it
1. Open the Supabase project used by YN Studio.
2. Open SQL Editor and create a new query.
3. Copy/paste the complete contents of `supabase-city-province-location-fix.sql`.
4. Run the query, then try saving the customer's delivery information again.

This migration adds the delivery fields and includes a compatibility workaround
for the legacy timestamp reference. It does not delete existing profile data.
