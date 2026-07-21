import VestraPrototype from './VestraPrototype.jsx'
import { TermsPage, PrivacyPage, resolveLegalPath } from './LegalPages.jsx'

export default function App() {
  const kind = resolveLegalPath(
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  if (kind === 'terms') return <TermsPage />
  if (kind === 'privacy') return <PrivacyPage />
  return <VestraPrototype />
}
