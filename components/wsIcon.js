import { FaCloud, FaCloudBolt, FaTowerBroadcast, FaWifiSlash, FaWifi } from "react-icons/fa6";
import { useState } from "react";

export default function WsIcon({ connected, shown, onClick }) {
  const [isHovered, setIsHovered] = useState(false);

  const baseStyle = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 1000,
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    display: shown ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
    backdropFilter: 'blur(10px)',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
    cursor: onClick ? 'pointer' : 'default',
    color: 'white'
  };

  const connectedStyle = {
    ...baseStyle,
    background: 'linear-gradient(135deg, #2ed573, #7bed9f)',
    boxShadow: isHovered 
      ? '0 6px 20px rgba(46, 213, 115, 0.4)' 
      : '0 4px 12px rgba(46, 213, 115, 0.3)'
  };

  const disconnectedStyle = {
    ...baseStyle,
    background: 'linear-gradient(135deg, #ff4757, #ff6b7a)',
    boxShadow: isHovered 
      ? '0 6px 20px rgba(255, 71, 87, 0.4)' 
      : '0 4px 12px rgba(255, 71, 87, 0.3)',
    animation: 'pulse-red 2s infinite'
  };

  return (
    <>
      <style jsx>{`
        @keyframes pulse-red {
          0% {
            box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
          }
          50% {
            box-shadow: 0 4px 12px rgba(255, 71, 87, 0.6), 0 0 0 10px rgba(255, 71, 87, 0.1);
          }
          100% {
            box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
          }
        }
      `}</style>
      <div
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={connected ? "Connected to server" : "Connection lost - Click for details"}
        style={connected ? connectedStyle : disconnectedStyle}
      >
        {connected ? (
          <FaWifi size={24} />
        ) : (
          <FaWifiSlash size={24} />
        )}
      </div>
    </>
  )
}
