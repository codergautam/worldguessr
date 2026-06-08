import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { FaSearch, FaPlus, FaHeart, FaUser, FaFlag, FaStar, FaFire, FaClock, FaLock, FaStopwatch, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useTranslation } from '@/components/useTranslations';
import { asset, localePath } from '@/lib/basePath';
import nameFromCode from '../utils/nameFromCode';
import config from '@/clientConfig';
import MapTile from './mapTile';
import MakeMapForm from './makeMap';
import { useMapSearch } from '../hooks/useMapSearch';
import CountriesPanel from './CountriesPanel';
import SpotlightCarousel from './SpotlightCarousel';
import { mapColor } from './mapBanner';

const countryFlagExamples = ['us', 'gb', 'fr', 'de', 'jp', 'br', 'in', 'au'];

export default function MapsPanel({
  open,
  onClose,
  session,
  gameOptions,
  setGameOptions,
  onMapClick,
  showOptions = false,
  showAllCountriesOption = true,
  hideCountryGuessrModes = false,
  showTimerOption = false,
  customChooseMapCallback,
  chosenMap,
}) {
  const { t: text, lang } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [mapHome, setMapHome] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [heartingMap, setHeartingMap] = useState('');
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [makeMap, setMakeMap] = useState({
    open: false, progress: false, name: '', description_short: '',
    description_long: '', data: '', edit: false, mapId: '',
  });

  const { handleSearch } = useMapSearch(session, setSearchResults, setSearchLoading);

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
    const onKey = (e) => { if (e.key === 'Escape' && !countriesOpen && !makeMap.open) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, countriesOpen, makeMap.open]);

  useEffect(() => { handleSearch(searchTerm); }, [searchTerm, handleSearch]);

  const refreshHome = useCallback(() => {
    setIsLoading(true);
    if (typeof window !== 'undefined') window.cConfig = config();
    const apiUrl = (typeof window !== 'undefined' && window.cConfig?.apiUrl) || config()?.apiUrl;
    if (!apiUrl) return;
    const isAnon = !session?.token?.secret;
    const url = `${apiUrl}/api/map/mapHome${isAnon ? '?anon=true' : ''}`;
    let backupTimeout = setTimeout(() => {
      import('../utils/backupMapHome.js').then(({ backupMapHome }) => {
        setMapHome(backupMapHome);
        setIsLoading(false);
      });
    }, 5000);
    fetch(url, isAnon ? { method: 'GET' } : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: session?.token?.secret, inCG: window.inCrazyGames }),
    })
      .then((r) => r.json())
      .then((d) => { setMapHome(d); setIsLoading(false); clearTimeout(backupTimeout); })
      .catch(() => {
        clearTimeout(backupTimeout);
        import('../utils/backupMapHome.js').then(({ backupMapHome }) => {
          setMapHome(backupMapHome);
          setIsLoading(false);
        });
      });
  }, [session?.token?.secret]);

  useEffect(() => { if (open) refreshHome(); }, [open, refreshHome]);

  const heartMap = useCallback((map) => {
    if (!session?.token?.secret) { toast.error('Not logged in'); return; }
    setHeartingMap(map.id);
    const apiUrl = (typeof window !== 'undefined' && window.cConfig?.apiUrl) || config()?.apiUrl;
    fetch(`${apiUrl}/api/map/heartMap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: session?.token?.secret, mapId: map.id }),
    })
      .then(async (r) => {
        setHeartingMap('');
        const json = await r.json();
        if (!(r.ok && json.success)) { toast.error(text(json.message || 'unexpectedError')); return; }
        toast(json.hearted ? text('heartedMap') : text('unheartedMap'), { type: json.hearted ? 'success' : 'info' });
        const newHeartsCnt = json.hearts;
        setMapHome((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((section) => {
            if (!Array.isArray(next[section])) return;
            next[section] = next[section].map((m) => (m.id === map.id ? { ...m, hearts: newHeartsCnt, hearted: json.hearted } : m));
            if (section === 'likedMaps') {
              next[section] = json.hearted
                ? [...next[section].filter((m) => m.id !== map.id), { ...map, hearts: newHeartsCnt, hearted: true }]
                : next[section].filter((m) => m.id !== map.id);
            }
          });
          return next;
        });
      })
      .catch(() => { setHeartingMap(''); toast.error('Unexpected error'); });
  }, [session, text]);

  const handleTileClick = useCallback((map) => {
    if (customChooseMapCallback) { customChooseMapCallback(map); return; }
    if (onMapClick) { onMapClick(map); return; }

    if (typeof window !== 'undefined') {
      const slug = map.countryMap || map.slug;
      const inCG = window.location.search.includes('crazygames') ? '&crazygames=true' : '';
      window.location.href = `${localePath('/')}?map=${slug}${inCG}`;
    }
  }, [customChooseMapCallback, onMapClick]);

  const filterMaps = useCallback((arr) => {
    if (!Array.isArray(arr)) return [];
    const q = searchTerm.toLowerCase();
    if (!q) return arr;
    return arr.filter((m) => {
      const localizedName = m.countryMap ? nameFromCode(m.countryMap, lang) : m.name;
      return (
        localizedName?.toLowerCase().includes(q)
        || m.name?.toLowerCase().includes(q)
        || m.description_short?.toLowerCase().includes(q)
        || m.created_by_name?.toLowerCase().includes(q)
      );
    });
  }, [searchTerm, lang]);

  const spotlight = useMemo(() => filterMaps(mapHome.spotlight), [mapHome.spotlight, filterMaps]);
  const popular = useMemo(() => filterMaps(mapHome.popular), [mapHome.popular, filterMaps]);
  const recent = useMemo(() => filterMaps(mapHome.recent), [mapHome.recent, filterMaps]);
  const myMaps = useMemo(() => filterMaps(mapHome.myMaps), [mapHome.myMaps, filterMaps]);
  const liked = useMemo(() => filterMaps(mapHome.likedMaps), [mapHome.likedMaps, filterMaps]);
  const countryMaps = useMemo(() => filterMaps(mapHome.countryMaps), [mapHome.countryMaps, filterMaps]);
  const reviewQueue = useMemo(() => filterMaps(mapHome.reviewQueue), [mapHome.reviewQueue, filterMaps]);

  const bodyRef = useRef(null);
  const mainRef = useRef(null);
  const sectionRefs = useRef({});
  const scrollToSection = (id) => {
    const target = sectionRefs.current[id];
    const scroller = mainRef.current;
    if (!target || !scroller) return;

    const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: scroller.scrollTop + delta - 14, behavior: 'smooth' });
  };

  const registerSectionRef = useCallback((id, el) => {
    sectionRefs.current[id] = el;
  }, []);

  const openPencilEdit = useCallback((map) => {
    setMakeMap({
      open: true, edit: true, mapId: map.id, name: map.name,
      description_short: map.description_short,
      description_long: map.description_long,
      data: map.data.map((loc) => JSON.stringify(loc)),
      progress: false,
    });
  }, []);

  if (!mounted) return null;

  if (makeMap.open) {
    return (
      <aside className={`wg-maps ${shown ? 'wg-maps--shown' : ''}`} role="dialog" aria-label="Make map">
        <div className="wg-maps__topbar">
          <h2 className="wg-maps__title wg-gmarket-bold">
            {makeMap?.edit ? text('editMap') : text('makeMap')}
          </h2>
          <button
            type="button"
            className="wg-maps__close"
            onClick={() => setMakeMap((m) => ({ ...m, open: false }))}
            aria-label="Close make map"
          >
            <FaXmark />
          </button>
        </div>
        <div className="wg-maps__body wg-maps__body--makeMap" ref={bodyRef}>
          <MakeMapForm
            map={makeMap}
            setMap={setMakeMap}
            createMap={(payload) => {
              const apiUrl = (typeof window !== 'undefined' && window.cConfig?.apiUrl) || config()?.apiUrl;
              fetch(`${apiUrl}/api/map/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: makeMap.edit ? 'edit' : 'create',
                  mapId: makeMap.mapId,
                  secret: session?.token?.secret,
                  name: payload.name,
                  description_short: payload.description_short,
                  description_long: payload.description_long,
                  data: payload.data,
                }),
              }).then(async (res) => {
                const json = await res.json().catch(() => null);
                if (res.ok) {
                  toast.success('Map ' + (makeMap.edit ? 'edited' : 'created'));
                  setMakeMap((m) => ({ ...m, open: false }));
                  refreshHome();
                } else {
                  setMakeMap((m) => ({ ...m, progress: false }));
                  toast.error(json?.message || 'Failed');
                }
              });
            }}
          />
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside
        className={`wg-maps ${shown ? 'wg-maps--shown' : ''}`}
        role="dialog"
        aria-label="Community maps"
      >

        <div className="wg-maps__topbar">
          <h2 className="wg-maps__title wg-gmarket-bold">{text('maps') || 'Maps'}</h2>
          <div className="wg-maps__search">
            <FaSearch className="wg-maps__searchIcon" aria-hidden="true" />
            <input
              type="text"
              className="wg-maps__searchInput"
              placeholder={text('searchForMaps') || 'Search maps'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <nav className="wg-maps__tabs">
            <button type="button" className="wg-maps__tab" onClick={() => scrollToSection('spotlight')}>
              <FaStar /><span>{text('spotlight') || 'Spotlight'}</span>
            </button>
            <button type="button" className="wg-maps__tab" onClick={() => scrollToSection('popular')}>
              <FaFire /><span>{text('popular') || 'Popular'}</span>
            </button>
            <button type="button" className="wg-maps__tab" onClick={() => scrollToSection('recent')}>
              <FaClock /><span>{text('recent') || 'Recent'}</span>
            </button>
          </nav>
          {showOptions && (
            <div className="wg-maps__opts" role="group" aria-label="Game options">
              <button
                type="button"
                className={`wg-maps__optBtn ${(gameOptions?.nm && gameOptions?.npz) ? 'wg-maps__optBtn--on' : ''}`}
                onClick={() => {
                  const enabled = !(gameOptions?.nm && gameOptions?.npz);
                  setGameOptions?.({ ...(gameOptions || {}), nm: enabled, npz: enabled });
                }}
                title={text('nmpz') || 'NMPZ'}
              >
                <FaLock />
                <span>NMPZ</span>
              </button>
              {showTimerOption && (
                <button
                  type="button"
                  className={`wg-maps__optBtn ${(gameOptions?.timePerRound > 0) ? 'wg-maps__optBtn--on' : ''}`}
                  onClick={() => {
                    const on = !(gameOptions?.timePerRound > 0);
                    setGameOptions?.({ ...(gameOptions || {}), timePerRound: on ? 30 : 0 });
                  }}
                  title={text('enableTimer') || 'Timer'}
                >
                  <FaStopwatch />
                  <span>Timer{gameOptions?.timePerRound > 0 ? ` · ${gameOptions.timePerRound}s` : ''}</span>
                </button>
              )}
              {showTimerOption && gameOptions?.timePerRound > 0 && (
                <label className="wg-maps__optRange" title="Seconds per round">
                  <input
                    type="range"
                    min="10"
                    max="300"
                    step="10"
                    value={gameOptions.timePerRound}
                    onChange={(e) => setGameOptions?.({ ...(gameOptions || {}), timePerRound: parseInt(e.target.value, 10) })}
                  />
                </label>
              )}
            </div>
          )}
          {session?.token?.secret && (
            <button
              type="button"
              className="wg-maps__createBtn"
              onClick={() => setMakeMap((m) => ({ ...m, open: true }))}
            >
              <FaPlus /><span>{text('makeMap') || 'Make map'}</span>
            </button>
          )}
          <button
            type="button"
            className="wg-maps__close"
            onClick={onClose}
            aria-label="Close"
          >
            <FaXmark />
            <span>{text('close') || 'Close'}</span>
          </button>
        </div>

        <div className="wg-maps__body" ref={bodyRef}>
          <aside className="wg-maps__sidebar">
            <div className="wg-maps__sidebarSection">
              <div className="wg-maps__sidebarTitle">
                <FaHeart aria-hidden="true" />
                <span>Favorites</span>
                <span className="wg-maps__sidebarCount">{liked.length}</span>
              </div>
              {liked.length === 0 ? (
                <div className="wg-maps__sidebarEmpty">
                  {session?.token?.secret
                    ? 'No favorites yet. Tap the heart on any map to save it here.'
                    : 'Sign in to favorite maps.'}
                </div>
              ) : (
                <ul className="wg-maps__sidebarList">
                  {liked.slice(0, 20).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="wg-maps__sidebarItem"
                        onClick={() => handleTileClick(m)}
                        title={m.name}
                      >
                        <FaHeart className="wg-maps__sidebarItemIcon wg-maps__sidebarItemIcon--fav" />
                        <span className="wg-maps__sidebarItemLabel">{m.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="wg-maps__sidebarDivider" aria-hidden="true" />

            <div className="wg-maps__sidebarSection">
              <div className="wg-maps__sidebarTitle">
                <FaUser aria-hidden="true" />
                <span>My maps</span>
                <span className="wg-maps__sidebarCount">{myMaps.length}</span>
              </div>
              {!session?.token?.secret ? (
                <div className="wg-maps__sidebarEmpty">Sign in to create maps.</div>
              ) : myMaps.length === 0 ? (
                <div className="wg-maps__sidebarEmpty">
                  You haven&apos;t made any maps yet.
                </div>
              ) : (
                <ul className="wg-maps__sidebarList">
                  {myMaps.slice(0, 20).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="wg-maps__sidebarItem"
                        onClick={() => handleTileClick(m)}
                        title={m.name}
                      >
                        <FaUser className="wg-maps__sidebarItemIcon" />
                        <span className="wg-maps__sidebarItemLabel">{m.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <main className="wg-maps__main" ref={mainRef}>

            {showAllCountriesOption && searchTerm.length === 0 && (
              <div className="wg-maps__modes">
                <MapTile
                  bgImage={`url("${asset('/world.jpg')}")`}
                  map={{ name: text('allCountries'), slug: 'all' }}
                  onClick={() => handleTileClick({ name: text('allCountries'), slug: 'all' })}
                  searchTerm={searchTerm}
                />
                {!hideCountryGuessrModes && (
                  <MapTile
                    bgImage={`url("${asset('/flags.jpg')}")`}
                    map={{ name: text('countryGuesser'), slug: '__countryGuesser' }}
                    onClick={() => handleTileClick({ name: text('countryGuesser'), slug: '__countryGuesser' })}
                    searchTerm={searchTerm}
                  />
                )}
                {!hideCountryGuessrModes && (
                  <MapTile
                    bgImage={`url("${asset('/continents.jpg')}")`}
                    map={{ name: text('continentGuesser'), slug: '__continentGuesser' }}
                    onClick={() => handleTileClick({ name: text('continentGuesser'), slug: '__continentGuesser' })}
                    searchTerm={searchTerm}
                  />
                )}
              </div>
            )}

            {countryMaps.length > 0 && searchTerm.length === 0 && (
              <button
                type="button"
                className="wg-maps__countryRow"
                onClick={() => setCountriesOpen(true)}
              >
                <span className="wg-maps__countryRowMain">
                  <FaFlag className="wg-maps__countryRowIcon" />
                  <span className="wg-maps__countryRowText">
                    <span className="wg-maps__countryRowTitle">Country maps</span>
                    <span className="wg-maps__countryRowHint">
                      Play on only one country! Currently 93 countries to choose from.
                    </span>
                  </span>
                </span>
                <span className="wg-maps__countryRowFlags" aria-hidden="true">
                  {countryFlagExamples.map((code) => (
                    <img
                      key={code}
                      src={`https://flagcdn.com/h60/${code}.png`}
                      alt=""
                      className="wg-maps__countryRowFlag"
                      loading="lazy"
                    />
                  ))}
                </span>
                <span className="wg-maps__countryRowChevron" aria-hidden="true">›</span>
              </button>
            )}

            {isLoading ? (
              <div className="wg-maps__loading">
                <span className="wg-maps__loadingSpinner" />
                <span>{text('loading') || 'Loading'}…</span>
              </div>
            ) : (
              <>
                {searchTerm.length > 0 && searchResults.length > 0 && (
                  <SectionGrid
                    id="searchResults"
                    title="Search results"
                    icon={<FaSearch aria-hidden="true" />}
                    maps={searchResults}
                    sessionSecret={session?.token?.secret}
                    staff={!!session?.token?.staff}
                    heartingMap={heartingMap}
                    searchTerm={searchTerm}
                    lang={lang}
                    onTileClick={handleTileClick}
                    onHeartMap={heartMap}
                    onPencilClick={openPencilEdit}
                    refreshHome={refreshHome}
                    registerSectionRef={registerSectionRef}
                  />
                )}

                {spotlight.length > 0 && searchTerm.length === 0 && (
                  <section
                    className="wg-maps__section wg-maps__section--spotlight"
                    ref={(el) => { sectionRefs.current.spotlight = el; }}
                  >
                    <h3 className="wg-maps__sectionTitle">
                      <FaStar aria-hidden="true" />
                      <span>{text('spotlight') || 'Spotlight'}</span>
                    </h3>
                    <SpotlightCarousel
                      maps={spotlight}
                      onPlay={handleTileClick}
                      lang={lang}
                    />
                  </section>
                )}
                <SectionGrid
                  id="popular"
                  title={text('popular') || 'Popular'}
                  icon={<FaFire aria-hidden="true" />}
                  maps={popular}
                  variant="popular"
                  defaultRows={3}
                  sessionSecret={session?.token?.secret}
                  staff={!!session?.token?.staff}
                  heartingMap={heartingMap}
                  searchTerm={searchTerm}
                  lang={lang}
                  onTileClick={handleTileClick}
                  onHeartMap={heartMap}
                  onPencilClick={openPencilEdit}
                  refreshHome={refreshHome}
                  registerSectionRef={registerSectionRef}
                />
                <SectionGrid
                  id="recent"
                  title={text('recent') || 'Recent'}
                  icon={<FaClock aria-hidden="true" />}
                  maps={recent}
                  variant="recent"
                  defaultRows={3}
                  sessionSecret={session?.token?.secret}
                  staff={!!session?.token?.staff}
                  heartingMap={heartingMap}
                  searchTerm={searchTerm}
                  lang={lang}
                  onTileClick={handleTileClick}
                  onHeartMap={heartMap}
                  onPencilClick={openPencilEdit}
                  refreshHome={refreshHome}
                  registerSectionRef={registerSectionRef}
                />
                {session?.token?.staff && (
                  <SectionGrid
                    id="reviewQueue"
                    title="Review queue"
                    icon={<FaStar aria-hidden="true" />}
                    maps={reviewQueue}
                    sessionSecret={session?.token?.secret}
                    staff={!!session?.token?.staff}
                    heartingMap={heartingMap}
                    searchTerm={searchTerm}
                    lang={lang}
                    onTileClick={handleTileClick}
                    onHeartMap={heartMap}
                    onPencilClick={openPencilEdit}
                    refreshHome={refreshHome}
                    registerSectionRef={registerSectionRef}
                  />
                )}
                {searchTerm.length > 0
                  && spotlight.length + popular.length + recent.length + searchResults.length === 0
                  && !searchLoading && (
                    <div className="wg-maps__empty">
                      <span>{text('noResultsFound') || 'No maps match your search.'}</span>
                    </div>
                  )}
              </>
            )}
          </main>
        </div>
      </aside>

      <CountriesPanel
        open={countriesOpen}
        onClose={() => setCountriesOpen(false)}
        countryMaps={mapHome.countryMaps || []}
        onPick={(map) => { setCountriesOpen(false); handleTileClick(map); }}
      />
    </>
  );
}

const SectionGrid = memo(function SectionGrid({
  id,
  title,
  icon,
  maps,
  variant,
  defaultRows,
  sessionSecret,
  staff,
  heartingMap,
  searchTerm,
  lang,
  onTileClick,
  onHeartMap,
  onPencilClick,
  refreshHome,
  registerSectionRef,
}) {
  const [expanded, setExpanded] = useState(false);
  const gridRef = useRef(null);

  const [perRow, setPerRow] = useState(4);

  useEffect(() => {
    const node = gridRef.current;
    if (!node) return undefined;

    const tileMin = 220;
    const gap = 12;
    const compute = (w) => {
      if (!w) return;
      const n = Math.max(1, Math.floor((w + gap) / (tileMin + gap)));
      setPerRow((prev) => (prev === n ? prev : n));
    };
    compute(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      compute(entry?.contentRect?.width || node.clientWidth);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  if (!maps || maps.length === 0) return null;

  const limit = defaultRows && defaultRows > 0 ? defaultRows * perRow : maps.length;
  const showToggle = maps.length > limit;
  const visible = !showToggle || expanded ? maps : maps.slice(0, limit);

  return (
    <section
      className={`wg-maps__section ${variant ? `wg-maps__section--${variant}` : ''}`}
      ref={(el) => registerSectionRef?.(id, el)}
    >
      <h3 className="wg-maps__sectionTitle">
        {icon}
        <span>{title}</span>
      </h3>
      <div className="wg-maps__grid" ref={gridRef}>
        {visible.map((m, i) => {
          const displayMap = m.countryMap ? { ...m, name: nameFromCode(m.countryMap, lang) } : m;

          const { accent } = mapColor(m);
          const stableKey = m.id || m.slug || m.countryMap || `${id}-${i}`;
          return (
            <div
              key={stableKey}
              className="wg-maps__tile"
              style={{ '--map-accent': accent }}
            >
              <MapTile
                map={displayMap}
                bgImage={undefined}
                canHeart={!!sessionSecret && heartingMap !== m.id}
                onClick={() => onTileClick?.(m)}
                country={m.countryMap}
                searchTerm={searchTerm}
                secret={sessionSecret}
                refreshHome={refreshHome}
                showEditControls={(m.yours && id === 'myMaps') || staff}
                showReviewOptions={staff && id === 'reviewQueue'}
                onPencilClick={onPencilClick}
                onHeart={() => onHeartMap?.(m)}
              />
            </div>
          );
        })}
      </div>
      {showToggle && (
        <button
          type="button"
          className="wg-maps__expandBtn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
          <span>{expanded ? 'Show less' : 'Show all'}</span>
        </button>
      )}
    </section>
  );
});
