import 'i18next';
import type common from '../locales/en/common.json';
import type report from '../locales/en/report.json';
import type account from '../locales/en/account.json';
import type codes from '../locales/en/codes.json';
import type chart from '../locales/en/chart.json';
import type whatsNew from '../locales/en/whatsNew.json';
import type billing from '../locales/en/billing.json';
import type landing from '../locales/en/landing.json';
import type auth from '../locales/en/auth.json';
import type app from '../locales/en/app.json';
import type forms from '../locales/en/forms.json';
import type media from '../locales/en/media.json';
import type library from '../locales/en/library.json';
import type reminders from '../locales/en/reminders.json';

// Adding a namespace: one import above + one entry in `resources` below.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      report: typeof report;
      account: typeof account;
      codes: typeof codes;
      chart: typeof chart;
      whatsNew: typeof whatsNew;
      billing: typeof billing;
      landing: typeof landing;
      auth: typeof auth;
      app: typeof app;
      forms: typeof forms;
      media: typeof media;
      library: typeof library;
      reminders: typeof reminders;
    };
  }
}
