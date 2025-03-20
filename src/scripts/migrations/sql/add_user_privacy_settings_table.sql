-- migrations/add_user_privacy_settings_table.sql

-- Create the user_privacy_settings table
CREATE TABLE IF NOT EXISTS user_privacy_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX idx_user_privacy_settings_user_id ON user_privacy_settings(user_id);

-- Create a trigger to automatically update updated_at timestamp
CREATE TRIGGER update_user_privacy_settings_updated_at
BEFORE UPDATE ON user_privacy_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE user_privacy_settings IS 'Stores extended privacy settings for users beyond the basic settings in the user table';
COMMENT ON COLUMN user_privacy_settings.settings IS 'JSON object containing all extended privacy settings';

-- Apply Row-Level Security (RLS)
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for select operations
CREATE POLICY user_privacy_settings_select ON user_privacy_settings
  FOR SELECT USING (
    -- Users can view their own privacy settings
    auth.uid() = user_id OR 
    -- Admins can view any privacy settings
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Create policy for insert operations
CREATE POLICY user_privacy_settings_insert ON user_privacy_settings
  FOR INSERT WITH CHECK (
    -- Users can only insert their own privacy settings
    auth.uid() = user_id
  );

-- Create policy for update operations
CREATE POLICY user_privacy_settings_update ON user_privacy_settings
  FOR UPDATE USING (
    -- Users can only update their own privacy settings
    auth.uid() = user_id OR
    -- Admins can update any privacy settings
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );