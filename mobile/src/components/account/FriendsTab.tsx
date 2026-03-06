import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard, sharedStyles } from './shared';

interface FriendsTabProps {
  secret: string;
}

// Friends tab — placeholder until WebSocket is available on mobile.
// Shows a simple "coming soon" message with explanation.
export default function FriendsTab({ secret }: FriendsTabProps) {
  return (
    <View style={{ gap: 16 }}>
      <GlassCard>
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 16 }}>
          <Text style={{ fontSize: 48 }}>👥</Text>
          <Text style={styles.title}>Friends</Text>
          <Text style={styles.subtitle}>
            Friend management is coming soon to mobile. Use the web version for now to manage friends, send requests, and invite players.
          </Text>
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontFamily: 'Lexend',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
});
