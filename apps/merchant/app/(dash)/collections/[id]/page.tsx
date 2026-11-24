'use client';

import { useParams } from 'next/navigation';
import { CollectionForm } from '@/components/collection-form';
import { LoadError, Loading } from '@/components/page';
import { useApi } from '@/lib/use-api';

export default function EditCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useApi(`/admin/collections/${id}`);
  if (loading) return <Loading />;
  if (error || !data) return <LoadError error={error!} />;
  return <CollectionForm collection={data} />;
}
