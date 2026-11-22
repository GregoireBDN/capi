import { createFileRoute } from '@tanstack/react-router'
import { CryptoPage } from '#/components/crypto/CryptoPage'

export const Route = createFileRoute('/_app/crypto')({
  head: () => ({ meta: [{ title: 'Crypto · Capi' }] }),
  component: CryptoPage,
})
