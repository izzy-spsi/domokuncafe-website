-- Domo Cafe guest survey module. Isolated from the static site schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('staff', 'manager', 'admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff_users(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  current_version_id uuid,
  allow_no_reward boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE survey_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id),
  version_number integer NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'published')),
  title text NOT NULL,
  intro text NOT NULL,
  schema jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, version_number)
);

ALTER TABLE surveys
  ADD CONSTRAINT surveys_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES survey_versions(id);

CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft', 'scheduled', 'active', 'paused', 'ended')),
  current_version_id uuid,
  is_default boolean NOT NULL DEFAULT false,
  test_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX promotions_one_default ON promotions (is_default) WHERE is_default;

CREATE TABLE promotion_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id),
  version_number integer NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'published')),
  name text NOT NULL,
  description text NOT NULL,
  image_url text,
  reward_type text NOT NULL CHECK (reward_type IN ('percent_off', 'fixed_amount', 'bogo', 'free_food_drink', 'merchandise', 'other_gift')),
  reward_details jsonb NOT NULL,
  eligibility jsonb NOT NULL,
  guest_terms text NOT NULL,
  staff_instructions text NOT NULL DEFAULT '',
  starts_at timestamptz,
  ends_at timestamptz,
  expiry_rule jsonb NOT NULL,
  total_cap integer,
  daily_cap integer,
  physical_supply integer,
  redemption_rules jsonb NOT NULL,
  survey_id uuid REFERENCES surveys(id),
  test_data boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, version_number),
  CHECK (total_cap IS NULL OR total_cap > 0),
  CHECK (daily_cap IS NULL OR daily_cap > 0),
  CHECK (physical_supply IS NULL OR physical_supply > 0)
);

ALTER TABLE promotions
  ADD CONSTRAINT promotions_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES promotion_versions(id);

CREATE TABLE capacity_ledger (
  promotion_id uuid PRIMARY KEY REFERENCES promotions(id),
  total_issued integer NOT NULL DEFAULT 0 CHECK (total_issued >= 0),
  daily_date date,
  daily_issued integer NOT NULL DEFAULT 0 CHECK (daily_issued >= 0),
  total_cap integer,
  daily_cap integer,
  physical_supply integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_cap IS NULL OR total_cap > 0),
  CHECK (daily_cap IS NULL OR daily_cap > 0),
  CHECK (physical_supply IS NULL OR physical_supply > 0)
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  promotion_id uuid NOT NULL REFERENCES promotions(id),
  promotion_version_id uuid REFERENCES promotion_versions(id),
  survey_version_id uuid REFERENCES survey_versions(id),
  channel text NOT NULL,
  placement text NOT NULL,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  test_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE survey_attempts (
  id uuid PRIMARY KEY,
  survey_version_id uuid NOT NULL REFERENCES survey_versions(id),
  promotion_version_id uuid REFERENCES promotion_versions(id),
  campaign_id uuid REFERENCES campaigns(id),
  entry_source text NOT NULL,
  placement text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  test_data boolean NOT NULL DEFAULT false
);

CREATE TABLE survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  attempt_id uuid NOT NULL UNIQUE REFERENCES survey_attempts(id),
  survey_version_id uuid NOT NULL REFERENCES survey_versions(id),
  promotion_version_id uuid REFERENCES promotion_versions(id),
  answers jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  first_visit text CHECK (first_visit IS NULL OR first_visit IN ('first_time', 'returning')),
  party_size integer,
  discovery_option text,
  location jsonb,
  postal_code text,
  locality text,
  country_code text,
  location_unmapped boolean,
  campaign_id uuid REFERENCES campaigns(id),
  entry_source text,
  placement text,
  test_data boolean NOT NULL DEFAULT false,
  signup_token text UNIQUE,
  accepted_replacement boolean NOT NULL DEFAULT false,
  no_reward boolean NOT NULL DEFAULT false
);

CREATE TABLE rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL UNIQUE REFERENCES survey_responses(id),
  token_hash text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  code_normalized text NOT NULL UNIQUE,
  promotion_version_id uuid NOT NULL REFERENCES promotion_versions(id),
  terms_snapshot jsonb NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('issued', 'redeemed', 'expired', 'voided')),
  test_data boolean NOT NULL DEFAULT false
);

CREATE TABLE redemptions (
  reward_id uuid PRIMARY KEY REFERENCES rewards(id),
  staff_id uuid NOT NULL REFERENCES staff_users(id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  check_reference text,
  fulfillment_state text NOT NULL DEFAULT 'pending' CHECK (fulfillment_state IN ('pending', 'completed', 'failed')),
  fulfillment_at timestamptz,
  fulfillment_by uuid REFERENCES staff_users(id),
  fulfillment_note text,
  idempotency_key text UNIQUE,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES staff_users(id),
  reversal_reason text
);

CREATE TABLE reward_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES rewards(id),
  event_type text NOT NULL,
  actor_id uuid REFERENCES staff_users(id),
  reason text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  email_hash text,
  first_name text,
  status text NOT NULL CHECK (status IN ('subscribed', 'unsubscribed', 'deleted')),
  unsubscribe_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subscribers_email_hash_unique ON subscribers (email_hash) WHERE email_hash IS NOT NULL;

CREATE TABLE consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id),
  action text NOT NULL CHECK (action IN ('opt_in', 'opt_out', 'delete')),
  consent_text text,
  consent_version text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE response_subscriber_links (
  response_id uuid NOT NULL REFERENCES survey_responses(id),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (response_id, subscriber_id)
);

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'survey_opened', 'survey_started', 'survey_submitted', 'reward_issued',
    'signup_opted_in', 'reward_redeemed', 'fulfillment_completed'
  )),
  attempt_id uuid,
  response_id uuid,
  reward_id uuid,
  campaign_id uuid,
  test_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES staff_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  promotion_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE zip_reference (
  zip text PRIMARY KEY,
  city text NOT NULL,
  region text,
  state text NOT NULL
);

CREATE INDEX survey_attempts_started_idx ON survey_attempts (started_at);
CREATE INDEX survey_responses_submitted_idx ON survey_responses (submitted_at);
CREATE INDEX rewards_issued_idx ON rewards (issued_at);
CREATE INDEX rewards_status_idx ON rewards (status);
CREATE INDEX analytics_events_type_idx ON analytics_events (event_type, created_at);

CREATE OR REPLACE FUNCTION survey_versions_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'published' AND (
    NEW.schema IS DISTINCT FROM OLD.schema OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.intro IS DISTINCT FROM OLD.intro OR
    NEW.survey_id IS DISTINCT FROM OLD.survey_id OR
    NEW.version_number IS DISTINCT FROM OLD.version_number OR
    NEW.state IS DISTINCT FROM OLD.state
  ) THEN
    RAISE EXCEPTION 'published survey versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER survey_versions_immutable_trg
  BEFORE UPDATE ON survey_versions
  FOR EACH ROW EXECUTE PROCEDURE survey_versions_immutable();

CREATE OR REPLACE FUNCTION promotion_versions_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'published' THEN
    RAISE EXCEPTION 'published promotion versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER promotion_versions_immutable_trg
  BEFORE UPDATE ON promotion_versions
  FOR EACH ROW EXECUTE PROCEDURE promotion_versions_immutable();

INSERT INTO zip_reference (zip, city, region, state) VALUES
  ('90620', 'Buena Park', 'Orange County', 'CA'),
  ('90621', 'Buena Park', 'Orange County', 'CA'),
  ('90622', 'Buena Park', 'Orange County', 'CA'),
  ('90630', 'Cypress', 'Orange County', 'CA'),
  ('90680', 'Stanton', 'Orange County', 'CA'),
  ('90720', 'Los Alamitos', 'Orange County', 'CA'),
  ('90740', 'Seal Beach', 'Orange County', 'CA'),
  ('92683', 'Westminster', 'Orange County', 'CA'),
  ('92801', 'Anaheim', 'Orange County', 'CA'),
  ('92804', 'Anaheim', 'Orange County', 'CA'),
  ('92805', 'Anaheim', 'Orange County', 'CA'),
  ('92821', 'Brea', 'Orange County', 'CA'),
  ('92832', 'Fullerton', 'Orange County', 'CA')
ON CONFLICT (zip) DO NOTHING;
