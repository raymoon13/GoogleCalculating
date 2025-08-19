/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly GOOGLE_CLIENT_ID: string;
  readonly GOOGLE_CLIENT_SECRET: string;
  readonly OAUTH_REDIRECT_URI: string;
  readonly OAUTH_SCOPES: string;
  readonly CALLBACK_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
