import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { api } from '../../src/services/api';

// Query-style profile links — the forms the WEBSITE shares (pages/user.js):
//   /user?id=<account id>   stable key (usernames change), preferred when both
//   /user?u=<username>      legacy links
// The app claims the bare /user path (intent filters / applinks), so without
// this route those links dead-end on expo-router's Unmatched Route screen.
function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function UserQueryLink() {
  const params = useLocalSearchParams<{ u?: string; id?: string }>();
  const u = firstParam(params.u);
  const id = firstParam(params.id);

  // id-based visits don't know the username until the profile arrives (web
  // user.js does the same lookup) — resolve, then land on the canonical route.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .publicProfile({ id })
      .then((profile) => {
        if (cancelled) return;
        if (profile?.username) router.replace(`/user/${profile.username}`);
        else router.replace('/');
      })
      .catch(() => {
        if (!cancelled) router.replace('/');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return u ? <Redirect href={`/user/${u}`} /> : <Redirect href="/" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#112b18', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}
