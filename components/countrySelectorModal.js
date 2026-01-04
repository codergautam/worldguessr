import { Modal } from "react-responsive-modal";
import { useState, useMemo } from "react";
import { useTranslation } from '@/components/useTranslations';
import nameFromCode from './utils/nameFromCode';
import { VALID_COUNTRY_CODES } from '@/serverUtils/timezoneToCountry';

export default function CountrySelectorModal({ shown, onClose, currentCountry, onSelect, session, ws }) {
  const { t: text } = useTranslation("common");
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return VALID_COUNTRY_CODES;

    const query = searchQuery.toLowerCase();
    return VALID_COUNTRY_CODES.filter(code => {
      const name = nameFromCode(code);
      return name.toLowerCase().includes(query) || code.toLowerCase().includes(query);
    });
  }, [searchQuery]);

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
      styles={{
        modal: {
          background: 'transparent',
          padding: 0,
          margin: 0,
          boxShadow: 'none',
          maxWidth: '100%',
          width: 'auto',
          overflow: 'visible'
        },
        overlay: {
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          overflow: 'hidden'
        }
      }}
    >
      <div className="join-party-card" style={{
        maxWidth: '600px',
        width: '90vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInUp 0.6s ease-out'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '15px', flexShrink: 0 }}>
          {text('selectCountryFlag') || 'Select Your Country Flag'}
        </h2>

        <input
          type="text"
          className="join-party-input"
          placeholder={text('searchCountry') || 'Search country...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            marginBottom: '15px',
            flexShrink: 0
          }}
        />

        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))',
          gap: '8px',
          marginBottom: '15px',
          paddingRight: '5px'
        }}>
          {filteredCountries.map(code => (
            <button
              key={code}
              onClick={() => handleSelect(code)}
              disabled={saving}
              style={{
                padding: '10px',
                background: currentCountry === code
                  ? 'rgba(76, 175, 80, 0.3)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: currentCountry === code
                  ? '2px solid #4CAF50'
                  : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.target.style.background = currentCountry === code
                    ? 'rgba(76, 175, 80, 0.3)'
                    : 'rgba(255, 255, 255, 0.1)';
                }
              }}
            >
              <span style={{ fontSize: '20px', flexShrink: 0 }}>
                {String.fromCodePoint(...[...code].map(c =>
                  0x1F1E6 - 65 + c.charCodeAt(0)
                ))}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nameFromCode(code)}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexShrink: 0 }}>
          {currentCountry && (
            <button
              className="join-party-button"
              onClick={handleRemoveFlag}
              disabled={saving}
              style={{
                background: 'rgba(244, 67, 54, 0.8)',
                borderColor: '#c62828'
              }}
            >
              {text('removeFlag') || 'Remove Flag'}
            </button>
          )}
          <button
            className="join-party-button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              borderColor: 'rgba(255, 255, 255, 0.3)'
            }}
          >
            {text('cancel') || 'Cancel'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
