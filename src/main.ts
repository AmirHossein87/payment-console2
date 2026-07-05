import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { TagManagerService } from '@core/services/tag-manager.service';

// Load Google Tag Manager as early as possible (before Angular bootstraps) so the
// tag sits near the top of page load — gated by environment.enableTagManager.
TagManagerService.loadContainer();

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);
