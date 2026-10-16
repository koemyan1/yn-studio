# Debt KHQR: auto-approve + saving the QR
1. Run supabase-debt-khqr-fix.sql once in Supabase -> SQL Editor. (Also folded into supabase-debt-interest-fix.sql for new installs.)
2. Deploy.
- Cause of no auto-approval: the server confirms the Bakong payment with the service key; accrue_customer_debt_interest() refused calls with no signed-in user, so the debt payment was never applied.
- The Debt page now re-checks pending KHQR payments every 8s and when the customer returns from the bank app (like Orders did), and the pay window checks the moment the app is reopened.
- Save QR image now shares/downloads a clean PNG with a white border and the amount (works on phones); fallback opens the image to press-and-hold.
