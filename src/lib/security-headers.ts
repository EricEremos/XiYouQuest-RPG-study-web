export function createContentSecurityPolicy(
  nonce: string,
  isDevelopment: boolean,
): string {
  const scriptDevelopmentException = isDevelopment ? "'unsafe-eval'" : "";

  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${scriptDevelopmentException};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    media-src 'self' blob:;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}
