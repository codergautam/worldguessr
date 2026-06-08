import { Modal } from "react-responsive-modal";
import { useState, useMemo } from "react";
import { FaXmark } from 'react-icons/fa6';
import { useTranslation } from '@/components/useTranslations';
import nameFromCode from './utils/nameFromCode';
import { VALID_COUNTRY_CODES } from '@/serverUtils/timezoneToCountry';

export default function CountrySelectorModal({ shown, onClose, currentCountry, onSelect, session, ws }) {
  const { t: text, lang } = useTranslation("common");
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return VALID_COUNTRY_CODES;

    const query = searchQuery.toLowerCase();
    return VALID_COUNTRY_CODES.filter(code => {
      const name = nameFromCode(code, lang);
      return name.toLowerCase().includes(query) || code.toLowerCase().includes(query);
    });
  }, [searchQuery, lang]);

  const handleSelect = async (countryCode) => {
    setSaving(true);
    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/updateCountryCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: session?.token?.secret,
          countryCode
        })
      });

      if (response.ok) {
        const data = await response.json();
        onSelect(data.countryCode);

        // Send WebSocket message to update countryCode in real-time
        if (ws) {
          ws.send(JSON.stringify({
            type: 'updateCountryCode',
            countryCode: data.countryCode || ''
          }));
        }

        onClose();
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to update country');
      }
    } catch (error) {
      alert('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFlag = async () => {
    await handleSelect('');
  };

  return (
    <Modal
      open={shown}
      onClose={onClose}
      center
      showCloseIcon={false}
      animationDuration={180}
      classNames={{
        modal: 'wg-flagPicker__modal',
        overlay: 'wg-flagPicker__overlay',
      }}
      styles={{
        modal: {
          background: 'transparent',
          padding: 0,
          margin: 0,
          boxShadow: 'none',
          maxWidth: '100%',
          width: 'auto',
          overflow: 'visible',
          zIndex: 100000,
        },
        overlay: {
          background: 'rgba(0, 0, 0, 0.78)',
          overflow: 'hidden',
          zIndex: 100000,
        },
        root: { zIndex: 100000 },
      }}
    >
      <div className="wg-flagPicker">
        <button
          type="button"
          className="wg-flagPicker__close"
          onClick={onClose}
          aria-label="Close"
        >
          <FaXmark />
        </button>

        <h2 className="wg-flagPicker__title">
          {text('selectCountryFlag') || 'Select your country flag'}
        </h2>

        <input
          type="text"
          className="wg-flagPicker__search"
          placeholder={text('searchCountry') || 'Search country'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />

        <div className="wg-flagPicker__grid">
          {filteredCountries.map(code => (
            <button
              key={code}
              type="button"
              onClick={() => handleSelect(code)}
              disabled={saving}
              className={`wg-flagPicker__item ${currentCountry === code ? 'wg-flagPicker__item--on' : ''}`}
            >
              <img
                src={`https://flagcdn.com/w80/${code.toLowerCase()}.png`}
                srcSet={`https://flagcdn.com/w160/${code.toLowerCase()}.png 2x`}
                alt={code}
                className="wg-flagPicker__flag"
                loading="lazy"
              />
              <span className="wg-flagPicker__name">
                {nameFromCode(code, lang)}
              </span>
            </button>
          ))}
        </div>

        <div className="wg-flagPicker__actions">
          {currentCountry && (
            <button
              type="button"
              className="wg-flagPicker__btn wg-flagPicker__btn--danger"
              onClick={handleRemoveFlag}
              disabled={saving}
            >
              {text('removeFlag') || 'Remove flag'}
            </button>
          )}
          <button
            type="button"
            className="wg-flagPicker__btn wg-flagPicker__btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            {text('cancel') || 'Cancel'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
