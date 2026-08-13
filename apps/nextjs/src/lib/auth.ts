import { auth as authFn } from "@atelierone/auth";
import { redirect } from "next/navigation";

export const auth = authFn;

export const requireAuth = async () => {
  const session = await authFn();
  if (!session?.user) redirect("/login");
  return session.user;
};

export const requireRole = async (...roles: string[]) => {
  const user = await requireAuth();
  if (!roles.includes(user.role)) redirect("/");
  return user;
};
