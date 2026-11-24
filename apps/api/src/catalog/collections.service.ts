import { Injectable } from '@nestjs/common';
import { Collection } from '@prisma/client';
import { Tx } from '../db/db.service';
import { Rule, productMatches, sortProducts } from './collection-rules';

const productInclude = {
  variants: { orderBy: { position: 'asc' as const } },
  images: { orderBy: { position: 'asc' as const } },
};

@Injectable()
export class CollectionsService {
  /** The products in a collection, in its sort order. Smart collections are evaluated now, so they are always current. */
  async products(tx: Tx, collection: Collection, opts: { activeOnly: boolean; sort?: string }) {
    const where = opts.activeOnly ? { status: 'ACTIVE' as const } : {};
    if (collection.kind === 'SMART') {
      const all = await tx.product.findMany({ where, include: productInclude });
      const rules = (collection.rules as unknown as Rule[]) ?? [];
      const matched = all.filter((p) => productMatches(p, rules, collection.matchAll));
      return sortProducts(matched, opts.sort ?? collection.sortOrder);
    }
    const links = await tx.collectionProduct.findMany({
      where: { collectionId: collection.id, product: where },
      include: { product: { include: productInclude } },
    });
    const position = new Map(links.map((l) => [l.productId, l.position]));
    return sortProducts(links.map((l) => l.product), opts.sort ?? collection.sortOrder, position, (p) => p.id);
  }

  /** Product counts for every collection, for list pages. */
  async counts(tx: Tx, collections: Collection[], activeOnly = false): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const smart = collections.filter((c) => c.kind === 'SMART');
    const where = activeOnly ? { status: 'ACTIVE' as const } : {};
    if (smart.length) {
      const all = await tx.product.findMany({ where, include: { variants: true } });
      for (const c of smart) counts.set(c.id, all.filter((p) => productMatches(p, (c.rules as unknown as Rule[]) ?? [], c.matchAll)).length);
    }
    const manual = collections.filter((c) => c.kind === 'MANUAL');
    if (manual.length) {
      const grouped = await tx.collectionProduct.groupBy({
        by: ['collectionId'],
        where: { collectionId: { in: manual.map((c) => c.id) }, product: where },
        _count: true,
      });
      for (const c of manual) counts.set(c.id, grouped.find((g) => g.collectionId === c.id)?._count ?? 0);
    }
    return counts;
  }
}
