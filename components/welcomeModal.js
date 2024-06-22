import {Modal} from "react-responsive-modal";
import { useTranslation } from 'next-i18next'

export default function WelcomeModal({ shown, onClose, openGame }) {
    const { t: text } = useTranslation("common");

    return (
    <Modal id="infoModal" styles={{
      modal: {
          zIndex: 100,
          background: 'black',
          color: 'white',
          padding: '20px',
          borderRadius: '10px',
          fontFamily: "'Arial', sans-serif",
          maxWidth: '500px',
          textAlign: 'center'
      }
  }} open={shown} center onClose={onClose}>

      <h1 style={{
          marginBottom: '20px',
          fontSize: '24px',
          fontWeight: 'bold'
      }}>{text("welcomeToWorldguessr")}</h1>

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
        openGame();
      }}>
          {text("letsGo")}
      </button>
  </Modal>
  )
}