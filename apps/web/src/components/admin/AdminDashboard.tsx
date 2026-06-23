'use client'

import { Separator } from '@/components/ui/separator'
import { InvitationsPanel } from './InvitationsPanel'
import { MembersPanel } from './MembersPanel'

/** Owner/admin console (US3): allowlist invitations + member access control. */
export function AdminDashboard() {
  return (
    <div className="flex flex-col gap-8">
      <InvitationsPanel />
      <Separator />
      <MembersPanel />
    </div>
  )
}
