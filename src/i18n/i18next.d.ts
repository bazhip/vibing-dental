import 'i18next';
import type common from '../locales/en/common.json';
import type report from '../locales/en/report.json';

// Adding a namespace: one import above + one entry in `resources` below.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      report: typeof report;
    };
  }
}
