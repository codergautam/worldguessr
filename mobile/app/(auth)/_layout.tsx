import { Stack } from 'expo-router';
import { colors } from '../../src/shared';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'ios_from_right',
        animationDuration: 200,
      }}
    >
      <Stack.Screen name="set-username" />
    </Stack>
  );
}
