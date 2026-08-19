interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <div
      className={`rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 ${className}`}
    >
      <img
        src="/logo.jpeg"
        alt="Al-Drasat ERP Logo"
        className="w-full h-full object-contain"
      />
    </div>
  );
}
