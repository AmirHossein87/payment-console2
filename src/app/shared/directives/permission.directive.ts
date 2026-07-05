import {
  Directive,
  Input,
  OnInit,
  TemplateRef,
  ViewContainerRef,
  inject,
  effect,
} from '@angular/core';
import { PermissionStore } from '@core/stores/permission.store';

/**
 * Structural directive that conditionally renders a template based on whether
 * the current user holds a given permission scope.
 *
 * Usage:
 *   <button *appPermission="'PaymentProfileWrite'">Add Gateway</button>
 *
 * When the user does NOT have the specified permission the element is removed
 * from the DOM entirely (not just hidden). When they do, it is rendered
 * normally. The directive reacts to live signal changes, so if permissions
 * update mid-session the DOM updates accordingly.
 *
 * Pass an empty string or omit the value to always render:
 *   <div *appPermission="''">Always visible</div>
 */
@Directive({
  selector: '[appPermission]',
  standalone: true,
})
export class PermissionDirective implements OnInit {
  /** The permission scope string to check, e.g. 'PaymentProfileWrite'. */
  @Input('appPermission') permission: string = '';

  private readonly permissionStore = inject(PermissionStore);
  private readonly templateRef = inject(TemplateRef<any>);
  private readonly vcr = inject(ViewContainerRef);

  /** Track whether the view is currently rendered to avoid redundant ops. */
  private isRendered = false;

  ngOnInit(): void {
    // React reactively to permission signal changes using an effect.
    // The effect runs in the injection context because the directive is
    // instantiated inside Angular's DI tree.
    effect(
      () => {
        // Reading the signal inside the effect registers this as a dependency.
        const hasPermission = this.permissionStore.hasPermission(this.permission);
        this.updateView(hasPermission);
      },
      { injector: this.vcr.injector }
    );
  }

  private updateView(hasPermission: boolean): void {
    if (hasPermission && !this.isRendered) {
      this.vcr.createEmbeddedView(this.templateRef);
      this.isRendered = true;
    } else if (!hasPermission && this.isRendered) {
      this.vcr.clear();
      this.isRendered = false;
    }
  }
}
