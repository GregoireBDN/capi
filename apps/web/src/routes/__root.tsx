import { TanStackDevtools } from '@tanstack/react-devtools'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { Toaster } from '@finances/ui'
import NotFound from '../components/NotFound'
import { NavigationProgress } from '../components/app-shell/NavigationProgress'
import { ServiceWorkerUpdates } from '../components/pwa/ServiceWorkerUpdates'
import { AuthProvider } from '../lib/auth-context'

import appCss from '../globals.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRoute({
  head: () => ({
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
      // PWA / installed app (see CLAUDE.md, "PWA"); theme-color is in <head>.
      { name: 'application-name', content: 'Finances' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Finances' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      // Keep iOS from turning amounts or account numbers into phone links.
      { name: 'format-detection', content: 'telephone=no' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/logo.svg',
      },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
        {/* Rendered here: `head()` keeps a single meta per name. */}
        <meta
          name="theme-color"
          content="#f4f7fc"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#090c1a"
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body className="flex min-h-svh flex-col font-sans antialiased [overflow-wrap:anywhere]">
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
      </body>
    </html>
  )
}
