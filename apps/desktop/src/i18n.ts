const en = {
  consentTitle: 'Allow control?',
  consentMessage: 'Your helper would like to control your screen.',
  consentDetail:
    'Your helper can then move the mouse and type on this computer. You can stop it at any time with the "Stop" button at the top of the screen.',
  consentAllow: 'Allow',
  consentDeny: "Don't allow",
  overlayOnlyDetail:
    'Your helper can only show you where to click. For full control, allow Houston under System Settings > Privacy & Security > Accessibility.',
  trustTitle: 'Connect to a Houston server?',
  trustMessage: (host: string) => `Do you want to connect to ${host}?`,
  trustDetail: 'Only continue if the person helping you sent you this link.',
  trustYes: 'Connect',
  trustNo: 'Cancel',
  barControl: 'Your helper is controlling your screen',
  barPointing: 'Your helper shows you where to click',
  barStop: 'Stop',
};

const de: typeof en = {
  consentTitle: 'Steuern erlauben?',
  consentMessage: 'Ihr Helfer möchte Ihren Bildschirm steuern.',
  consentDetail:
    'Ihr Helfer kann dann auf diesem Computer die Maus bewegen und tippen. Sie können das jederzeit mit dem Knopf „Stopp“ oben am Bildschirm beenden.',
  consentAllow: 'Erlauben',
  consentDeny: 'Nicht erlauben',
  overlayOnlyDetail:
    'Ihr Helfer kann Ihnen nur zeigen, wohin Sie klicken sollen. Für volles Steuern erlauben Sie Houston unter Systemeinstellungen > Datenschutz & Sicherheit > Bedienungshilfen.',
  trustTitle: 'Mit einem Houston-Server verbinden?',
  trustMessage: (host) => `Möchten Sie sich mit ${host} verbinden?`,
  trustDetail:
    'Fahren Sie nur fort, wenn Ihnen die Person, die Ihnen hilft, diesen Link geschickt hat.',
  trustYes: 'Verbinden',
  trustNo: 'Abbrechen',
  barControl: 'Ihr Helfer steuert Ihren Bildschirm',
  barPointing: 'Ihr Helfer zeigt Ihnen, wohin Sie klicken sollen',
  barStop: 'Stopp',
};

export type Strings = typeof en;

export function strings(locale: string): Strings {
  return locale.toLowerCase().startsWith('de') ? de : en;
}
