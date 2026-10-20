import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { sizes, useColors } from './theme';

export function Title({ children, testID }: { children: ReactNode; testID?: string }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]} testID={testID}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'error';
}) {
  const colors = useColors();
  return (
    <Text style={[styles.body, { color: tone === 'error' ? colors.stop : colors.muted }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: sizes.title, fontWeight: '800' },
  body: { fontSize: sizes.text, lineHeight: sizes.text * 1.4 },
});
