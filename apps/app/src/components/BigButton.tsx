import { Pressable, StyleSheet, Text } from 'react-native';
import { sizes, useColors } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'go' | 'stop' | 'plain';
  disabled?: boolean;
  /** Toggle buttons show their pressed state. */
  active?: boolean;
  testID?: string;
}

export function BigButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  active,
  testID,
}: Props) {
  const colors = useColors();
  const background = {
    primary: colors.primary,
    go: colors.go,
    stop: colors.stop,
    plain: active ? colors.primary : colors.surface,
  }[variant];
  const foreground = variant === 'plain' && !active ? colors.text : colors.primaryText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.button,
    paddingHorizontal: sizes.pad,
    borderRadius: sizes.radius,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.98 }] },
  label: { fontSize: sizes.text, fontWeight: '700', textAlign: 'center' },
});
