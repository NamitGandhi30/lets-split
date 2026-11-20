# Email code sign-in: setup

Let's Split signs people in with a 6-digit code sent by email. Codes work inside the installed
iPhone app, where magic links would open Safari instead. This needs three settings in the
Supabase dashboard (project `lets-split`, ref `hpsiylvlgzngoincqnca`).

## 1. Put the code in the emails (required, 2 minutes)

By default Supabase emails a link, not a code. Open
**Authentication → Emails → Templates**
(https://supabase.com/dashboard/project/hpsiylvlgzngoincqnca/auth/templates)
and change **both** of these templates. New people get "Confirm signup"; returning people get "Magic Link".

**Subject:** `Your Let's Split code: {{ .Token }}`

**Body (HTML):**

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#121316">
  <p style="font-size:15px;color:#6C717C;margin:0 0 8px">Your sign-in code</p>
  <p style="font-size:40px;font-weight:700;letter-spacing:8px;margin:0 0 16px">{{ .Token }}</p>
  <p style="font-size:14px;line-height:1.5;color:#6C717C;margin:0">
    Type it into Let's Split to sign in. It expires in 10 minutes.<br>
    Didn't ask for this? You can ignore this email.
  </p>
</div>
```

Then open **Authentication → Sign In / Providers → Email**
(https://supabase.com/dashboard/project/hpsiylvlgzngoincqnca/auth/providers) and check:
- **Email OTP length:** `6` (the app expects 6 digits; to change it, also set `VITE_OTP_LENGTH`).
- **Email OTP expiration:** `600` seconds.

With only this step, sign-in already works for **your own email address**. Supabase's built-in
mailer only delivers to members of your Supabase organization, at about 2 emails an hour.

## 2. Brevo SMTP, so friends and cousins can sign in (free, about 10 minutes)

Brevo's free plan sends 300 emails a day and doesn't need your own domain.

1. **Create a Brevo account** at https://www.brevo.com (Free plan). You'll confirm your email and phone.
2. **Add a sender:** go to **Senders, Domains & Dedicated IPs → Senders → Add a sender**.
   - Name: `Let's Split`.
   - Email: an address you own, for example your Gmail.
   - Brevo emails that address a confirmation link; click it.
3. **Get the SMTP details:** go to **SMTP & API → SMTP** and **Generate a new SMTP key**. Copy:
   - Server: `smtp-relay.brevo.com`
   - Port: `587`
   - Login: looks like `xxxxxx@smtp-brevo.com`
   - Password: the SMTP key you just generated. It's shown once, so keep it in a password manager.
4. **Plug it into Supabase:** go to **Authentication → Emails → SMTP Settings**
   (https://supabase.com/dashboard/project/hpsiylvlgzngoincqnca/auth/smtp) and turn on **Enable custom SMTP**:
   - Sender email: the sender from step 2.
   - Sender name: `Let's Split`.
   - Host, port, username and password from step 3.
   - Minimum interval between emails: `30` seconds.
5. **Raise the email rate limit:** go to **Authentication → Rate Limits**
   (https://supabase.com/dashboard/project/hpsiylvlgzngoincqnca/auth/rate-limits).
   Set "Rate limit for sending emails" to about `60` per hour. Brevo allows 300 a day.
6. **Test it:** run the app (`pnpm dev`), enter an address that isn't yours, and the code should
   arrive within a few seconds. Check spam the first time.

**Deliverability note:** sending "from" a Gmail address through Brevo works, but some inboxes may
file it as spam because Gmail doesn't vouch for Brevo's servers. If that happens, the fix is a
cheap domain authenticated in Brevo (**Senders, Domains → Domains**, then add the DNS records it shows).
That's worth doing before publishing the app.

## 3. URLs (before deploying)

In **Authentication → URL Configuration**, set the Site URL to the deployed app's URL. Codes don't
use redirects, so this only affects the fallback link in emails.

## How it works in the app

- `apps/web/src/features/auth/EmailScreen.tsx` calls `supabase.auth.signInWithOtp({ email })`.
  The same call creates the account the first time.
- `CodeScreen.tsx` calls `supabase.auth.verifyOtp({ email, token, type: "email" })`. It uses one
  real input with `autocomplete="one-time-code"`, so iOS 17+ offers the code straight from Mail.
- On sign-up, a database trigger creates the `profiles` row, named after the email until the person picks a name.
- The web app uses Supabase only for Auth. All data goes through the REST API with the session's access token.
