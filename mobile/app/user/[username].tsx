import { useLocalSearchParams, useRouter } from 'expo-router';
import ProfileView from '../../src/components/account/ProfileView';

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();

  return (
    <ProfileView
      isOwnProfile={false}
      username={username}
      onBack={() => router.back()}
      onNavigateToUser={(u) => router.push(`/user/${u}`)}
    />
  );
}
