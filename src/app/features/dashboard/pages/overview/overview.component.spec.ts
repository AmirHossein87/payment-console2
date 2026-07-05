import { OverviewComponent } from './overview.component';

/**
 * The "customers blocked" fraud stat must count unique people, not raw block
 * actions — the same customer blocked several times counts once.
 * `countBlockedCustomers` is a pure static helper, so no TestBed is needed.
 */
describe('Overview', () => {
  describe('fraud', () => {
    describe('customersBlocked', () => {
      it('deduplicates same customer', () => {
        const events = [
          { customerId: 'cus_1' },
          { customerId: 'cus_1' }, // same customer blocked again
          { customerId: 'cus_2' },
          { customerId: 'cus_1' }, // and again
        ];

        expect(OverviewComponent.countBlockedCustomers(events)).toBe(2);
      });

      it('ignores blank / missing customer ids', () => {
        const events = [
          { customerId: 'cus_1' },
          { customerId: '' },
          { customerId: null },
          {},
        ];

        expect(OverviewComponent.countBlockedCustomers(events)).toBe(1);
      });

      it('returns 0 for no events', () => {
        expect(OverviewComponent.countBlockedCustomers([])).toBe(0);
        expect(OverviewComponent.countBlockedCustomers(null)).toBe(0);
        expect(OverviewComponent.countBlockedCustomers(undefined)).toBe(0);
      });
    });
  });
});
