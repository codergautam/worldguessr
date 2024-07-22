import { FaCloud, FaCloudBolt, FaTowerBroadcast } from "react-icons/fa6";

export default function WsIcon({ connected, shown }) {
  // show cloud if connected, else show cloud with slash
  return (
    <div className={`wsIcon ${shown ? "" : "hidden"}`}>
   <FaTowerBroadcast size={50} style={{ opacity: 1, color: 'white' }} />

      </div>
  )
}
