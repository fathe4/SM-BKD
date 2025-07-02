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
  const now = new Date().toISOString();

  // 1. Concurrently fetch the total user count AND the user IDs for the current page
  const [
    { data: totalUsers, error: countError },
    { data: usersData, error: rpcError },
  ] = await Promise.all([
    supabase.rpc("count_active_story_users"),
    supabase.rpc("get_paginated_story_users", {
      page_number: page,
      page_size: limit,
    }),
  ]);

  if (countError) throw new Error(countError.message);
  if (rpcError) throw new Error(rpcError.message);

  const userIds = usersData.map((u: { user_id: string }) => u.user_id);

  let groupedStories: any[] = [];
  // Only fetch stories if there are users on the current page
  if (userIds.length > 0) {
    const { data: storiesData, error: storiesError } = await supabase
      .from("stories")
      .select(
        `
        *,
        user:users (
          id,
          username,
          profile_picture
        )
      `
      )
      .in("user_id", userIds)
      .gt("expires_at", now)
      .order("created_at", { ascending: false });

    if (storiesError) {
      throw new Error(storiesError.message);
    }

    // Grouping logic (same as before)
    const userStoriesMap = new Map<string, { user: any; stories: any[] }>();
    storiesData.forEach((story: any) => {
      if (!userStoriesMap.has(story.user_id)) {
        userStoriesMap.set(story.user_id, { user: story.user, stories: [] });
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { user, ...storyWithoutUser } = story;
      userStoriesMap.get(story.user_id)?.stories.push(storyWithoutUser);
    });

    const storiesArray = Array.from(userStoriesMap.values());
    storiesArray.sort(
      (a, b) => userIds.indexOf(a.user.id) - userIds.indexOf(b.user.id)
    );
    groupedStories = storiesArray;
  }

  // 2. Calculate pagination metadata
  const totalPages = Math.ceil(totalUsers / limit);
  const pagination: PaginationMeta = {
    currentPage: page,
    limit: limit,
    totalUsers: totalUsers,
    totalPages: totalPages,
    hasNextPage: page < totalPages,
  };

  // 3. Return the final structured response
  return {
    data: groupedStories,
    pagination: pagination,
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
