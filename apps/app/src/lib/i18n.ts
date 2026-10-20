import { getLocales } from 'expo-localization';

const en = {
  appTitle: 'Houston',
  tagline: 'Remote help for family and friends',

  homeHelpTitle: 'Help someone',
  homeHelpText: 'Start a session and send the link to the person who needs help.',
  homeStart: 'Start session',
  homeNeedHelpTitle: 'I need help',
  homeNeedHelpText: 'Enter the six-digit code your helper gave you.',
  homeCodePlaceholder: 'Code',
  homeJoin: 'Continue',

  joinTitle: 'Your helper is waiting',
  joinText: 'Tap the button to talk to your helper.',
  joinButton: 'Connect',
  joinBusy: 'Connecting…',

  inviteTitle: 'Send this link',
  inviteText: 'Send the link to the person who needs help, or read out the code.',
  inviteCode: 'Code',
  inviteCopy: 'Copy link',
  inviteCopied: 'Copied',
  inviteShare: 'Share',
  inviteShareText: 'Click this link so I can help you:',

  statusConnecting: 'Connecting…',
  statusWaitingApollo: 'Waiting for the other person…',
  statusWaitingHouston: 'Waiting for your helper…',
  statusJoining: 'Connecting the call…',
  statusConnected: 'Connected',
  statusReconnecting: 'Connection lost. Reconnecting…',

  mute: 'Mute',
  unmute: 'Unmute',
  cameraOn: 'Turn camera on',
  cameraOff: 'Turn camera off',
  screenOn: 'Show my screen',
  screenOff: 'Stop showing screen',
  hangUp: 'Hang up',

  noScreenYet: 'Ask the other person to tap “Show my screen”.',
  sharingScreen: 'Your helper can see your screen.',

  endedTitle: 'The call has ended',
  endedText: 'You can close this window now.',
  backHome: 'Back to start',

  errorNotFound: 'This link is no longer valid. Please ask your helper for a new one.',
  errorAlreadyJoined:
    'Someone has already joined with this link. Please ask your helper for a new one.',
  errorRateLimited: 'Too many attempts. Please wait a minute and try again.',
  errorGeneric: 'Something went wrong. Please try again.',
  errorMicrophone:
    'Houston could not use your microphone. Please allow microphone access and try again.',
  errorCamera: 'Houston could not use your camera.',
  errorReplaced: 'This call was opened in another window.',
  errorUnauthorized: 'This call is no longer available.',

  ringTitle: 'Call your helper',
  ringText: "Enter your helper's email address. They will be notified and can answer.",
  ringEmail: "Helper's email address",
  ringName: 'Your name (optional)',
  ringButton: 'Call',
  ringWaiting: 'Calling your helper… Please wait.',
  endedUnanswered: 'Your helper is not available right now. Please try again later.',

  signInLink: 'Sign in as a helper',
  accountLink: 'Your account',
  signInTitle: 'Sign in',
  signInText:
    'Helpers can sign in to be reachable by email. Enter your email address and we will send you a code.',
  signInEmail: 'Email address',
  signInSend: 'Send code',
  signInCodeText: 'We sent a six-digit code to',
  signInCode: 'Code',
  signInVerify: 'Sign in',
  signInWrongCode: 'That code is wrong or has expired.',
  signInUnavailable: 'Signing in is not set up on this server.',

  accountTitle: 'Your account',
  accountName: 'Your name',
  accountNameHint: 'Shown nowhere yet; helps you recognize your account.',
  accountSave: 'Save',
  accountSaved: 'Saved',
  accountReachable: 'People can call you by entering:',
  accountNotifications: 'Notifications',
  accountNotificationsText: 'Get notified when someone calls you, even when Houston is closed.',
  accountEnableNotifications: 'Turn on notifications',
  accountNotificationsOn: 'Notifications are on for this device.',
  accountNotificationsDenied:
    'Notifications are blocked. Allow them in your browser or phone settings.',
  accountNotificationsUnsupported: 'This browser cannot show notifications.',
  accountNotificationsUnavailable: 'Notifications are not set up on this server.',
  accountHistory: 'Recent calls',
  accountNoHistory: 'No calls yet.',
  accountSignOut: 'Sign out',

  ringStatusRinging: 'Calling now',
  ringStatusAnswered: 'Answered',
  ringStatusMissed: 'Missed',
  ringStatusDeclined: 'Declined',
  unknownCaller: 'Someone',
  incomingTitle: (name: string) => `${name} needs your help`,
  answer: 'Answer',
  decline: 'Decline',
  block: 'Block caller',
  ringGone: 'This call is over.',
  signInToAnswer: 'Sign in to answer this call.',

  controlRequest: 'Ask to control the screen',
  controlStop: 'Stop controlling',
  controlRequested: 'Waiting for permission to control…',
  controlDenied: 'The other person did not allow control.',
  controlActiveFull: 'You are controlling the screen. Click into it, then use mouse and keyboard.',
  controlActiveOverlay:
    'You can point: the other person sees where you click, but you cannot click for them.',
  controlAsk: 'Your helper would like to control your screen, to show you how something works.',
  controlAllow: 'Allow',
  controlDeny: "Don't allow",
  controlActiveApollo: 'Your helper is controlling your screen.',
  controlPointingApollo: 'Your helper shows you where to click.',
  controlStopApollo: 'Stop',
  installTitle: 'Install the Houston app',
  installText:
    'For your helper to control your screen, install the free Houston app on this computer. Then open it with the button below.',
  installDownload: 'Download Houston',
  installOpen: 'Open in the Houston app',
  installLater: 'Not now',
  handoffText: 'This call continues in the Houston app.',

  controlOverlayHint:
    'Your helper can show you where to tap. To let them tap for you, turn on "Houston remote help" in the accessibility settings.',
  controlOpenAccessibility: 'Open accessibility settings',
};

type Strings = typeof en;

const de: Strings = {
  appTitle: 'Houston',
  tagline: 'Fernhilfe für Familie und Freunde',

  homeHelpTitle: 'Jemandem helfen',
  homeHelpText:
    'Starten Sie eine Sitzung und schicken Sie den Link an die Person, die Hilfe braucht.',
  homeStart: 'Sitzung starten',
  homeNeedHelpTitle: 'Ich brauche Hilfe',
  homeNeedHelpText: 'Geben Sie den sechsstelligen Code ein, den Sie bekommen haben.',
  homeCodePlaceholder: 'Code',
  homeJoin: 'Weiter',

  joinTitle: 'Ihr Helfer wartet',
  joinText: 'Tippen Sie auf den Knopf, um mit Ihrem Helfer zu sprechen.',
  joinButton: 'Verbinden',
  joinBusy: 'Verbinde…',

  inviteTitle: 'Diesen Link verschicken',
  inviteText:
    'Schicken Sie den Link an die Person, die Hilfe braucht, oder lesen Sie den Code vor.',
  inviteCode: 'Code',
  inviteCopy: 'Link kopieren',
  inviteCopied: 'Kopiert',
  inviteShare: 'Teilen',
  inviteShareText: 'Klicke auf diesen Link, damit ich dir helfen kann:',

  statusConnecting: 'Verbinde…',
  statusWaitingApollo: 'Warte auf die andere Person…',
  statusWaitingHouston: 'Warte auf Ihren Helfer…',
  statusJoining: 'Gespräch wird verbunden…',
  statusConnected: 'Verbunden',
  statusReconnecting: 'Verbindung unterbrochen. Verbinde neu…',

  mute: 'Stumm',
  unmute: 'Ton an',
  cameraOn: 'Kamera an',
  cameraOff: 'Kamera aus',
  screenOn: 'Bildschirm zeigen',
  screenOff: 'Bildschirm nicht mehr zeigen',
  hangUp: 'Auflegen',

  noScreenYet: 'Bitten Sie die andere Person, auf „Bildschirm zeigen“ zu tippen.',
  sharingScreen: 'Ihr Helfer sieht Ihren Bildschirm.',

  endedTitle: 'Das Gespräch ist beendet',
  endedText: 'Sie können dieses Fenster jetzt schließen.',
  backHome: 'Zurück zum Start',

  errorNotFound:
    'Dieser Link ist nicht mehr gültig. Bitte fragen Sie Ihren Helfer nach einem neuen.',
  errorAlreadyJoined:
    'Mit diesem Link hat sich schon jemand verbunden. Bitte fragen Sie Ihren Helfer nach einem neuen.',
  errorRateLimited: 'Zu viele Versuche. Bitte warten Sie eine Minute.',
  errorGeneric: 'Etwas ist schiefgegangen. Bitte versuchen Sie es noch einmal.',
  errorMicrophone:
    'Houston konnte Ihr Mikrofon nicht verwenden. Bitte erlauben Sie den Zugriff und versuchen Sie es noch einmal.',
  errorCamera: 'Houston konnte Ihre Kamera nicht verwenden.',
  errorReplaced: 'Dieses Gespräch wurde in einem anderen Fenster geöffnet.',
  errorUnauthorized: 'Dieses Gespräch ist nicht mehr verfügbar.',

  ringTitle: 'Meinen Helfer anrufen',
  ringText:
    'Geben Sie die E-Mail-Adresse Ihres Helfers ein. Er wird benachrichtigt und kann abheben.',
  ringEmail: 'E-Mail-Adresse des Helfers',
  ringName: 'Ihr Name (freiwillig)',
  ringButton: 'Anrufen',
  ringWaiting: 'Ihr Helfer wird angerufen… Bitte warten Sie.',
  endedUnanswered:
    'Ihr Helfer ist gerade nicht erreichbar. Bitte versuchen Sie es später noch einmal.',

  signInLink: 'Als Helfer anmelden',
  accountLink: 'Ihr Konto',
  signInTitle: 'Anmelden',
  signInText:
    'Helfer können sich anmelden, um per E-Mail-Adresse erreichbar zu sein. Geben Sie Ihre E-Mail-Adresse ein, wir schicken Ihnen einen Code.',
  signInEmail: 'E-Mail-Adresse',
  signInSend: 'Code schicken',
  signInCodeText: 'Wir haben einen sechsstelligen Code geschickt an',
  signInCode: 'Code',
  signInVerify: 'Anmelden',
  signInWrongCode: 'Der Code ist falsch oder abgelaufen.',
  signInUnavailable: 'Anmelden ist auf diesem Server nicht eingerichtet.',

  accountTitle: 'Ihr Konto',
  accountName: 'Ihr Name',
  accountNameHint: 'Wird noch nirgends angezeigt; hilft Ihnen, Ihr Konto zu erkennen.',
  accountSave: 'Speichern',
  accountSaved: 'Gespeichert',
  accountReachable: 'Man kann Sie anrufen, indem man eingibt:',
  accountNotifications: 'Benachrichtigungen',
  accountNotificationsText:
    'Werden Sie benachrichtigt, wenn jemand anruft, auch wenn Houston geschlossen ist.',
  accountEnableNotifications: 'Benachrichtigungen einschalten',
  accountNotificationsOn: 'Benachrichtigungen sind auf diesem Gerät eingeschaltet.',
  accountNotificationsDenied:
    'Benachrichtigungen sind blockiert. Erlauben Sie sie in den Browser- oder Telefoneinstellungen.',
  accountNotificationsUnsupported: 'Dieser Browser kann keine Benachrichtigungen anzeigen.',
  accountNotificationsUnavailable: 'Benachrichtigungen sind auf diesem Server nicht eingerichtet.',
  accountHistory: 'Letzte Anrufe',
  accountNoHistory: 'Noch keine Anrufe.',
  accountSignOut: 'Abmelden',

  ringStatusRinging: 'Ruft gerade an',
  ringStatusAnswered: 'Angenommen',
  ringStatusMissed: 'Verpasst',
  ringStatusDeclined: 'Abgelehnt',
  unknownCaller: 'Jemand',
  incomingTitle: (name: string) => `${name} braucht Ihre Hilfe`,
  answer: 'Annehmen',
  decline: 'Ablehnen',
  block: 'Anrufer blockieren',
  ringGone: 'Dieser Anruf ist vorbei.',
  signInToAnswer: 'Melden Sie sich an, um diesen Anruf anzunehmen.',

  controlRequest: 'Steuerung anfragen',
  controlStop: 'Steuerung beenden',
  controlRequested: 'Warte auf die Erlaubnis zum Steuern…',
  controlDenied: 'Die andere Person hat das Steuern nicht erlaubt.',
  controlActiveFull:
    'Sie steuern den Bildschirm. Klicken Sie hinein und benutzen Sie Maus und Tastatur.',
  controlActiveOverlay:
    'Sie können zeigen: Die andere Person sieht, wohin Sie klicken, aber Sie können nicht für sie klicken.',
  controlAsk: 'Ihr Helfer möchte Ihren Bildschirm steuern, um Ihnen etwas zu zeigen.',
  controlAllow: 'Erlauben',
  controlDeny: 'Nicht erlauben',
  controlActiveApollo: 'Ihr Helfer steuert Ihren Bildschirm.',
  controlPointingApollo: 'Ihr Helfer zeigt Ihnen, wohin Sie klicken sollen.',
  controlStopApollo: 'Stopp',
  installTitle: 'Houston-App installieren',
  installText:
    'Damit Ihr Helfer Ihren Bildschirm steuern kann, installieren Sie die kostenlose Houston-App auf diesem Computer. Öffnen Sie sie danach mit dem Knopf unten.',
  installDownload: 'Houston herunterladen',
  installOpen: 'In der Houston-App öffnen',
  installLater: 'Jetzt nicht',
  handoffText: 'Das Gespräch geht in der Houston-App weiter.',

  controlOverlayHint:
    'Ihr Helfer kann Ihnen zeigen, wohin Sie tippen sollen. Damit er für Sie tippen kann, schalten Sie „Houston Fernhilfe“ in den Bedienungshilfen ein.',
  controlOpenAccessibility: 'Bedienungshilfen öffnen',
};

const languages: Record<string, Strings> = { en, de };

const language = getLocales()[0]?.languageCode ?? 'en';

export const t: Strings = languages[language] ?? en;
