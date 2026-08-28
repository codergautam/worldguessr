import ComparePage from "@/components/comparePage";
import { getComparePage } from "@/lib/compareData";

const page = getComparePage("openguessr");

export default function CompareToOpenGuessr() {
  return <ComparePage data={page.data} others={page.others} />;
}
