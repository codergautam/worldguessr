import ComparePage from "@/components/comparePage";
import { getComparePage } from "@/lib/compareData";

const page = getComparePage("geoguessr");

export default function CompareToGeoGuessr() {
  return <ComparePage data={page.data} others={page.others} />;
}
