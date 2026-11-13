import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.scottstevens.casemanager',
  appName: 'Case Manager',
  webDir: 'dist',
  backgroundColor: '#f5f6f8',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_cm',
      iconColor: '#b8892f',
    },
  },
}

export default config
