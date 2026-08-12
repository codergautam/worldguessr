import { useState, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';
import { ImageBackground } from 'expo-image';
import { backgroundUrlForSku } from '../services/siteBackground';
import { useSiteBackgroundStore } from '../store/siteBackgroundStore';

/* ===========================================================================
 *  THE PHOTOGRAPH BEHIND EVERY MENU.
 *
 *  ONE COMPONENT, fourteen screens. It used to be fourteen copies of
 *  `<ImageBackground source={require('../assets/street2.jpg')} …>`, which was
 *  fine while everybody saw the same picture and impossible the moment they
 *  did not: a purchased background that showed on home and vanished on the
 *  shop is not a background, it is a bug with a price tag.
 *
 *  Web solves this with a single CSS custom property (--site-bg) that every
 *  surface reads, so one write swaps all of them at once. This is that, as a
 *  component.
 *
 *  THE STOCK IMAGE IS STILL BUNDLED and does three jobs: it is what everybody
 *  who owns nothing sees, it is the `placeholder` under a purchased image that
 *  has not downloaded yet, and it is the fallback if that download fails. A
 *  failed <Image> in React Native does not throw — it paints transparent — so
 *  without the last of those, a 404 or a dead connection would render a black
 *  rectangle behind the whole menu rather than a background.
 *
 *  ONE SCREEN DELIBERATELY DOES NOT USE THIS: GlobalErrorBoundary keeps its own
 *  require(). It renders when the app has already crashed, and the last thing
 *  that screen should depend on is a store and a network fetch.
 * ======================================================================== */

const STOCK = require('../../assets/street2.jpg');
const BACKGROUND_TRANSITION_MS = 280;

interface Props {
  /** Almost always StyleSheet.absoluteFill(Object) — this is a backdrop layer. */
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  /** Optional screen-specific softening. Keep zero on image-led surfaces. */
  blurRadius?: number;
  children?: ReactNode;
  /**
   * WHOSE background to paint. Omit for the viewer's own, which is what every
   * screen wants and what the store holds.
   *
   * IT EXISTS FOR ONE SCREEN: a PUBLIC profile, which is about somebody else.
   * Painting the reader's own city behind a stranger's stats put the wrong
   * person's purchase on the one screen that exists to show off a player. Pass
   * their sku and this paints theirs; `null` is an explicit "they have nothing
   * equipped, use stock" and is NOT the same as omitting the prop.
   *
   * Web does the identical thing with a scoped --profile-bg on pages/user.js.
   */
  sku?: string | null;
}

export default function SiteBackground({
  style,
  imageStyle,
  blurRadius = 0,
  children,
  sku: skuOverride,
}: Props) {
  const ownSku = useSiteBackgroundStore((s) => s.sku);
  // `undefined` means "not overridden" and falls through to the store; `null`
  // means "this person has nothing" and must NOT fall through, or a public
  // profile with no background would silently borrow the reader's.
  const sku = skuOverride === undefined ? ownSku : skuOverride;
  // Remembered per URL, not as a bare boolean: equipping a different city has
  // to get a fresh attempt rather than inheriting the last one's failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const url = backgroundUrlForSku(sku);
  const remote = url && url !== failedUrl ? url : null;

  return (
    <ImageBackground
      source={remote ? { uri: remote } : STOCK}
      // Paints instantly from the bundle while a purchased image downloads, so
      // the gap on a first-ever view is the stock photograph rather than black.
      // Only the first view: 'memory-disk' means every later launch is a cache
      // hit with no network at all.
      placeholder={remote ? STOCK : undefined}
      placeholderContentFit="cover"
      cachePolicy="memory-disk"
      contentFit="cover"
      blurRadius={blurRadius}
      // Cross-dissolve source changes so equipping a city feels like one scene
      // replacing another instead of a full-screen image snapping in place.
      transition={{
        duration: BACKGROUND_TRANSITION_MS,
        timing: 'ease-out',
        effect: 'cross-dissolve',
      }}
      onError={() => { if (remote) setFailedUrl(remote); }}
      style={style ?? StyleSheet.absoluteFillObject}
      imageStyle={imageStyle}
    >
      {children}
    </ImageBackground>
  );
}
