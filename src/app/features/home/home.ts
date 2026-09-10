import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>SaaS euIP B2C</h1>
      <p>Welcome — this feature is ready to build.</p>
    </main>
  `,
})
export class Home {}
