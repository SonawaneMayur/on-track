import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { Capacitor } from '@capacitor/core';
import { bootstrap, refreshCalendar, reschedule, triggerVoice } from './lib/store';

const app = mount(App, { target: document.getElementById('app')! });

// Boot the data layer, then wire app-resume refresh (BUILD.md: refresh calendar
// on app open, keep the notification horizon rolling).
void bootstrap();

if (Capacitor.isNativePlatform()) {
  void (async () => {
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('resume', () => {
      void refreshCalendar();
      void reschedule();
    });
    // Deep link: ontrack://voice opens the app already listening (bind it to a
    // "Hey Siri, onTrack" Shortcut for hands-free use while driving).
    CapApp.addListener('appUrlOpen', (data) => {
      if (data.url && /ontrack:\/\/voice/i.test(data.url)) triggerVoice();
    });
    // Cold launch via the deep link.
    const launch = await CapApp.getLaunchUrl().catch(() => null);
    if (launch?.url && /ontrack:\/\/voice/i.test(launch.url)) setTimeout(() => triggerVoice(), 600);
    // Handle ✓ Done / ⏰ Snooze / 🔊 Read aloud taps on reminders.
    const { initNotificationHandlers } = await import('./lib/services/notification-actions');
    void initNotificationHandlers();
  })();
}

export default app;
