import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ImageBackground,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, getLeague } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { spacing, borderRadius } from '../../src/styles/theme';

type GameMode = 'singleplayer' | 'rankedDuel' | 'unrankedDuel' | 'createGame' | 'joinGame' | 'communityMaps';

interface MenuButtonProps {
  label: string;
  onPress: () => void;
  delay: number;
}

function MenuButton({ label, onPress, delay }: MenuButtonProps) {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        transform: [{ translateX: slideAnim }],
        opacity: opacityAnim,
      }}
    >
      <Pressable
        style={({ pressed }) => [
          styles.menuButton,
          pressed && styles.menuButtonPressed,
        ]}
        onPress={onPress}
      >
        <Text style={styles.menuButtonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function OutlinedTitle({ children }: { children: string }) {
  // Simulate text-stroke by rendering multiple offset copies
  const offsets = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  return (
    <View>
      {/* Shadow/stroke layers */}
      {offsets.map((offset, i) => (
        <Text
          key={i}
          style={[
            styles.title,
            styles.titleStroke,
            { left: offset.x, top: offset.y },
          ]}
        >
          {children}
        </Text>
      ))}
      {/* Drop shadow */}
      <Text style={[styles.title, styles.titleShadow]}>{children}</Text>
      {/* Main text on top */}
      <Text style={styles.title}>{children}</Text>
    </View>
  );
}

function AccountButton({ onPress, username, elo }: { onPress: () => void; username?: string; elo?: number }) {
  const league = elo ? getLeague(elo) : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.accountBtn,
        pressed && styles.accountBtnPressed,
      ]}
      onPress={onPress}
    >
      {username ? (
        <View style={styles.accountBtnContent}>
          <Text style={styles.accountBtnText}>{username}</Text>
          {league && (
            <Text style={styles.accountBtnEmoji}>{league.emoji}</Text>
          )}
        </View>
      ) : (
        <View style={styles.accountBtnContent}>
          <View style={styles.accountBtnIconWrapper}>
            <Ionicons name="logo-google" size={14} color={colors.white} />
          </View>
          <Text style={styles.accountBtnText}>Login</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const titleAnim = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(titleSlide, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleModePress = (mode: GameMode) => {
    switch (mode) {
      case 'singleplayer':
        router.push({
          pathname: '/game/[id]',
          params: { id: 'singleplayer', map: 'all', rounds: '5', time: '60' },
        });
        break;
      case 'rankedDuel':
        router.push({
          pathname: '/game/[id]',
          params: { id: 'ranked-duel', map: 'all', rounds: '5', time: '60' },
        });
        break;
      case 'unrankedDuel':
        router.push({
          pathname: '/game/[id]',
          params: { id: 'unranked-duel', map: 'all', rounds: '5', time: '60' },
        });
        break;
      case 'createGame':
        break;
      case 'joinGame':
        break;
      case 'communityMaps':
        router.push('/(tabs)/maps');
        break;
    }
  };

  let buttonIndex = 0;
  const getDelay = () => {
    buttonIndex++;
    return 150 + buttonIndex * 60;
  };

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      {/* Green Gradient Overlay - Top to Bottom */}
      <LinearGradient
        colors={[
          'rgba(20, 65, 25, 0.95)',
          'rgba(20, 65, 25, 0.8)',
          'rgba(20, 65, 25, 0.5)',
          'rgba(20, 65, 25, 0.2)',
          'transparent',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientOverlay}
      />

      <SafeAreaView style={styles.content} edges={['top', 'bottom']}>
        {/* Header with Title and Account Button */}
        <View style={styles.header}>
          <Animated.View
            style={{
              opacity: titleAnim,
              transform: [{ translateX: titleSlide }],
            }}
          >
            <OutlinedTitle>WorldGuessr</OutlinedTitle>
          </Animated.View>

          {/* Account Button - Top Right */}
          <AccountButton
            onPress={() => router.push('/(tabs)/account')}
            username={isAuthenticated ? user?.username : undefined}
            elo={user?.elo}
          />
        </View>

        {/* Menu */}
        <View style={styles.menu}>
          <View style={styles.divider} />

          <View style={styles.menuGroup}>
            <MenuButton
              label="Singleplayer"
              onPress={() => handleModePress('singleplayer')}
              delay={getDelay()}
            />
            {isAuthenticated && (
              <MenuButton
                label="Ranked Duel"
                onPress={() => handleModePress('rankedDuel')}
                delay={getDelay()}
              />
            )}
            <MenuButton
              label={isAuthenticated ? 'Unranked Duel' : 'Find Duel'}
              onPress={() => handleModePress('unrankedDuel')}
              delay={getDelay()}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.menuGroup}>
            <MenuButton
              label="Create Game"
              onPress={() => handleModePress('createGame')}
              delay={getDelay()}
            />
            <MenuButton
              label="Join Game"
              onPress={() => handleModePress('joinGame')}
              delay={getDelay()}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.menuGroup}>
            <MenuButton
              label="Community Maps"
              onPress={() => handleModePress('communityMaps')}
              delay={getDelay()}
            />
          </View>
        </View>

        {/* Bottom Icons */}
        <View style={styles.bottomIcons}>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            onPress={() => router.push('/(tabs)/leaderboard')}
          >
            <Ionicons name="trophy" size={24} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            onPress={() => {}}
          >
            <Ionicons name="settings-outline" size={24} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1a0c',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 42,
    fontFamily: 'JockeyOne',
    color: colors.white,
    letterSpacing: 0,
  },
  titleStroke: {
    position: 'absolute',
    color: 'black',
  },
  titleShadow: {
    position: 'absolute',
    color: 'black',
    left: 2,
    top: 2,
  },
  // Account button - top right like website
  accountBtn: {
    backgroundColor: 'rgba(46, 125, 50, 0.85)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  accountBtnPressed: {
    backgroundColor: 'rgba(46, 125, 50, 1)',
  },
  accountBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accountBtnIconWrapper: {
    height: 20,
    justifyContent: 'center',
  },
  accountBtnText: {
    color: colors.white,
    fontSize: 17,
    fontFamily: 'Lexend-Bold',
    lineHeight: 20,
  },
  accountBtnEmoji: {
    fontSize: 14,
  },
  // Menu - near top, not centered
  menu: {
    flex: 1,
    paddingTop: spacing.md,
    maxWidth: 300,
  },
  menuGroup: {
    gap: 0,
  },
  divider: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    marginVertical: 8,
    width: '90%',
  },
  menuButton: {
    paddingVertical: 10,
  },
  menuButtonPressed: {
    opacity: 0.7,
  },
  menuButtonText: {
    fontSize: 24,
    fontFamily: 'Lexend',
    fontWeight: '400',
    color: colors.white,
  },
  // Bottom icons - g2_container_full style
  bottomIcons: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: spacing.xl,
  },
  iconButton: {
    width: 50,
    height: 44,
    borderRadius: borderRadius.md,
    // g2_container_full gradient approximation
    backgroundColor: 'rgba(20, 65, 25, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 7,
    elevation: 8,
  },
  iconButtonPressed: {
    backgroundColor: 'rgba(20, 65, 25, 0.75)',
  },
});
