import { redirect } from 'next/navigation';

/** Colours, fonts and photo layout now live together on the Design page. */
export default async function MovedToDesign({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  redirect(`/admin/businesses/${businessId}/design`);
}
