'use client';

import { useParams } from 'next/navigation';
import { LoadError, Loading } from '@/components/page';
import { ProductForm } from '@/components/product-form';
import { useApi } from '@/lib/use-api';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, error, loading } = useApi(`/admin/products/${id}`);
  if (loading) return <Loading />;
  if (error || !product) return <LoadError error={error!} />;
  return <ProductForm product={product} />;
}
