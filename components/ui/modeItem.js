/* ===========================================================================
 *  ONE HOME MENU ENTRY.
 *
 *  A row: an outline glyph, then the mode's name (styles/homeMenu.css).
 *
 *  `children` is for a live accessory after the label — the daily streak
 *  pill is the one there is (components/daily/DailyMenuItem.js). Everything
 *  else (onClick, disabled, aria-*) passes straight through to the <button>,
 *  so the callers keep their own gates and handlers unchanged.
 * ======================================================================== */
export default function ModeItem({ icon, label, className = '', children, ...props }) {
  return (
    <button type="button" className={`home__mode ${className}`} {...props}>
      <span className="home__mode__icon" aria-hidden="true">{icon}</span>
      <span className="home__mode__label">{label}</span>
      {children}
    </button>
  );
}
