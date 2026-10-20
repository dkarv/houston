/** Texts the server sends itself: emails and push notifications. */
const en = {
  codeSubject: (code: string) => `${code} is your Houston sign-in code`,
  codeText: (code: string) =>
    `Your Houston sign-in code is ${code}\n\nIt is valid for 10 minutes. If you didn't ask for it, you can ignore this email.`,
  ringSubject: (caller: string | null) =>
    caller ? `${caller} needs your help` : 'Someone needs your help',
  ringText: (caller: string | null, url: string) =>
    `${caller ?? 'Someone'} is calling you on Houston and needs help.\n\nAnswer here: ${url}\n\nThe call waits for a few minutes.`,
  ringTitle: 'Houston',
  ringBody: (caller: string | null) => `${caller ?? 'Someone'} needs your help`,
};

const de: typeof en = {
  codeSubject: (code) => `${code} ist Ihr Houston-Anmeldecode`,
  codeText: (code) =>
    `Ihr Houston-Anmeldecode lautet ${code}\n\nEr ist 10 Minuten gültig. Wenn Sie ihn nicht angefordert haben, können Sie diese E-Mail ignorieren.`,
  ringSubject: (caller) => (caller ? `${caller} braucht Ihre Hilfe` : 'Jemand braucht Ihre Hilfe'),
  ringText: (caller, url) =>
    `${caller ?? 'Jemand'} ruft Sie über Houston an und braucht Hilfe.\n\nHier annehmen: ${url}\n\nDer Anruf wartet einige Minuten.`,
  ringTitle: 'Houston',
  ringBody: (caller) => `${caller ?? 'Jemand'} braucht Ihre Hilfe`,
};

export type Language = 'de' | 'en';
export type Messages = typeof en;

export function messages(language: Language): Messages {
  return language === 'de' ? de : en;
}

/** Picks the first supported language from an Accept-Language header. */
export function languageFrom(acceptLanguage: string | undefined): Language {
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.trim().slice(0, 2).toLowerCase();
    if (tag === 'de' || tag === 'en') return tag;
  }
  return 'en';
}
