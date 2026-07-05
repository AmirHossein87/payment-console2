import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SettingsStore } from '@core/stores/settings.store';

@Component({
  selector: 'app-confirm-forget-pass',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './confirm-forget-pass.component.html',
  styleUrls: ['./confirm-forget-pass.component.scss'],
})
export class ConfirmForgetPassComponent {
  readonly settingsStore = inject(SettingsStore);
}
