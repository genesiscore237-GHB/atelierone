import { type DefaultSession } from "next-auth";

export type UserRole =
  | "superadmin"
  | "directeur"
  | "admin"
  | "chef_atelier"
  | "secretaire"
  | "magasinier"
  | "technicien"
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
