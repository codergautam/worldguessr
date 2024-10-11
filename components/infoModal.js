import {Modal} from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations'

export default function InfoModal({ shown, onClose }) {
    const { t: text } = useTranslation("common");

    return (
      <div className="infoModal" style={{
        display: 'none'
      }}>

      <h1 style={{
          marginBottom: '20px',
          fontSize: '24px',
          fontWeight: 'bold'
      }}>{text("howToPlay")}</h1>

      <p style={{
          fontSize: '16px',
          marginBottom: '10px'
      }}>
          🧐 {text("info1")}
      </p>
      <p style={{
          fontSize: '16px',
          marginBottom: '10px'
      }}>
          🗺️ {text("info2")}
      </p>
      <p style={{
          fontSize: '16px',
          marginBottom: '20px'
      }}>
          🎓 {text("info3")}
      </p>

      <button className="toggleMap" style={{
          fontSize: '16px',
          fontWeight: 'bold',
          color: 'white',
          background: 'green',
          border: 'none',
          borderRadius: '5px',
          padding: '10px 20px',
          cursor: 'pointer'
      }} onClick={() => {
          onClose();
      }}>
          {text("close")}
      </button>
      </div>
  )
}