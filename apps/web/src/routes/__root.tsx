import { TanStackDevtools } from '@tanstack/react-devtools'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { Toaster } from '@finances/ui'
import NotFound from '../components/NotFound'
import { NavigationProgress } from '../components/app-shell/NavigationProgress'
import { ServiceWorkerUpdates } from '../components/pwa/ServiceWorkerUpdates'
import {
  AppEnvironmentProvider,
  readAppEnvironment,
} from '../lib/app-environment'
import { AuthProvider } from '../lib/auth-context'
import { THEME_INIT_SCRIPT, ZOD_JITLESS_SCRIPT } from '../lib/inline-scripts'
import { ENVIRONMENT_HEAD } from '../lib/pwa/environment-head'

import appCss from '../globals.css?url'

export const Route = createRootRoute({
  // Production or staging (#454): the web service's `APP_ENVIRONMENT`, read
  // on the server; the client reads back what the server rendered.
  loader: () => readAppEnvironment(),
  head: ({ loaderData }) => {
    const env = ENVIRONMENT_HEAD[loaderData ?? 'production']
    return {
      meta: [
        {
          charSet: 'utf-8',
        },
        {
          name: 'viewport',
          // `viewport-fit=cover` + `env(safe-area-inset-*)` in globals.css.
          // `interactive-widget=resizes-content`: on Android the on-screen
          // keyboard shrinks the page, so bottom bars and sheets stay above it
          // (iOS ignores it; bottom sheets track the visual viewport instead).
          content:
            'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
        },
        {
          title: 'Finances',
        },
        // PWA / installed app (see docs/domain/pwa.md); theme-color is in <head>.
        { name: 'application-name', content: env.appName },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: env.appName },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        // Keep iOS from turning amounts or account numbers into phone links.
        { name: 'format-detection', content: 'telephone=no' },
      ],
      links: [
        { rel: 'manifest', href: env.manifest },
        { rel: 'icon', href: env.favicon, sizes: '32x32' },
        ...(env.svgIcon
          ? [{ rel: 'icon', type: 'image/svg+xml', href: env.svgIcon }]
          : []),
        { rel: 'apple-touch-icon', href: env.appleTouchIcon },
        {
          rel: 'stylesheet',
          href: appCss,
        },
      ],
    }
  },
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const environment = Route.useLoaderData()
  const { themeColor } = ENVIRONMENT_HEAD[environment]
  return (
    // `data-environment`: read back by the client (`ENVIRONMENT_ATTRIBUTE`).
    <html lang="fr" suppressHydrationWarning data-environment={environment}>
      <head>
        {/* Allowed by their hashes in the CSP (`lib/security-headers.ts`). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: ZOD_JITLESS_SCRIPT }} />
        <HeadContent />
        {/* Rendered here: `head()` keeps a single meta per name. */}
        <meta
          name="theme-color"
          content={themeColor.light}
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content={themeColor.dark}
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body className="flex min-h-svh flex-col font-sans antialiased [overflow-wrap:anywhere]">
        <AppEnvironmentProvider value={environment}>
          <AuthProvider>
            <NavigationProgress />
            {children}
            <Toaster />
            <ServiceWorkerUpdates />
            <TanStackDevtools
              config={{
                position: 'bottom-right',
              }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
            <Scripts />
          </AuthProvider>
        </AppEnvironmentProvider>
      </body>
    </html>
  )
}
