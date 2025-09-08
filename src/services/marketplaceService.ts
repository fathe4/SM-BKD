import { supabaseAdmin } from "./../config/supabase";
import { Database } from "../types/supabase";

// Types for marketplace listings from Supabase
export type MarketplaceListingRow =
  Database["public"]["Tables"]["marketplace_listings"]["Row"];
export type MarketplaceListingInsert =
  Database["public"]["Tables"]["marketplace_listings"]["Insert"];
export type ListingImageRow =
  Database["public"]["Tables"]["listing_images"]["Row"];
export type ListingImageInsert =
  Database["public"]["Tables"]["listing_images"]["Insert"];

// Create a new listing and store images in listing_images table
export async function createListing(
  data: Omit<
    MarketplaceListingInsert,
    "id" | "created_at" | "updated_at" | "status"
  > & { images: string[] },
): Promise<{
  listing?: MarketplaceListingRow & { images: string[] };
  error?: string;
}> {
  if (!supabaseAdmin) {
    return { error: "Supabase admin client not initialized." };
  }
  const now = new Date().toISOString();
  // Insert the listing (without images field)
  const { data: inserted, error } = await supabaseAdmin
    .from("marketplace_listings")
    .insert([{ ...data, created_at: now, updated_at: now, status: "active" }])
    .select()
    .single();
  if (error) return { error: error.message };
  const listingId = inserted.id;

  const imageRows: ListingImageInsert[] = data.images.map((url, idx) => ({
    listing_id: listingId,
    image_url: url,
    position: idx,
  }));
  const { error: imgError } = await supabaseAdmin
    .from("listing_images")
    .insert(imageRows);
  if (imgError) return { error: imgError.message };
  return {
    listing: {
      ...(inserted as MarketplaceListingRow),
      images: data.images,
    },
  };
}

// Get a listing by ID, including its images from listing_images
export async function getListingById(id: string): Promise<{
  listing?: MarketplaceListingRow & { images: string[] };
  error?: string;
}> {
  if (!supabaseAdmin) {
    return { error: "Supabase admin client not initialized." };
  }
  // Fetch the listing
  const { data, error } = await supabaseAdmin
    .from("marketplace_listings")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };
  // Fetch images for the listing
  const { data: imagesData, error: imgError } = await supabaseAdmin
    .from("listing_images")
    .select("image_url")
    .eq("listing_id", id)
    .order("position", { ascending: true });
  if (imgError) return { error: imgError.message };
  const images = (imagesData || []).map((img) => img.image_url);
  return {
    listing: {
      ...(data as MarketplaceListingRow),
      images,
    },
  };
}

// Update a listing by ID (only owner can update)
export async function updateListing(
  id: string,
  data: Record<string, any>,
  userId: string,
): Promise<{
  listing?: MarketplaceListingRow;
  error?: string;
  status?: number;
}> {
  if (!supabaseAdmin) {
    return { error: "Supabase admin client not initialized.", status: 500 };
  }
  // Fetch the listing
  const { data: listing, error } = await supabaseAdmin
    .from("marketplace_listings")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !listing) {
    return { error: "Listing not found.", status: 404 };
  }
  if (listing.seller_id !== userId) {
    return { error: "Unauthorized: not the owner.", status: 403 };
  }
  // Only update allowed fields
  const allowedFields = [
    "title",
    "description",
    "price",
    "category_id",
    "images",
    "location",
    "coordinates",
    "status",
    "subscription_tier_id",
  ];
  const updateData: any = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }
  updateData.updated_at = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("marketplace_listings")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return { error: updateError.message, status: 400 };
  }
  return { listing: updated as MarketplaceListingRow };
}

// Hard delete a listing by ID (only owner can delete)
export async function deleteListing(
  id: string,
  userId: string,
): Promise<{ success?: boolean; error?: string; status?: number }> {
  if (!supabaseAdmin) {
    return { error: "Supabase admin client not initialized.", status: 500 };
  }
  // Fetch the listing
  const { data: listing, error } = await supabaseAdmin
    .from("marketplace_listings")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !listing) {
    return { error: "Listing not found.", status: 404 };
  }
  if (listing.seller_id !== userId) {
    return { error: "Unauthorized: not the owner.", status: 403 };
  }
  // First, delete related images
  const { error: imgDeleteError } = await supabaseAdmin
    .from("listing_images")
    .delete()
    .eq("listing_id", id);
  if (imgDeleteError) {
    return { error: imgDeleteError.message, status: 400 };
  }
  // Then, delete the listing itself
  const { error: deleteError } = await supabaseAdmin
    .from("marketplace_listings")
    .delete()
    .eq("id", id);
  if (deleteError) {
    return { error: deleteError.message, status: 400 };
  }
  return { success: true };
}

export async function getAllCategories() {
  if (!supabaseAdmin) {
    return { error: "Supabase admin client not initialized." };
  }
  const { data, error } = await supabaseAdmin.from("categories").select("*");
  if (error) return { error: error.message };
  return data;
}

// List/filter listings with pagination and sorting, now supports seller_id
export async function listListings({
  category_id,
  min_price,
  max_price,
  search,
  page = 1,
  limit = 20,
  sort = "newest",
  seller_id,
}: {
  category_id?: string;
  min_price?: number;
  max_price?: number;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  seller_id?: string;
}): Promise<{
  listings: (MarketplaceListingRow & { images: string[] })[];
  total: number;
  limit: number;
  error?: string;
}> {
  if (!supabaseAdmin) {
    return {
      listings: [],
      total: 0,
      limit,
      error: "Supabase admin client not initialized.",
    };
  }
  let query = supabaseAdmin
    .from("marketplace_listings")
    .select("*, listing_images(id, image_url, position)", { count: "exact" })
    .neq("status", "deleted");

  if (category_id) {
    query = query.eq("category_id", category_id);
  }
  if (min_price !== undefined) {
    query = query.gte("price", min_price);
  }
  if (max_price !== undefined) {
    query = query.lte("price", max_price);
  }
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }
  if (seller_id) {
    query = query.eq("seller_id", seller_id);
  }
  // Sorting
  if (sort === "price_asc") {
    query = query.order("price", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price", { ascending: false });
  } else {
    // Default: newest first
    query = query.order("created_at", { ascending: false });
  }
  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return { listings: [], total: 0, limit, error: error.message };
  }

  return {
    listings: data,
    total: count || 0,
    limit,
  };
}
