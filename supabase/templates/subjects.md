<!-- Generated — run npm run i18n:emails. Do not edit by hand. -->
# Auth email subjects

Source: `src/locales/<lng>/authEmail.json`.

The primary path is the `send-auth-email` Send Email Hook, which sends every
auth email with a subject in the user's language; these dashboard templates
are only the fallback for when the hook is disabled (see README.md).

The dashboard Subject heading field holds **English only**: it is capped at 255
characters, too short for a five-language Go-template chain. So with the hook
off, bodies are localized (the `.html` files) but subjects are English. Paste
each block into Dashboard → Authentication → Emails → Templates, next to its
body. The tables list each language's subject as the hook sends it.

## Confirm signup (`confirm-signup.html`)

Paste into the Subject heading field (English only):

```
Confirm your ToothOps account
```

| Language | Subject |
|---|---|
| en | Confirm your ToothOps account |
| fr | Confirmez votre compte ToothOps |
| de | Bestätigen Sie Ihr ToothOps-Konto |
| it | Confermi il Suo account ToothOps |
| es | Confirme su cuenta de ToothOps |

## Reset password (`reset-password.html`)

Paste into the Subject heading field (English only):

```
Reset your ToothOps password
```

| Language | Subject |
|---|---|
| en | Reset your ToothOps password |
| fr | Réinitialisez votre mot de passe ToothOps |
| de | Setzen Sie Ihr ToothOps-Passwort zurück |
| it | Reimposti la Sua password di ToothOps |
| es | Restablezca su contraseña de ToothOps |

## Change email address (`change-email.html`)

Paste into the Subject heading field (English only):

```
Confirm your new email for ToothOps
```

| Language | Subject |
|---|---|
| en | Confirm your new email for ToothOps |
| fr | Confirmez votre nouvelle adresse e-mail pour ToothOps |
| de | Bestätigen Sie Ihre neue E-Mail-Adresse für ToothOps |
| it | Confermi il Suo nuovo indirizzo e-mail per ToothOps |
| es | Confirme su nuevo correo electrónico para ToothOps |
