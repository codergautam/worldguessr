import ComparePage from "@/components/comparePage";
import { getComparePage } from "@/lib/compareData";

const page = getComparePage("geotastic");

export default function CompareToGeotastic() {
  return <ComparePage data={page.data} others={page.others} />;
}
