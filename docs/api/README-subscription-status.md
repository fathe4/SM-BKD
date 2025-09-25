# Subscription Status Job

A cron job that automatically manages user subscription statuses based on expiration dates.

## Overview

This job runs every hour to check and update subscription statuses in the `user_subscriptions` table based on the `expires_at` field compared to the current time.

## Features

- **Automatic Expiration**: Updates expired subscriptions to "expired" status
- **Multiple Status Handling**: Handles active, past_due, and pending subscriptions
- **Comprehensive Logging**: Detailed logs for monitoring and debugging
- **Warning System**: Alerts for subscriptions expiring within 24 hours
- **Error Handling**: Graceful error handling with proper logging

## Subscription Status Flow

```
active → expired (when expires_at < current_time)
past_due → expired (when expires_at < current_time)
pending → expired (when expires_at < current_time)
cancelled → (no change)
expired → (no change)
```

## Schedule

- **Frequency**: Every hour at minute 0
- **Timezone**: UTC
- **Cron Expression**: `0 * * * *`

## What It Does

### 1. Expire Active Subscriptions
- Finds all subscriptions with status "active" where `expires_at < current_time`
- Updates them to status "expired"
- Logs the details of expired subscriptions

### 2. Expire Past Due Subscriptions
- Finds all subscriptions with status "past_due" where `expires_at < current_time`
- Updates them to status "expired"
- Logs the details of expired subscriptions

### 3. Expire Pending Subscriptions
- Finds all subscriptions with status "pending" where `expires_at < current_time`
- Updates them to status "expired"
- Logs the details of expired subscriptions

### 4. Warning System
- Checks for active subscriptions expiring within 24 hours
- Logs warnings for subscriptions that will expire soon
- Helps with proactive subscription management

## Database Operations

### Tables Affected
- `user_subscriptions` - Updates status and updated_at fields

### Fields Updated
- `status` - Changed to "expired" for expired subscriptions
- `updated_at` - Set to current timestamp

## Logging

### Info Logs
- Job start/completion
- Number of subscriptions expired
- Details of expired subscriptions
- No subscriptions to expire

### Warning Logs
- Subscriptions expiring within 24 hours

### Error Logs
- Database connection errors
- Query execution errors
- Missing Supabase admin client

## Example Log Output

```
[INFO] Starting subscription status job
[INFO] Checking subscriptions as of: 2024-01-15T10:00:00.000Z
[INFO] Expired 3 subscription(s): {
  "activeExpired": 2,
  "pastDueExpired": 1,
  "pendingExpired": 0,
  "expiredSubscriptions": [...]
}
[INFO] Active subscriptions expired: 2
[INFO] - User user-123: Subscription sub-456 expired at 2024-01-15T09:30:00.000Z
[WARN] Found 1 subscription(s) expiring within 24 hours
```

## Error Handling

- **Database Errors**: Logged and job continues
- **Missing Admin Client**: Logged and job skips
- **Unexpected Errors**: Caught and logged with full error details

## Monitoring

The job provides comprehensive logging for monitoring:
- Success/failure status
- Number of subscriptions processed
- Individual subscription details
- Warning alerts for upcoming expirations

## Integration

- **Auto-starts**: Initialized when the server starts
- **No Manual Intervention**: Runs automatically in the background
- **UTC Timezone**: Consistent time handling across environments

## Testing

The job includes unit tests covering:
- Successful execution
- Database error handling
- Missing admin client scenarios
- Different subscription statuses

## Dependencies

- `cron` - For scheduling
- `supabaseAdmin` - For database operations
- `logger` - For logging
