# Story API Documentation

This document provides detailed information about the Story API endpoints, including how to use them, the required parameters, and the expected responses.

## Base URL

All API endpoints are prefixed with `/api/v1/stories`.

---

## 1. Create a New Story

- **Endpoint:** `POST /`
- **Description:** Creates a new story for the authenticated user. Stories automatically expire after 24 hours.
- **Authentication:** Required (Bearer Token).
- **Request Body:**

  - `content` (string, optional): The text content of the story.
  - `media_url` (string, required): The URL for the story's image or video.
  - `media_type` (string, required): The type of media (e.g., 'image', 'video').
  - `visibility` (string, optional): The visibility of the story (e.g., 'public', 'friends'). Defaults to 'public'.

- **Example Request:**

  ```json
  {
    "content": "Enjoying a beautiful sunset!",
    "media_url": "https://example.com/story.jpg",
    "media_type": "image",
    "visibility": "friends"
  }
  ```

- **Success Response (201 Created):**

  - Returns the newly created story object.

  ```json
  {
    "id": "e2a7a7e4-a3a8-4c1d-8a29-3f4a3f4a3f4a",
    "user_id": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
    "content": "Enjoying a beautiful sunset!",
    "media_url": "https://example.com/story.jpg",
    "media_type": "image",
    "visibility": "friends",
    "view_count": 0,
    "expires_at": "2024-08-01T12:00:00.000Z",
    "created_at": "2024-07-31T12:00:00.000Z"
  }
  ```

- **Error Responses:**
  - `401 Unauthorized`: If the user is not authenticated.
  - `500 Internal Server Error`: If there is a server-side error.

---

## 2. Get Active Stories

- **Endpoint:** `GET /`
- **Description:** Retrieves all active (non-expired) stories.
- **Authentication:** Not required.
- **Success Response (200 OK):**

  - Returns an array of active story objects.

  ```json
  [
    {
      "id": "e2a7a7e4-a3a8-4c1d-8a29-3f4a3f4a3f4a",
      "user_id": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
      "content": "Enjoying a beautiful sunset!",
      "media_url": "https://example.com/story.jpg",
      "media_type": "image",
      "visibility": "friends",
      "view_count": 15,
      "expires_at": "2024-08-01T12:00:00.000Z",
      "created_at": "2024-07-31T12:00:00.000Z"
    }
  ]
  ```

- **Error Responses:**
  - `500 Internal Server Error`: If there is a server-side error.

---

## 3. Get a Single Story

- **Endpoint:** `GET /:id`
- **Description:** Retrieves a single story by its ID.
- **Authentication:** Not required.
- **URL Parameters:**
  - `id` (string, required): The ID of the story to retrieve.
- **Success Response (200 OK):**
  - Returns the requested story object.
- **Error Responses:**
  - `404 Not Found`: If the story with the specified ID does not exist or has expired.
  - `500 Internal Server Error`: If there is a server-side error.

---

## 4. Delete a Story

- **Endpoint:** `DELETE /:id`
- **Description:** Deletes a story owned by the authenticated user.
- **Authentication:** Required (Bearer Token).
- **URL Parameters:**
  - `id` (string, required): The ID of the story to delete.
- **Success Response (204 No Content):**
  - An empty response indicating successful deletion.
- **Error Responses:**
  - `401 Unauthorized`: If the user is not authenticated.
  - `403 Forbidden`: If the user is not the owner of the story.
  - `404 Not Found`: If the story with the specified ID does not exist.
  - `500 Internal Server Error`: If there is a server-side error.

---

## 5. View a Story

- **Endpoint:** `POST /:id/view`
- **Description:** Marks a story as viewed by the authenticated user and increments the view count.
- **Authentication:** Required (Bearer Token).
- **URL Parameters:**
  - `id` (string, required): The ID of the story to view.
- **Success Response (200 OK):**
  ```json
  {
    "message": "Story viewed successfully."
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: If the user is not authenticated.
  - `500 Internal Server Error`: If there is a server-side error.

---

## 6. Get Story Views

- **Endpoint:** `GET /:id/views`
- **Description:** Retrieves a list of users who have viewed a specific story.
- **Authentication:** Not required (but could be restricted to the story owner depending on privacy rules).
- **URL Parameters:**
  - `id` (string, required): The ID of the story.
- **Success Response (200 OK):**
  - Returns an array of view objects, including viewer details.
  ```json
  [
    {
      "id": "f1b9c8d7-e6f5-g4h3-i2j1-k0l9m8n7o6p5",
      "viewed_at": "2024-07-31T13:00:00.000Z",
      "viewer": {
        "id": "b2c3d4e5-f6g7-h8i9-j0k1-l2m3n4o5p6q7",
        "username": "jane_doe",
        "profile_picture": "https://example.com/jane.jpg"
      }
    }
  ]
  ```
- **Error Responses:**
  - `500 Internal Server Error`: If there is a server-side error.
