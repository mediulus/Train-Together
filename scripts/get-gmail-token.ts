#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * OAuth2 Token Generator for Gmail API
 * 
 * This script helps you get a refresh token for the Gmail API.
 * 
 * Steps:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a project and enable Gmail API
 * 3. Create OAuth 2.0 credentials (Web application)
 * 4. Add redirect URI: http://localhost:3000/oauth2callback
 * 5. Run this script and follow the prompts
 */

import { OAuth2Client } from "google-auth-library";

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

async function getRefreshToken() {
  console.log('\n=== Gmail OAuth2 Token Generator ===\n');
  
  const clientId = prompt('Enter your Google Client ID:');
  const clientSecret = prompt('Enter your Google Client Secret:');
  
  if (!clientId || !clientSecret) {
    console.error('Client ID and Secret are required!');
    Deno.exit(1);
  }

  const oauth2Client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: REDIRECT_URI,
  });

  // Generate the auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh token
  });

  console.log('\n1. Visit this URL to authorize the application:');
  console.log('\n' + authUrl + '\n');
  console.log('2. After authorization, you will be redirected to a URL');
  console.log('3. Copy the entire redirect URL and paste it below\n');

  const redirectUrl = prompt('Enter the full redirect URL:');
  
  if (!redirectUrl) {
    console.error('Redirect URL is required!');
    Deno.exit(1);
  }

  try {
    // Extract the code from the redirect URL
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    
    if (!code) {
      console.error('No authorization code found in the URL!');
      Deno.exit(1);
    }

    console.log('\nExchanging authorization code for tokens...');
    
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.error('\nNo refresh token received. Make sure you:');
      console.error('1. Revoked previous access at https://myaccount.google.com/permissions');
      console.error('2. Used prompt=consent in the auth URL');
      Deno.exit(1);
    }

    console.log('\n✅ Success! Add these to your .env file:\n');
    console.log(`GOOGLE_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n');
  } catch (error) {
    const err = error as Error;
    console.error('\n❌ Error getting tokens:', err.message);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await getRefreshToken();
}
