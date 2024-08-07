import { Modal } from "react-responsive-modal";
import MapView from "./mapView";
import { useRouter } from "next/router";

export default function MapsModal({ shown, onClose, session, text }) {
    const router = useRouter();
    return (
        <Modal id="" styles={{
            modal: {
                zIndex: 100,
                width: 'calc(100vw - 40px)',
                height: 'calc(100vh - 40px)',
                top: 0,
                left: 0,
                position: 'fixed',
                backgroundColor: '#3A3B3C'
            },
            closeButton: {
               display: "none"
            },
        }} open={shown} center onClose={onClose}>
            <MapView close={onClose} session={session} text={text} onMapClick={(map)=>{
                router.push(`/map/${map.slug}`)
            }} />
        </Modal>
    );
}