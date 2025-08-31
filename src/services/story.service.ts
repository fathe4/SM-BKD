import { supabase } from "../config/supabase";
import { Database } from "../types/supabase";

type Story = Database["public"]["Tables"]["stories"]["Row"];
type NewStory = Database["public"]["Tables"]["stories"]["Insert"];
type StoryView = Database["public"]["Tables"]["story_views"]["Insert"];

export const createStory = async (storyData: NewStory): Promise<Story> => {
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("stories")
    .insert([{ ...storyData, expires_at }])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

// export const getActiveStories = async (): Promise<Story[]> => {
//   const now = new Date().toISOString();
//   const { data, error } = await supabase
//     .from("stories")
//     .select("*")
//     .gt("expires_at", now)
//     .order("created_at", { ascending: false });

//   if (error) {
//     throw new Error(error.message);
//   }
//   return data;
// };
interface PaginationOptions {
  page: number;
  limit: number;
}

// Define the structure for our pagination metadata and the final response
interface PaginationMeta {
  currentPage: number;
  limit: number;
  totalUsers: number;
  totalPages: number;
  hasNextPage: boolean;
}

interface PaginatedStoriesResponse {
  data: any[];
  pagination: PaginationMeta;
}

interface PaginationOptions {
  page: number;
  limit: number;
}

export const getActiveStories = async (
  options: PaginationOptions
): Promise<PaginatedStoriesResponse> => {
  const { page, limit } = options;

  const { data, error } = await supabase.rpc("get_active_stories_paginated", {
    page_number: page,
    page_size: limit,
  });

  if (error) throw new Error(error.message);

  const totalUsers = data[0]?.total_users || 0;

  // Group stories by user
  const userStoriesMap = new Map<string, { user: any; stories: any[] }>();

  data.forEach((row: any) => {
    const userId = row.user_id;
    const user = {
      id: row.user_id,
      username: row.username,
      profile_picture: row.profile_picture,
    };

    const story = {
      id: row.story_id,
      content: row.content,
      created_at: row.created_at,
      expires_at: row.expires_at,
      media_type: row.media_type,
      media_url: row.media_url,
      view_count: row.view_count,
      visibility: row.visibility,
      user: user, // Embed user in each story
    };

    if (!userStoriesMap.has(userId)) {
      userStoriesMap.set(userId, { user, stories: [] });
    }
    userStoriesMap.get(userId)?.stories.push(story);
  });

  const groupedStories = Array.from(userStoriesMap.values());
  const totalPages = Math.ceil(totalUsers / limit);

  return {
    data: groupedStories,
    pagination: {
      currentPage: page,
      limit,
      totalUsers,
      totalPages,
      hasNextPage: page < totalPages,
    },
  };
};

export const getStoryById = async (id: string): Promise<Story | null> => {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // PostgREST error for no rows found
      return null;
    }
    throw new Error(error.message);
  }
  return data;
};

export const deleteStory = async (
  id: string,
  userId: string
): Promise<void> => {
  const { error } = await supabase
    .from("stories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
};

export const viewStory = async (
  storyId: string,
  userId: string
): Promise<void> => {
  // Check if the user has already viewed the story
  const { data: existingView, error: checkError } = await supabase
    .from("story_views")
    .select("id")
    .eq("story_id", storyId)
    .eq("viewer_id", userId)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    throw new Error(checkError.message);
  }

  // If the user hasn't viewed the story, add a view and increment the count
  if (!existingView) {
    const newView: StoryView = { story_id: storyId, viewer_id: userId };
    const { error: viewError } = await supabase
      .from("story_views")
      .insert(newView);

    if (viewError) {
      throw new Error(viewError.message);
    }

    const { error: rpcError } = await supabase.rpc("increment", {
      table_name: "stories",
      row_id: storyId,
      x: 1,
      field_name: "view_count",
    });

    if (rpcError) {
      // Note: Depending on requirements, you might want to handle this differently.
      // For instance, if the RPC fails, should we roll back the view insertion?
      // For now, we'll just log the error or throw it.
      throw new Error(`Failed to increment view count: ${rpcError.message}`);
    }
  }
};

export const getStoryViews = async (storyId: string) => {
  const { data, error } = await supabase
    .from("story_views")
    .select(
      `
            id,
            viewed_at,
            viewer:users (
                id,
                username,
                profile_picture
            )
        `
    )
    .eq("story_id", storyId);

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
