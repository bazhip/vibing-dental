// Generated — run npm run i18n:emails. Do not edit by hand.
// Source: src/locales/<lng>/email.json and authEmail.json (edge functions can't import src/).

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

// Supabase Auth emails sent by the send-auth-email hook (src/locales/<lng>/authEmail.json).
// Values may contain <strong>…</strong> and {{var}} placeholders; _shared/authEmails.ts renders them.

export type AuthEmailKey =
  | "changeEmail.body"
  | "changeEmail.button"
  | "changeEmail.ignore"
  | "changeEmail.preheader"
  | "changeEmail.subject"
  | "changeEmail.title"
  | "common.fallback"
  | "common.tagline"
  | "confirmSignup.body"
  | "confirmSignup.button"
  | "confirmSignup.ignore"
  | "confirmSignup.preheader"
  | "confirmSignup.subject"
  | "confirmSignup.title"
  | "invite.body"
  | "invite.button"
  | "invite.ignore"
  | "invite.preheader"
  | "invite.subject"
  | "invite.title"
  | "magiclink.body"
  | "magiclink.button"
  | "magiclink.ignore"
  | "magiclink.preheader"
  | "magiclink.subject"
  | "magiclink.title"
  | "notice.emailChanged.body"
  | "notice.emailChanged.subject"
  | "notice.footnote"
  | "notice.generic.body"
  | "notice.generic.subject"
  | "notice.identityLinked.body"
  | "notice.identityLinked.subject"
  | "notice.identityUnlinked.body"
  | "notice.identityUnlinked.subject"
  | "notice.mfaEnrolled.body"
  | "notice.mfaEnrolled.subject"
  | "notice.mfaUnenrolled.body"
  | "notice.mfaUnenrolled.subject"
  | "notice.passwordChanged.body"
  | "notice.passwordChanged.subject"
  | "notice.phoneChanged.body"
  | "notice.phoneChanged.subject"
  | "reauthentication.body"
  | "reauthentication.ignore"
  | "reauthentication.preheader"
  | "reauthentication.subject"
  | "reauthentication.title"
  | "resetPassword.body"
  | "resetPassword.button"
  | "resetPassword.ignore"
  | "resetPassword.preheader"
  | "resetPassword.subject"
  | "resetPassword.title";

export const AUTH_EMAIL_STRINGS: Record<EmailLanguage, Record<AuthEmailKey, string>> = {
  en: {
    "changeEmail.body": "Confirm that <strong>{{newEmail}}</strong> should replace <strong>{{email}}</strong> as the sign-in email for your ToothOps account.",
    "changeEmail.button": "Confirm new email",
    "changeEmail.ignore": "Didn’t request this change? Ignore this email and your sign-in email stays the same.",
    "changeEmail.preheader": "Confirm the new email address for your ToothOps account.",
    "changeEmail.subject": "Confirm your new email for ToothOps",
    "changeEmail.title": "Confirm your new email",
    "common.fallback": "If the button doesn’t work, copy this link into your browser:",
    "common.tagline": "Veterinary dental charting",
    "confirmSignup.body": "Welcome to ToothOps. Confirm <strong>{{email}}</strong> to activate your practice account — you’ll be signed in right away.",
    "confirmSignup.button": "Confirm email & sign in",
    "confirmSignup.ignore": "Didn’t sign up for ToothOps? You can ignore this email — the account stays inactive unless this link is used.",
    "confirmSignup.preheader": "Confirm your email to activate your ToothOps account.",
    "confirmSignup.subject": "Confirm your ToothOps account",
    "confirmSignup.title": "Confirm your email",
    "invite.body": "You’ve been invited to create a ToothOps account for <strong>{{email}}</strong>. Accept the invitation to set your password and get started.",
    "invite.button": "Accept invitation",
    "invite.ignore": "Not expecting this invitation? You can ignore this email — no account is created unless this link is used.",
    "invite.preheader": "You’ve been invited to create a ToothOps account.",
    "invite.subject": "You’re invited to ToothOps",
    "invite.title": "Accept your invitation",
    "magiclink.body": "Use the button below to sign in to ToothOps as <strong>{{email}}</strong>. The link can be used only once.",
    "magiclink.button": "Sign in",
    "magiclink.ignore": "Didn’t try to sign in? Ignore this email — no one can sign in without this link.",
    "magiclink.preheader": "Your link to sign in to ToothOps.",
    "magiclink.subject": "Your ToothOps sign-in link",
    "magiclink.title": "Sign in to ToothOps",
    "notice.emailChanged.body": "The sign-in email for your ToothOps account was changed.",
    "notice.emailChanged.subject": "Your ToothOps sign-in email was changed",
    "notice.footnote": "If you didn’t make this change, reset your password right away.",
    "notice.generic.body": "A security setting on your ToothOps account was changed.",
    "notice.generic.subject": "Your ToothOps account was updated",
    "notice.identityLinked.body": "A new sign-in method was linked to your ToothOps account.",
    "notice.identityLinked.subject": "A sign-in method was added to your ToothOps account",
    "notice.identityUnlinked.body": "A sign-in method was removed from your ToothOps account.",
    "notice.identityUnlinked.subject": "A sign-in method was removed from your ToothOps account",
    "notice.mfaEnrolled.body": "A two-factor authentication method was added to your ToothOps account.",
    "notice.mfaEnrolled.subject": "Two-factor authentication was added to your ToothOps account",
    "notice.mfaUnenrolled.body": "A two-factor authentication method was removed from your ToothOps account.",
    "notice.mfaUnenrolled.subject": "Two-factor authentication was removed from your ToothOps account",
    "notice.passwordChanged.body": "The password for your ToothOps account was changed.",
    "notice.passwordChanged.subject": "Your ToothOps password was changed",
    "notice.phoneChanged.body": "The phone number for your ToothOps account was changed.",
    "notice.phoneChanged.subject": "Your ToothOps phone number was changed",
    "reauthentication.body": "Enter this code in ToothOps to confirm it’s you:",
    "reauthentication.ignore": "Didn’t request this code? Ignore this email, and consider changing your password.",
    "reauthentication.preheader": "Your ToothOps verification code.",
    "reauthentication.subject": "Your ToothOps verification code",
    "reauthentication.title": "Confirm it’s you",
    "resetPassword.body": "We received a request to reset the password for <strong>{{email}}</strong>. The link is valid for one hour.",
    "resetPassword.button": "Choose a new password",
    "resetPassword.ignore": "Didn’t ask for this? Ignore this email — your password stays the same.",
    "resetPassword.preheader": "Reset the password for your ToothOps account.",
    "resetPassword.subject": "Reset your ToothOps password",
    "resetPassword.title": "Reset your password",
  },
  fr: {
    "changeEmail.body": "Confirmez que <strong>{{newEmail}}</strong> doit remplacer <strong>{{email}}</strong> comme adresse e-mail de connexion de votre compte ToothOps.",
    "changeEmail.button": "Confirmer la nouvelle adresse",
    "changeEmail.ignore": "Vous n’avez pas demandé ce changement ? Ignorez cet e-mail — votre adresse de connexion reste inchangée.",
    "changeEmail.preheader": "Confirmez la nouvelle adresse e-mail de votre compte ToothOps.",
    "changeEmail.subject": "Confirmez votre nouvelle adresse e-mail pour ToothOps",
    "changeEmail.title": "Confirmez votre nouvelle adresse e-mail",
    "common.fallback": "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    "common.tagline": "Schéma dentaire vétérinaire",
    "confirmSignup.body": "Bienvenue sur ToothOps. Confirmez <strong>{{email}}</strong> pour activer le compte de votre clinique — vous serez connecté immédiatement.",
    "confirmSignup.button": "Confirmer l’e-mail et se connecter",
    "confirmSignup.ignore": "Vous ne vous êtes pas inscrit sur ToothOps ? Vous pouvez ignorer cet e-mail — le compte reste inactif tant que ce lien n’est pas utilisé.",
    "confirmSignup.preheader": "Confirmez votre adresse e-mail pour activer votre compte ToothOps.",
    "confirmSignup.subject": "Confirmez votre compte ToothOps",
    "confirmSignup.title": "Confirmez votre adresse e-mail",
    "invite.body": "Vous avez été invité à créer un compte ToothOps pour <strong>{{email}}</strong>. Acceptez l’invitation pour définir votre mot de passe et commencer.",
    "invite.button": "Accepter l’invitation",
    "invite.ignore": "Vous n’attendiez pas cette invitation ? Vous pouvez ignorer cet e-mail — aucun compte n’est créé tant que ce lien n’est pas utilisé.",
    "invite.preheader": "Vous avez été invité à créer un compte ToothOps.",
    "invite.subject": "Vous êtes invité sur ToothOps",
    "invite.title": "Acceptez votre invitation",
    "magiclink.body": "Utilisez le bouton ci-dessous pour vous connecter à ToothOps en tant que <strong>{{email}}</strong>. Le lien ne peut être utilisé qu’une seule fois.",
    "magiclink.button": "Se connecter",
    "magiclink.ignore": "Vous n’avez pas essayé de vous connecter ? Ignorez cet e-mail — personne ne peut se connecter sans ce lien.",
    "magiclink.preheader": "Votre lien pour vous connecter à ToothOps.",
    "magiclink.subject": "Votre lien de connexion ToothOps",
    "magiclink.title": "Connectez-vous à ToothOps",
    "notice.emailChanged.body": "L’adresse e-mail de connexion de votre compte ToothOps a été modifiée.",
    "notice.emailChanged.subject": "Votre adresse e-mail de connexion ToothOps a été modifiée",
    "notice.footnote": "Si vous n’êtes pas à l’origine de cette modification, réinitialisez votre mot de passe immédiatement.",
    "notice.generic.body": "Un paramètre de sécurité de votre compte ToothOps a été modifié.",
    "notice.generic.subject": "Votre compte ToothOps a été mis à jour",
    "notice.identityLinked.body": "Une nouvelle méthode de connexion a été associée à votre compte ToothOps.",
    "notice.identityLinked.subject": "Une méthode de connexion a été ajoutée à votre compte ToothOps",
    "notice.identityUnlinked.body": "Une méthode de connexion a été retirée de votre compte ToothOps.",
    "notice.identityUnlinked.subject": "Une méthode de connexion a été retirée de votre compte ToothOps",
    "notice.mfaEnrolled.body": "Une méthode d’authentification à deux facteurs a été ajoutée à votre compte ToothOps.",
    "notice.mfaEnrolled.subject": "L’authentification à deux facteurs a été ajoutée à votre compte ToothOps",
    "notice.mfaUnenrolled.body": "Une méthode d’authentification à deux facteurs a été retirée de votre compte ToothOps.",
    "notice.mfaUnenrolled.subject": "L’authentification à deux facteurs a été retirée de votre compte ToothOps",
    "notice.passwordChanged.body": "Le mot de passe de votre compte ToothOps a été modifié.",
    "notice.passwordChanged.subject": "Votre mot de passe ToothOps a été modifié",
    "notice.phoneChanged.body": "Le numéro de téléphone de votre compte ToothOps a été modifié.",
    "notice.phoneChanged.subject": "Votre numéro de téléphone ToothOps a été modifié",
    "reauthentication.body": "Saisissez ce code dans ToothOps pour confirmer votre identité :",
    "reauthentication.ignore": "Vous n’avez pas demandé ce code ? Ignorez cet e-mail et envisagez de changer votre mot de passe.",
    "reauthentication.preheader": "Votre code de vérification ToothOps.",
    "reauthentication.subject": "Votre code de vérification ToothOps",
    "reauthentication.title": "Confirmez votre identité",
    "resetPassword.body": "Nous avons reçu une demande de réinitialisation du mot de passe de <strong>{{email}}</strong>. Le lien est valable une heure.",
    "resetPassword.button": "Choisir un nouveau mot de passe",
    "resetPassword.ignore": "Vous n’êtes pas à l’origine de cette demande ? Ignorez cet e-mail — votre mot de passe reste inchangé.",
    "resetPassword.preheader": "Réinitialisez le mot de passe de votre compte ToothOps.",
    "resetPassword.subject": "Réinitialisez votre mot de passe ToothOps",
    "resetPassword.title": "Réinitialisez votre mot de passe",
  },
  de: {
    "changeEmail.body": "Bestätigen Sie, dass <strong>{{newEmail}}</strong> die Adresse <strong>{{email}}</strong> als Anmelde-E-Mail Ihres ToothOps-Kontos ersetzen soll.",
    "changeEmail.button": "Neue E-Mail-Adresse bestätigen",
    "changeEmail.ignore": "Sie haben diese Änderung nicht veranlasst? Ignorieren Sie diese E-Mail – Ihre Anmelde-E-Mail-Adresse bleibt unverändert.",
    "changeEmail.preheader": "Bestätigen Sie die neue E-Mail-Adresse für Ihr ToothOps-Konto.",
    "changeEmail.subject": "Bestätigen Sie Ihre neue E-Mail-Adresse für ToothOps",
    "changeEmail.title": "Bestätigen Sie Ihre neue E-Mail-Adresse",
    "common.fallback": "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    "common.tagline": "Zahnschema für die Tiermedizin",
    "confirmSignup.body": "Willkommen bei ToothOps. Bestätigen Sie <strong>{{email}}</strong>, um das Konto Ihrer Praxis zu aktivieren – Sie sind danach sofort angemeldet.",
    "confirmSignup.button": "E-Mail bestätigen & anmelden",
    "confirmSignup.ignore": "Sie haben sich nicht bei ToothOps registriert? Dann können Sie diese E-Mail ignorieren – das Konto bleibt inaktiv, solange dieser Link nicht verwendet wird.",
    "confirmSignup.preheader": "Bestätigen Sie Ihre E-Mail-Adresse, um Ihr ToothOps-Konto zu aktivieren.",
    "confirmSignup.subject": "Bestätigen Sie Ihr ToothOps-Konto",
    "confirmSignup.title": "Bestätigen Sie Ihre E-Mail-Adresse",
    "invite.body": "Sie wurden eingeladen, ein ToothOps-Konto für <strong>{{email}}</strong> zu erstellen. Nehmen Sie die Einladung an, um Ihr Passwort festzulegen und loszulegen.",
    "invite.button": "Einladung annehmen",
    "invite.ignore": "Sie haben diese Einladung nicht erwartet? Dann können Sie diese E-Mail ignorieren – es wird kein Konto erstellt, solange dieser Link nicht verwendet wird.",
    "invite.preheader": "Sie wurden eingeladen, ein ToothOps-Konto zu erstellen.",
    "invite.subject": "Sie wurden zu ToothOps eingeladen",
    "invite.title": "Nehmen Sie Ihre Einladung an",
    "magiclink.body": "Melden Sie sich über die Schaltfläche unten als <strong>{{email}}</strong> bei ToothOps an. Der Link kann nur einmal verwendet werden.",
    "magiclink.button": "Anmelden",
    "magiclink.ignore": "Sie haben nicht versucht, sich anzumelden? Ignorieren Sie diese E-Mail – ohne diesen Link kann sich niemand anmelden.",
    "magiclink.preheader": "Ihr Link zur Anmeldung bei ToothOps.",
    "magiclink.subject": "Ihr Anmeldelink für ToothOps",
    "magiclink.title": "Bei ToothOps anmelden",
    "notice.emailChanged.body": "Die Anmelde-E-Mail-Adresse Ihres ToothOps-Kontos wurde geändert.",
    "notice.emailChanged.subject": "Ihre ToothOps-Anmelde-E-Mail-Adresse wurde geändert",
    "notice.footnote": "Wenn Sie diese Änderung nicht vorgenommen haben, setzen Sie Ihr Passwort sofort zurück.",
    "notice.generic.body": "Eine Sicherheitseinstellung Ihres ToothOps-Kontos wurde geändert.",
    "notice.generic.subject": "Ihr ToothOps-Konto wurde aktualisiert",
    "notice.identityLinked.body": "Mit Ihrem ToothOps-Konto wurde eine neue Anmeldemethode verknüpft.",
    "notice.identityLinked.subject": "Ihrem ToothOps-Konto wurde eine Anmeldemethode hinzugefügt",
    "notice.identityUnlinked.body": "Aus Ihrem ToothOps-Konto wurde eine Anmeldemethode entfernt.",
    "notice.identityUnlinked.subject": "Aus Ihrem ToothOps-Konto wurde eine Anmeldemethode entfernt",
    "notice.mfaEnrolled.body": "Ihrem ToothOps-Konto wurde eine Methode zur Zwei-Faktor-Authentifizierung hinzugefügt.",
    "notice.mfaEnrolled.subject": "Ihrem ToothOps-Konto wurde die Zwei-Faktor-Authentifizierung hinzugefügt",
    "notice.mfaUnenrolled.body": "Aus Ihrem ToothOps-Konto wurde eine Methode zur Zwei-Faktor-Authentifizierung entfernt.",
    "notice.mfaUnenrolled.subject": "Aus Ihrem ToothOps-Konto wurde die Zwei-Faktor-Authentifizierung entfernt",
    "notice.passwordChanged.body": "Das Passwort Ihres ToothOps-Kontos wurde geändert.",
    "notice.passwordChanged.subject": "Ihr ToothOps-Passwort wurde geändert",
    "notice.phoneChanged.body": "Die Telefonnummer Ihres ToothOps-Kontos wurde geändert.",
    "notice.phoneChanged.subject": "Ihre ToothOps-Telefonnummer wurde geändert",
    "reauthentication.body": "Geben Sie diesen Code in ToothOps ein, um Ihre Identität zu bestätigen:",
    "reauthentication.ignore": "Sie haben diesen Code nicht angefordert? Ignorieren Sie diese E-Mail und ändern Sie gegebenenfalls Ihr Passwort.",
    "reauthentication.preheader": "Ihr ToothOps-Bestätigungscode.",
    "reauthentication.subject": "Ihr ToothOps-Bestätigungscode",
    "reauthentication.title": "Bestätigen Sie Ihre Identität",
    "resetPassword.body": "Wir haben eine Anfrage erhalten, das Passwort für <strong>{{email}}</strong> zurückzusetzen. Der Link ist eine Stunde lang gültig.",
    "resetPassword.button": "Neues Passwort wählen",
    "resetPassword.ignore": "Sie haben das nicht angefordert? Ignorieren Sie diese E-Mail – Ihr Passwort bleibt unverändert.",
    "resetPassword.preheader": "Setzen Sie das Passwort für Ihr ToothOps-Konto zurück.",
    "resetPassword.subject": "Setzen Sie Ihr ToothOps-Passwort zurück",
    "resetPassword.title": "Passwort zurücksetzen",
  },
  it: {
    "changeEmail.body": "Confermi che <strong>{{newEmail}}</strong> deve sostituire <strong>{{email}}</strong> come indirizzo e-mail di accesso del Suo account ToothOps.",
    "changeEmail.button": "Conferma il nuovo indirizzo",
    "changeEmail.ignore": "Non ha richiesto Lei questa modifica? Ignori questa e-mail: il Suo indirizzo di accesso rimane invariato.",
    "changeEmail.preheader": "Confermi il nuovo indirizzo e-mail del Suo account ToothOps.",
    "changeEmail.subject": "Confermi il Suo nuovo indirizzo e-mail per ToothOps",
    "changeEmail.title": "Confermi il Suo nuovo indirizzo e-mail",
    "common.fallback": "Se il pulsante non funziona, copi questo link nel Suo browser:",
    "common.tagline": "Odontogramma veterinario",
    "confirmSignup.body": "Benvenuto in ToothOps. Confermi <strong>{{email}}</strong> per attivare l’account del Suo studio: verrà connesso subito.",
    "confirmSignup.button": "Conferma e-mail e accedi",
    "confirmSignup.ignore": "Non si è registrato su ToothOps? Può ignorare questa e-mail: l’account resta inattivo finché questo link non viene utilizzato.",
    "confirmSignup.preheader": "Confermi il Suo indirizzo e-mail per attivare l’account ToothOps.",
    "confirmSignup.subject": "Confermi il Suo account ToothOps",
    "confirmSignup.title": "Confermi il Suo indirizzo e-mail",
    "invite.body": "È stato invitato a creare un account ToothOps per <strong>{{email}}</strong>. Accetti l’invito per impostare la Sua password e iniziare.",
    "invite.button": "Accetta l’invito",
    "invite.ignore": "Non si aspettava questo invito? Può ignorare questa e-mail: nessun account viene creato finché questo link non viene utilizzato.",
    "invite.preheader": "È stato invitato a creare un account ToothOps.",
    "invite.subject": "È stato invitato su ToothOps",
    "invite.title": "Accetti il Suo invito",
    "magiclink.body": "Usi il pulsante qui sotto per accedere a ToothOps come <strong>{{email}}</strong>. Il link può essere utilizzato una sola volta.",
    "magiclink.button": "Accedi",
    "magiclink.ignore": "Non ha provato ad accedere? Ignori questa e-mail: nessuno può accedere senza questo link.",
    "magiclink.preheader": "Il Suo link per accedere a ToothOps.",
    "magiclink.subject": "Il Suo link di accesso a ToothOps",
    "magiclink.title": "Acceda a ToothOps",
    "notice.emailChanged.body": "L’indirizzo e-mail di accesso del Suo account ToothOps è stato modificato.",
    "notice.emailChanged.subject": "Il Suo indirizzo e-mail di accesso a ToothOps è stato modificato",
    "notice.footnote": "Se non ha effettuato Lei questa modifica, reimposti subito la Sua password.",
    "notice.generic.body": "Un’impostazione di sicurezza del Suo account ToothOps è stata modificata.",
    "notice.generic.subject": "Il Suo account ToothOps è stato aggiornato",
    "notice.identityLinked.body": "Un nuovo metodo di accesso è stato collegato al Suo account ToothOps.",
    "notice.identityLinked.subject": "È stato aggiunto un metodo di accesso al Suo account ToothOps",
    "notice.identityUnlinked.body": "Un metodo di accesso è stato rimosso dal Suo account ToothOps.",
    "notice.identityUnlinked.subject": "È stato rimosso un metodo di accesso dal Suo account ToothOps",
    "notice.mfaEnrolled.body": "Un metodo di autenticazione a due fattori è stato aggiunto al Suo account ToothOps.",
    "notice.mfaEnrolled.subject": "L’autenticazione a due fattori è stata aggiunta al Suo account ToothOps",
    "notice.mfaUnenrolled.body": "Un metodo di autenticazione a due fattori è stato rimosso dal Suo account ToothOps.",
    "notice.mfaUnenrolled.subject": "L’autenticazione a due fattori è stata rimossa dal Suo account ToothOps",
    "notice.passwordChanged.body": "La password del Suo account ToothOps è stata modificata.",
    "notice.passwordChanged.subject": "La Sua password di ToothOps è stata modificata",
    "notice.phoneChanged.body": "Il numero di telefono del Suo account ToothOps è stato modificato.",
    "notice.phoneChanged.subject": "Il Suo numero di telefono ToothOps è stato modificato",
    "reauthentication.body": "Inserisca questo codice in ToothOps per confermare la Sua identità:",
    "reauthentication.ignore": "Non ha richiesto questo codice? Ignori questa e-mail e valuti di cambiare la Sua password.",
    "reauthentication.preheader": "Il Suo codice di verifica ToothOps.",
    "reauthentication.subject": "Il Suo codice di verifica ToothOps",
    "reauthentication.title": "Confermi la Sua identità",
    "resetPassword.body": "Abbiamo ricevuto una richiesta di reimpostazione della password per <strong>{{email}}</strong>. Il link è valido per un’ora.",
    "resetPassword.button": "Scegli una nuova password",
    "resetPassword.ignore": "Non ha fatto Lei questa richiesta? Ignori questa e-mail: la Sua password rimane invariata.",
    "resetPassword.preheader": "Reimposti la password del Suo account ToothOps.",
    "resetPassword.subject": "Reimposti la Sua password di ToothOps",
    "resetPassword.title": "Reimposti la Sua password",
  },
  es: {
    "changeEmail.body": "Confirme que <strong>{{newEmail}}</strong> debe sustituir a <strong>{{email}}</strong> como correo de inicio de sesión de su cuenta de ToothOps.",
    "changeEmail.button": "Confirmar nuevo correo",
    "changeEmail.ignore": "¿No solicitó este cambio? Ignore este correo: su correo de inicio de sesión no cambiará.",
    "changeEmail.preheader": "Confirme la nueva dirección de correo electrónico de su cuenta de ToothOps.",
    "changeEmail.subject": "Confirme su nuevo correo electrónico para ToothOps",
    "changeEmail.title": "Confirme su nuevo correo electrónico",
    "common.fallback": "Si el botón no funciona, copie este enlace en su navegador:",
    "common.tagline": "Odontograma veterinario",
    "confirmSignup.body": "Bienvenido a ToothOps. Confirme <strong>{{email}}</strong> para activar la cuenta de su clínica; iniciará sesión de inmediato.",
    "confirmSignup.button": "Confirmar correo e iniciar sesión",
    "confirmSignup.ignore": "¿No se registró en ToothOps? Puede ignorar este correo: la cuenta permanece inactiva a menos que se use este enlace.",
    "confirmSignup.preheader": "Confirme su correo electrónico para activar su cuenta de ToothOps.",
    "confirmSignup.subject": "Confirme su cuenta de ToothOps",
    "confirmSignup.title": "Confirme su correo electrónico",
    "invite.body": "Le han invitado a crear una cuenta de ToothOps para <strong>{{email}}</strong>. Acepte la invitación para establecer su contraseña y empezar.",
    "invite.button": "Aceptar invitación",
    "invite.ignore": "¿No esperaba esta invitación? Puede ignorar este correo: no se crea ninguna cuenta a menos que se use este enlace.",
    "invite.preheader": "Le han invitado a crear una cuenta de ToothOps.",
    "invite.subject": "Le han invitado a ToothOps",
    "invite.title": "Acepte su invitación",
    "magiclink.body": "Use el botón de abajo para iniciar sesión en ToothOps como <strong>{{email}}</strong>. El enlace solo puede usarse una vez.",
    "magiclink.button": "Iniciar sesión",
    "magiclink.ignore": "¿No intentó iniciar sesión? Ignore este correo: nadie puede iniciar sesión sin este enlace.",
    "magiclink.preheader": "Su enlace para iniciar sesión en ToothOps.",
    "magiclink.subject": "Su enlace de inicio de sesión de ToothOps",
    "magiclink.title": "Inicie sesión en ToothOps",
    "notice.emailChanged.body": "Se ha cambiado el correo de inicio de sesión de su cuenta de ToothOps.",
    "notice.emailChanged.subject": "Se ha cambiado su correo de inicio de sesión de ToothOps",
    "notice.footnote": "Si no realizó este cambio, restablezca su contraseña de inmediato.",
    "notice.generic.body": "Se ha cambiado un ajuste de seguridad de su cuenta de ToothOps.",
    "notice.generic.subject": "Se ha actualizado su cuenta de ToothOps",
    "notice.identityLinked.body": "Se ha vinculado un nuevo método de inicio de sesión a su cuenta de ToothOps.",
    "notice.identityLinked.subject": "Se ha añadido un método de inicio de sesión a su cuenta de ToothOps",
    "notice.identityUnlinked.body": "Se ha eliminado un método de inicio de sesión de su cuenta de ToothOps.",
    "notice.identityUnlinked.subject": "Se ha eliminado un método de inicio de sesión de su cuenta de ToothOps",
    "notice.mfaEnrolled.body": "Se ha añadido un método de autenticación de dos factores a su cuenta de ToothOps.",
    "notice.mfaEnrolled.subject": "Se ha añadido la autenticación de dos factores a su cuenta de ToothOps",
    "notice.mfaUnenrolled.body": "Se ha eliminado un método de autenticación de dos factores de su cuenta de ToothOps.",
    "notice.mfaUnenrolled.subject": "Se ha eliminado la autenticación de dos factores de su cuenta de ToothOps",
    "notice.passwordChanged.body": "Se ha cambiado la contraseña de su cuenta de ToothOps.",
    "notice.passwordChanged.subject": "Se ha cambiado su contraseña de ToothOps",
    "notice.phoneChanged.body": "Se ha cambiado el número de teléfono de su cuenta de ToothOps.",
    "notice.phoneChanged.subject": "Se ha cambiado su número de teléfono de ToothOps",
    "reauthentication.body": "Introduzca este código en ToothOps para confirmar que es usted:",
    "reauthentication.ignore": "¿No solicitó este código? Ignore este correo y considere cambiar su contraseña.",
    "reauthentication.preheader": "Su código de verificación de ToothOps.",
    "reauthentication.subject": "Su código de verificación de ToothOps",
    "reauthentication.title": "Confirme que es usted",
    "resetPassword.body": "Hemos recibido una solicitud para restablecer la contraseña de <strong>{{email}}</strong>. El enlace es válido durante una hora.",
    "resetPassword.button": "Elegir una contraseña nueva",
    "resetPassword.ignore": "¿No lo solicitó usted? Ignore este correo: su contraseña no cambiará.",
    "resetPassword.preheader": "Restablezca la contraseña de su cuenta de ToothOps.",
    "resetPassword.subject": "Restablezca su contraseña de ToothOps",
    "resetPassword.title": "Restablezca su contraseña",
  },
};

/** The raw `key` string in `lng` (placeholders and <strong> left in). */
export function authEmailRaw(lng: string, key: AuthEmailKey): string {
  return AUTH_EMAIL_STRINGS[emailLanguage(lng)][key];
}
