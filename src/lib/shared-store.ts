import {
  getKitchen,
  saveKitchen,
  type SharedKitchen,
} from "@/db/kitchen-repo";

export type { SharedKitchen };

export async function getSharedKitchen(): Promise<SharedKitchen> {
  return getKitchen();
}

export async function saveSharedKitchen(kitchen: SharedKitchen): Promise<SharedKitchen> {
  return saveKitchen({
    ...kitchen,
    updatedAt: kitchen.updatedAt || new Date().toISOString(),
  });
}
