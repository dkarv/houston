import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { sizes, useColors } from './theme';

interface Props extends TextInputProps {
  label: string;
  /** Large, spaced digits for codes. */
  code?: boolean;
}

export function TextField({ label, code, style, ...input }: Props) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          code && styles.code,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
          style,
        ]}
        {...input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: sizes.small, fontWeight: '600' },
  input: {
    fontSize: sizes.text,
    borderWidth: 2,
    borderRadius: sizes.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  code: {
    fontSize: sizes.title,
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
