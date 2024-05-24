import HeadContent from "@/components/headContent";
import CesiumWrapper from "../components/cesium/CesiumWrapper";
import { Jockey_One } from 'next/font/google';
import GameBtn from "@/components/ui/gameBtn";
import { FaDiscord, FaGithub, FaGoogle } from "react-icons/fa";
import { FaRankingStar } from "react-icons/fa6";

const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });

export default function Home() {
  return (
    <>
      <HeadContent />
      <main className={`home ${jockey.className}`} id="main" >
        <button className="gameBtn accountBtn">Login <FaGoogle className="home__squarebtnicon" /></button>
        <CesiumWrapper positions={[{ lat: 0, lng: 0 }]} />
        <div className="home__content">

          <div className="home__ui">
          <h1 className="home__title">WorldGuessr</h1>
          <div className="home__btns">
        <GameBtn text="Singleplayer" />
        <GameBtn text="Multiplayer" />
        <GameBtn text="How to Play" />

        <div className="home__squarebtns">
          <button className="home__squarebtn gameBtn"><FaGithub className="home__squarebtnicon" /></button>
          <button className="home__squarebtn gameBtn"><FaDiscord className="home__squarebtnicon" /></button>
          <button className="home__squarebtn gameBtn"><FaRankingStar className="home__squarebtnicon" /></button>
        </div>
        </div>
          </div>
        </div>
      </main>
    </>
  )
}