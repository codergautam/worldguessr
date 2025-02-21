import msToTime from "./msToTime";
import { useTranslation } from '@/components/useTranslations'
import sendEvent from "./utils/sendEvent";

export default function AccountView({ accountData, supporter, session }) {
  const { t: text } = useTranslation("common");

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #6e8efb, #a777e3)',
    color: '#fff',
    fontFamily: 'Arial, sans-serif',
    padding: '20px',
    boxSizing: 'border-box',
    borderRadius: '10px',
  };

  const titleStyle = {
    fontSize: '32px',
    fontWeight: 'bold',
    margin: '10px 0',
    textShadow: '2px 2px 4px rgba(0,0,0,0.2)'
  };

  const textStyle = {
    fontSize: '18px',
    margin: '5px 0',
    letterSpacing: '0.5px'
  };

  const iconStyle = {
    marginRight: '8px'
  };


  const changeName = async () => {
    if(window.settingName) return;
    const secret = session?.token?.secret;
    if (!secret) return alert("An error occurred (log out and log back in)");
    // make sure name change is not in progress

    try {
    const response1 = await fetch(window.cConfig.apiUrl+'/api/checkIfNameChangeProgress', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: secret })
    });

    // get the json
    const data1 = await response1.json();
    if(data1.name) {
      return alert(text("nameChangeInProgress", {name: data1.name}));
    }
  } catch (error) {
    return alert('An error occurred');
  }

    const username = prompt(text("enterNewName"));

    window.settingName = true;
    const response = await fetch(window.cConfig.apiUrl+'/api/setName', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, token: secret })
    });

    if(response.ok) {
      window.settingName = false;
      sendEvent("name_change");
      alert(text("nameChanged"));

      setTimeout(() => {
          window.location.reload();
      },1000);
    } else {
      window.settingName = false;
      try {
        const data = await response.json();
        alert(data.message || 'An error occurred');

      } catch (error) {
        alert('An error occurred');
      }
    }

  };
  return (
    <div style={containerStyle}>
      <span style={titleStyle}>
        <i className="fas fa-user" style={iconStyle}></i>
        {accountData.username}
        {supporter && <span className="badge" style={{marginLeft: '10px', color: 'black', fontSize: '0.8rem'}}>{text("supporter")}</span>}
      </span>
      <p style={textStyle}>
        <i className="fas fa-clock" style={iconStyle}></i>
        {/* Joined {msToTime(Date.now() - new Date(accountData.createdAt).getTime())} ago */}
        {text("joined", {t: msToTime(Date.now() - new Date(accountData.createdAt).getTime())})}
      </p>
      <p style={textStyle}>
        <i className="fas fa-star" style={iconStyle}></i>
        {accountData.totalXp} XP
      </p>
      <p style={textStyle}>
        <i className="fas fa-gamepad" style={iconStyle}></i>
        {/* Games played: {accountData.gamesLen} */}
        {text("gamesPlayed", {games:accountData.gamesLen})}
      </p>
      {/* change name buton */}
      {accountData.canChangeUsername ? (
      <button style={{marginTop: '10px', padding: '5px 10px', border: 'none', borderRadius: '5px', background: 'rgba(0,0,0,0.5)', color: 'white', cursor: 'pointer'}}

      onClick={changeName}>
        {text("changeName")}
      </button>
      ): accountData.recentChange ? (
      <p style={textStyle}>
        <i className="fas fa-exclamation-triangle" style={iconStyle}></i>
        {text("recentChange")}
      </p>

      ) : null}

{accountData.daysUntilNameChange > 0 && (
<p style={textStyle}>
        <i className="fas fa-exclamation-triangle" style={iconStyle}></i>
        {text("nameChangeCooldown", {days: accountData.daysUntilNameChange})}
      </p>
)}
    </div>
  );
}
