import Dexie, { type Table } from "dexie";

export interface LocalProduct {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  level: string | null;
  type: "book" | "supply";
  condition: "new" | "used";
  unitType: "unit" | "pack" | "carton" | "dozen";
  purchasePrice: string;
  minPrice: string;
  salePrice: string;
  categoryId: string | null;
  publisherId: string | null;
  category: { name: string | null } | null;
  publisher: { name: string | null } | null;
}

export interface LocalSchoolList {
  id: string;
  name: string;
  schoolName: string | null;
  description: string | null;
  items: { productId: string; quantityRequired: number; product: { title: string; author: string | null; salePrice: string } }[];
}

export interface PendingSale {
  clientSideId: string;
  sessionId: string;
  organizationId: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
  totalAmount: number;
  paymentMethod: "CASH" | "MOMO" | "CREDIT";
  customerId: string | null;
  createdAt: string;
  synced: boolean;
  syncAttempts: number;
}

export class LocalDB extends Dexie {
  products!: Table<LocalProduct>;
  schoolLists!: Table<LocalSchoolList>;
  pendingSales!: Table<PendingSale>;

  constructor() {
    super("libracore-local");
    this.version(1).stores({
      products: "id, title, author, isbn",
      schoolLists: "id, name, schoolName",
      pendingSales: "clientSideId, sessionId, synced, createdAt",
    });
  }
}

export const localDb = new LocalDB();
