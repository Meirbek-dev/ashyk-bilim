import { LocaleSwitcher } from '@components/Utils/LocaleSwitcher'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* The sign-in pages have no header: without this a visitor could not leave the default language. */}
      <LocaleSwitcher className="absolute top-4 right-4 z-10" />
      {children}
    </div>
  )
}
