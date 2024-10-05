import {Modal} from "react-responsive-modal";
import { useTranslation } from 'next-i18next'

export default function MerchModal({ shown, onClose }) {
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
      }}>Support WorldGuessr by buying merch!</h1>
      <p style={{
          fontSize: '16px',
          marginBottom: '10px',
          color: 'white',
      }}>
         Get our <i>limited time</i> T-shirt for $15!
         <br/>
         Also comes with a shiny <span style={{background: 'gold', color: 'black', padding: '3px', borderRadius: '10px'}}>supporter</span> badge in-game!
        <br/>
        Free shipping within the United States, <a href="https://discord.gg/ubdJHjKtrC" target="_blank" style={{color:"cyan"}}>contact us</a> for international orders.
      </p>

      <img src="/merch.png" style={{width: '100%', maxWidth: '400px', margin: '20px 0'}} />

<br/>
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
      &nbsp;
      &nbsp;
      <button className="toggleMap" style={{
          fontSize: '16px',
          fontWeight: 'bold',
          color: 'white',
          background: 'gray',
          border: 'none',
          borderRadius: '5px',
          padding: '10px 20px',
          cursor: 'pointer'
      }} onClick={() => {
          onClose();
      }}>
          Not Now
      </button>
</center>

      </    Modal>
  )
}