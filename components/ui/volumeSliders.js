import { useState } from 'react';
import { useTranslation } from '@/components/useTranslations';
import { getMusicVolume, setMusicVolume, getSfxVolume, setSfxVolume, playSfx } from '@/components/utils/audio';

// The music + SFX volume rows, shared by the full settings page and the
// party-lobby sound modal. Local mirror (0-100) of the audio manager's
// persisted 0-1 volumes; every change writes through immediately (music
// ramps live, SFX applies to the next sound). Sliding music up from 0 also
// restarts it — that lives in setMusicVolume, the drag is the user gesture
// it needs. rowClassName picks the host surface's row layout; the sliders
// themselves are always .settingsVolumeSlider.
export default function VolumeSliders({ rowClassName = "settingsModalInner" }) {
    const { t: text } = useTranslation("common");
    const [musicVol, setMusicVol] = useState(() => Math.round(getMusicVolume() * 100));
    const [sfxVol, setSfxVol] = useState(() => Math.round(getSfxVolume() * 100));

    return (
        <>
            {/* Bare range inputs on purpose — g2_input is select/checkbox
                chrome (same precedent as mapView's timer slider). */}
            <div className={rowClassName}>
                <label htmlFor="musicVolume">{text("musicVolume")}: </label>
                <input type="range" id="musicVolume" min="0" max="100" step="1"
                    className="settingsVolumeSlider"
                    value={musicVol}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); setMusicVol(v); setMusicVolume(v / 100); }} />
                <span style={{ minWidth: '48px', textAlign: 'right', alignSelf: 'center' }}>{musicVol}%</span>
            </div>

            <div className={rowClassName}>
                <label htmlFor="sfxVolume">{text("sfxVolume")}: </label>
                <input type="range" id="sfxVolume" min="0" max="100" step="1"
                    className="settingsVolumeSlider"
                    value={sfxVol}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); setSfxVol(v); setSfxVolume(v / 100); }}
                    // Release preview: one click at the new level (music
                    // previews itself — it keeps playing through the drag).
                    onPointerUp={() => playSfx('click_2')} />
                <span style={{ minWidth: '48px', textAlign: 'right', alignSelf: 'center' }}>{sfxVol}%</span>
            </div>
        </>
    );
}
