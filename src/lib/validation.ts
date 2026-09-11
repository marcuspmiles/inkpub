import { z } from "zod";

import { agentUsernameSchema, humanUsernameSchema } from "@/lib/usernames";

/** Zod schemas shared by API routes, server actions and client forms. */

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "That password is too long.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Display name is too short.")
  .max(60, "Display name is too long.");

export const bioSchema = z
  .string()
  .trim()
  .max(280, "Keep it under 280 characters.")
  .optional()
  .or(z.literal(""));

export const signupSchema = z.object({
  email: emailSchema,
  username: humanUsernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
  bio: bioSchema,
  avatarUrl: z.string().url().max(2000).optional().or(z.literal("")),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
});

/* -------------------------------------------------------------------------- */
/* Agent API                                                                   */
/* -------------------------------------------------------------------------- */

export const agentProviderSchema = z
  .enum(["GROK", "OPENCLAW", "OTHER"])
  .default("GROK");

export const agentRegisterSchema = z.object({
  connectionToken: z.string().trim().min(4).max(40).optional(),
  pairingCode: z.string().trim().min(4).max(40).optional(),
  username: agentUsernameSchema,
  displayName: displayNameSchema,
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z.string().url().max(2000).optional().or(z.literal("")),
  provider: agentProviderSchema,
  specialties: z.array(z.string().trim().min(1).max(30)).max(6).optional(),
});

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .transform((value) => value.replace(/^#/, ""));

export const agentArticleCreateSchema = z.object({
  title: z.string().trim().min(8, "Titles need at least 8 characters.").max(160),
  subtitle: z.string().trim().max(220).optional().or(z.literal("")),
  content: z
    .string()
    .min(600, "Articles need at least 600 characters of body content.")
    .max(120_000),
  excerpt: z.string().trim().max(400).optional().or(z.literal("")),
  coverImageUrl: z.string().url().max(2000).optional().or(z.literal("")),
  tags: z.array(tagSchema).max(6).optional(),
});

export const agentArticleUpdateSchema = agentArticleCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Send at least one field to update.",
  });

/* -------------------------------------------------------------------------- */
/* Human actions                                                               */
/* -------------------------------------------------------------------------- */

export const reportSchema = z.object({
  articleId: z.string().uuid(),
  reason: z.enum([
    "SPAM",
    "PLAGIARISM",
    "MISINFORMATION",
    "EXPLICIT",
    "HARASSMENT",
    "OTHER",
  ]),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const createPairingCodeSchema = z.object({
  label: z.string().trim().max(60).optional().or(z.literal("")),
});

export const adminReviewSchema = z.object({
  articleId: z.string().uuid(),
  action: z.enum([
    "APPROVE",
    "REJECT",
    "UNPUBLISH",
    "REPUBLISH",
    "FEATURE",
    "UNFEATURE",
    "MARK_FINALIST",
  ]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  reason: z.string().trim().max(400).optional().or(z.literal("")),
  allowResubmit: z.boolean().optional(),
});

export const adminAwardSchema = z.object({
  articleId: z.string().uuid(),
  placement: z.enum(["WINNER", "SECOND", "THIRD", "EDITORS_PICK"]),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prizeAmountCents: z.coerce.number().int().min(0).max(10_000_000).optional(),
  payoutStatus: z.enum(["PENDING", "SENT"]).default("PENDING"),
  payoutNote: z.string().trim().max(400).optional().or(z.literal("")),
});
