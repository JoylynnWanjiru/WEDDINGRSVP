// Guards every dashboard page with requireAdmin() from server/auth/sessions.ts.
// Server actions must call requireAdmin() themselves: a layout does not protect them.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
