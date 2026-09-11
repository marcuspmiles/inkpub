"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input, Select, Textarea } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";

type AwardableArticle = {
  id: string;
  title: string;
  username: string;
  publicationWeek: string;
  publishedAt: string | null;
};

const PLACEMENTS = [
  { value: "WINNER", label: "Winner" },
  { value: "SECOND", label: "Second" },
  { value: "THIRD", label: "Third" },
  { value: "EDITORS_PICK", label: "Editor's pick" },
];

export function AwardForm({
  articles,
  defaultWeekStart,
}: {
  articles: AwardableArticle[];
  defaultWeekStart: string;
}) {
  const router = useRouter();
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [placement, setPlacement] = useState("WINNER");
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [prize, setPrize] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("PENDING");
  const [payoutNote, setPayoutNote] = useState("");
  const [status, setStatus] = useState<{ error?: string; notice?: string }>({});
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setStatus({});

    try {
      const response = await fetch("/api/admin/awards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          placement,
          weekStart,
          prizeAmountCents: prize ? Math.round(Number(prize) * 100) : undefined,
          payoutStatus,
          payoutNote,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message ?? "Could not record that award.");
      }
      setStatus({ notice: data.message ?? "Award recorded." });
      router.refresh();
    } catch (caught) {
      setStatus({
        error: caught instanceof Error ? caught.message : "Could not record that award.",
      });
    } finally {
      setPending(false);
    }
  };

  if (articles.length === 0) {
    return (
      <Panel className="px-6 py-12 text-center">
        <p className="text-[0.9375rem] text-paper-dim">
          Publish an article before recording a weekly award.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Record a weekly award"
        description="Payouts are sent by hand — this only records the decision."
      />
      <form onSubmit={submit} className="space-y-5 px-5 py-6 sm:px-6">
        <Field label="Article" htmlFor="award-article" required>
          <Select
            id="award-article"
            value={articleId}
            onChange={(event) => setArticleId(event.target.value)}
          >
            {articles.map((article) => (
              <option key={article.id} value={article.id}>
                {article.title} — @{article.username} ({article.publicationWeek})
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Placement" htmlFor="award-placement" required>
            <Select
              id="award-placement"
              value={placement}
              onChange={(event) => setPlacement(event.target.value)}
            >
              {PLACEMENTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Week start (Monday, UTC)"
            htmlFor="award-week"
            hint={formatDate(weekStart)}
            required
          >
            <Input
              id="award-week"
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Prize amount (USD)" htmlFor="award-prize" hint="Optional">
            <Input
              id="award-prize"
              type="number"
              min="0"
              step="1"
              value={prize}
              onChange={(event) => setPrize(event.target.value)}
              placeholder="250"
            />
          </Field>

          <Field label="Payout status" htmlFor="award-payout">
            <Select
              id="award-payout"
              value={payoutStatus}
              onChange={(event) => setPayoutStatus(event.target.value)}
            >
              <option value="PENDING">Pending</option>
              <option value="SENT">Sent</option>
            </Select>
          </Field>
        </div>

        <Field label="Payout note" htmlFor="award-note" hint="Internal, optional">
          <Textarea
            id="award-note"
            rows={2}
            maxLength={400}
            value={payoutNote}
            onChange={(event) => setPayoutNote(event.target.value)}
            placeholder="How and when the reward was sent."
          />
        </Field>

        <FormError>{status.error}</FormError>
        <FormNotice>{status.notice}</FormNotice>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Recording…" : "Record award"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
