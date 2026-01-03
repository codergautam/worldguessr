import { Modal } from "react-responsive-modal";
import { useState, useMemo } from "react";
import { useTranslation } from '@/components/useTranslations';
import nameFromCode from './utils/nameFromCode';
import { VALID_COUNTRY_CODES } from '@/serverUtils/timezoneToCountry';

export default function CountrySelectorModal({ shown, onClose, currentCountry, onSelect, session }) {
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
    if (!confirm(text('confirmRemoveFlag') || 'Remove your country flag?')) {
      return;
    }
    // Send empty string to opt out (not null - empty string means user chose to remove)
    await handleSelect('');
  };

  return (
    <Modal
      open={shown}
      onClose={onClose}
      center
      classNames={{ modal: 'country-selector-modal' }}
      styles={{
        modal: {
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 30, 15, 0.7) 100%)',
          color: 'white',
          borderRadius: '10px',
          padding: '20px'
        }
      }}
    >
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
        {text('selectCountryFlag') || 'Select Your Country Flag'}
      </h2>

      <input
        type="text"
        placeholder={text('searchCountry') || 'Search country...'}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '10px',
          marginBottom: '20px',
          borderRadius: '5px',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          background: 'rgba(255, 255, 255, 0.1)',
          color: 'white',
          fontSize: '16px'
        }}
      />

      <div style={{
        maxHeight: '400px',
        overflowY: 'auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '10px',
        marginBottom: '20px'
      }}>
        {filteredCountries.map(code => (
          <button
            key={code}
            onClick={() => handleSelect(code)}
            disabled={saving}
            style={{
              padding: '12px',
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
            <span style={{ fontSize: '24px' }}>
              {String.fromCodePoint(...[...code].map(c =>
                0x1F1E6 - 65 + c.charCodeAt(0)
              ))}
            </span>
            <span>{nameFromCode(code)}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        {currentCountry && (
          <button
            onClick={handleRemoveFlag}
            disabled={saving}
            style={{
              padding: '10px 20px',
              background: 'rgba(244, 67, 54, 0.7)',
              border: 'none',
              borderRadius: '5px',
              color: 'white',
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {text('removeFlag') || 'Remove Flag'}
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '5px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          {text('cancel') || 'Cancel'}
        </button>
      </div>
    </Modal>
  );
}
