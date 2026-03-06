import { Tabs } from 'expo-router';
import { colors } from '../../src/shared';

export default function TabLayout() {
  return (
    <Tabs
      detachInactiveScreens={false}
      lazy={false}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        animation: 'fade',
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="maps" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
