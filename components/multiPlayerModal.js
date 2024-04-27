import { useEffect, useState } from 'react';
import Modal from 'react-responsive-modal';
import findLatLongRandom from './findLatLong';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';

function enforceMinMax(el, callback) {
  if (el.value !== "") {
    const value = parseInt(el.value);
    const min = parseInt(el.min);
    const max = parseInt(el.max);

    if (isNaN(value)) {
      el.value = min;
    } else if (value < min) {
      el.value = min;
    } else if (value > max) {
      el.value = max;
    } else {
      el.value = Math.floor(value);
    }
  }
  callback();
}

export default function MultiplayerModal({ open, close }) {
  // show create options view
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  // show join options view
  const [showJoinOptions, setShowJoinOptions] = useState(false);
  // game creation loading state (false, true, or latLong fetch progress)
  const [creatingGame, setCreatingGame] = useState(false);
  // game creation options
  const [createOptions, setCreateOptions] = useState({
    rounds: 5,
    timePerRound: 200
  });

  // whether in enter name screen
  const [enterName, setEnterName] = useState(false);
  // game code/id
  const [code,  setCode] = useState('');
  // whether user is the creator of the game
  const [creator, setCreator] = useState(false);
  const [modifySecret, setModifySecret] = useState('');
  // player name textbox value
  const [playerName, setPlayerName] = useState('');

  // whether joining a game (waiting for response)
  const [joining, setJoining] = useState(false);
  // user data after joining
  const [myData, setMyData] = useState({joined: false});
  // game data after joining
  const [gameData, setGameData] = useState(null);
  // starting or leaving game (waiting for response)
  const [starting, setStarting] = useState(false);


  const handleCreateGame = () => {
    setShowCreateOptions(true);
  };

  function join() {
    setJoining(true);
    fetch('/api/joinGame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: code, name: playerName })
    }).then(res => res.json()).then(data => {
      setJoining(false);
      if(data.error) {
        alert(data.error || 'Failed to join');
        return;
      }
      setEnterName(false);
      setMyData({
        joined: true,
        playerId: data.playerId,
        playerSecret: data.playerSecret
      });
    }).catch(err => {
      setJoining(false);
      console.error('Failed to join:', err);
      alert('Failed to join');
    });
  }

  useEffect(() => {
    // reset all states when modal is closed
    if(!open) {
      setShowCreateOptions(false);
      setShowJoinOptions(false);
      setCreatingGame(false);
      setCreateOptions({
        rounds: null,
        timePerRound: null
      });
      setEnterName(false);
      setCode('');
      setCreator(false);
      setModifySecret('');
      setPlayerName('');
      setJoining(false);
      setMyData({joined: false});
      setGameData(null);
      setStarting(false);
    }
  }, [open]);

  useEffect(() => {
    const refresh = async () => {
      await fetch('/api/gameState', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: code })
      }).then(res => res.json()).then(data => {
        if(data.error) {
          console.error('Failed to fetch game state:', data.error);
          return;
        }

        setGameData(data);
      }).catch(err => {
        console.error('Failed to fetch game state:', err);
      });
    }
    let int;
    if(myData.joined) {
      int = setInterval(refresh, 1000);
    }
    return () => {
      // cleanup
      clearInterval(int);
    }
  }, [myData]);

  useEffect(() => {
    if(gameData && gameData.state === 2) {
      // game started
      close({
        gameData,
        myData,
        modifySecret,
        code
      });
    }
  }, [gameData]);

  const handleCreateGameSubmit = async () => {
    if(!createOptions.rounds || !createOptions.timePerRound) {
      alert('Please enter number of rounds and time per round');
      return;
    }
    if(createOptions.timePerRound < 10) {
      alert('Time per round should be at least 10 seconds');
      return;
    }

    setCreatingGame(0);

    const coords = [];
    while(coords.length < createOptions.rounds) {
      coords.push(await findLatLongRandom());
      setCreatingGame(coords.length);

    }

    const gameData = {
      points: coords,
      rounds: createOptions.rounds,
      timePerRound: createOptions.timePerRound
      // Add other game settings
    };

    try {
      setCreatingGame(true);
      const response = await fetch('/api/createGame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gameData)
      });
      setCreatingGame(false);
      const data = await response.json();
      const { uuid } = data;
      if(!uuid) {
        console.error('Failed to create game:', data);
        alert(data?.error || 'Failed to create game');
        return;
      }
      setCode(uuid.toString());
      setModifySecret(data.modifySecret);
      setEnterName(true);
      setCreator(true);
    } catch (error) {
      setCreatingGame(false);
      console.error('Failed to create game:', error);
      alert('Failed to create game');
    }
  };


  return (
    <Modal id="infoModal" open={open} onClose={()=>{}} center classNames={{
      modal: 'customModal',
      overlay: 'customOverlay',
      closeButton: 'customCloseButton',
    }}>

      {myData.joined && !enterName && (
        <div>
          <h2>Multiplayer Game - {gameData?.points.length} rounds</h2>
          <p>Game code: {code}</p>
          <p>Share this code with your friends to join the game!</p>

          {/* <p>Players: {gameData?.players.map(p => p.n).join(', ')}</p> */}
          {gameData?.players?.length === 0 ? (
            <p style={{ color: 'red', fontStyle: 'italic' }}>No players have joined yet</p>
          ) : (
            <>
            <h3 style={{textAlign: 'center', marginTop: '10px'}}>Players ({gameData?.players.length} / 10)</h3>
            <ul style={{ listStyleType: 'none', padding: 0 }}>
              {gameData?.players.map((p, index) => (
                <li key={index} style={{ margin: '10px', padding: '10px', border: '1px solid black' }}>
                  {p.n}
                </li>
              ))}
            </ul>
            </>
          )}

         {gameData && gameData.state === 1 && (
          <>
          { creator ? (
            <button className="actionButton" onClick={() => {
              setStarting(true);
              fetch('/api/startGame', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: code, modifySecret })
              }).then(res => res.json()).then(data => {
                setStarting(false);
                if(data.error) {
                  alert(data.error);
                  return;
                }
              }).catch(err => {
                setStarting(false);
                console.error('Failed to start game:', err);
                alert('Failed to start game');
              });
            }} disabled={(gameData.players.length <= 1) || starting}>{gameData.players.length <= 1 ? 'Need at least 2 players to start' : starting ? 'Starting Game...' : 'Start Game'}</button>
          ) : (
            <button className="actionButton secondary" onClick={() => {
              setStarting(true);
              fetch('/api/leaveGame', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: code, playerId: myData.playerId, playerSecret: myData.playerSecret })
              }).then(res => res.json()).then(data => {
                setStarting(false);
                if(data.error) {
                  alert(data.error);
                  return;
                }
                close();
              }).catch(err => {
                setStarting(false);
                console.error('Failed to leave game:', err);
                alert('Failed to leave game');
              });
            }}>{starting ? 'Leaving Game...' : 'Leave Game'}</button>
          )}
          </>
          )}
        </div>
      )}

      {enterName && (
        <>
      <h2>Enter a nickname</h2>
      <p>Enter a nickname to join the game:</p>
      <div className="inputContainer">
        <input type="text" placeholder="Nickname" value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={20}/>
      </div>
      <button className="actionButton" onClick={() => {
          join();
      }} disabled={joining}>
      {joining ? 'Joining...' : 'Join Game'}
      </button>
      {/* option to not join if owner
      {creator && (
        <button className="actionButton secondary" onClick={() => {
        }}> Spectate </button>
      )}
      */}
      </>
      )}


      { !showCreateOptions && !showJoinOptions && !enterName&& !myData.joined && (
        <div>
      <h2>Multiplayer (beta)!</h2>
      <p>Choose an option to get started:</p>

      <div className="buttonContainer">
        <button className="actionButton create" onClick={handleCreateGame}>
          Create Game
        </button>
        <button className="actionButton join" onClick={() => {
            setShowJoinOptions(true);
        }}>
          Join Game
        </button>
        <button className="actionButton secondary" onClick={() => close()}>
          Close
        </button>
      </div>
      </div>
      )}

      {showCreateOptions && !enterName && !myData.joined &&  (
        <div style={{textAlign: 'center'}}>
          <h3>Create Your Game</h3>
          <p style={{fontWeight: 'bold'}}>Enter details for the new game:</p>
          <div className="inputContainer">

          <label>Number of rounds:</label>
          <div className="numberInput rounds">
          <FaArrowLeft onClick={() => setCreateOptions({...createOptions, rounds: Math.max(1, createOptions.rounds-1)})} />
          <input type="number" className='numberIn' placeholder="Number of rounds"  max={20} onChange={(e) => enforceMinMax(e.target, ()=>setCreateOptions({...createOptions, rounds: e.target.value}))} disabled={creatingGame} value={createOptions.rounds} />
          <FaArrowRight onClick={() => setCreateOptions({...createOptions, rounds: Math.min(20, createOptions.rounds+1)})} />
          </div>

          <label>Time per round (seconds):</label>
          <div className="timePerRound numberInput">
          <FaArrowLeft onClick={() => setCreateOptions({...createOptions, timePerRound: Math.max(10, createOptions.timePerRound-10)})} />
          <input type="number" className='numberIn' placeholder="Time per round (seconds)"  max={300} onChange={(e) => enforceMinMax(e.target, ()=>setCreateOptions({...createOptions, timePerRound: e.target.value}))} disabled={creatingGame} value={createOptions.timePerRound} />
          <FaArrowRight onClick={() => setCreateOptions({...createOptions, timePerRound: Math.min(300, createOptions.timePerRound+10)})} />
          </div>

          </div>
          <button className="actionButton" onClick={handleCreateGameSubmit} disabled={creatingGame}>
            {creatingGame===false ? 'Create Game' : typeof creatingGame === 'number' ? `Loading (${creatingGame}/${createOptions.rounds})` : 'Creating Game...' }
          </button>
          <button className="actionButton secondary" onClick={() => {
            setShowCreateOptions(false);
          }}>
            Cancel
          </button>
        </div>
      )}

      {showJoinOptions && !myData.joined && !enterName && (
        <div>
          <h3>Join Game</h3>
          <p>Enter the game code to join:</p>
          <div className="inputContainer">
            <input type="text" placeholder="Game Code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button className="actionButton" onClick={() => {
            setJoining(true);
              fetch('/api/gameState', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: code })
              }).then(res => res.json()).then(data => {
                setJoining(false);
                if(data.error || data.state !== 1) {
                  alert(data.error || 'Game not accepting players');
                  return;
                }
                setEnterName(true);
              }).catch(err => {
                setJoining(false);
                console.error('Failed to join:', err);
                alert('Failed to join');
              });
          }}>
            {joining ? 'Connecting...' : 'Connect'}
          </button>
          <button className="actionButton secondary" onClick={() => {
            setShowJoinOptions(false);
          }}>
            Cancel
          </button>
        </div>
      )}

    </Modal>
  );
}
