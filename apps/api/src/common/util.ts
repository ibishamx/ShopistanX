import { BadRequestException } from '@nestjs/common';
import { ZodTypeAny, z } from 'zod';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    throw new BadRequestException({
      message: field ? `${field}: ${issue.message}` : issue.message,
      field: field || undefined,
    });
  }
  return result.data;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** 250000 paisa → "2,500" */
export function formatRupees(paisa: number): string {
  const rupees = paisa / 100;
  return rupees.toLocaleString('en-PK', { maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2 });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
