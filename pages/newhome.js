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
import { useEffect, useState } from "react";
import Navbar from "@/components/ui/navbar";
import SetUsernameModal from "@/components/setUsernameModal";
import GameUI from "@/components/gameUI";
import Loader from "@/components/loader";
import findLatLongRandom from "@/components/findLatLong";

const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });

export default function Home() {
  const { data: session, status } = useSession();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(false);

  // game state
  const [latLong, setLatLong] = useState({ lat: 0, long: 0 })
  const [streetViewShown, setStreetViewShown] = useState(false)
  const [gameOptionsModalShown, setGameOptionsModalShown] = useState(false);
  const [gameOptions, setGameOptions] = useState({location: "all"});

  function backBtnPressed() {
    if(loading) setLoading(false)
    setScreen("home");
    clearLocation();
  }

  function clearLocation() {
    setLatLong({ lat: 0, long: 0 })
    setStreetViewShown(false)
  }

  function loadLocation() {
    setLoading(true)
    findLatLongRandom(gameOptions).then((latLong) => {
      setLatLong(latLong)
      setTimeout(() => {
        setStreetViewShown(true)
        setTimeout(() => {
          setLoading(false)
        }, 100);
      }, 500);
    });
  }

  useEffect(() => {
    loadLocation()
  }, [gameOptions])


  function onNavbarLogoPress() {
    if (screen !== "home" && !loading) {
      loadLocation()
    }
  }

  return (
    <>
      <HeadContent />

      <AccountModal shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen} />
      <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} />

      <main className={`home ${jockey.className}`} id="main" >
      <Loader loadingText="Loading..." shown={loading} />

        <AccountBtn session={session} openAccountModal={() => setAccountModalOpen(true)} shown={screen === "home"} />
        <CesiumWrapper className={`cesium_${screen} ${screen !== "home" && !loading ? "cesium_hidden": ""}`} />
        <Navbar shown={screen !== "home"} backBtnPressed={backBtnPressed} setGameOptionsModalShown={setGameOptionsModalShown} onNavbarPress={() => onNavbarLogoPress()} gameOptions={gameOptions} />
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

        { screen === "singleplayer" && <div className="home__singleplayer">
          <GameUI loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} setLatLong={setLatLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
        </div>}
      </main>
    </>
  )
}