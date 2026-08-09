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

interface Props {
  /** Almost always StyleSheet.absoluteFill(Object) — this is a backdrop layer. */
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  children?: ReactNode;
}

export default function SiteBackground({ style, imageStyle, children }: Props) {
  const sku = useSiteBackgroundStore((s) => s.sku);
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
      // No crossfade, matching web and the fadeDuration={0} these call sites
      // already passed: this is a backdrop that is either there or being
      // replaced, and a fade on it reads as the screen loading twice.
      transition={0}
      onError={() => { if (remote) setFailedUrl(remote); }}
      style={style ?? StyleSheet.absoluteFillObject}
      imageStyle={imageStyle}
    >
      {children}
    </ImageBackground>
  );
}
