-- Product names for imported sales.
--
-- No charge on a real account names the product: every subscription payment
-- reads "Subscription update" and one-off payments read "Payment to <business>".
-- The real name lives on the invoice line items or the checkout session line
-- items, which stripe-sync resolves in a backfill pass after each import.
--
-- product_id is stored alongside the name on purpose. Item 2 (product -> offer
-- matching) keys the mapping on the id, because a user can rename a product in
-- Stripe at any time and a name-keyed mapping would silently orphan itself.

alter table public.imported_sales
  add column if not exists product_name text,
  add column if not exists product_id text;

create index if not exists imported_sales_user_product_idx
  on public.imported_sales (user_id, product_id);
