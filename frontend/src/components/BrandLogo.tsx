import { BRANDING_LOGO_SRC } from '../branding'

type BrandLogoProps = {
  className?: string
  /** Texto alternativo; vacío si es decorativo junto al nombre del producto */
  alt?: string
}

export function BrandLogo({ className, alt = '' }: BrandLogoProps) {
  return (
    <img
      src={BRANDING_LOGO_SRC}
      alt={alt}
      className={className}
      decoding="async"
    />
  )
}
