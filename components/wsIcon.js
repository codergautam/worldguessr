import { FaTowerBroadcast } from "react-icons/fa6";

export default function WsIcon({ connected, shown, onClick }) {
  if (!shown) return null;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed',
        top: '60px',
        left: '15px',
        zIndex: 10000,
        width: '70px',
        height: '70px',
        borderRadius: '15px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        transition: 'all 0.3s ease',
        border: `3px solid ${connected ? '#22c55e' : '#ef4444'}`,
        pointerEvents: 'auto'
      }}
      onMouseEnter={(e) => {
        e.target.style.transform = 'scale(1.1)';
        e.target.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={(e) => {
        e.target.style.transform = 'scale(1)';
        e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
      }}
      title={connected ? "Connected to server" : "Connection lost - Click for details"}
    >
      {connected ? (
        <FaTowerBroadcast size={28} color="#22c55e" />
      ) : (
        <FaTowerBroadcast size={28} color="#ef4444" />
      )}
    </div>
  )
}
