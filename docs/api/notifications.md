# Notification API Documentation

## Overview

The Notification API provides endpoints for managing user notifications in the social platform. These endpoints allow users to view, manage, and interact with their notifications.

## Base URL

```
http://localhost:7979/api/v1/notifications
```

## Authentication

All endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Get All Notifications

Retrieves all notifications for the authenticated user with pagination support.

```http
GET /api/v1/notifications
```

#### Query Parameters

| Parameter | Type    | Default | Description                |
| --------- | ------- | ------- | -------------------------- |
| page      | integer | 1       | Page number for pagination |
| limit     | integer | 20      | Number of items per page   |

#### Response

```json
{
  "status": "success",
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "actor_id": "uuid",
        "reference_id": "uuid",
        "reference_type": "post|comment|reaction",
        "content": "string",
        "is_read": boolean,
        "created_at": "ISO date string",
        "actor": {
          "id": "uuid",
          "username": "string",
          "profile_picture": "string"
        }
      }
    ],
    "total": 100,
    "page": 1,
    "totalPages": 5,
    "limit": 20
  }
}
```

### 2. Get Unread Count

Retrieves the count of unread notifications for the authenticated user.

```http
GET /api/v1/notifications/unread-count
```

#### Response

```json
{
  "status": "success",
  "data": {
    "count": 5
  }
}
```

### 3. Mark Notification as Read

Marks a specific notification as read.

```http
PATCH /api/v1/notifications/:notificationId/read
```

#### URL Parameters

| Parameter      | Type   | Description                            |
| -------------- | ------ | -------------------------------------- |
| notificationId | string | ID of the notification to mark as read |

#### Response

```json
{
  "status": "success",
  "data": {
    "notification": {
      "id": "uuid",
      "is_read": true
      // ... other notification fields
    }
  }
}
```

### 4. Mark All Notifications as Read

Marks all notifications as read for the authenticated user.

```http
PATCH /api/v1/notifications/read-all
```

#### Response

```json
{
  "status": "success",
  "message": "All notifications marked as read"
}
```

### 5. Delete Notification

Deletes a specific notification.

```http
DELETE /api/v1/notifications/:notificationId
```

#### URL Parameters

| Parameter      | Type   | Description                      |
| -------------- | ------ | -------------------------------- |
| notificationId | string | ID of the notification to delete |

#### Response

```http
204 No Content
```

### 6. Delete All Notifications

Deletes all notifications for the authenticated user.

```http
DELETE /api/v1/notifications
```

#### Response

```http
204 No Content
```

## Error Responses

All endpoints may return the following error responses:

### 401 Unauthorized

```json
{
  "status": "error",
  "message": "Unauthorized access"
}
```

### 404 Not Found

```json
{
  "status": "error",
  "message": "Notification not found"
}
```

### 400 Bad Request

```json
{
  "status": "error",
  "message": "Invalid request parameters"
}
```

## Notification Types

The `reference_type` field in notifications can have the following values:

| Type     | Description                                     |
| -------- | ----------------------------------------------- |
| post     | Notification related to a post                  |
| comment  | Notification related to a comment               |
| reaction | Notification related to a reaction (like, etc.) |

## Example Usage

### Using cURL

1. Get all notifications:

```bash
curl -X GET \
  'http://localhost:7979/api/v1/notifications?page=1&limit=20' \
  -H 'Authorization: Bearer your_jwt_token'
```

2. Mark notification as read:

```bash
curl -X PATCH \
  'http://localhost:7979/api/v1/notifications/notification_id/read' \
  -H 'Authorization: Bearer your_jwt_token'
```

3. Delete all notifications:

```bash
curl -X DELETE \
  'http://localhost:7979/api/v1/notifications' \
  -H 'Authorization: Bearer your_jwt_token'
```

### Using JavaScript/Fetch

```javascript
// Get notifications
const getNotifications = async (page = 1, limit = 20) => {
  const response = await fetch(
    `http://localhost:7979/api/v1/notifications?page=${page}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return await response.json();
};

// Mark notification as read
const markAsRead = async (notificationId) => {
  const response = await fetch(
    `http://localhost:7979/api/v1/notifications/${notificationId}/read`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return await response.json();
};

// Delete all notifications
const deleteAllNotifications = async () => {
  const response = await fetch("http://localhost:7979/api/v1/notifications", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.status === 204;
};
```

## Best Practices

1. **Pagination**: Always use pagination when fetching notifications to prevent loading too much data at once.
2. **Error Handling**: Implement proper error handling for all API calls.
3. **Token Management**: Ensure JWT tokens are properly managed and refreshed when needed.
4. **Rate Limiting**: Be mindful of API rate limits when making multiple requests.

## WebSocket Events

The notification system also supports real-time updates through WebSocket connections. The following events are emitted:

### notification:new

Emitted when a new notification is created:

```javascript
socket.on("notification:new", (data) => {
  console.log("New notification:", data);
  // data = { notification: {...}, message: "string" }
});
```

To listen for notifications, ensure your WebSocket connection is established and authenticated with the same JWT token used for REST API calls.
