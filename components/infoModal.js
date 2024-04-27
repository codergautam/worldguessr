import Modal from "react-responsive-modal";

export default function InfoModal({ shown, onClose }) {
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
      }}>How to Play</h1>

      <p style={{
          fontSize: '16px',
          marginBottom: '10px'
      }}>
          🧐 Explore your surroundings, and try to guess where in the World you are
      </p>
      <p style={{
          fontSize: '16px',
          marginBottom: '10px'
      }}>
          🗺️ Use the map to place your guess, and check your accuracy
      </p>
      <p style={{
          fontSize: '16px',
          marginBottom: '20px'
      }}>
          🎓 Learn geography through play, and have fun!
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
          Close
      </button>
  </Modal>
  )
}