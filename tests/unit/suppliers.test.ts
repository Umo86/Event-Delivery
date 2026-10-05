import { describe, expect, it } from 'vitest';
import { suppliersFor, worksOn } from '@/lib/domain/suppliers';

const printer = { name: 'Signs Express', works_on_os: true, works_on_ss: true, works_on_si: false };
const promo = { name: 'Promo Direct', works_on_os: false, works_on_ss: false, works_on_si: true };

describe('which suppliers work on which lists', () => {
  it('follows the lists ticked in their scope', () => {
    expect(worksOn(printer, 'organiser_signage')).toBe(true);
    expect(worksOn(printer, 'sponsor_item')).toBe(false);
    expect(worksOn(promo, 'sponsor_item')).toBe(true);
  });

  it('puts the suppliers who work on a list first', () => {
    expect(suppliersFor([printer, promo], 'sponsor_item')).toEqual({ match: [promo], others: [printer] });
    expect(suppliersFor([printer, promo], 'sponsor_signage')).toEqual({ match: [printer], others: [promo] });
  });
});
