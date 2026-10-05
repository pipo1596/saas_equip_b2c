// Shared, deliberately-abstract fake identity for specs across the app
// that need an authenticated session — a plain placeholder rather than
// something that reads like a real employee id/name, and defined once so
// every spec file doesn't invent (and keep back in sync with) its own
// copy.

import { Session } from './auth';

export const FAKE_EMP_ID = 'E1';
export const FAKE_SESSION_ID = 'S1';
export const FAKE_FIRST_NAME = 'Pat';
export const FAKE_LAST_NAME = 'Doe';
export const FAKE_EMAIL = 'pat.doe@example.com';
export const FAKE_PHONE = '780-555-0100';

export const FAKE_SESSION: Session = {
  empId: FAKE_EMP_ID,
  sessionId: FAKE_SESSION_ID,
  firstName: FAKE_FIRST_NAME,
  lastName: FAKE_LAST_NAME,
  email: FAKE_EMAIL,
  phone: FAKE_PHONE,
  locations: [],
};
