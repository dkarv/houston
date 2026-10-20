import { useColorScheme } from 'react-native';

// Large type and strong contrast: many people using Houston don't see or tap well.
export const sizes = {
  text: 22,
  title: 32,
  small: 18,
  button: 64,
  radius: 16,
  gap: 16,
  pad: 24,
};

const light = {
  background: '#F4F6FA',
  surface: '#FFFFFF',
  text: '#0B1B33',
  muted: '#4A5568',
  primary: '#0B3D91',
  primaryText: '#FFFFFF',
  go: '#1E7B34',
  stop: '#C62828',
  border: '#C9D2E0',
  stage: '#0B1B33',
};

const dark: typeof light = {
  background: '#0B1220',
  surface: '#141E30',
  text: '#F4F6FA',
  muted: '#B4BFD0',
  primary: '#6C9BFF',
  primaryText: '#0B1220',
  go: '#4CC26A',
  stop: '#FF6B6B',
  border: '#2A3850',
  stage: '#000000',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
