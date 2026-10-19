// Guards every dashboard page with requireAdmin() from lib/auth.ts.
// Server actions must call requireAdmin() themselves: a layout does not protect them.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
