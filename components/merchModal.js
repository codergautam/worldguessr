import {Modal} from "react-responsive-modal";
import { useTranslation } from 'next-i18next'

export default function MerchModal({ shown, onClose, session }) {
    const { t: text } = useTranslation("common");

    return (
      <Modal open={shown} onClose={onClose} center styles={{
        modal: {
            backgroundColor: 'black',
        },
        closeButton: {
            scale: 0.5
        }

      }}>

<center>
      <h1 style={{
          marginBottom: '20px',
          fontSize: '24px',
          fontWeight: 'bold',
      }}>Play WorldGuessr ad-free!</h1>
      <p style={{
          fontSize: '16px',
          marginBottom: '10px',
          color: 'white',
      }}>
         Get our <i>limited time</i> T-shirt for $20 and remove all ads!
         <br/>
         Also comes with a shiny <span className="badge">supporter</span> badge in-game!
      </p>

      <img src="/merch.png" style={{width: '100%', maxWidth: '400px', margin: '20px 0'}} />

<br/>

{ session && session.token && session.token.supporter ? <p style={{
          fontSize: '16px',
          marginBottom: '10px',
          color: 'white',
      }}>
         You are already a supporter!
      </p> : (
<button className="toggleMap" style={{
          fontSize: '16px',
          fontWeight: 'bold',
          color: 'black',
          background: 'gold',
          border: 'none',
          borderRadius: '5px',
          padding: '10px 20px',
          cursor: 'pointer'
      }} onClick={() => {
        // open https://tshirt.worldguessr.com
        window.open("https://tshirt.worldguessr.com", "_blank");
      }}>
         Let's Go!
      </button>
      )}
</center>

      </    Modal>
  )
}