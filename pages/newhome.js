import HeadContent from "@/components/headContent";
import CesiumWrapper from "../components/cesium/CesiumWrapper";
import { Jockey_One } from 'next/font/google';
import GameBtn from "@/components/ui/gameBtn";
import { FaDiscord, FaGithub, FaGoogle } from "react-icons/fa";
import { FaRankingStar } from "react-icons/fa6";
import { useSession } from "next-auth/react";
import AccountBtn from "@/components/ui/accountBtn";
import 'react-responsive-modal/styles.css';
import AccountModal from "@/components/accountModal";
import { useState } from "react";
import Navbar from "@/components/ui/navbar";

const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });

export default function Home() {
  const { data: session, status } = useSession();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [screen, setScreen] = useState("home");

  function backBtnPressed() {
    setScreen("home");
  }

  return (
    <>
      <HeadContent />
      <AccountModal shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen} />

      <main className={`home ${jockey.className}`} id="main" >
        <AccountBtn session={session} openAccountModal={() => setAccountModalOpen(true)} shown={screen === "home"} />
        <CesiumWrapper className={`cesium_${screen}`} />
        <Navbar shown={screen !== "home"} backBtnPressed={backBtnPressed} />
        <div className={`home__content ${screen !== "home" ? "hidden" : ""}`}>

          <div className="home__ui">
            <h1 className="home__title">WorldGuessr</h1>
            <div className="home__btns">
              <GameBtn text="Singleplayer" onClick={() => setScreen("singleplayer")} />
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