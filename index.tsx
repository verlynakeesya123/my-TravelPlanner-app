import '@angular/compiler'; // Required for JIT compilation in Applet environment

import { bootstrapApplication, provideProtractorTestingSupport } from '@angular/platform-browser';
import { AppComponent } from './src/app.component';
import { provideZonelessChangeDetection } from '@angular/core';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideProtractorTestingSupport()
  ]
}).catch(err => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.
