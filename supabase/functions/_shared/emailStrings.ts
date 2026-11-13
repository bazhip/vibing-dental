// Generated — run npm run i18n:emails. Do not edit by hand.
// Source: src/locales/<lng>/email.json (edge functions can't import src/).

export const EMAIL_LANGUAGES = ['en', 'fr', 'de', 'it', 'es'] as const;
export type EmailLanguage = (typeof EMAIL_LANGUAGES)[number];

export type EmailKey =
  | "common.setPasswordButton"
  | "invite.body1"
  | "invite.body2"
  | "invite.fallback.preheader"
  | "invite.fallback.title"
  | "invite.fallback.who"
  | "invite.footnote"
  | "invite.preheader"
  | "invite.subject"
  | "invite.title"
  | "join.body1"
  | "join.body2"
  | "join.button"
  | "join.fallback"
  | "join.footnote"
  | "join.preheader"
  | "join.subject"
  | "join.title"
  | "layout.linkFallback"
  | "layout.tagline"
  | "reminder.body1"
  | "reminder.body2"
  | "reminder.fallback"
  | "reminder.footnote"
  | "reminder.footnoteFinal"
  | "reminder.preheader"
  | "reminder.subject"
  | "reminder.subjectFinal"
  | "reminder.title"
  | "reminder.titleFinal";

export const EMAIL_STRINGS: Record<EmailLanguage, Record<EmailKey, string>> = {
  en: {
    "common.setPasswordButton": "Set your password & join",
    "invite.body1": "{{who}} added you to their team on ToothOps — chairside veterinary dental charting.",
    "invite.body2": "Set your password to activate your account and see the practice’s charts.",
    "invite.fallback.preheader": "the practice",
    "invite.fallback.title": "a practice",
    "invite.fallback.who": "A practice",
    "invite.footnote": "If you weren’t expecting this, you can ignore this email.",
    "invite.preheader": "Set your password to join {{practice}} on ToothOps.",
    "invite.subject": "{{who}} invited you to ToothOps",
    "invite.title": "You’re invited to join {{practice}}",
    "join.body1": "{{name}} invited you to join their team on ToothOps. Sign in with your existing account to accept.",
    "join.body2": "Nothing changes until you accept — and sharing your existing charts with the practice is a separate choice you make when joining.",
    "join.button": "Review invitation",
    "join.fallback": "a practice",
    "join.footnote": "The link works for 14 days. If you weren’t expecting this, ignore this email.",
    "join.preheader": "{{name}} invited you to their team on ToothOps.",
    "join.subject": "Join {{name}} on ToothOps?",
    "join.title": "Join {{name}}?",
    "layout.linkFallback": "If the button doesn’t work, copy this link into your browser:",
    "layout.tagline": "Veterinary dental charting",
    "reminder.body1": "{{who}} invited you to ToothOps, their veterinary dental charting app. Your account is ready whenever you are — just set a password to get started.",
    "reminder.body2": "The link below works for 24 hours.",
    "reminder.fallback": "your practice",
    "reminder.footnote": "Not expecting this, or don’t want to join? Just ignore this email — we’ll send at most one more reminder.",
    "reminder.footnoteFinal": "This is the last reminder we’ll send. If you haven’t joined by {{date}}, this invite expires and the pending account is removed — {{who}} can invite you again anytime.",
    "reminder.preheader": "{{who}} is waiting for you on ToothOps — set your password to join.",
    "reminder.subject": "Reminder: {{who}} invited you to ToothOps",
    "reminder.subjectFinal": "Last reminder: join {{who}} on ToothOps",
    "reminder.title": "You’re invited to join {{who}}",
    "reminder.titleFinal": "Your invitation is still waiting",
  },
  fr: {
    "common.setPasswordButton": "Définir votre mot de passe et rejoindre",
    "invite.body1": "{{who}} vous invite à rejoindre son équipe sur ToothOps, le schéma dentaire vétérinaire au fauteuil.",
    "invite.body2": "Définissez votre mot de passe pour activer votre compte et accéder aux dossiers du cabinet.",
    "invite.fallback.preheader": "le cabinet",
    "invite.fallback.title": "un cabinet",
    "invite.fallback.who": "Un cabinet",
    "invite.footnote": "Si vous ne vous attendiez pas à cet e-mail, vous pouvez l’ignorer.",
    "invite.preheader": "Définissez votre mot de passe pour rejoindre {{practice}} sur ToothOps.",
    "invite.subject": "{{who}} vous invite sur ToothOps",
    "invite.title": "Invitation à rejoindre {{practice}}",
    "join.body1": "{{name}} vous invite à rejoindre son équipe sur ToothOps. Connectez-vous avec votre compte existant pour accepter.",
    "join.body2": "Rien ne change tant que vous n’avez pas accepté — et le partage de vos dossiers existants avec le cabinet est un choix distinct, que vous faites au moment de le rejoindre.",
    "join.button": "Voir l’invitation",
    "join.fallback": "un cabinet",
    "join.footnote": "Le lien est valable 14 jours. Si vous ne vous attendiez pas à cet e-mail, ignorez-le.",
    "join.preheader": "{{name}} vous invite à rejoindre son équipe sur ToothOps.",
    "join.subject": "Rejoindre {{name}} sur ToothOps ?",
    "join.title": "Rejoindre {{name}} ?",
    "layout.linkFallback": "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    "layout.tagline": "Schéma dentaire vétérinaire",
    "reminder.body1": "{{who}} vous invite sur ToothOps, son application de schéma dentaire vétérinaire. Votre compte est prêt dès que vous l’êtes — il vous suffit de définir un mot de passe pour commencer.",
    "reminder.body2": "Le lien ci-dessous est valable 24 heures.",
    "reminder.fallback": "votre cabinet",
    "reminder.footnote": "Vous ne vous attendiez pas à cet e-mail ou ne souhaitez pas rejoindre l’équipe ? Ignorez-le simplement — nous vous enverrons au plus un autre rappel.",
    "reminder.footnoteFinal": "Ceci est notre dernier rappel. Si vous n’avez pas rejoint l’équipe d’ici le {{date}}, cette invitation expirera et le compte en attente sera supprimé — {{who}} pourra vous inviter de nouveau à tout moment.",
    "reminder.preheader": "{{who}} vous attend sur ToothOps — définissez votre mot de passe pour rejoindre l’équipe.",
    "reminder.subject": "Rappel : {{who}} vous invite sur ToothOps",
    "reminder.subjectFinal": "Dernier rappel : rejoignez {{who}} sur ToothOps",
    "reminder.title": "Invitation à rejoindre {{who}}",
    "reminder.titleFinal": "Votre invitation vous attend toujours",
  },
  de: {
    "common.setPasswordButton": "Passwort festlegen und beitreten",
    "invite.body1": "{{who}} hat Sie zum Team auf ToothOps hinzugefügt – dem Zahnschema für die Tiermedizin, direkt am Behandlungstisch.",
    "invite.body2": "Legen Sie Ihr Passwort fest, um Ihr Konto zu aktivieren und die Akten der Praxis zu sehen.",
    "invite.fallback.preheader": "der Praxis",
    "invite.fallback.title": "einer Praxis",
    "invite.fallback.who": "Eine Praxis",
    "invite.footnote": "Wenn Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.",
    "invite.preheader": "Legen Sie Ihr Passwort fest, um {{practice}} auf ToothOps beizutreten.",
    "invite.subject": "{{who}} hat Sie zu ToothOps eingeladen",
    "invite.title": "Einladung zu {{practice}}",
    "join.body1": "{{name}} hat Sie eingeladen, dem Team auf ToothOps beizutreten. Melden Sie sich mit Ihrem bestehenden Konto an, um die Einladung anzunehmen.",
    "join.body2": "Bis Sie annehmen, ändert sich nichts – und ob Sie Ihre bestehenden Akten mit der Praxis teilen, entscheiden Sie beim Beitritt separat.",
    "join.button": "Einladung ansehen",
    "join.fallback": "Eine Praxis",
    "join.footnote": "Der Link ist 14 Tage gültig. Wenn Sie diese E-Mail nicht erwartet haben, ignorieren Sie sie.",
    "join.preheader": "{{name}} hat Sie in das Team auf ToothOps eingeladen.",
    "join.subject": "{{name}} lädt Sie zu ToothOps ein",
    "join.title": "{{name}} lädt Sie ein",
    "layout.linkFallback": "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    "layout.tagline": "Zahnschema für die Tiermedizin",
    "reminder.body1": "{{who}} hat Sie zu ToothOps eingeladen, dem Zahnschema-Programm für die Tiermedizin. Ihr Konto ist bereit, wann immer Sie es sind – legen Sie einfach ein Passwort fest, um loszulegen.",
    "reminder.body2": "Der Link unten ist 24 Stunden gültig.",
    "reminder.fallback": "Ihre Praxis",
    "reminder.footnote": "Sie haben das nicht erwartet oder möchten nicht beitreten? Ignorieren Sie diese E-Mail einfach – wir senden höchstens noch eine weitere Erinnerung.",
    "reminder.footnoteFinal": "Dies ist unsere letzte Erinnerung. Wenn Sie bis zum {{date}} nicht beigetreten sind, läuft diese Einladung ab und das ausstehende Konto wird entfernt – {{who}} kann Sie jederzeit erneut einladen.",
    "reminder.preheader": "{{who}} wartet auf Sie bei ToothOps – legen Sie Ihr Passwort fest, um beizutreten.",
    "reminder.subject": "Erinnerung: {{who}} hat Sie zu ToothOps eingeladen",
    "reminder.subjectFinal": "Letzte Erinnerung: {{who}} wartet auf Sie bei ToothOps",
    "reminder.title": "{{who}} hat Sie eingeladen",
    "reminder.titleFinal": "Ihre Einladung wartet noch auf Sie",
  },
  it: {
    "common.setPasswordButton": "Imposta la password e unisciti",
    "invite.body1": "{{who}} La invita a far parte del proprio team su ToothOps, l’odontogramma veterinario da usare alla poltrona.",
    "invite.body2": "Imposti la password per attivare il Suo account e vedere le cartelle dello studio.",
    "invite.fallback.preheader": "Lo studio",
    "invite.fallback.title": "uno studio",
    "invite.fallback.who": "Uno studio",
    "invite.footnote": "Se non si aspettava questa email, può ignorarla.",
    "invite.preheader": "{{practice}} La aspetta su ToothOps: imposti la password per unirsi al team.",
    "invite.subject": "{{who}} La invita su ToothOps",
    "invite.title": "Invito a unirsi a {{practice}}",
    "join.body1": "{{name}} La invita a far parte del proprio team su ToothOps. Acceda con il Suo account esistente per accettare.",
    "join.body2": "Non cambia nulla finché non accetta — e la condivisione delle Sue cartelle esistenti con lo studio è una scelta separata, che farà al momento dell’adesione.",
    "join.button": "Vedi invito",
    "join.fallback": "uno studio",
    "join.footnote": "Il link è valido per 14 giorni. Se non si aspettava questa email, la ignori.",
    "join.preheader": "{{name}} La invita a far parte del proprio team su ToothOps.",
    "join.subject": "Unirsi a {{name}} su ToothOps?",
    "join.title": "Unirsi a {{name}}?",
    "layout.linkFallback": "Se il pulsante non funziona, copi questo link nel Suo browser:",
    "layout.tagline": "Odontogramma veterinario",
    "reminder.body1": "{{who}} La invita su ToothOps, la propria app per l’odontogramma veterinario. Il Suo account è pronto quando vuole: basta impostare una password per iniziare.",
    "reminder.body2": "Il link qui sotto è valido per 24 ore.",
    "reminder.fallback": "il Suo studio",
    "reminder.footnote": "Non se lo aspettava o non desidera unirsi? Ignori semplicemente questa email: invieremo al massimo un altro promemoria.",
    "reminder.footnoteFinal": "Questo è l’ultimo promemoria che invieremo. Se non avrà aderito entro il {{date}}, l’invito scadrà e l’account in sospeso verrà rimosso — {{who}} potrà invitarLa di nuovo in qualsiasi momento.",
    "reminder.preheader": "{{who}} La aspetta su ToothOps — imposti la password per unirsi.",
    "reminder.subject": "Promemoria: {{who}} La invita su ToothOps",
    "reminder.subjectFinal": "Ultimo promemoria: {{who}} La aspetta su ToothOps",
    "reminder.title": "{{who}} La invita a unirsi",
    "reminder.titleFinal": "Il Suo invito La sta ancora aspettando",
  },
  es: {
    "common.setPasswordButton": "Establecer contraseña y unirse",
    "invite.body1": "{{who}} le ha invitado a unirse a su equipo en ToothOps, el odontograma veterinario para usar en la consulta.",
    "invite.body2": "Establezca su contraseña para activar su cuenta y ver los historiales de la clínica.",
    "invite.fallback.preheader": "la clínica",
    "invite.fallback.title": "una clínica",
    "invite.fallback.who": "Una clínica",
    "invite.footnote": "Si no esperaba este correo, puede ignorarlo.",
    "invite.preheader": "Establezca su contraseña para unirse a {{practice}} en ToothOps.",
    "invite.subject": "{{who}} le ha invitado a ToothOps",
    "invite.title": "Invitación para unirse a {{practice}}",
    "join.body1": "{{name}} le ha invitado a unirse a su equipo en ToothOps. Inicie sesión con su cuenta actual para aceptar.",
    "join.body2": "Nada cambia hasta que acepte, y compartir sus historiales actuales con la clínica es una decisión aparte que tomará al unirse.",
    "join.button": "Ver invitación",
    "join.fallback": "una clínica",
    "join.footnote": "El enlace es válido durante 14 días. Si no esperaba este correo, ignórelo.",
    "join.preheader": "{{name}} le ha invitado a su equipo en ToothOps.",
    "join.subject": "¿Unirse a {{name}} en ToothOps?",
    "join.title": "¿Unirse a {{name}}?",
    "layout.linkFallback": "Si el botón no funciona, copie este enlace en su navegador:",
    "layout.tagline": "Odontograma veterinario",
    "reminder.body1": "{{who}} le ha invitado a ToothOps, su aplicación de odontograma veterinario. Su cuenta está lista cuando usted lo esté: solo tiene que establecer una contraseña para empezar.",
    "reminder.body2": "El enlace de abajo es válido durante 24 horas.",
    "reminder.fallback": "su clínica",
    "reminder.footnote": "¿No esperaba este correo o no desea unirse? Simplemente ignórelo: le enviaremos como máximo un recordatorio más.",
    "reminder.footnoteFinal": "Este es el último recordatorio que le enviaremos. Si no se ha unido antes del {{date}}, esta invitación caducará y la cuenta pendiente se eliminará; {{who}} puede volver a invitarle en cualquier momento.",
    "reminder.preheader": "{{who}} le espera en ToothOps: establezca su contraseña para unirse.",
    "reminder.subject": "Recordatorio: {{who}} le ha invitado a ToothOps",
    "reminder.subjectFinal": "Último recordatorio: únase a {{who}} en ToothOps",
    "reminder.title": "Invitación para unirse a {{who}}",
    "reminder.titleFinal": "Su invitación sigue esperándole",
  },
};

/** An app language for `v` ('fr-CA' → 'fr'); anything else → 'en'. */
export function emailLanguage(v: unknown): EmailLanguage {
  if (typeof v !== 'string') return 'en';
  const base = v.toLowerCase().split('-')[0];
  return (EMAIL_LANGUAGES as readonly string[]).includes(base) ? (base as EmailLanguage) : 'en';
}

/** True only for a supported language (base tag), so callers can try the next source. */
export function isEmailLanguage(v: unknown): boolean {
  return typeof v === 'string' && (EMAIL_LANGUAGES as readonly string[]).includes(v.toLowerCase().split('-')[0]);
}

/** The `key` string in `lng` with {{var}} placeholders filled. */
export function emailT(lng: string, key: EmailKey, vars: Record<string, string> = {}): string {
  return EMAIL_STRINGS[emailLanguage(lng)][key].replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name: string) =>
    name in vars ? vars[name] : m,
  );
}
