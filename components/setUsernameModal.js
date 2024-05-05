import Modal from "react-responsive-modal";
import { useState } from "react";

export default function SetUsernameModal({ shown, onClose, session }) {
    const [username, setUsername] = useState("");

    const handleSave = async () => {
        const secret = session.token.secret;

        const response = await fetch('/api/setName', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, token: secret })
        });

        if (response.ok) {
          window.location.reload();
        } else {
            try {
              const data = await response.json();
              alert(data.message || 'An error occurred');

            } catch (error) {
              alert('An error occurred');
            }
        }
    };

    return (
        <Modal id="setUsernameModal" styles={{
            modal: {
                zIndex: 100,
                background: '#333', // dark mode: #333
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                fontFamily: "'Arial', sans-serif",
                maxWidth: '500px',
                textAlign: 'center'
            }
        }} open={shown} center onClose={()=>{}}>

            <h1 style={{
                marginBottom: '20px',
                fontSize: '24px',
                fontWeight: 'bold'
            }}>Welcome to WorldGuessr!</h1>
            <h3 style={{
                marginBottom: '20px',
                fontSize: '18px'
            }}>Please enter a username to continue</h3>

            <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                    fontSize: '16px',
                    padding: '10px',
                    marginBottom: '20px',
                    width: '100%',
                    boxSizing: 'border-box'
                }}
            />

            <button className="saveUsername" style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: 'white',
                background: 'blue',
                border: 'none',
                borderRadius: '5px',
                padding: '10px 20px',
                cursor: 'pointer'
            }} onClick={handleSave}>
                Save
            </button>
        </Modal>
    )
}
