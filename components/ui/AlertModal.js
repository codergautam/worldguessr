import Modal from './Modal';
import { useTranslation } from '@/components/useTranslations';

export default function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
  buttonText,
  children
}) {
  const { t: text } = useTranslation("common");

  const getVariant = (type) => {
    switch (type) {
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getDefaultTitle = (type) => {
    switch (type) {
      case 'success': return text("success") || "Success";
      case 'error': return text("error") || "Error";
      case 'warning': return text("warning") || "Warning";
      case 'info':
      default: return text("info") || "Information";
    }
  };

  const actions = (
    <button onClick={onClose}>
      {buttonText || text("ok") || "OK"}
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || getDefaultTitle(type)}
      variant={getVariant(type)}
      actions={actions}
    >
      <div style={{ textAlign: 'center' }}>
        {message && (
          <p style={{
            fontSize: '16px',
            lineHeight: '1.5',
            margin: '0',
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            {message}
          </p>
        )}
        {children}
      </div>
    </Modal>
  );
}