import HeadContent from "@/components/headContent";
import { Jockey_One, Roboto } from "next/font/google";
import { useTranslation } from "react-i18next";

const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });
const roboto = Roboto({ subsets: ['cyrillic'], weight: "400", style: 'normal' });

export default function MapsPage() {
  const { t: text } = useTranslation("common");

  return (
    <>
    <HeadContent text={text} />

      <main className={`home ${jockey.className} ${roboto.className}`} id="main">
      </main>
    </>
  )
}