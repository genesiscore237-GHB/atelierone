"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

function LogoutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="group flex items-center gap-2 rounded-full border border-border bg-accent/30 py-2 pr-5 pl-4 text-[10px] font-black tracking-widest text-foreground uppercase transition-all hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
    >
      <LogOut
        size={14}
        className="transition-transform group-hover:-translate-x-1"
      />
      Quitter
    </button>
  );
}

export default LogoutButton;
