import { useEffect, useState } from 'react';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions = null,
  variant = "default",
  disableBackdropClose = false
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
    } else if (isVisible) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
        document.body.style.overflow = '';
      }, 200);
      
      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !disableBackdropClose) {
      handleClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`modal-backdrop ${isClosing ? 'closing' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`modal ${variant} ${isClosing ? 'closing' : ''}`}>
        {title && (
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button className="modal-close" onClick={handleClose}>
              ×
            </button>
          </div>
        )}
        
        <div className="modal-content">
          {children}
        </div>
        
        {actions && (
          <div className="modal-actions">
            {actions}
          </div>
        )}
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        .modal-backdrop.closing {
          animation: fadeOut 0.2s ease-out;
        }

        .modal {
          background:
            linear-gradient(160deg, rgba(28, 44, 78, 0.55) 0%, rgba(8, 12, 22, 0.92) 60%),
            rgba(8, 12, 22, 0.92);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: white;
          font-family: "Lexend", sans-serif;
          max-width: 500px;
          width: 100%;
          max-height: 80vh;
          overflow: hidden;
          animation: slideIn 0.2s ease-out;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
          display: flex;
          flex-direction: column;
        }

        .modal.closing {
          animation: slideOut 0.2s ease-out;
        }

        .modal.error,
        .modal.warning {
          border-color: rgba(255, 255, 255, 0.08);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .modal-title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: white;
        }

        .modal-close {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          transition: all 0.2s ease;
        }

        .modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: rotate(90deg);
        }

        .modal-content {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }

        .modal-actions {
          padding: 16px 24px 24px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }

        .modal-actions :global(button) {
          background: linear-gradient(160deg, #4f8bff 0%, #2c63d8 100%);
          color: white;
          border: 1px solid rgba(140, 180, 255, 0.4);
          border-radius: 10px;
          padding: 10px 22px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: filter 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
          font-family: "Lexend", sans-serif;
          box-shadow: 0 4px 12px rgba(60, 120, 220, 0.35);
        }

        .modal-actions :global(button:hover) {
          filter: brightness(1.07);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(60, 120, 220, 0.45);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        @keyframes slideIn {
          from {
            transform: scale(0.9) translateY(30px);
            opacity: 0;
          }
          to {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }

        @keyframes slideOut {
          from {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
          to {
            transform: scale(0.9) translateY(-30px);
            opacity: 0;
          }
        }

        @media (max-width: 768px) {
          .modal {
            margin: 20px 10px;
            max-width: calc(100vw - 20px);
            max-height: calc(100vh - 40px);
          }
          
          .modal-header {
            padding: 16px 20px;
          }
          
          .modal-content {
            padding: 20px;
          }
          
          .modal-actions {
            padding: 12px 20px 20px;
          }
          
          .modal-title {
            font-size: 1.25rem;
          }
        }
      `}</style>
    </div>
  );
}