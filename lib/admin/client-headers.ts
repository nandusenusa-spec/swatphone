/** Headers para llamadas al panel Super Admin (cookie HttpOnly + Bearer en localStorage). */
export function getAdminAuthHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = { ...extra }
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('admin_token')?.trim()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}
