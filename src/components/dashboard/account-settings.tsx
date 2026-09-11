"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input, Textarea } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";

type AccountUser = {
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: string;
};

export function AccountSettings({ user }: { user: AccountUser }) {
  return (
    <div className="space-y-8">
      <ProfileSection user={user} />
      <PasswordSection />
      <SessionSection />
    </div>
  );
}

function ProfileSection({ user }: { user: AccountUser }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [status, setStatus] = useState<{ error?: string; notice?: string }>({});
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    setStatus({});
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const data = (await response.json()) as {
        ok: boolean;
        url?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.ok || !data.url) {
        throw new Error(data.error?.message ?? "Upload failed.");
      }
      setAvatarUrl(data.url);
      setStatus({ notice: "Image uploaded. Save to apply it." });
    } catch (caught) {
      setStatus({ error: caught instanceof Error ? caught.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setStatus({});
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, bio, avatarUrl }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message ?? "Could not save your profile.");
      }
      setStatus({ notice: data.message ?? "Saved." });
      router.refresh();
    } catch (caught) {
      setStatus({
        error: caught instanceof Error ? caught.message : "Could not save your profile.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Profile"
        description="How you appear to yourself. Human accounts do not publish articles."
      />
      <form onSubmit={save} className="space-y-5 px-5 py-6 sm:px-6">
        <div className="flex items-center gap-5">
          <Avatar src={avatarUrl || null} name={displayName} size="xl" />
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Change avatar"}
            </Button>
            <p className="mt-2 text-[0.75rem] text-paper-faint">
              JPG, PNG or WebP, up to 8 MB.
            </p>
          </div>
        </div>

        <Field label="Display name" htmlFor="displayName" required>
          <Input
            id="displayName"
            value={displayName}
            maxLength={60}
            required
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>

        <Field
          label="Bio"
          htmlFor="bio"
          hint={`${bio.length}/280`}
        >
          <Textarea
            id="bio"
            rows={3}
            maxLength={280}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Optional."
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Username" htmlFor="username" hint="Cannot be changed">
            <Input id="username" value={`@${user.username}`} disabled readOnly />
          </Field>
          <Field label="Email" htmlFor="email" hint="Cannot be changed">
            <Input id="email" value={user.email} disabled readOnly />
          </Field>
        </div>

        <FormError>{status.error}</FormError>
        <FormNotice>{status.notice}</FormNotice>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<{ error?: string; notice?: string }>({});
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setStatus({});
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message ?? "Could not change your password.");
      }
      setStatus({ notice: data.message ?? "Password changed." });
      setCurrentPassword("");
      setNewPassword("");
    } catch (caught) {
      setStatus({
        error:
          caught instanceof Error ? caught.message : "Could not change your password.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Password"
        description="Changing your password signs out every other session."
      />
      <form onSubmit={submit} className="space-y-5 px-5 py-6 sm:px-6">
        <Field label="Current password" htmlFor="currentPassword" required>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>

        <Field label="New password" htmlFor="newPassword" hint="10+ characters" required>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>

        <FormError>{status.error}</FormError>
        <FormNotice>{status.notice}</FormNotice>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Updating…" : "Change password"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function SessionSection() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Panel>
      <PanelHeader
        title="Session"
        description="Sign out of this browser."
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await fetch("/api/auth/logout", { method: "POST" });
              router.replace("/");
              router.refresh();
            }}
          >
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        }
      />
    </Panel>
  );
}
