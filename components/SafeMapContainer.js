import dynamic from 'next/dynamic';
import ErrorBoundary from './ErrorBoundary';

/**
 * Drop-in replacement for react-leaflet's <MapContainer>, wrapped in an
 * ErrorBoundary.
 *
 * Production telemetry shows an intermittent fatal client-side crash:
 *
 *     a.Map is not a constructor   (TypeError, react-leaflet MapContainer)
 *
 * `a` is the leaflet module and `a.Map` is its Map class — undefined here when
 * the leaflet chunk loads partially / fails on certain clients (old Chrome,
 * crawlers, flaky networks). The throw happens in MapContainer's ref callback
 * during commit, so with no boundary it unmounts the whole React tree and
 * Next.js shows its full-screen "client-side exception" page.
 *
 * Wrapping it here means a leaflet failure only blanks the map area — the
 * navbar, menus and the rest of the app keep working, and the user can reload
 * to re-fetch the chunk. Every call site already funnels through a local
 * `const MapContainer = dynamic(() => import('react-leaflet')...)`, so aliasing
 * that name to this component protects all of them with no JSX changes.
 */
const RLMapContainer = dynamic(
  () => Promise.all([
    import('react-leaflet'),
    // Registers the fluidWheelZoom handler on L.Map before any map mounts.
    // Maps opt in per-container via the fluidWheelZoom prop.
    import('@/lib/leafletFluidZoom'),
    // Settles interrupted CSS zoom animations before any new motion starts.
    import('@/lib/leafletSettleZoomAnim'),
    // Reprojects vectors every frame during flyTo / wheel-glide zooms instead
    // of CSS-scaling stale geometry — keeps lines crisp and glued to their
    // points during (and despite interruptions of) camera flights.
    import('@/lib/leafletLiveVectors'),
  ]).then(([m]) => m.MapContainer),
  { ssr: false },
);

function MapFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: '#1b2838',
        color: '#fff',
        textAlign: 'center',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 15, opacity: 0.9 }}>The map failed to load.</div>
      <button
        type="button"
        onClick={() => { try { window.location.reload(); } catch (_) {} }}
        style={{
          padding: '8px 18px',
          fontSize: 14,
          fontWeight: 600,
          color: '#1b2838',
          background: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}

export default function SafeMapContainer(props) {
  return (
    <ErrorBoundary name="leaflet-map" fallback={<MapFallback />}>
      {/* Fluid wheel zoom (lib/leafletFluidZoom.js) is the app-wide default;
          the stock stepped scrollWheelZoom must stay off or both handlers
          would fire per wheel event. Call sites can override any prop.

          zoomSnap 0 frees mobile PINCH: with the default snap of 1, Leaflet's
          TouchZoom._onTouchEnd runs the final zoom through _limitZoom, which
          rounds it to the nearest whole level — every pinch ended with the
          map lurching off the zoom the fingers chose. Desktop wheel zoom
          still RESTS on whole levels (crisp raster labels): the fluid handler
          hard-snaps its landing target to 1 regardless of zoomSnap. */}
      <RLMapContainer scrollWheelZoom={false} fluidWheelZoom={true} zoomSnap={0} {...props} />
    </ErrorBoundary>
  );
}
