import { useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { CreateSessionResponse } from '@houston/protocol';
import { t } from '@/lib/i18n';
import { BigButton } from './BigButton';
import { Card } from './Screen';
import { sizes, useColors } from './theme';
import { Body, Title } from './Typography';

export function InviteCard({ session }: { session: CreateSessionResponse }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const message = `${t.inviteShareText} ${session.joinUrl}`;
  const canShare = Platform.OS !== 'web' || typeof navigator.share === 'function';

  async function copy() {
    await Clipboard.setStringAsync(session.joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    try {
      if (Platform.OS === 'web') await navigator.share({ text: message });
      else await Share.share({ message });
    } catch {
      // Cancelled.
    }
  }

  return (
    <Card>
      <Title>{t.inviteTitle}</Title>
      <Body>{t.inviteText}</Body>
      <Text selectable style={[styles.link, { color: colors.primary }]} testID="invite-link">
        {session.joinUrl}
      </Text>
      <View style={styles.codeRow}>
        <Text style={[styles.codeLabel, { color: colors.muted }]}>{t.inviteCode}</Text>
        <Text selectable style={[styles.code, { color: colors.text }]} testID="invite-code">
          {session.code.slice(0, 3)} {session.code.slice(3)}
        </Text>
      </View>
      <View style={styles.actions}>
        <BigButton label={copied ? t.inviteCopied : t.inviteCopy} onPress={copy} />
        {canShare && <BigButton variant="plain" label={t.inviteShare} onPress={share} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: sizes.text, fontWeight: '600' },
  codeRow: { flexDirection: 'row', alignItems: 'baseline', gap: sizes.gap },
  codeLabel: { fontSize: sizes.text },
  code: {
    fontSize: sizes.title,
    fontWeight: '800',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: sizes.gap },
});
