import { useEffect, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { useTranslation } from '@/components/useTranslations';

const normalTile = 'https://tile.openstreetmap.org/4/8/5.png';
const satelliteTile =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/8';
const terrainTile = 'https://a.tile.opentopomap.org/4/8/5.png';

const hybridOverlay =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/4/5/8';

const mapTypes = [
  { v: 'm', bg: `url("${normalTile}")` },
  { v: 's', bg: `url("${satelliteTile}")` },
  { v: 'p', bg: `url("${terrainTile}")` },
  { v: 'y', bg: `url("${satelliteTile}")`, overlay: `url("${hybridOverlay}")` },
];

export default function HomeSettingsPanel({
  open,
  onClose,
  options,
  setOptions,
  inCrazyGames,
  inGameDistribution,
}) {
  const { t: text, lang } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !options) return null;

  const setUnits = (v) => setOptions((p) => ({ ...p, units: v }));
  const setMapType = (v) => setOptions((p) => ({ ...p, mapType: v }));
  const setLanguage = (v) => {
    setOptions((p) => ({ ...p, language: v }));
    try { window.localStorage.setItem('lang', v); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('langChange', { detail: v })); } catch (e) {}
  };
  const setRamUsage = (v) => setOptions((p) => ({ ...p, ramUsage: v }));

  const units = options.units || 'metric';
  const mapType = options.mapType || 'm';
  const language = options.language || lang || 'en';

  return (
    <>
      <div
        className={`wg-settings__scrim ${shown ? 'wg-settings__scrim--shown' : ''}`}
        onClick={onClose}
      />
      <aside
        className={`wg-settings ${shown ? 'wg-settings--shown' : ''}`}
        role="dialog"
        aria-label="Settings"
      >
        <div className="wg-settings__topbar">
          <h2 className="wg-settings__title wg-gmarket-bold">
            {text('settings') || 'Settings'}
          </h2>

          <button
            type="button"
            className="wg-locPanel__close wg-settings__close"
            onClick={onClose}
            aria-label={text('back') || 'Close'}
          >
            <FaXmark />
          </button>
        </div>

        <div className="wg-settings__body">

          <SettingBlock title={text('units') || 'Units'}>
            <SegRow>
              <SegBtn
                active={units === 'metric'}
                onClick={() => setUnits('metric')}
                label="Metric"
                sub="km · meters"
              />
              <SegBtn
                active={units === 'imperial'}
                onClick={() => setUnits('imperial')}
                label="Imperial"
                sub="miles · feet"
              />
            </SegRow>
            <Visualisation>
              <span>Distance display</span>
              <strong>
                {units === 'metric' ? '1,247 km away' : '775 mi away'}
              </strong>
            </Visualisation>
          </SettingBlock>

          <SettingBlock title={text('mapType') || 'Map Type'}>
            <div className="wg-settings__mapGrid">
              {mapTypes.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  className={`wg-settings__mapTile ${mapType === opt.v ? 'wg-settings__mapTile--active' : ''}`}
                  onClick={() => setMapType(opt.v)}
                >
                  <span
                    className="wg-settings__mapPreview"
                    style={{ backgroundImage: opt.bg }}
                  >
                    {opt.overlay && (
                      <span
                        className="wg-settings__mapPreviewOverlay"
                        style={{ backgroundImage: opt.overlay }}
                      />
                    )}
                  </span>
                  <span className="wg-settings__mapLabel">
                    {opt.v === 'm' ? text('normal') || 'Normal'
                     : opt.v === 's' ? text('satellite') || 'Satellite'
                     : opt.v === 'p' ? text('terrain') || 'Terrain'
                     : text('hybrid') || 'Hybrid'}
                  </span>
                </button>
              ))}
            </div>
          </SettingBlock>

          {!inCrazyGames && !inGameDistribution && (
            <SettingBlock title={text('language') || 'Language'}>
              <div className="wg-settings__langGrid">
                {[
                  { v: 'en', flag: 'us', label: 'English' },
                  { v: 'es', flag: 'es', label: 'Español' },
                  { v: 'fr', flag: 'fr', label: 'Français' },
                  { v: 'de', flag: 'de', label: 'Deutsch' },
                  { v: 'ru', flag: 'ru', label: 'Русский' },
                ].map((l) => (
                  <button
                    key={l.v}
                    type="button"
                    className={`wg-settings__langTile ${language === l.v ? 'wg-settings__langTile--active' : ''}`}
                    onClick={() => setLanguage(l.v)}
                  >
                    <img
                      className="wg-settings__langFlag"
                      src={`https://flagcdn.com/w80/${l.flag}.png`}
                      srcSet={`https://flagcdn.com/w160/${l.flag}.png 2x`}
                      alt=""
                    />
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </SettingBlock>
          )}

          {!inCrazyGames && !inGameDistribution && (
            <SettingBlock title="Debug">
              <ToggleRow
                label="Show RAM usage"
                sub="Renders an FPS/memory overlay during play."
                checked={!!options.ramUsage}
                onChange={(v) => setRamUsage(v)}
              />
            </SettingBlock>
          )}
        </div>

        <div className="wg-settings__footer">
          <a href="https://github.com/codergautam/worldguessr" target="_blank" rel="noreferrer">GitHub</a>
          <span className="wg-settings__footerSep">·</span>
          <a href="https://www.coolmathgames.com/0-worldguessr" target="_blank" rel="noreferrer">Coolmath Games</a>
          <span className="wg-settings__footerSep">·</span>
          <a href="https://worldguessr.com/privacy.html" target="_blank" rel="noreferrer">Terms &amp; Privacy</a>
        </div>
      </aside>
    </>
  );
}

function SettingBlock({ title, children }) {
  return (
    <div className="wg-settings__block">
      <div className="wg-settings__blockHead">
        <span className="wg-settings__blockTitle wg-gmarket-bold">{title}</span>
        <span className="wg-settings__blockLine" />
      </div>
      {children}
    </div>
  );
}

function SegRow({ children }) {
  return <div className="wg-settings__seg">{children}</div>;
}

function SegBtn({ active, onClick, label, sub }) {
  return (
    <button
      type="button"
      className={`wg-settings__segBtn ${active ? 'wg-settings__segBtn--active' : ''}`}
      onClick={onClick}
    >
      <span className="wg-settings__segLabel">{label}</span>
      {sub && <span className="wg-settings__segSub">{sub}</span>}
    </button>
  );
}

function Visualisation({ children }) {
  return <div className="wg-settings__viz">{children}</div>;
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <button
      type="button"
      className="wg-settings__toggleRow"
      onClick={() => onChange(!checked)}
    >
      <div className="wg-settings__toggleText">
        <span className="wg-settings__toggleLabel">{label}</span>
        {sub && <span className="wg-settings__toggleSub">{sub}</span>}
      </div>
      <span className={`wg-settings__toggle ${checked ? 'wg-settings__toggle--on' : ''}`}>
        <span className="wg-settings__toggleKnob" />
      </span>
    </button>
  );
}
