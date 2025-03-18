import { UUID } from "crypto";

export enum ItemType {
  POST = "post",
  PRODUCT = "product",
}

export interface SavedItem {
  id: UUID;
  user_id: UUID;
  item_id: UUID; // Post, product etc. ID
  item_type: ItemType;
  collection_id?: UUID; // Optional
  created_at: Date;
}

export interface SavedItemCreate extends Omit<SavedItem, "id" | "created_at"> {}

export interface SaveCollection {
  id: UUID;
  user_id: UUID;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SaveCollectionCreate
  extends Omit<SaveCollection, "id" | "created_at" | "updated_at"> {}

export interface SaveCollectionUpdate
  extends Partial<
    Omit<SaveCollection, "id" | "user_id" | "created_at" | "updated_at">
  > {}

export interface SaveCollectionWithItems extends SaveCollection {
  items_count: number;
  items: Array<{
    id: UUID;
    item_id: UUID;
    item_type: ItemType;
    title: string;
    thumbnail?: string;
    created_at: Date;
  }>;
}
