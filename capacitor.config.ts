import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.toothops.ios',
  appName: 'ToothOps',
  webDir: 'build',
  ios: {
    scheme: 'ToothOps',
  },
  plugins: {
    Keyboard: { resize: 'native' },
    SplashScreen: { launchAutoHide: false },
  },
};

export default config;
