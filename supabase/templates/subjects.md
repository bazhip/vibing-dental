<!-- Generated — run npm run i18n:emails. Do not edit by hand. -->
# Auth email subjects

Source: `src/locales/<lng>/authEmail.json`. Supabase's Subject heading field accepts
Go templates, so each subject below picks the user's language from their
`language` metadata and falls back to English. Paste each block into
Dashboard → Authentication → Emails → Templates, next to its body (see README.md).

## Confirm signup (`confirm-signup.html`)

Paste into the Subject heading field:

```
{{ $lang := "" }}{{ with .Data }}{{ with .language }}{{ $lang = printf "%v" . }}{{ end }}{{ end }}{{ if eq $lang "fr" }}Confirmez votre compte ToothOps{{ else if eq $lang "de" }}Bestätigen Sie Ihr ToothOps-Konto{{ else if eq $lang "it" }}Confermi il Suo account ToothOps{{ else if eq $lang "es" }}Confirme su cuenta de ToothOps{{ else }}Confirm your ToothOps account{{ end }}
```

| Language | Subject |
|---|---|
| en | Confirm your ToothOps account |
| fr | Confirmez votre compte ToothOps |
| de | Bestätigen Sie Ihr ToothOps-Konto |
| it | Confermi il Suo account ToothOps |
| es | Confirme su cuenta de ToothOps |

## Reset password (`reset-password.html`)

Paste into the Subject heading field:

```
{{ $lang := "" }}{{ with .Data }}{{ with .language }}{{ $lang = printf "%v" . }}{{ end }}{{ end }}{{ if eq $lang "fr" }}Réinitialisez votre mot de passe ToothOps{{ else if eq $lang "de" }}Setzen Sie Ihr ToothOps-Passwort zurück{{ else if eq $lang "it" }}Reimposti la Sua password di ToothOps{{ else if eq $lang "es" }}Restablezca su contraseña de ToothOps{{ else }}Reset your ToothOps password{{ end }}
```

| Language | Subject |
|---|---|
| en | Reset your ToothOps password |
| fr | Réinitialisez votre mot de passe ToothOps |
| de | Setzen Sie Ihr ToothOps-Passwort zurück |
| it | Reimposti la Sua password di ToothOps |
| es | Restablezca su contraseña de ToothOps |

## Change email address (`change-email.html`)

Paste into the Subject heading field:

```
{{ $lang := "" }}{{ with .Data }}{{ with .language }}{{ $lang = printf "%v" . }}{{ end }}{{ end }}{{ if eq $lang "fr" }}Confirmez votre nouvelle adresse e-mail pour ToothOps{{ else if eq $lang "de" }}Bestätigen Sie Ihre neue E-Mail-Adresse für ToothOps{{ else if eq $lang "it" }}Confermi il Suo nuovo indirizzo e-mail per ToothOps{{ else if eq $lang "es" }}Confirme su nuevo correo electrónico para ToothOps{{ else }}Confirm your new email for ToothOps{{ end }}
```

| Language | Subject |
|---|---|
| en | Confirm your new email for ToothOps |
| fr | Confirmez votre nouvelle adresse e-mail pour ToothOps |
| de | Bestätigen Sie Ihre neue E-Mail-Adresse für ToothOps |
| it | Confermi il Suo nuovo indirizzo e-mail per ToothOps |
| es | Confirme su nuevo correo electrónico para ToothOps |
