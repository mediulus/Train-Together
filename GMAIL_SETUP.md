# Setting Up Gmail Notifications

This guide will help you set up a system email account to send team notifications.

## Prerequisites

- A Google account to use as the system email (e.g., `yourteam@gmail.com`)
- Access to Google Cloud Console

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it (e.g., "Train Together Notifications")
4. Click "Create"

## Step 2: Enable Gmail API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Gmail API"
3. Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External (or Internal if you have a workspace)
   - App name: "Train Together"
   - User support email: your email
   - Developer contact: your email
   - Add scopes: Click "Add or Remove Scopes" and add `https://www.googleapis.com/auth/gmail.send`
   - Save and continue
4. Back to creating OAuth client ID:
   - Application type: **Web application**
   - Name: "Train Together Server"
   - Authorized redirect URIs: `http://localhost:3000/oauth2callback`
   - Click "Create"
5. **Save your Client ID and Client Secret** (you'll need them next)

## Step 4: Get Refresh Token

Run the token generator script:

```bash
cd Train-Together
deno run --allow-net --allow-env --allow-read scripts/get-gmail-token.ts
```

Follow the prompts:
1. Enter your Client ID and Client Secret
2. Visit the authorization URL that's displayed
3. Sign in with the Google account you want to use for sending emails
4. Grant permissions
5. Copy the entire redirect URL (even though it won't load)
6. Paste it back into the terminal

The script will output your credentials in the correct format.

## Step 5: Update .env File

Copy the output from the script and paste it into your `.env` file in the `Train-Together` directory:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

## Step 6: Test It

Start your server:

```bash
deno task concepts
```

You should see in the logs that OAuth is configured. Try sending a notification from the frontend!

## Troubleshooting

### "No refresh token received"
- Revoke access at https://myaccount.google.com/permissions
- Run the token script again (it needs `prompt=consent` to get a refresh token)

### "Access blocked: This app's request is invalid"
- Make sure you added the redirect URI exactly: `http://localhost:3000/oauth2callback`
- Check that the Gmail API is enabled

### "Error: invalid_grant"
- Your refresh token may have expired
- Re-run the token generator script

## Security Notes

- Never commit the `.env` file to version control (it's in `.gitignore`)
- The refresh token gives access to send emails from that account
- Keep it secure like a password
- Consider using a dedicated email account (not your personal one)
