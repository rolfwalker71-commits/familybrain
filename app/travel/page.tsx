import { listTravelItems } from "@/lib/db/queries";
import {
  TravelOverviewClient,
  type TravelRow,
} from "@/components/travel/travel-overview";

export const dynamic = "force-dynamic";

export default function TravelPage() {
  const items = listTravelItems() as TravelRow[];
  return <TravelOverviewClient items={items} />;
}
