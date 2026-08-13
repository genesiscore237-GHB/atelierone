import { type DefaultSession } from "next-auth";

export type UserRole =
  | "admin_reseau"
  | "responsable_agence"
  | "operateur_pos"
  | "caissier"
  | "magasinier"
  | "gestionnaire_achats"
  | "comptable"
  | "rh"
  | "consultation";

export interface Permission {
  code: string;
  description?: string;
}

export interface ExtendedUser {
  id: string;
  email: string;
  name: string;
  agenceId: number;
  agenceName: string;
  organizationId: string;
  role: UserRole;
  permissions: string[];
  isActive: boolean;
  status: string;
}

declare module "next-auth" {
  interface Session {
    user: ExtendedUser;
  }
  interface User extends ExtendedUser {}
}
