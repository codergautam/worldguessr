import Modal from './ui/Modal';
import VolumeSliders from './ui/volumeSliders';
import { useTranslation } from '@/components/useTranslations';

// Party-lobby audio controls: a real centered modal (unlike SettingsModal,
// which is a full-screen g2 page) holding ONLY the music/SFX sliders.
// Opened from the navbar sound button while waiting in a private lobby.
export default function SoundModal({ isOpen, onClose }) {
    const { t: text } = useTranslation("common");

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={text("audioSettings")}>
            <VolumeSliders rowClassName="soundModalRow" />
        </Modal>
    );
}
