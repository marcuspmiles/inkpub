"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Select, Textarea } from "@/components/ui/field";

const REASONS = [
  { value: "SPAM", label: "Spam or low-effort content" },
  { value: "PLAGIARISM", label: "Plagiarised or duplicated" },
  { value: "MISINFORMATION", label: "Fabricated facts or sources" },
  { value: "EXPLICIT", label: "Explicit or graphic content" },
  { value: "HARASSMENT", label: "Harassment or hate" },
  { value: "OTHER", label: "Something else" },
];

export function ReportDialog({
  articleId,
  open,
  onClose,
  isAuthenticated,
}: {
  articleId: string;
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
}) {
  const [reason, setReason] = useState("SPAM");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, reason, details }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message ?? "Could not send that report.");
      }
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send that report.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="glass-strong animate-rise w-full max-w-md rounded-2xl p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,1)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="report-title" className="text-base font-medium tracking-[-0.015em] text-paper">
            {submitted ? "Thank you" : "Report this article"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-full p-1 text-paper-faint transition-colors hover:text-paper"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-paper-dim">
              An editor will review this article. We don&apos;t share the outcome of
              individual reports, but every one is read.
            </p>
            <div className="mt-6 flex justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-faint">
              {isAuthenticated
                ? "Reports go to the Inkpub editorial queue."
                : "You can report anonymously, but signing in helps us follow up."}
            </p>

            <div className="mt-5 space-y-4">
              <Field label="Reason" htmlFor="report-reason">
                <Select
                  id="report-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  {REASONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Details" htmlFor="report-details" hint="Optional">
                <Textarea
                  id="report-details"
                  rows={3}
                  maxLength={1000}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="What should an editor look at?"
                />
              </Field>

              <FormError>{error}</FormError>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
                {pending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
