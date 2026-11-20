// The round screens come from @mapfinder/quiz-kit; this file is WG's side of
// the contract: text, sounds, asset URLs, the pin, saving, and the party's
// socket and chrome. Client only (useQuizScreens loads it with ssr:false), so
// MapLibre stays out of the home bundle and never runs during prerender.

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { QuizFind, QuizGame } from '@mapfinder/quiz-kit';
// Global CSS from node_modules, loaded with this chunk (as QuizGlobe did with
// MapLibre's): the kit's screens, then WG's --mf-* theme.
import { useTranslation } from '@/components/useTranslations';
import { asset } from '@/lib/basePath';
import { flagSrc, isFindMode } from '../modes/quizClient';
import nameFromCode from '../utils/nameFromCode';
import { getSfxVolume } from '../utils/audio';
import { HIDE_ACCOUNT_UI } from '../utils/accountUi';
import PlayerList from '../playerList';
import TeamScorebar from '../teamScorebar';
import BannerText from '../bannerText';
import deriveTeamEndFallback from '../utils/teamDuelEndFallback';
import { readBest, saveBest, postRun } from './runStore';

const RoundOverScreen = dynamic(() => import('../roundOverScreen'), { ssr: false });
const EMPTY = [];

// MapLibre 6 finds its worker next to its own import.meta.url, which webpack
// rewrites; point it at the file in the one maplibre-gl copy (the kit's peer
// resolves to WG's own node_modules/maplibre-gl).
const WORKER_URL = new URL('../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href;
// Sounds in play are the kit's own MapFinder tones; WG only passes its volume
// setting (0 = muted). The hub and menus keep WG's click sound.

// The capitals result card's photo, from Wikipedia's page summary (a public,
// CORS-open endpoint; one request per city, cached for the session). Offline
// or blocked, the card simply shows no photo, as MapFinder's does. WG never
// calls MapFinder's own API.
const intelCache = new Map();
function cityIntel({ capital, country }) {
  const key = `${capital}|${country}`;
  if (!intelCache.has(key)) {
    intelCache.set(key, (async () => {
      for (const title of [capital, `${capital}, ${country}`]) {
        try {
          const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { accept: 'application/json' } });
          if (!r.ok) continue;
          const j = await r.json();
          if (j.type !== 'standard' || !j.thumbnail?.source) continue;
          // The card names the city as the game does ("Moroni"), not as Wikipedia
          // disambiguates it ("Moroni, Comoros").
          return { title: capital, image: j.thumbnail.source };
        } catch {}
      }
      return null;
    })());
  }
  return intelCache.get(key);
}

// What every round screen gets from WG.
function useHost(session) {
  const { t: text, lang } = useTranslation('common');
  const volume = getSfxVolume();
  return useMemo(() => ({
    t: text,
    lang,
    volume,
    countryName: (code) => nameFromCode(code, lang),
    flagUrl: flagSrc,
    countriesUrl: asset('/modes/countries.json'),
    shapesUrl: asset('/modes/shapes.json'),
    workerUrl: WORKER_URL,
    pinRenderer: asset('/src-v2.png'),
    hideAccountUi: HIDE_ACCOUNT_UI,
    readBest,
    saveBest,
    // A race has no round points to store (its record is the local best time).
    postRun: ({ spec, region, history }) => { if (!spec?.race) postRun({ session, spec, region, history }); },
    cityIntel,
  }), [text, lang, session, volume]);
}

// A singleplayer run. `onPlayAgainSp` is the ad between games: it starts
// with the restart and is never awaited.
export function SoloRound({ mode, region, islands, session, leaving, onExit, onPlayAgainSp }) {
  const host = useHost(session);
  const Run = isFindMode(mode) ? QuizFind : QuizGame;
  return (
    <Run
      {...host}
      mode={mode}
      region={region}
      islands={islands}
      leaving={leaving}
      onExit={onExit}
      onPlayAgain={(restart) => { onPlayAgainSp?.(); restart(); }}
    />
  );
}

// A party game whose mode is a quiz: the kit plays the rounds, WG keeps its
// player list, team bar, banner and end screen.
export function PartyRound({ multiplayerState, ws, timeOffset, session, options, backBtnPressed }) {
  const host = useHost(session);
  const { t: text } = useTranslation('common');
  const gd = multiplayerState?.inGame ? multiplayerState.gameData : null;
  if (!gd) return null;
  const me = gd.players?.find((p) => p.id === gd.myId);
  const mp = {
    state: gd,
    myId: gd.myId,
    send: (msg) => ws?.send(JSON.stringify(msg)),
    timeOffset,
    renderPlayers: () => <PlayerList multiplayerState={multiplayerState} fadingOut={false} />,
    renderTeamBar: () => <TeamScorebar gameData={gd} />,
    renderBanner: (banner) => <BannerText text={banner} shown={true} />,
    renderEnd: () => {
      const back = gd.host ? { button2Text: text('back'), button2Press: () => backBtnPressed() } : { button2Text: null, button2Press: null };
      if (!gd.duel && !gd.teamGame) {
        return (
          <RoundOverScreen
            history={gd.history || EMPTY} duel={false} multiplayerState={multiplayerState} gameId={gd.code}
            points={me?.score || 0} maxPoints={gd.rounds * 5000} {...back} session={session} options={options}
          />
        );
      }
      if (gd.public) return null;
      return (
        <RoundOverScreen
          history={gd.history || EMPTY} duel={true} data={gd.duelEnd ?? deriveTeamEndFallback(gd)}
          multiplayerState={multiplayerState} gameId={gd.code} {...back} session={session} options={options}
        />
      );
    },
  };
  return <QuizGame {...host} mp={mp} onExit={() => backBtnPressed()} />;
}
