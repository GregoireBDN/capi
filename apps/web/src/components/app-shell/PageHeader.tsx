interface PageHeaderProps {
  title: string
  description?: string
}

/** Title block shared by every page of the authenticated app. */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </header>
  )
}
