import {Modal} from "react-responsive-modal";
import { useState } from "react";
import { useTranslation } from 'next-i18next'
import sendEvent from "./utils/sendEvent";

export default function SetUsernameModal({ shown, onClose, session }) {
    const [username, setUsername] = useState("");
    const { t: text } = useTranslation("common");

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
            sendEvent("sign_up");
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

            <span style={{
                marginBottom: '20px',
                fontSize: '24px',
                fontWeight: 'bold'
            }}>{text("welcomeToWorldguessr")}</span>
            <h3 style={{
                marginBottom: '20px',
                fontSize: '18px'
            }}>{text("enterUsername")}</h3>

            <input
                type="text"
                placeholder={text("enterUsernameBox")}
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
                {text("save")}
            </button>
        </Modal>
    )
}
