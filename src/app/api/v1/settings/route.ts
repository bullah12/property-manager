import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeSettings, serializeUser } from "@/lib/serializers";

const patchSettingsSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    displayName: z.string().min(1).max(200),
    defaultLeadDays: z
      .array(z.number().int().min(1).max(365))
      .min(1)
      .max(6)
      .refine((a) => new Set(a).size === a.length, "lead days must be unique"),
    rentOverdueGraceDays: z.number().int().min(0).max(60),
    emailEnabled: z.boolean(),
    landlordAddress: z.string().trim().max(500).nullable(),
    landlordPhone: z.string().trim().max(50).nullable(),
    clausePetsDefault: z.boolean(),
    clauseGardenDefault: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");

export const PATCH = apiHandler(async (req) => {
  const { user } = await requireAdmin();
  const body = await parseBody(req, patchSettingsSchema);
  const { timezone, displayName, ...settingsPatch } = body;

  // Sort lead days descending so scan logic can rely on the order.
  if (settingsPatch.defaultLeadDays) {
    settingsPatch.defaultLeadDays = [...settingsPatch.defaultLeadDays].sort(
      (a, b) => b - a
    );
  }

  const [updatedUser, updatedSettings] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        ...(timezone !== undefined ? { timezone } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
      },
    }),
    prisma.userSettings.update({
      where: { userId: user.id },
      data: settingsPatch,
    }),
  ]);

  return ok({
    user: serializeUser(updatedUser),
    settings: serializeSettings(updatedSettings),
  });
});
