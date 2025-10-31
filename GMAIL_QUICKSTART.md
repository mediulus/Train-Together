# Quick Start: Gmail Notifications Setup

## TL;DR

1. **Create Google Cloud Project**: https://console.cloud.google.com/
   - Enable Gmail API
   - Create OAuth 2.0 credentials (Web app)
   - Redirect URI: `http://localhost:3000/oauth2callback`

2. **Get Tokens**:
   ```bash
   cd Train-Together
   deno run --allow-net --allow-env --allow-read scripts/get-gmail-token.ts
   ```

3. **Update `.env`**:
   ```bash
   GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-secret
   GOOGLE_REFRESH_TOKEN=your-token
   ```

4. **Start Server**:
   ```bash
   deno task concepts
   ```

✅ Look for: "Gmail OAuth configured successfully"
❌ If not configured: Notifications will return a friendly error

---

For detailed instructions, see [GMAIL_SETUP.md](./GMAIL_SETUP.md)
