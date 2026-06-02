import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { withTiming, withSpring } from './daily/anims';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isVersionHigher } from '../utils/versionCompare';
import { useAuthStore } from '../store/authStore';
import { t } from '../shared';
import changelogData from '../data/changelog.json';

const LAST_VERSION_KEY = 'wg_last_version';

interface ChangelogEntry {
  version: string;
  date?: string;
  change?: string;
  postedBy?: string;
}

const changelog = changelogData as ChangelogEntry[];

function getLatestVersion(entries: ChangelogEntry[]): ChangelogEntry | null {
  if (!entries || entries.length === 0) return null;
  let latest = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (isVersionHigher(entries[i].version, latest.version)) {
      latest = entries[i];
    }
  }
  return latest;
}

// ── Minimal markdown renderer for the changelog subset ───────────────────────
// Supports: ### / ## / # headers, **bold**, "-"/"*" bullets, and paragraphs.
// Returns an array of React nodes (one per line/block).
type InlineSeg = { text: string; bold: boolean };

function parseInline(text: string): InlineSeg[] {
  const segments: InlineSeg[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  return segments;
}

function InlineText({ text, style }: { text: string; style?: any }) {
  const segs = parseInline(text);
  return (
    <Text style={style}>
      {segs.map((s, i) => (
        <Text key={i} style={s.bold ? styles.bold : undefined}>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

function ChangelogBody({ change }: { change: string }) {
  const lines = change.split('\n');
  return (
    <View>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (line.trim() === '') return <View key={i} style={styles.spacer} />;

        if (line.startsWith('### ')) {
          return (
            <Text key={i} style={styles.h3}>
              {line.slice(4)}
            </Text>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <Text key={i} style={styles.h2}>
              {line.slice(3)}
            </Text>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <Text key={i} style={styles.h1}>
              {line.slice(2)}
            </Text>
          );
        }
        const bulletMatch = line.match(/^[-*]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <InlineText text={bulletMatch[1]} style={styles.bulletText} />
            </View>
          );
        }
        return <InlineText key={i} text={line} style={styles.paragraph} />;
      })}
    </View>
  );
}

interface Props {
  /** Force the modal open regardless of version/login gating (demo/testing). */
  forceOpen?: boolean;
  /** Called when a force-opened modal is dismissed. */
  onForceClose?: () => void;
}

export default function WhatsNewModal({ forceOpen, onForceClose }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isOpen, setIsOpen] = useState(false);
  const latestEntry = useMemo(() => getLatestVersion(changelog), []);

  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.92);

  // Version-gated auto-show (mirrors web WhatsNewModal): only for logged-in
  // users, only when the latest changelog version is newer than what they last
  // saw. First-ever launch seeds the stored version silently (no modal).
  useEffect(() => {
    if (forceOpen) return;
    if (!latestEntry) return;
    if (!isAuthenticated) return;

    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_VERSION_KEY);
        if (cancelled) return;
        if (!stored) {
          // First time — remember version without interrupting the user.
          await AsyncStorage.setItem(LAST_VERSION_KEY, latestEntry.version);
          return;
        }
        if (isVersionHigher(latestEntry.version, stored)) {
          setIsOpen(true);
        }
      } catch (err) {
        console.warn('[whatsnew] version check failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forceOpen, latestEntry, isAuthenticated]);

  const visible = forceOpen || isOpen;

  useEffect(() => {
    if (visible) {
      cardOpacity.value = 0;
      cardScale.value = 0.92;
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withSpring(1, { damping: 14, stiffness: 180 });
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const handleClose = async () => {
    if (latestEntry) {
      try {
        await AsyncStorage.setItem(LAST_VERSION_KEY, latestEntry.version);
      } catch {
        // best-effort persistence
      }
    }
    setIsOpen(false);
    if (forceOpen) onForceClose?.();
  };

  if (!latestEntry || !visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Pressable onPress={() => {}} style={styles.inner}>
            <Text style={styles.title}>{t('whatsNew', undefined, "What's New!")}</Text>
            {!!latestEntry.date && (
              <Text style={styles.releaseLine}>
                {t('versionReleasedOn', { version: latestEntry.version, date: latestEntry.date }, '{{version}} released on {{date}}')}
              </Text>
            )}

            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {!!latestEntry.change && <ChangelogBody change={latestEntry.change} />}

              {!!latestEntry.postedBy && (
                <Text style={styles.postedBy}>— {latestEntry.postedBy}</Text>
              )}
            </ScrollView>

            <Pressable onPress={handleClose} style={styles.primaryBtn}>
              <LinearGradient
                colors={['#5cba60', '#347a37']}
                style={styles.primaryBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <Text style={styles.primaryBtnText}>{t('ok')}</Text>
              </LinearGradient>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: 'rgba(12,32,20,0.97)',
    borderRadius: 22,
    paddingTop: 26,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    color: '#4CAF50',
    fontFamily: 'Lexend-Bold',
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 6,
  },
  releaseLine: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 14,
  },
  bodyScroll: {
    alignSelf: 'stretch',
    marginBottom: 18,
  },
  bodyContent: {
    paddingBottom: 4,
  },
  h1: {
    color: '#4CAF50',
    fontFamily: 'Lexend-Bold',
    fontSize: 20,
    marginTop: 14,
    marginBottom: 6,
  },
  h2: {
    color: '#4CAF50',
    fontFamily: 'Lexend-Bold',
    fontSize: 18,
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    color: '#4CAF50',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Lexend',
    fontSize: 14,
    lineHeight: 21,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 4,
    marginBottom: 4,
  },
  bulletDot: {
    color: '#4CAF50',
    fontFamily: 'Lexend-Bold',
    fontSize: 14,
    lineHeight: 21,
  },
  bulletText: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Lexend',
    fontSize: 14,
    lineHeight: 21,
  },
  bold: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
  },
  spacer: {
    height: 8,
  },
  postedBy: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Lexend',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 18,
  },
  primaryBtn: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.7)',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
