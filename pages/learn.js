import { Jockey_One, Roboto } from 'next/font/google';
import React from "react";

const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });
const roboto = Roboto({ subsets: ['cyrillic'], weight: "400", style: 'normal' });

import NextImage from "next/image";
import Link from 'next/link';
import Head from 'next/head';
import config from '@/clientConfig';

export default function Learn({ locale }) {
const [clueCnt, setClueCnt] = React.useState(0);
const [displayCount, setDisplayCount] = React.useState(0);

React.useEffect(() => {
  const configData = config();
  fetch(configData.apiUrl+'/api/clues/getCluesCount').then(res => res.json()).then(data => {
    setClueCnt(data.count);
  });
}, []);

// ease effect: lerp
function lerp(start, end, t) {
  return start * (1 - t) + end * t;
}
React.useEffect(() => {
  const interval = setInterval(() => {
    setDisplayCount(lerp(displayCount, clueCnt, 0.15));
  }, 1000 / 50);
  return () => clearInterval(interval);
});

  return (
    <>
    <Head>
      <title>WorldGuessr - Learn Mode</title>
      <meta name="description" content="Learn Mode - Improve your Geoguessr skills by guessing & learning with community explanations of strategies you could've used to pinpoint each location." />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#000000" />
      <meta name="robots" content="index, follow" />
      </Head>
<div style={{
        top: 0,
        left: 0,
        position: 'fixed',
        width: '100vw',
        height: '100vh',
        transition: 'opacity 0.5s',
        opacity: 0.4,
        userSelect: 'none',
      }}>
      <NextImage.default src={'/street1.jpg'}
      fill   alt="Game Background" style={{objectFit: "cover",userSelect:'none'}}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
      </div>
      <main className={`home ${jockey.className} ${roboto.className}`} id="main">

        <div className={`home__content`} >


          <div className="home__ui" style={{backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '10px'}}>
            <h1 className="home__title">WorldGuessr</h1>
            <h2 className="home__subtitle">Learn Mode <span className="home__subtitle--highlight" style={{color: 'orange'}}
            >(Beta)</span></h2>

            <p className="home__subtitle" style={{fontSize: '1.5em', color: 'white', textShadow: 'none'}}>
             Inspired by a Reddit post - Improve your Geoguessr skills by guessing & learning with community explanations of strategies you could&apos;ve used to pinpoint each location.
            </p>

            <p className="home__subtitle" style={{fontSize: '1.5em', color: 'white', textShadow: 'none'}}>
              {Math.round(displayCount)} explanations contributed!
              <br/>
              <a style={{color: "cyan"}} target='_blank' href='https://discord.com/invite/ubdJHjKtrC'>Join our Discord</a> to become a contributor!
            </p>

            <button className="gameBtn" onClick={() => {
              window.location.href = '/?learn=true';
            }}>
              Play!
            </button>
</div>
</div>
      </main>
    </>
  )
}