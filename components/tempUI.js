<div className={`home__content ${screen !== "home" ? "hidden" : ""} `}>
    {onboardingCompleted === null ? (<> </>) : (
        <>
            <div className="home__ui">
                <h1 className="home__title ">WorldGuessr</h1>
                <h3 className="text-center text-2xl">A free multiplayer geography guessing game</h3>

                <div className="home__btns">
                    <div className={`mainHomeBtns `}>

                        {/* <GameBtn text={text("singleplayer")} onClick={() => {
                if (!loading) setScreen("singleplayer")
              }} /> */}
                        {/* Buttons to select different options on homepage (singleplayer,find duel, create/join party) */}
                        <button className="homeBtn singleplayer border-4 border-red-600"
                            onClick={() => {
                                if (!loading) {
                                    // setScreen("singleplayer")
                                    crazyMidgame(() => setScreen("singleplayer"))
                                }
                            }} >{text("singleplayer")}</button>
                        {/* <span className="bigSpan">{text("playOnline")}</span> */}
                        <button className="homeBtn multiplayerOptionBtn publicGame" onClick={() => handleMultiplayerAction("publicDuel")}
                            disabled={!multiplayerState.connected || maintenance}>{session?.token?.secret ? text("rankedDuel") : text("findDuel")}</button>

                        {/* <span className="bigSpan" disabled={!multiplayerState.connected}>{text("playFriends")}</span> */}
                        <div className="multiplayerPrivBtns">
                            <button className="homeBtn multiplayerOptionBtn" disabled={!multiplayerState.connected || maintenance} onClick={() => handleMultiplayerAction("createPrivateGame")}>{text("createGame")}</button>
                            <button className="homeBtn multiplayerOptionBtn" disabled={!multiplayerState.connected || maintenance} onClick={() => handleMultiplayerAction("joinPrivateGame")}>{text("joinGame")}</button>
                        </div>
                    </div>

                    <div className="home__squarebtns">
                        {/* { !isApp && (
                  <>
                <Link target="_blank" href={"https://github.com/codergautam/worldguessr"}><button className="home__squarebtn gameBtn" aria-label="Github"><FaGithub className="home__squarebtnicon" /></button></Link>
                <Link target="_blank" href={"https://discord.gg/ubdJHjKtrC"}><button className="home__squarebtn gameBtn" aria-label="Discord"><FaDiscord className="home__squarebtnicon" /></button></Link>
                <Link href={"./leaderboard"}><button className="home__squarebtn gameBtn" aria-label="Leaderboard"><FaRankingStar className="home__squarebtnicon" /></button></Link>
                </>
                )}
                <button className="home__squarebtn gameBtn" aria-label="Settings" onClick={() => setSettingsModal(true)}><FaGear className="home__squarebtnicon" /></button>
 */}
                        <button className="homeBtn" aria-label="Community Maps" onClick={() => setMapModal(true)}>{text("communityMaps")}</button>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: "20px" }}>
                <center>
                    {!loading && screen === "home" && !inCrazyGames && (!session?.token?.supporter) && (
                        <Ad inCrazyGames={inCrazyGames} screenH={height} types={[[320, 50], [728, 90], [970, 90], [970, 250]]} screenW={width} />
                    )}
                </center>
            </div>
            <br />
        </>
    )}
</div>