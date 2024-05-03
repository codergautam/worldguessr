import msToTime from "./msToTime";

export default function AccountView({ accountData }) {
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
      <h1 style={titleStyle}>
        <i className="fas fa-user" style={iconStyle}></i>
        {accountData.username}
      </h1>
      <p style={textStyle}>
        <i className="fas fa-clock" style={iconStyle}></i>
        Joined {msToTime(Date.now() - new Date(accountData.createdAt).getTime())} ago
      </p>
      <p style={textStyle}>
        <i className="fas fa-star" style={iconStyle}></i>
        {accountData.totalXp} XP
      </p>
      <p style={textStyle}>
        <i className="fas fa-gamepad" style={iconStyle}></i>
        Games played: {accountData.gamesLen}
      </p>
    </div>
  );
}
