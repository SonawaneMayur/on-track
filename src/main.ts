import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { Capacitor } from '@capacitor/core';
import { bootstrap, refreshCalendar, reschedule } from './lib/store';

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
  })();
}

export default app;
