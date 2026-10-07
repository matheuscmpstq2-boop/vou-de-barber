import Image from "next/image";

export function BrandLogo({ className = "h-24 w-36", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/vou-de-barber.webp" alt="Vou de Barber" width={720} height={480} priority={priority} unoptimized className={`rounded-xl bg-white object-contain ${className}`} />;
}
