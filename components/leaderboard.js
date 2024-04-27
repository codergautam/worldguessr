import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

function playerPoints(player, currentRound, gameEnded) {
  if(!gameEnded) {
  return player.g.filter((g) => g.r <= currentRound).reduce((acc, g) => acc + g.po, 0);
  } else {
    return player.g.reduce((acc, g) => acc + g.po, 0);
  }
}

// Custom hook to animate number changes
function useAnimatedNumber(target) {
  const [displayValue, setDisplayValue] = useState(target);

  useEffect(() => {
    const handle = setInterval(() => {
      setDisplayValue((prev) => {
        if (prev < target) return prev + Math.ceil((target - prev) / 20);
        if (prev > target) return prev - Math.ceil((prev - target) / 20);
        return prev;
      });
    }, 20);

    return () => clearInterval(handle);
  }, [target]);

  return displayValue;
}

const Leaderboard = ({ gameData, playingMultiplayer, currentRound, realCurrentRoundIndex, gameEnded, finish, mobileOpen }) => {
  return (
    <>
      {playingMultiplayer && (
        <div id="leaderBoard" className={`${gameEnded ? 'gameEnded' : ''} ${mobileOpen?'mobileOpen':''}`}>
          <h1>Leaderboard</h1>
          {gameEnded && <h2>Game Ended</h2>}
          {gameData?.players?.length === 0 ? (
            <p style={{ color: 'red', fontStyle: 'italic' }}>No players have joined yet</p>
          ) : (
            <>
              <ul style={{ listStyleType: 'none', padding: 0 }}>
                <AnimatePresence>
                  {gameData?.players
                    .slice()
                    .sort((a, b) => playerPoints(b, currentRound, gameEnded) - playerPoints(a, currentRound, gameEnded))
                    .map((p, index) => {
                      const animatedPoints = useAnimatedNumber(playerPoints(p, currentRound, gameEnded));
                      return (
                        <motion.li
                          key={p.id}
                          layout
                          initial={{ opacity: 0, y: 50 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -50 }}
                          transition={{ duration: 0.5 }}
                          style={{ margin: '10px', padding: '10px', border: '1px solid black', backgroundColor: p.g.find((g) => g.r === realCurrentRoundIndex) ? 'green' : 'black' }}
                        >
                         #{index + 1}: {p.n} - {animatedPoints} points
                        </motion.li>
                      );
                    })}
                </AnimatePresence>
              </ul>
            </>
          )}

          {gameEnded && (
            <button
            className='actionButton'
              onClick={() => {
                finish();
              }}
            >
              Finish
            </button>
          )}

        </div>
      )}
    </>
  );
};

export default Leaderboard;
