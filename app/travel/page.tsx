import { listTravelItems } from "@/lib/db/queries";
import { listDocumentTripLinks } from "@/lib/trips/queries";
import {
  TravelOverviewClient,
  type TravelRow,
} from "@/components/travel/travel-overview";

export const dynamic = "force-dynamic";

export default function TravelPage() {
  const items = listTravelItems() as unknown as TravelRow[];
  const documentTripLinks = Object.fromEntries(
    listDocumentTripLinks(items.map((item) => item.document_local_id))
  );
  return <TravelOverviewClient items={items} documentTripLinks={documentTripLinks} />;
}
