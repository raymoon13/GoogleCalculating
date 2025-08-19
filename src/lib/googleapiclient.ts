// Build the URL
const scopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");

const state = "sadasd3rfwssdsfew";        // random string

const CLIENT_ID = import.meta.env.GOOGLE_CLIENT_ID
const REDIRECT_URI = import.meta.env.OAUTH_REDIRECT_URI

const params = new URLSearchParams({
  client_id: `${CLIENT_ID}.apps.googleusercontent.com`,
  redirect_uri: REDIRECT_URI, // e.g. "http://localhost:4321/callback"
  response_type: "token",     // implicit (no server)
  scope: scopes,              // space-delimited string
  include_granted_scopes: "true",
  state,                      // random CSRF string you verify on return
});

export const GOOGLE_URL =  `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

