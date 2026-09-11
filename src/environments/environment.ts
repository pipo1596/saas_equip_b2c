export const environment = {
  production: true,
  // Left relative: assumes this app is deployed on the same origin as the
  // CGI dispatcher for each environment (matches the one-Apache-per-env
  // pattern). If PROD/STAGE end up on a different origin than their
  // backend, set the real host here (and that backend will need to send
  // CORS headers, since it won't go through a dev proxy).
  apiBaseUrl: '',
};
