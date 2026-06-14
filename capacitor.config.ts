import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.ontrack.family',
  appName: 'onTrack',
  webDir: 'dist',
  // On-device only. No server.url — the app always runs the bundled assets.
  plugins: {
    CapacitorSQLite: {
      // Personal app, single device. No encryption secret juggling needed, but
      // the option is here if a parent later wants an at-rest passphrase.
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      androidIsEncryption: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_ontrack',
      iconColor: '#3B82F6',
    },
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
