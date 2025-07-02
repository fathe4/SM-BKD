# Post Boost API Documentation

## Overview

The Post Boost API allows users to promote their posts for increased visibility. Boosts are time-limited and priced according to a tiered, discount-based model. All pricing is calculated server-side to prevent manipulation.

---

## Endpoints

| Method | Endpoint                                 | Description                                     |
| ------ | ---------------------------------------- | ----------------------------------------------- |
| POST   | `/api/v1/posts/:postId/boosts`           | Create a new boost for a post                   |
| GET    | `/api/v1/posts/boosts/my`                | List all boosts for the authenticated user      |
| GET    | `/api/v1/posts/:postId/boosts/status`    | Get the current boost status for a post         |
| PATCH  | `/api/v1/posts/boosts/:boostId/status`   | Update the status of a boost                    |
| PATCH  | `/api/v1/posts/boosts/:boostId/activate` | Activate a boost (set to ACTIVE, expire others) |

---

## Authentication

All endpoints require authentication. The user must be logged in and authorized to perform actions on the target post or boost.

---

## Boost Pricing Model

- **Tiered, Discounted Pricing:**
  - Pricing is based on the number of days the post is boosted.
  - The backend selects the correct pricing tier from the `boost_pricing` table, using `min_days`, `max_days`, `base_price_per_day`, and `discount_percent`.
  - **Amount Calculation:**
    - `amount = base_price_per_day * days * (1 - discount_percent / 100)`
  - The client never provides the amount; it is always calculated server-side.

---

## Status Values

- `pending_payment`: Awaiting payment before activation
- `active`: Boost is live and post is promoted
- `pause`: Boost is temporarily paused
- `expired`: Boost duration has ended
- `cancelled`: Boost was cancelled

---

## Endpoint Details

### 1. Create a Post Boost

**POST** `/api/v1/posts/:postId/boosts`

**Request Body Example:**

```json
{
  "days": 7,
  "city": "New York",
  "country": "US",
  "coordinates": { "lat": 40.7128, "lng": -74.006 }
}
```

**Response Example:**

```json
{
  "status": "success",
  "data": {
    "boost": {
      "id": "...",
      "post_id": "...",
      "user_id": "...",
      "days": 7,
      "amount": 12.6,
      "status": "pending_payment",
      "created_at": "2024-06-01T12:00:00Z",
      "expires_at": "2024-06-08T12:00:00Z",
      "city": "New York",
      "country": "US",
      "coordinates": { "lat": 40.7128, "lng": -74.006 }
    }
  }
}
```

---

### 2. List User Boosts

**GET** `/api/v1/posts/boosts/my`

**Query Parameters:**

- `status` (optional): Filter by boost status

**Response Example:**

```json
{
  "status": "success",
  "data": {
    "boosts": [
      /* array of boost objects */
    ]
  }
}
```

---

### 3. Get Boost Status for a Post

**GET** `/api/v1/posts/:postId/boosts/status`

**Response Example:**

```json
{
  "status": "success",
  "data": {
    "boost": {
      /* boost object or null */
    }
  }
}
```

---

### 4. Update Boost Status

**PATCH** `/api/v1/posts/boosts/:boostId/status`

**Request Body Example:**

```json
{
  "status": "cancelled"
}
```

**Response Example:**

```json
{
  "status": "success"
}
```

---

### 5. Activate a Boost

**PATCH** `/api/v1/posts/boosts/:boostId/activate`

Activates the boost, sets its status to `active`, and expires any other active/pause boosts for the same post.

**Response Example:**

```json
{
  "status": "success"
}
```

---

## Error Handling

- All errors return a JSON object with `status: "error"` and a descriptive `message`.
- Common errors include:
  - Unauthorized or unauthenticated access
  - Invalid or missing parameters
  - Attempting to boost a post that already has an active or pending boost
  - Invalid boost duration (no matching pricing tier)

---

## Example Use Cases

- User wants to boost a post for 7 days in a specific city.
- User checks the status of their current boosts.
- User cancels a pending or active boost.
- User activates a boost after payment is confirmed.

---

## Notes

- All pricing and status logic is enforced server-side for security.
- Only one boost can be active for a post at a time.
- Boosts can be paused, expired, or cancelled as needed.
