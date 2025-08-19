export function getCallbackUrl(): string {
  // Check if we have an explicit callback URL from environment
  if (import.meta.env.CALLBACK_URL) {
    return import.meta.env.CALLBACK_URL;
  }
  
  // Fallback to localhost for development
  return "http://localhost:4321/api/callback";
}