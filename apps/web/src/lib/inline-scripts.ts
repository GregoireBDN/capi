/**
 * The app's own inline `<head>` scripts (`routes/__root.tsx`), run before any
 * module. The Content-Security-Policy allows each by its SHA-256 hash
 * (`lib/security-headers.ts`), computed from these exact strings.
 */

/**
 * Applies the stored theme (light / dark / auto) before hydration, so the page
 * never flashes the wrong one.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

/**
 * Zod compiles object parsers with `new Function` when it can, probing for it
 * as each object schema is created (module load of the shared schemas). The
 * CSP forbids `eval`, so the probe would be reported as a violation on every
 * page: Zod reads its global config from `globalThis.__zod_globalConfig`, set
 * here before any bundle runs, and parses without code generation.
 */
export const ZOD_JITLESS_SCRIPT = `globalThis.__zod_globalConfig=Object.assign(globalThis.__zod_globalConfig||{},{jitless:true});`

export const INLINE_SCRIPTS = [THEME_INIT_SCRIPT, ZOD_JITLESS_SCRIPT] as const
