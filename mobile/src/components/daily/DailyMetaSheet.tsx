import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Pressable } from '../ui/SfxPressable';
import type { DailyLocation, DailyMeta, DailyMetaView } from '@shared/daily/types';
import { t } from '../../shared/locale';
import { useGameUiScale } from '../../styles/responsive';
import { dailyColors } from './styles';

// Reveal tip for scheduled meta days (docs/daily-metas.md), phone edition.
// Web's desktop card sits beside the banner; on a phone the two fought for
// the bottom of the screen and both came out squished (owner, Sep 3). So the
// tip is a SHEET that floats in front of the score banner: the host renders
// ClassicEndBanner as usual and mounts this absolutely over it, bottom-
// aligned to the banner's own bottom margin. The banner stays visible behind
// and around it; Got it slides the sheet away. Web's <= 1100px rules in
// styles/daily.scss do the same.
//
// Deliberate size (owner: "no reason for it to take full width", "be
// deliberate with height", "move it a bit to left"): 80% of the screen width,
// 420pt max, pinned to the left edge like the desktop card; the pano is
// 16:10 and never taller than 25% of the screen (a 16:9 box capped at 20% read
// as zoomed in). On a 390x844 phone that is a 312pt sheet with ~195pt of pano
// + ~95pt of text + ~55pt of button = ~345pt, 41% of the screen; the answer
// pins and the banner's right side stay in view.
//
// Pano: the round's own Street View pointed at the meta (Maps Embed API),
// the web card's recipe (DailyMetaCard.js): ONE fixed-size iframe, PANO_W
// wide plus the chrome crop, that the wrapper page transform-scales to cover
// the box with the top crop carried inside the scale. Never viewport-sized:
// at a phone-width viewport the embed lays its address box out differently
// and a crop tuned for the 720px layout let a sliver of the "View on Google
// Maps" link through (owner, Sep 4).
//
// The sheet WAITS for the pano (owner, Sep 4: "wait for the pano to finish
// loading"). It mounts invisible and untouchable, so the banner behind it
// works, while the embed loads at full size underneath; the entrance runs
// PANO_REVEAL_DELAY_MS after the iframe's load event (the web card's
// "street view flash" hold, longer here because a phone paints the imagery
// later). SHEET_MAX_WAIT_MS caps the wait so a dead embed never hides the
// tip; the box just stays dark. Cycling to another meta reloads the embed:
// the box goes dark and the new framing fades + settles in like web's
// `ready` class.
//
// Layout: pano on top, then the lead row (Tip · category | Powered by
// geocoach.me), title, one paragraph, cycle dots when a location carries
// several metas, and the Got it button in the banner's Next recipe.
// Landscape phones drop the pano (no vertical room).

// Same key / endpoint as StreetViewWebView.
const GOOGLE_MAPS_API_KEY = 'AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI';
// google.com base so the embed iframe is same-origin with its wrapper — see
// the WRAPPER_BASE_URL note in StreetViewWebView (iOS rAF throttling).
const WRAPPER_BASE_URL = 'https://www.google.com/';
// The embed's native visible size, web's PANO_W; the box scales it down.
const PANO_W = 720;
const PANO_ASPECT = 1.6;
const PANO_H = PANO_W / PANO_ASPECT;
// Embed chrome crop (iframe px, inside the scale so it tracks the content),
// same numbers as the web card: the address / "View on Google Maps" box on
// top (~65px for one line, ~85px when the address wraps), the right-side
// controls, and the bottom logo / terms strip.
const CROP_TOP = 90;
const CROP_RIGHT = 60;
const CROP_BOTTOM = 40;
// The iframe's load event = the embed DOCUMENT; the imagery paints later.
// Web holds 700ms; the app holds longer (owner: "add more delay").
const PANO_REVEAL_DELAY_MS = 1000;
// Never hold the tip hostage to a dead embed.
const SHEET_MAX_WAIT_MS = 6000;
// A reloaded framing (next tip) fades + settles in over this long.
const PANO_IN_MS = 700;
// Credit link for the pack author (docs/daily-metas.md).
const GEOCOACH_URL = 'https://geocoach.me';
// Size budget, see the header comment.
const SHEET_WIDTH_SHARE = 0.8;
const SHEET_MAX_WIDTH = 420;
// Left-aligned like the desktop card (owner: centred read as an ad and hid
// the banner); the banner's right side stays visible beside it.
const SHEET_LEFT_INSET = 12;
const PANO_MAX_HEIGHT_SHARE = 0.25;
// ClassicEndBanner's card has marginBottom: 10; the sheet shares that
// baseline so the two read as one stack.
const BANNER_BOTTOM_MARGIN = 10;

// Street View zoom -> horizontal fov. The Embed API accepts 10..100.
function fovFromZoom(zoom?: number) {
  const z = Number.isFinite(zoom) ? (zoom as number) : 1;
  return Math.round(Math.min(100, Math.max(10, 180 / Math.pow(2, z))));
}

function metaEmbedUrl(location: Pick<DailyLocation, 'lat' | 'long' | 'heading'>, view: DailyMetaView) {
  const lat = Number.isFinite(view?.lat) ? (view.lat as number) : location.lat;
  const lng = Number.isFinite(view?.lng) ? (view.lng as number) : location.long;
  const heading = Number.isFinite(view?.heading) ? view.heading : (location.heading ?? 0);
  const pitch = Number.isFinite(view?.pitch) ? (view.pitch as number) : 0;
  return `https://www.google.com/maps/embed/v1/streetview?location=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&fov=${fovFromZoom(view?.zoom)}&heading=${heading}&pitch=${pitch}&language=en`;
}

function buildHtml(url: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
        /* Fixed-size surface (web: .daily-meta-card__pano iframe); fit()
           below writes the cover-fit transform. Fixed, not absolute: an
           oversized in-flow box would make the document scrollable on iOS. */
        iframe {
          position: fixed;
          top: 0;
          left: 0;
          width: ${PANO_W + CROP_RIGHT}px;
          height: ${PANO_H + CROP_TOP + CROP_BOTTOM}px;
          border: none;
          transform-origin: 0 0;
        }
      </style>
    </head>
    <body>
      <!-- Sensors explicitly denied: same-origin (base URL spoof) would
           otherwise grant them and the embed gyro-pans when the phone moves.
           onload: tells the sheet the embed document landed (imagery follows);
           an attribute, so an early load can never be missed. -->
      <iframe
        src="${url}"
        referrerpolicy="no-referrer-when-downgrade"
        allow="accelerometer 'none'; gyroscope 'none'; magnetometer 'none'; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        loading="eager"
        onload="window.ReactNativeWebView && window.ReactNativeWebView.postMessage('load')"
      ></iframe>
      <script>
        (function () {
          var frame = document.querySelector('iframe');
          // The web card's fitPano(): scale by the larger ratio, centre the
          // overflow both ways, carry the top crop inside the scale.
          function fit() {
            var w = window.innerWidth;
            var h = window.innerHeight;
            if (!w || !h) return;
            var s = Math.max(w / ${PANO_W}, h / ${PANO_H});
            var tx = -((${PANO_W} * s - w) / 2);
            var ty = -((${PANO_H} * s - h) / 2);
            frame.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ') translateY(${-CROP_TOP}px)';
          }
          fit();
          addEventListener('resize', fit);
          addEventListener('scroll', function () { scrollTo(0, 0); }, { passive: true });
        })();
      </script>
    </body>
    </html>
  `;
}

interface Props {
  location: Pick<DailyLocation, 'lat' | 'long' | 'heading'>;
  metas?: DailyMeta[];
  /** Called after the exit animation; the host unmounts the sheet. */
  onDismiss: () => void;
}

export default function DailyMetaSheet({ location, metas, onDismiss }: Props) {
  const list = metas ?? [];
  const [index, setIndex] = useState(0);
  // New round = new array from the locations payload: back to the first meta.
  useEffect(() => {
    setIndex(0);
  }, [metas]);
  const meta = list[Math.min(index, list.length - 1)];

  const { width, height } = useWindowDimensions();
  const { sc } = useGameUiScale();
  // Web's `(orientation: landscape) and (max-height: 500px)`: text only.
  const compactLandscape = width > height && height <= 500;
  const showsPano = !compactLandscape;
  const sheetWidth = Math.min(width * SHEET_WIDTH_SHARE, SHEET_MAX_WIDTH);
  const panoHeight = Math.min(sheetWidth / PANO_ASPECT, height * PANO_MAX_HEIGHT_SHARE);

  const html = useMemo(() => (meta ? buildHtml(metaEmbedUrl(location, meta.view)) : ''), [location, meta]);

  // Per framing: false while the embed (re)loads, true PANO_REVEAL_DELAY_MS
  // after its load event. A new framing clears a pending timer with it.
  const [panoReady, setPanoReady] = useState(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setPanoReady(false);
    return () => {
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
    };
  }, [html]);
  const onPanoMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data !== 'load') return;
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = setTimeout(() => {
      readyTimerRef.current = null;
      setPanoReady(true);
    }, PANO_REVEAL_DELAY_MS);
  };

  // The sheet shows once the first framing is ready; at once when there is
  // no pano; after the cap if the embed never reports in.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (revealed) return;
    if (!showsPano || panoReady) {
      setRevealed(true);
      return;
    }
    const cap = setTimeout(() => setRevealed(true), SHEET_MAX_WAIT_MS);
    return () => clearTimeout(cap);
  }, [revealed, showsPano, panoReady]);

  // Pano opacity + settle (web: iframe fade + metaPanoSettle on the box).
  // The first framing snaps to 1: the sheet's own entrance carries it in.
  const panoIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!panoReady) {
      panoIn.setValue(0);
      return;
    }
    if (!revealed) {
      panoIn.setValue(1);
      return;
    }
    Animated.timing(panoIn, { toValue: 1, duration: PANO_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [panoReady, revealed, panoIn]);
  const panoSettle = panoIn.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] });

  // Enter: rise + fade once revealed, the banner wrapper's own slide carries
  // the rest. Exit: the reverse, then onDismiss; the banner was behind it
  // all along.
  const enter = useRef(new Animated.Value(0)).current;
  const leavingRef = useRef(false);
  useEffect(() => {
    if (!revealed) return;
    Animated.timing(enter, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [revealed, enter]);
  const dismiss = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    Animated.timing(enter, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) onDismiss();
      else leavingRef.current = false;
    });
  };
  const animatedStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
  };

  if (!meta) return null;
  const many = list.length > 1;
  const lead = meta.category ? `${t('dailyMetaTip')} · ${meta.category}` : t('dailyMetaTip');

  return (
    <Animated.View style={[styles.sheet, { width: sheetWidth }, animatedStyle]} pointerEvents={revealed ? 'auto' : 'none'}>
      <LinearGradient
        colors={['rgba(36,87,52,0.78)', 'rgba(36,87,52,0.6)', 'rgba(36,87,52,0.42)']}
        locations={[0, 0.57, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {showsPano && (
        <Animated.View style={[styles.pano, { height: panoHeight, transform: [{ scale: panoSettle }] }]}>
          {/* Opacity on an inner wrapper so the box keeps its dark ground
              while the embed loads (web: the iframe fades, the box does not). */}
          <Animated.View style={[styles.panoFill, { opacity: panoIn }]}>
            <WebView
              source={{ html, baseUrl: WRAPPER_BASE_URL }}
              style={styles.webview}
              javaScriptEnabled
              allowsInlineMediaPlayback
              scrollEnabled={false}
              bounces={false}
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={['*']}
              onMessage={onPanoMessage}
            />
          </Animated.View>
        </Animated.View>
      )}

      <Pressable
        onPress={many ? () => setIndex((i) => (i + 1) % list.length) : undefined}
        sfx="none"
        style={[styles.text, compactLandscape && styles.textLandscape]}
      >
        <View style={styles.head}>
          <Text style={[styles.tag, { fontSize: sc(12) }]}>{lead}</Text>
          {/* Its own press target so a tap opens the site, not the next tip. */}
          <Text
            style={[styles.credit, { fontSize: sc(12) }]}
            onPress={() => { Linking.openURL(GEOCOACH_URL).catch(() => {}); }}
            suppressHighlighting
          >
            {t('dailyMetaPoweredBy', { brand: 'geocoach.me' })}
          </Text>
        </View>
        <Text style={[styles.title, { fontSize: sc(compactLandscape ? 15 : 16), lineHeight: sc(compactLandscape ? 18 : 20) }]}>
          {meta.title}
        </Text>
        <Text style={[styles.body, { fontSize: sc(compactLandscape ? 12.5 : 13.5), lineHeight: sc(compactLandscape ? 17 : 19) }]}>
          {meta.explanation}
        </Text>
        {many && (
          <View style={styles.dots}>
            {list.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotCurrent]} />
            ))}
          </View>
        )}
      </Pressable>

      {/* Same recipe as ClassicEndBanner's Next button (web .playAgain). */}
      <View style={[styles.btnRow, compactLandscape && styles.btnRowLandscape]}>
        <Pressable onPress={dismiss} style={({ pressed }) => [styles.btnPress, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
          <LinearGradient
            colors={['#245734', '#2e7042']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.btn, compactLandscape && styles.btnLandscape]}
          >
            <Text style={[styles.btnText, { fontSize: sc(compactLandscape ? 15 : 16) }]}>{t('gotIt')}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // In front of the banner (the host's bannerSlot is the containing box),
  // sharing its bottom margin. Opaque: the banner is right behind, and the
  // banner's glass would ghost its text through. ClassicEndBanner's radius
  // and hairline so the pair reads as one family.
  sheet: {
    position: 'absolute',
    bottom: BANNER_BOTTOM_MARGIN,
    left: SHEET_LEFT_INSET,
    zIndex: 5,
    elevation: 5,
    backgroundColor: dailyColors.cardBgSolid,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: dailyColors.cardBorder,
  },
  pano: {
    width: '100%',
    overflow: 'hidden',
    // The pano's own anti-flash colour (StreetViewWebView), not drift.
    backgroundColor: '#1a1a2e',
  },
  panoFill: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#1a1a2e' },
  text: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 2,
    gap: 3,
  },
  textLandscape: { paddingTop: 8, paddingBottom: 2, gap: 2 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  tag: { color: dailyColors.green, fontFamily: 'Lexend-SemiBold', flexShrink: 1 },
  credit: { color: '#fff', fontFamily: 'Lexend-SemiBold', flexShrink: 0 },
  title: { color: '#fff', fontFamily: 'Lexend-Bold' },
  body: { color: 'rgba(255,255,255,0.88)', fontFamily: 'Lexend' },
  dots: { flexDirection: 'row', gap: 5, marginTop: 6 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotCurrent: { backgroundColor: dailyColors.green },
  btnRow: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  btnRowLandscape: { paddingTop: 6, paddingBottom: 8 },
  btnPress: { width: '100%' },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnLandscape: { paddingVertical: 8 },
  btnText: { color: '#fff', fontFamily: 'Lexend-Bold' },
});
