import { requireMariConfig } from "@/lib/mari/client";
import { mariSql } from "@/lib/mari/client";
import { PRIORITY_LABELS } from "@/lib/mari/status";

export type MariSupportGroupOption = {
  groupId: number;
  description: string;
};

export type MariSettingOption = {
  id: number;
  label: string;
};

/** Aktive Supportgruppen für Ticketkopf-Dropdown. */
export async function listMariSupportGroups(): Promise<
  MariSupportGroupOption[]
> {
  requireMariConfig();
  const rows = await mariSql<{
    GroupId: number;
    Description: string | null;
  }>(
    `SELECT TOP 200
  g."GroupId",
  g."Description"
FROM "MARISupportGroup" g
WHERE g."GroupId" IS NOT NULL
ORDER BY g."Description", g."GroupId"`
  );
  return rows
    .map((r) => {
      const groupId = Number(r.GroupId);
      if (!Number.isInteger(groupId) || groupId <= 0) return null;
      const description = (r.Description || "").trim() || `Gruppe ${groupId}`;
      return { groupId, description };
    })
    .filter((x): x is MariSupportGroupOption => x != null);
}

/** MPHOTLINESETTINGS Lookup (SETTING: 3=Prio, 5=Medium/Kanal). */
export async function listMariHotlineSettings(
  setting: number
): Promise<MariSettingOption[]> {
  requireMariConfig();
  if (!Number.isInteger(setting) || setting <= 0) return [];
  const rows = await mariSql<{
    ID: number;
    BEZEICHNUNG: string | null;
  }>(
    `SELECT
  s."ID",
  s."BEZEICHNUNG"
FROM "MPHOTLINESETTINGS" s
WHERE s."SETTING" = ${setting}
ORDER BY s."ID"`
  );
  return rows
    .map((r) => {
      const id = Number(r.ID);
      if (!Number.isInteger(id) || id <= 0) return null;
      const label = (r.BEZEICHNUNG || "").trim() || `ID ${id}`;
      return { id, label };
    })
    .filter((x): x is MariSettingOption => x != null);
}

export async function listMariPriorities(): Promise<MariSettingOption[]> {
  try {
    const rows = await listMariHotlineSettings(3);
    if (rows.length > 0) return rows;
  } catch {
    /* fallback */
  }
  return Object.entries(PRIORITY_LABELS).map(([id, label]) => ({
    id: Number(id),
    label,
  }));
}

/** Kommunikationskanal / Medium (SETTING = 5). */
export async function listMariMedia(): Promise<MariSettingOption[]> {
  return listMariHotlineSettings(5);
}
