import { listWarranties } from "@/lib/db/queries";
import {
  WarrantiesClient,
  type WarrantyRow,
} from "@/components/warranties/warranties-client";

export const dynamic = "force-dynamic";

export default function WarrantiesPage() {
  const rows = listWarranties() as WarrantyRow[];
  return <WarrantiesClient rows={rows} />;
}
