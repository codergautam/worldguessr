import { Tabs } from 'expo-router';
import { colors } from '../../src/shared';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        animation: 'fade',
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="maps" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
