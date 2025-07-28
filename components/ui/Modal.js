import { useEffect, useState } from 'react';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions = null,
  variant = "default"
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      if (isVisible) {
        setIsClosing(true);
        setTimeout(() => {
          setIsVisible(false);
          setIsClosing(false);
          document.body.style.overflow = '';
        }, 200);
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isVisible]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
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
          background: rgba(0, 0, 0, 0.75);
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
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 30, 15, 0.9) 50%, rgba(0, 0, 0, 0.95) 100%);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          font-family: "Lexend", sans-serif;
          max-width: 500px;
          width: 100%;
          max-height: 80vh;
          overflow: hidden;
          animation: slideIn 0.2s ease-out;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7);
        }

        .modal.closing {
          animation: slideOut 0.2s ease-out;
        }

        .modal.error {
          background: linear-gradient(135deg, rgba(156, 82, 39, 0.95) 0%, rgba(91, 29, 29, 0.9) 100%);
          border-color: rgba(220, 53, 69, 0.3);
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
          max-height: 60vh;
        }

        .modal-actions {
          padding: 16px 24px 24px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .modal-actions :global(button) {
          background: linear-gradient(135deg, rgba(36, 87, 52, 0.9) 0%, rgba(20, 65, 25, 0.8) 100%);
          color: white;
          border: 2px solid #245734;
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: "Lexend", sans-serif;
        }

        .modal-actions :global(button:hover) {
          background: linear-gradient(135deg, rgba(36, 87, 52, 1) 0%, rgba(36, 87, 52, 0.9) 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(36, 87, 52, 0.4);
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
            transform: scale(0.95) translateY(20px);
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
            transform: scale(0.95) translateY(-20px);
            opacity: 0;
          }
        }

        @media (max-width: 768px) {
          .modal {
            margin: 10px;
            max-width: calc(100vw - 20px);
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