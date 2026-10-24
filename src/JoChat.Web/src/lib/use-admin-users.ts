import { useCallback, useEffect, useState } from 'react'
import { useApi, type AdminUser } from './api'

/** All users (admin view), plus a lookup from profile id to a display name. */
export function useAdminUsers() {
  const api = useApi()
  const [users, setUsers] = useState<AdminUser[]>([])

  useEffect(() => {
    let cancelled = false
    api.admin
      .users()
      .then((u) => !cancelled && setUsers(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api])

  const nameOf = useCallback(
    (profileId: string | null | undefined) => {
      if (!profileId) return '—'
      const u = users.find((x) => x.profileId === profileId)
      return u ? (u.displayName ?? u.userName) : profileId.slice(0, 8)
    },
    [users],
  )

  // Only people who have signed in own anything, so only they make sense as a filter.
  const withProfiles = users.filter((u) => u.profileId)
  return { users, withProfiles, nameOf }
}
