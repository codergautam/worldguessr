import { Stack } from 'expo-router';
import { colors } from '../../src/shared';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="set-username" />
    </Stack>
  );
}
