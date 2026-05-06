import { useEffect, useState } from 'react';
import {
  FaXmark,
  FaSignal,
  FaEarthAmericas,
  FaUserGroup,
  FaUsers,
  FaHouse,
} from 'react-icons/fa6';
import { LuSwords } from 'react-icons/lu';

const STAT_DEFS = [
  { key: 'singleplayer', icon: <FaEarthAmericas />, label: 'Singleplayer' },
  { key: 'multiplayer', icon: <FaUsers />,         label: 'Multiplayer' },
  { key: 'ranked',      icon: <LuSwords />,        label: 'Ranked Duels' },
  { key: 'casual',      icon: <FaUserGroup />,     label: 'Casual Matches' },
  { key: 'parties',     icon: <FaUsers />,         label: 'In Parties' },
  { key: 'menu',        icon: <FaHouse />,         label: 'In Menu' },
];

export default function OnlineStatsPanel({ open, onClose, total, breakdown }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 360);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`wg-onlinePanel ${shown ? 'wg-onlinePanel--shown' : ''}`}
      role="dialog"
      aria-label="Online players breakdown"
    >
      <button className="wg-onlinePanel__close" onClick={onClose} aria-label="Close">
        <FaXmark />
      </button>

      <div className="wg-onlinePanel__header">
        <FaSignal className="wg-onlinePanel__headerIcon" />
        <div className="wg-onlinePanel__headerText">
          <div className="wg-onlinePanel__totalNum">
            {total == null ? '...' : total.toLocaleString()}
          </div>
          <div className="wg-onlinePanel__totalLabel">players online</div>
        </div>
      </div>

      <div className="wg-onlinePanel__grid">
        {STAT_DEFS.map((s) => {
          const val = breakdown?.[s.key];
          return (
            <div className="wg-onlinePanel__stat" key={s.key}>
              <span className="wg-onlinePanel__statIcon">{s.icon}</span>
              <div className="wg-onlinePanel__statText">
                <div className="wg-onlinePanel__statValue">
                  {val == null ? '—' : val.toLocaleString()}
                </div>
                <div className="wg-onlinePanel__statLabel">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
