import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';

const Leaderboard = ({ }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const { data: session, status } = useSession();

  useEffect(() => {
    fetch('/api/leaderboard'+(session ? '?username='+encodeURIComponent(session.token.username) : ''))
      .then(res => res.json())
      .then(data => setLeaderboardData(data));
  }, [session]);

  return (
    <div>
      <Head>
        <title>Leaderboard</title>
        <style>
          {`
          * {
            font-size: 62, 5%;
            box-sizing: border-box;
            margin: 0;
        }

        body {
            height: 100%;
            width: 100%;
            min-height: 100vh;
            background-color: #141a39; /* Dark background */
            display: flex;
            justify-content: center;
        }

        main {
            width: 40rem;
            background-color: #1f2747; /* Darker background */
            box-shadow: 0px 5px 15px 8px #050c2b; /* Darker shadow */
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-top: 5rem !important;
            border-radius: 0.5rem;
        }

        #header {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 2.5rem 2rem;
        }

        .share {
            width: 4.5rem;
            height: 3rem;
            background-color: #ff7b9d; /* Darker pink */
            border: 0;
            border-bottom: 0.2rem solid #c0506a;
            border-radius: 2rem;
            cursor: pointer;
        }

        .share:active {
            border-bottom: 0;
        }

        .share i {
            color: #fff;
            font-size: 2rem;
        }

        h1 {
            font-family: "Rubik", sans-serif;
            font-size: 1.7rem;
            color: #fbfaff; /* Light text */
            text-transform: uppercase;
            cursor: default;
        }

        #leaderboard {
            width: 100%;
            position: relative;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            color: #fbfaff; /* Light text */
            cursor: default;
        }

        tr {
            transition: all 0.2s ease-in-out;
            border-radius: 0.2rem;
        }

        tr:not(:first-child):hover {
            background-color: #1f2747; /* Darker background */
            transform: scale(1.1);
            box-shadow: 0px 5px 15px 8px #050c2b; /* Darker shadow */
        }

        tr:nth-child(odd) {
            background-color: #2e345f; /* Darker background */
        }

        .first {
            color: #fff;
        }

        td {
            height: 5rem;
            font-family: "Rubik", sans-serif;
            font-size: 1.4rem;
            padding: 1rem 2rem;
            position: relative;
        }

        .number {
            width: 1rem;
            font-size: 2.2rem;
            font-weight: bold;
            text-align: left;
        }

        .name {
            text-align: left;
            font-size: 1.2rem;
        }

        .points {
            font-weight: bold;
            font-size: 1.3rem;
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }

        .points:first-child {
            width: 10rem;
        }

        .gold-medal {
            height: 3rem;
            margin-left: 1.5rem;
        }

        .ribbon {
            width: 42rem;
            height: 5.5rem;
            top: -0.5rem;
            background-color: #7c7bf4; /* Darker purple */
            position: absolute;
            left: -1rem;
            box-shadow: 0px 15px 11px -6px #292858; /* Darker shadow */
        }

        .ribbon::before {
            content: "";
            height: 1.5rem;
            width: 1.5rem;
            bottom: -0.8rem;
            left: 0.35rem;
            transform: rotate(45deg);
            background-color: #7c7bf4; /* Darker purple */
            position: absolute;
            z-index: -1;
        }

        .ribbon::after {
            content: "";
            height: 1.5rem;
            width: 1.5rem;
            bottom: -0.8rem;
            right: 0.35rem;
            transform: rotate(45deg);
            background-color: #7c7bf4; /* Darker purple */
            position: absolute;
            z-index: -1;
        }

        #buttons {
            width: 100%;
            margin-top: 3rem;
            display: flex;
            justify-content: center;
            gap: 2rem;
        }

        .exit {
            width: 11rem;
            height: 3rem;
            font-family: "Rubik", sans-serif;
            font-size: 1.3rem;
            text-transform: uppercase;
            color: #a5a6ad; /* Light gray */
            border: 0;
            background-color: #1f2747; /* Darker background */
            border-radius: 2rem;
            cursor: pointer;
        }

        .exit:hover {
            border: 0.1rem solid #7c7bf4; /* Darker purple */
        }

        .continue {
            width: 11rem;
            height: 3rem;
            font-family: "Rubik", sans-serif;
            font-size: 1.3rem;
            color: #fff;
            text-transform: uppercase;
            background-color: #7c7bf4; /* Darker purple */
            border: 0;
            border-bottom: 0.2rem solid #3838b8;
            border-radius: 2rem;
            cursor: pointer;
        }

        .continue:active {
            border-bottom: 0;
        }

        @media (max-width: 740px) {
            * {
                font-size: 70%;
            }
        }

        @media (max-width: 500px) {
            * {
                font-size: 55%;
            }
        }

        @media (max-width: 390px) {
            * {
                font-size: 45%;
            }
        }

          `}
        </style>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://unpkg.com/@phosphor/icons"></script>
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <main className="main">
        <div className="header" id="header">
          <h1>Leaderboard</h1>


          <button className="share" onClick={() => window.location.replace('/')}>
            Back
          </button>
        </div>
        <div className="leaderboard" id="leaderboard">
          <div className="ribbon"></div>
          <table className="table" id="table">
            <tbody>
              {session && leaderboardData.myRank && (
                <tr>
                  <td className="number">#{leaderboardData.myRank}</td>
                  <td className="name">{session.token.username}</td>
                  <td className="points">{leaderboardData.myXp.toFixed(0)} XP</td>
                </tr>
              )}

              {leaderboardData && leaderboardData.leaderboard && leaderboardData.leaderboard.map((user, index) => (
                <tr key={index} className={index === 0 ? 'first' : ''}>
                  <td className="number">#{index + 1}</td>
                  <td className="name">{user.username}</td>
                  <td className="points">
                    {user.totalXp.toFixed(0)} XP
                    {index === 0 && (
                      <img
                        className="gold-medal"
                        src="https://github.com/malunaridev/Challenges-iCodeThis/blob/master/4-leaderboard/assets/gold-medal.png?raw=true"
                        alt="gold medal"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div id="buttons">
            <button className="exit" onClick={() => window.location.replace('/')}>
              Exit
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Leaderboard;
