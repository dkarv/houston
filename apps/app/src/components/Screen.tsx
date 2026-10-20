import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sizes, useColors } from './theme';

/** Centered, readable column for the non-call screens. */
export function Screen({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: sizes.pad },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: sizes.gap * 1.5 },
  card: { borderWidth: 2, borderRadius: sizes.radius, padding: sizes.pad, gap: sizes.gap },
});
