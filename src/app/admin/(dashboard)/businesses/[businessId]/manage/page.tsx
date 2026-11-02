import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { TenantAccessError } from '@/server/tenancy/context';
import { loadManageView } from '@/server/menu-manage/view';
import { assignMediaAction, setDishFocalAction, uploadDishPhotoAction } from '@/server/admin/media-actions';
import { ManageBoard } from './manage-board';

export const dynamic = 'force-dynamic';

/**
 * Menu and dishes, in one place: the sections on the side, the dishes in the
 * middle, and the editor beside the list, so no dish is edited at the bottom
 * of a long page.
 */
export default async function ManagePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const view = await loadManageView(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const picker = {
    upload: uploadDishPhotoAction.bind(null, view.businessId, view.publicId),
    assign: assignMediaAction.bind(null, view.businessId, view.publicId),
    focal: setDishFocalAction.bind(null, view.businessId, view.publicId),
  };

  return <ManageBoard businessId={view.businessId} view={view} picker={picker} />;
}
