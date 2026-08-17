-- ============================================================
-- PRICING SEED — boost pricing, subscription tiers, marketplace
-- categories, free-tier subscriptions + auto-subscribe trigger.
-- Idempotent: safe to run multiple times.
-- Statements are separated by a standalone marker comment line
-- (see seedPricing.ts for the exact splitter, needed because
-- trigger bodies contain semicolons).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Boost pricing tiers
-- Matches the frontend CreateBoostDialog exactly:
-- $2.00/day with 0/5/10/15/20% discounts at 3/7/14/21+ days.
-- PostService picks the tier with the highest min_days <= days.
-- ------------------------------------------------------------
INSERT INTO boost_pricing (min_days, max_days, base_price_per_day, discount_percent, is_active)
SELECT * FROM (VALUES
  (1,  2,       2.00::numeric, 0,  true),
  (3,  6,       2.00::numeric, 5,  true),
  (7,  13,      2.00::numeric, 10, true),
  (14, 20,      2.00::numeric, 15, true),
  (21, NULL::int, 2.00::numeric, 20, true)
) AS t(min_days, max_days, base_price_per_day, discount_percent, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM boost_pricing p
  WHERE p.min_days = t.min_days
    AND p.max_days IS NOT DISTINCT FROM t.max_days
);
-- !split

-- ------------------------------------------------------------
-- 2. Marketplace subscription tiers
-- UI (marketplace/upgrade) renders 3 columns; price 0 shows "Free".
-- ------------------------------------------------------------
INSERT INTO subscription_tiers (name, description, price, duration_days, listing_limit, featured_listings, priority_search)
SELECT * FROM (VALUES
  ('Free',     'Basic marketplace access with up to 5 active listings.',            0.00::numeric,  30, 5,   false, false),
  ('Standard', 'Grow your shop: 25 listings and featured placement.',               9.99::numeric,  30, 25,  true,  false),
  ('Premium',  'Maximum reach: 100 listings, featured placement and priority search.', 19.99::numeric, 30, 100, true,  true)
) AS t(name, description, price, duration_days, listing_limit, featured_listings, priority_search)
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_tiers s WHERE s.name = t.name
);
-- !split

-- ------------------------------------------------------------
-- 3. Marketplace categories
-- ------------------------------------------------------------
INSERT INTO categories (name, description, category_type)
SELECT * FROM (VALUES
  ('Electronics',        'Phones, computers, gadgets and accessories', 'marketplace'),
  ('Fashion & Clothing', 'Apparel, shoes and accessories',             'marketplace'),
  ('Home & Furniture',   'Furniture, appliances and home decor',       'marketplace'),
  ('Vehicles',           'Cars, motorcycles, parts and accessories',   'marketplace'),
  ('Sports & Outdoors',  'Sporting goods and outdoor gear',            'marketplace'),
  ('Health & Beauty',    'Personal care and beauty products',          'marketplace'),
  ('Toys & Games',       'Toys, board games and video games',          'marketplace'),
  ('Books & Media',      'Books, movies, music and collectibles',      'marketplace'),
  ('Pets Supplies',      'Pet food, accessories and care',             'marketplace'),
  ('Jewelry & Watches',  'Fine jewelry, watches and accessories',      'marketplace'),
  ('Musical Instruments','Instruments, gear and equipment',            'marketplace'),
  ('Other',              'Everything else',                            'marketplace')
) AS t(name, description, category_type)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.name = t.name AND c.category_type = t.category_type
);
-- !split

-- ------------------------------------------------------------
-- 4. Grant the Free tier to every existing user who does not
--    already have an active, unexpired subscription.
--    (checkActiveSubscription middleware 403s marketplace access
--    without this.)
-- ------------------------------------------------------------
INSERT INTO user_subscriptions (user_id, subscription_tier_id, status, started_at, expires_at)
SELECT u.id, t.id, 'active', now(), now() + (t.duration_days || ' days')::interval
FROM users u
CROSS JOIN (
  SELECT id, duration_days FROM subscription_tiers
  WHERE name = 'Free' ORDER BY price ASC LIMIT 1
) t
WHERE NOT EXISTS (
  SELECT 1 FROM user_subscriptions us
  WHERE us.user_id = u.id
    AND us.status = 'active'
    AND us.expires_at > now()
);
-- !split

-- ------------------------------------------------------------
-- 5. Auto-subscribe new signups to the Free tier
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, subscription_tier_id, status, started_at, expires_at)
  SELECT NEW.id, t.id, 'active', now(), now() + (t.duration_days || ' days')::interval
  FROM (
    SELECT id, duration_days FROM subscription_tiers
    WHERE name = 'Free' ORDER BY price ASC LIMIT 1
  ) t;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- !split

DROP TRIGGER IF EXISTS trg_assign_free_subscription ON users;
-- !split

CREATE TRIGGER trg_assign_free_subscription
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION assign_free_subscription();
