-- Add password reset fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS reset_password_token TEXT,
ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP WITH TIME ZONE;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_password_token);

-- Add comment for documentation
COMMENT ON COLUMN users.reset_password_token IS 'Token for password reset functionality';
COMMENT ON COLUMN users.reset_password_expires IS 'Expiry timestamp for password reset token';

