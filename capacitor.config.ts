import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.teslaschool',
  appName: 'E-OS School',
  webDir: 'out',
  android: {
    allowMixedContent: false,
    backgroundColor: '#1d4ed8',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1d4ed8',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1d4ed8',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
