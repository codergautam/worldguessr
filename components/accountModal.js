import { Modal } from "react-responsive-modal";
import { useEffect, useState } from "react";
import AccountView from "./accountView";
import { signOut } from "next-auth/react";
import { useTranslation } from 'next-i18next'

export default function AccountModal({ session, shown, setAccountModalOpen, inCrazyGames }) {
  const { t: text } = useTranslation("common");

    const [accountData, setAccountData] = useState({});
    useEffect(() => {
      if(shown) {
        const fetchData = async () => {
          const response = await fetch('/api/publicAccount', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ secret: session?.token?.secret }),
          });
          if (response.ok) {
            const data = await response.json();
            setAccountData(data);
          } else {
            alert('An error occurred');
          }
        }
        fetchData();
      }
    }, [shown, session?.token?.secret]);

    return (
        <Modal id="accountModal" styles={{
            modal: {
                zIndex: 100,
                background: '#333', // dark mode: #333
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                fontFamily: "'Arial', sans-serif",
                maxWidth: '500px',
                textAlign: 'center',
            }
        }} open={shown} center onClose={()=>{setAccountModalOpen(false)}}>

          <AccountView accountData={accountData} supporter={session?.token?.supporter} />

{!inCrazyGames && (
            <button onClick={()=>signOut()} style={{
                background: 'red',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                marginTop: '20px'
            }}>
              {text("logOut")}
            </button>
          )}

        </Modal>
    )
}
