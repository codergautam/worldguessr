import { FaCloud, FaCloudBolt, FaTowerBroadcast, FaWifiSlash, FaWifi } from "react-icons/fa6";
import { useState } from "react";
import './wsIcon.css';

export default function WsIcon({ connected, shown, onClick }) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      className={`wsIcon ${shown ? "" : "hidden"} ${connected ? "connected" : "disconnected"}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={connected ? "Connected to server" : "Connection lost - Click for details"}
      style={{
        transform: isHovered ? 'scale(1.1)' : 'scale(1)',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      {connected ? (
        <FaWifi size={24} />
      ) : (
        <FaWifiSlash size={24} />
      )}
    </div>
  )
}
