import msToTime from "./msToTime";
import { useTranslation } from 'next-i18next'

export default function AccountView({ accountData, supporter }) {
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
    </div>
  );
}
