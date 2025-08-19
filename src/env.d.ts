/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly GOOGLE_CLIENT_ID: string;
  readonly OAUTH_REDIRECT_URI: string;
  readonly OAUTH_SCOPES: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
