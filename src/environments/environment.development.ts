export const environment = {
  production: false,
  // Left relative: `ng serve` proxies /cgi/* to the TEST backend
  // (edmontonfire.itestv2.uniformworks.ca) via proxy.conf.json, so calls
  // stay same-origin and avoid CORS/mixed-content issues against that
  // internal HTTP host.
  apiBaseUrl: '',
};
