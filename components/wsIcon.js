import { FaTowerBroadcast } from "react-icons/fa6";
import { useState, useEffect, useRef } from "react";

export default function WsIcon({ connected, shown, onClick, connecting }) {
  const [showIcon, setShowIcon] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [isSlideIn, setIsSlideIn] = useState(false);
  const prevConnected = useRef(connected);
  const hideTimer = useRef(null);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    const wasConnected = prevConnected.current;
    const timeSinceMount = Date.now() - mountTime.current;

    // Clear any existing timer
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (connecting) {
      // Show connecting after 3 seconds, hide immediately if under 3 seconds
      if (timeSinceMount >= 3000) {
        setShowIcon(true);
        setIsSliding(false);
        setIsSlideIn(true);
        setTimeout(() => setIsSlideIn(false), 400);
      } else {
        setShowIcon(false);
        setIsSliding(false);
        setIsSlideIn(false);
      }
    } else if (!connected) {
      // Show red when disconnected immediately
      setShowIcon(true);
      setIsSliding(false);
      setIsSlideIn(true);
      setTimeout(() => setIsSlideIn(false), 400);
    } else if (connected && !wasConnected) {
      // Just connected - show green briefly then hide
      setShowIcon(true);
      setIsSliding(false);
      setIsSlideIn(false);
      hideTimer.current = setTimeout(() => {
        setIsSliding(true);
        setTimeout(() => {
          setShowIcon(false);
          setIsSliding(false);
        }, 400);
      }, 2000);
    } else if (connected) {
      // Already connected - hide immediately
      setShowIcon(false);
      setIsSliding(false);
      setIsSlideIn(false);
    }

    prevConnected.current = connected;
  }, [connected, connecting]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, []);

  if (!shown || !showIcon) return null;

  const getColor = () => {
    if (connected) return '#22c55e';
    if (connecting) return '#f59e0b';
    return '#ef4444';
  };

  const getAnimation = () => {
    if (connecting) return 'pulse-connect 1s ease-in-out infinite';
    if (!connected) return 'pulse-disconnect 2s ease-in-out infinite';
    return 'none';
  };

  return (
    <>
      <style jsx>{`
        @keyframes pulse-connect {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(245, 158, 11, 0.6);
          }
        }
        @keyframes pulse-disconnect {
          0%, 100% {
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          }
          50% {
            box-shadow: 0 6px 20px rgba(239, 68, 68, 0.6);
          }
        }
      `}</style>
      <div
        onClick={onClick}
        style={{
          position: 'fixed',
          top: '100px',
          right: isSliding ? '-85px' : (isSlideIn ? '-85px' : '15px'),
          zIndex: 10000,
          width: '50px',
          height: '50px',
          borderRadius: '15px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onClick ? 'pointer' : 'default',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          transition: 'right 0.4s ease-in-out, transform 0.4s ease-in-out, all 0.3s ease',
          border: `3px solid ${getColor()}`,
          pointerEvents: 'auto',
          animation: (!isSliding && !isSlideIn) ? getAnimation() : 'none',
          transform: isSlideIn ? 'translateX(100px)' : 'translateX(0)'
        }}
        onMouseEnter={(e) => {
          if (!connecting) {
            e.target.style.transform = 'scale(1.1)';
            e.target.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
          }
        }}
        onMouseLeave={(e) => {
          if (!connecting) {
            e.target.style.transform = 'scale(1)';
            e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
          }
        }}
        title={
          connected ? "Connected to server" :
          connecting ? "Connecting to server..." :
          "Connection lost - Click for details"
        }
      >
        <FaTowerBroadcast size={28} color={getColor()} />
      </div>
    </>
  )
}
