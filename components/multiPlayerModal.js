import Modal from "react-responsive-modal";

export default function MultiplayerModal({ open, close }) {
  return (
    <Modal id="infoModal" open={open} onClose={close} center classNames={{
      modal: 'customModal',
      overlay: 'customOverlay',
      closeButton: 'customCloseButton',
    }}>
      <h2>Multiplayer (beta)!</h2>
      <p>Choose an option to get started:</p>

      <div className="buttonContainer">
        <button className="actionButton create" onClick={() => {
            // Implementation for creating a game
            console.log('Create game clicked');
        }}>
          Create Game
        </button>
        <button className="actionButton join" onClick={() => {
            // Implementation for joining a game
            console.log('Join game clicked');
        }}>
          Join Game
        </button>
      </div>

    </Modal>
  );
}
