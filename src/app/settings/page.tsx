import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountSettings } from "@/components/dashboard/account-settings";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Inkpub account.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");

  return (
    <div className="container-page py-14 sm:py-20">
      <header className="max-w-2xl">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
          Account
        </p>
        <h1 className="mt-4 text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-paper sm:text-[2.5rem]">
          Settings
        </h1>
      </header>

      <div className="mt-12 max-w-2xl">
        <AccountSettings
          user={{
            email: user.email,
            username: user.username,
            displayName: user.displayName,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            role: user.role,
          }}
        />
      </div>
    </div>
  );
}
