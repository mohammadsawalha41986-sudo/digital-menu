'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { invalidateProfile } from '@/server/profile/cache';
import { TenantAccessError } from '@/server/tenancy/context';
import { ValidationError } from './business-service';
import { forgetCustomer, optOutCustomer, setOffersSignup, setOrderStatus } from '@/server/customers/admin';

export type CustomerActionResult = { ok: true; message: string } | { ok: false; error: string };

function failure(error: unknown): CustomerActionResult {
  if (error instanceof ValidationError) return { ok: false, error: error.message };
  if (error instanceof TenantAccessError) return { ok: false, error: 'Only a manager or the owner can do this.' };
  throw error;
}

function refresh(businessId: string) {
  revalidatePath(`/admin/businesses/${businessId}/customers`);
}

export async function setOrderStatusAction(businessId: string, orderId: string, status: string): Promise<CustomerActionResult> {
  const user = await requireUser();
  try {
    await setOrderStatus(user, businessId, orderId, status);
    refresh(businessId);
    return { ok: true, message: 'تم تحديث حالة الطلب · Order updated' };
  } catch (error) {
    return failure(error);
  }
}

export async function setOffersSignupAction(businessId: string, enabled: boolean): Promise<CustomerActionResult> {
  const user = await requireUser();
  try {
    const { publicId } = await setOffersSignup(user, businessId, enabled);
    invalidateProfile(publicId);
    refresh(businessId);
    return {
      ok: true,
      message: enabled
        ? 'الاشتراك بالعروض ظاهر الآن في المنيو · Offers sign-up is on'
        : 'تم إخفاء الاشتراك بالعروض من المنيو · Offers sign-up is off',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function optOutCustomerAction(businessId: string, customerId: string): Promise<CustomerActionResult> {
  const user = await requireUser();
  try {
    await optOutCustomer(user, businessId, customerId);
    refresh(businessId);
    return { ok: true, message: 'لن تصله العروض بعد الآن · Removed from offers' };
  } catch (error) {
    return failure(error);
  }
}

export async function forgetCustomerAction(businessId: string, customerId: string): Promise<CustomerActionResult> {
  const user = await requireUser();
  try {
    await forgetCustomer(user, businessId, customerId);
    refresh(businessId);
    return { ok: true, message: 'تم حذف بيانات العميل · Customer data deleted' };
  } catch (error) {
    return failure(error);
  }
}
