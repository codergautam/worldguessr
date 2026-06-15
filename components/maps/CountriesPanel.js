import React, { useEffect, useMemo, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { FaSearch } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import nameFromCode from '../utils/nameFromCode';

const sortOptions = [
  { key: 'locations', label: 'Locations' },
  { key: 'alpha', label: 'A–Z' },
];

export default function CountriesPanel({ open, onClose, countryMaps, onPick }) {
  const { t: text, lang } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('locations');

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    setShown(false);
    setSearch('');
    setSort('locations');
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = [...(countryMaps || [])];

    if (sort === 'locations') {
      arr.sort((a, b) => (b.locations ?? b.locationCount ?? b.data?.length ?? 0)
        - (a.locations ?? a.locationCount ?? a.data?.length ?? 0));
    } else {
      arr.sort((a, b) => {
        const an = (a.countryMap ? nameFromCode(a.countryMap, lang) : a.name) || '';
        const bn = (b.countryMap ? nameFromCode(b.countryMap, lang) : b.name) || '';
        return an.localeCompare(bn);
      });
    }

    if (!q) return arr;
    return arr.filter((m) => {
      const n = (m.countryMap ? nameFromCode(m.countryMap, lang) : m.name) || '';
      return n.toLowerCase().includes(q) || m.countryMap?.toLowerCase().includes(q);
    });
  }, [countryMaps, search, sort, lang]);

  if (!mounted) return null;

  return (
    <aside
      className={`wg-countries ${shown ? 'wg-countries--shown' : ''}`}
      role="dialog"
      aria-label="Country maps"
    >
      <div className="wg-countries__topbar">
        <h2 className="wg-countries__title wg-gmarket-bold">Country maps</h2>
        <div className="wg-countries__search">
          <FaSearch className="wg-countries__searchIcon" aria-hidden="true" />
          <input
            type="text"
            className="wg-countries__searchInput"
            placeholder={text('searchForMaps') || 'Search a country'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="wg-countries__sort" role="group" aria-label="Sort countries">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`wg-countries__sortBtn ${sort === opt.key ? 'wg-countries__sortBtn--on' : ''}`}
              onClick={() => setSort(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="wg-countries__close"
          onClick={onClose}
          aria-label="Close"
        >
          <FaXmark />
          <span>{text('close') || 'Close'}</span>
        </button>
      </div>

      <div className="wg-countries__body">
        {filtered.length === 0 ? (
          <div className="wg-countries__empty">
            {countryMaps?.length === 0
              ? 'No country maps available yet.'
              : `No countries match "${search}".`}
          </div>
        ) : (
          <ul className="wg-countries__grid">
            {filtered.map((m) => {
              const name = m.countryMap ? nameFromCode(m.countryMap, lang) : m.name;
              const locCount = m.locations ?? m.locationCount ?? m.data?.length ?? null;
              return (
                <li key={m.id || m.countryMap}>
                  <button
                    type="button"
                    className="wg-countries__item"
                    onClick={() => onPick?.(m)}
                    title={name}
                  >
                    {m.countryMap && (
                      <span className="wg-countries__flagBox">
                        <img
                          src={`https://flagcdn.com/h240/${m.countryMap.toLowerCase()}.png`}
                          alt=""
                          className="wg-countries__flag"
                          loading="lazy"
                        />
                      </span>
                    )}
                    <span className="wg-countries__name">{name}</span>
                    {sort === 'locations' && locCount != null && (
                      <span className="wg-countries__plays">{locCount.toLocaleString()} locations</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
