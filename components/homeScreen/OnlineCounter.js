import { FaSignal } from 'react-icons/fa6';

export default function OnlineCounter({ count, onClick, active }) {
  return (
    <button
      type="button"
      className={`wg-onlineBtn ${active ? 'wg-onlineBtn--active' : ''}`}
      onClick={onClick}
      aria-label="Online players"
    >
      <FaSignal className="wg-onlineBtn__icon" />
      <span className="wg-onlineBtn__count">
        {count == null ? '...' : count.toLocaleString()} online
      </span>
    </button>
  );
}
