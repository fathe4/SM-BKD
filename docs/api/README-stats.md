# Stats Service

A simple and clean statistics service for user analytics based on Supabase database tables.

## Features

- **Comprehensive User Stats**: Get detailed statistics for any user
- **Quick Stats**: Lightweight version for fast loading
- **Multiple Data Sources**: Posts, friends, payments, subscriptions, stories, comments, reactions, saved items, marketplace listings
- **Error Handling**: Proper error handling with logging
- **Type Safety**: Full TypeScript support

## Available Statistics

### User Stats Interface
```typescript
interface UserStats {
  userId: string;
  totalPosts: number;
  totalBoostedPosts: number;
  totalFriends: number;
  totalInvested: number;
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
  totalStories: number;
  totalComments: number;
  totalReactions: number;
  totalSavedItems: number;
  totalMarketplaceListings: number;
  averageRating: number | null;
  totalRatings: number;
  lastActiveAt: string | null;
  accountCreatedAt: string | null;
}
```

## API Endpoints

### Get Current User's Comprehensive Stats
```
GET /api/v1/stats/me
Authorization: Bearer <token>
```

### Get Current User's Quick Stats
```
GET /api/v1/stats/me/quick
Authorization: Bearer <token>
```

### Get Specific User's Comprehensive Stats
```
GET /api/v1/stats/user/:userId
Authorization: Bearer <token>
```

### Get Specific User's Quick Stats
```
GET /api/v1/stats/user/:userId/quick
Authorization: Bearer <token>
```

## Usage Examples

### Service Usage
```typescript
import { StatsService } from './services/statsService';

// Get comprehensive stats
const stats = await StatsService.getUserStats('user-id-here');

// Get quick stats (faster, fewer queries)
const quickStats = await StatsService.getQuickStats('user-id-here');
```

### API Response Example
```json
{
  "success": true,
  "message": "User statistics retrieved successfully",
  "data": {
    "userId": "user-123",
    "totalPosts": 45,
    "totalBoostedPosts": 3,
    "totalFriends": 128,
    "totalInvested": 150.50,
    "subscriptionStatus": "active",
    "subscriptionTier": "Premium",
    "totalStories": 12,
    "totalComments": 89,
    "totalReactions": 234,
    "totalSavedItems": 15,
    "totalMarketplaceListings": 5,
    "averageRating": 4.8,
    "totalRatings": 12,
    "lastActiveAt": "2024-01-15T10:30:00Z",
    "accountCreatedAt": "2023-06-01T08:00:00Z"
  }
}
```

## Database Tables Used

- `posts` - For post counts and boosted posts
- `friendships` - For friend counts
- `payments` - For investment/spending totals
- `user_subscriptions` - For subscription status and tier
- `stories` - For story counts
- `comments` - For comment counts
- `reactions` - For reaction counts
- `saved_items` - For saved items count
- `marketplace_listings` - For marketplace activity
- `seller_ratings` - For seller ratings
- `users` - For basic user info

## Performance Notes

- **Comprehensive Stats**: Uses parallel queries for better performance
- **Quick Stats**: Only queries essential tables (posts, friends, payments)
- **Error Handling**: Each query is wrapped in try-catch with proper logging
- **Type Safety**: Full TypeScript interfaces for all data structures

## Error Handling

The service includes comprehensive error handling:
- Database connection errors
- Query execution errors
- Data validation errors
- Proper HTTP status codes
- Detailed error logging

## Security

- Authentication required for all endpoints
- Users can only access their own stats (unless admin)
- Admin/moderator roles can access any user's stats
- Input validation on all parameters
