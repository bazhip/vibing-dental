import 'i18next';
import type common from '../locales/en/common.json';
import type report from '../locales/en/report.json';
import type account from '../locales/en/account.json';
import type chart from '../locales/en/chart.json';
import type patients from '../locales/en/patients.json';
import type settings from '../locales/en/settings.json';

// Adding a namespace: one import above + one entry in `resources` below.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      report: typeof report;
      account: typeof account;
      chart: typeof chart;
      patients: typeof patients;
      settings: typeof settings;
    };
  }
}
