# Secret Theme Preview Accuracy Update

- Made storefront preview buttons follow one consistent editor interaction: single-click selects an item for editing; double-click tests its preview action.
- Applied the same interaction to hero CTA, category filters, product add-to-cart buttons, checkout/customer-service preview actions, and bottom navigation.
- Prevented the selected-item label from intercepting clicks or obscuring buttons.
- Improved small-screen layout and ensured preview controls and product actions remain visible.
- This remains an editor simulation for customer actions, not a production checkout or real cart mutation. Changes to theme settings are saved by the existing Supabase theme save action.
